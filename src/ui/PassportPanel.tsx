import { useCallback, useEffect, useMemo, useState } from 'react';
import { ROLE_LABELS } from '../core/types';
import { compressImage, localPassport, PASSPORT_CATEGORIES, permissions, validateFile, type PassportCategory, type PassportEntry } from '../passport/passport';
import { useApp } from '../store';
import { date, dateTime, downloadText } from './format';

function Thumb({ fileId, mime, name }: { fileId: string; mime: string; name: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let u: string | null = null;
    localPassport.file(fileId).then((b) => {
      if (b) {
        u = URL.createObjectURL(b);
        setUrl(u);
      }
    });
    return () => {
      if (u) URL.revokeObjectURL(u);
    };
  }, [fileId]);
  if (!url) return <span className="thumb loading" />;
  return (
    <a className="thumb" href={url} target="_blank" rel="noreferrer" title={name}>
      {mime.startsWith('image/') ? <img src={url} alt={name} /> : <span className="pdf">PDF</span>}
    </a>
  );
}

export function PassportPanel() {
  const { apartmentId, layout, role } = useApp();
  const app = useApp.getState();
  const [entries, setEntries] = useState<PassportEntry[]>([]);
  const [room, setRoom] = useState<string>('all');
  const [cat, setCat] = useState<PassportCategory | 'all'>('all');
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ roomId: 'apartment', category: 'repair_photo' as PassportCategory, zone: '', title: '', description: '' });
  const [files, setFiles] = useState<File[]>([]);

  const reload = useCallback(() => localPassport.list(apartmentId).then(setEntries), [apartmentId]);
  useEffect(() => {
    reload();
  }, [reload]);

  const rooms = useMemo(() => [{ id: 'apartment', name: 'Вся квартира' }, ...(layout?.rooms ?? [])], [layout]);
  const visible = entries.filter((e) => permissions.canView(role, e) && (room === 'all' || e.roomId === room) && (cat === 'all' || e.category === cat));
  const cats = PASSPORT_CATEGORIES.filter((c) => permissions.canView(role, { category: c.id }));

  const save = async (ev: React.FormEvent) => {
    ev.preventDefault();
    setError(null);
    for (const f of files) {
      const err = validateFile(f);
      if (err) return setError(err);
    }
    if (!permissions.canCreate(role, form.category)) return setError('Недостаточно прав для этой категории');
    setBusy(true);
    try {
      const blobs = await Promise.all(files.map(async (f) => ({ blob: await compressImage(f), name: f.name })));
      await localPassport.add({ ...form, apartmentId, authorRole: role }, blobs);
      setForm({ ...form, zone: '', title: '', description: '' });
      setFiles([]);
      setAdding(false);
      await reload();
    } catch (e) {
      setError(`Не удалось сохранить: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  const exportJson = () => downloadText(`passport-${apartmentId}.json`, JSON.stringify({ apartmentId, exportedAt: new Date().toISOString(), entries: visible }, null, 2), 'application/json');

  return (
    <aside className="panel">
      <header className="panel-head">
        <div>
          <div className="eyebrow">Квартира {apartmentId.replace('apt-', '№')} · {ROLE_LABELS[role]}</div>
          <h2>Цифровой паспорт</h2>
        </div>
        <button className="icon-btn" aria-label="Закрыть" onClick={() => app.set('panel', null)}>
          ✕
        </button>
      </header>
      <div className="panel-scroll">
        <div className="filters">
          <select value={room} onChange={(e) => setRoom(e.target.value)} aria-label="Помещение">
            <option value="all">Все помещения</option>
            {rooms.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
          <select value={cat} onChange={(e) => setCat(e.target.value as PassportCategory | 'all')} aria-label="Категория">
            <option value="all">Все категории</option>
            {cats.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
        {!adding ? (
          <div className="row">
            <button className="btn" onClick={() => setAdding(true)}>
              + Добавить запись
            </button>
            {visible.length > 0 && (
              <button className="btn ghost" onClick={exportJson}>
                Экспорт JSON
              </button>
            )}
          </div>
        ) : (
          <form className="order-form" onSubmit={save}>
            <div className="grid2">
              <label>
                Помещение
                <select value={form.roomId} onChange={(e) => setForm({ ...form, roomId: e.target.value })}>
                  {rooms.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Категория
                <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value as PassportCategory })}>
                  {cats
                    .filter((c) => permissions.canCreate(role, c.id))
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.label}
                      </option>
                    ))}
                </select>
              </label>
            </div>
            <label>
              Участок (без точных координат)
              <input placeholder="например: стена за кухонным гарнитуром" value={form.zone} onChange={(e) => setForm({ ...form, zone: e.target.value })} />
            </label>
            <label>
              Название
              <input required placeholder="Например: разводка электрики до штукатурки" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            </label>
            <label>
              Описание
              <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </label>
            <label className="file">
              Фото или документы (JPG, PNG, WEBP, PDF до 15 МБ)
              <input type="file" multiple accept="image/jpeg,image/png,image/webp,application/pdf" onChange={(e) => setFiles([...(e.target.files ?? [])])} />
            </label>
            {files.length > 0 && <p className="muted small">Выбрано файлов: {files.length}. Фото будут уменьшены до 1920 px для экономии места.</p>}
            {error && <p className="warn">{error}</p>}
            <div className="row">
              <button type="button" className="btn ghost" onClick={() => setAdding(false)}>
                Отмена
              </button>
              <button className="btn" type="submit" disabled={busy}>
                {busy ? 'Сохраняем…' : 'Сохранить'}
              </button>
            </div>
          </form>
        )}
        {visible.length === 0 && !adding && <p className="empty muted">Записей пока нет. Добавьте фото ремонта, скрытых работ, чеки, акты или инструкции.</p>}
        <ul className="passport">
          {visible.map((e) => (
            <li key={e.id}>
              <div className="pp-head">
                <span className={`cat ${e.category}`}>{PASSPORT_CATEGORIES.find((c) => c.id === e.category)?.label}</span>
                <span className="muted small">
                  {rooms.find((r) => r.id === e.roomId)?.name} · {dateTime(e.createdAt)} · {ROLE_LABELS[e.authorRole]}
                </span>
              </div>
              <b>{e.title}</b>
              {e.zone && <div className="muted small">Участок: {e.zone}</div>}
              {e.description && <p className="small">{e.description}</p>}
              {e.warrantyUntil && <div className="small">Гарантия до {date(e.warrantyUntil)}</div>}
              {e.files.length > 0 && (
                <div className="thumbs">
                  {e.files.map((f) => (
                    <Thumb key={f.id} fileId={f.id} mime={f.mime} name={f.name} />
                  ))}
                </div>
              )}
              {permissions.canDelete(role, e) && (
                <button
                  className="link danger"
                  onClick={async () => {
                    if (confirm('Удалить запись и её файлы?')) {
                      await localPassport.remove(e.id);
                      reload();
                    }
                  }}
                >
                  Удалить
                </button>
              )}
            </li>
          ))}
        </ul>
        <p className="muted small">Прототип хранит паспорт в этом браузере (IndexedDB). Синхронизация с сервером и E-Shanyraq подготовлена в интерфейсах интеграции.</p>
      </div>
    </aside>
  );
}
