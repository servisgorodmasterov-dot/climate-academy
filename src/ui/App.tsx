import { useEffect, useMemo, useRef, useState } from 'react';
import { ROLE_LABELS, type LayoutElement, type Role, type Room, type UtilitySystem } from '../core/types';
import { sectionIdFor } from '../core/academy';
import { academyById } from '../academies';
import { findProduct } from '../catalog/sheetParser';
import { ApartmentScene } from '../apartment/scene/ApartmentScene';
import { findApartment, listApartments, roomArea, totalArea } from '../apartment/layout';
import { useTotalEstimate } from '../estimate/useEstimate';
import { useApp, SYSTEM_META, type ViewMode } from '../store';
import { AcademyPanel } from './AcademyPanel';
import { EstimatePanel } from './EstimatePanel';
import { OrdersPanel } from './OrdersPanel';
import { PassportPanel } from './PassportPanel';
import { AboutPanel } from './AboutPanel';
import { money } from './format';

const MODES: { id: ViewMode; label: string; hint: string }[] = [
  { id: 'apartment', label: 'Моя квартира', hint: 'Нажмите на комнату, пол или отмеченный объект' },
  { id: 'xray', label: 'Рентген', hint: 'Условная схема инженерных систем — не исполнительная документация' },
  { id: 'encyclopedia', label: 'Энциклопедия', hint: 'Нажмите на объект — откроется объяснение, как он устроен' },
];

export function App() {
  const s = useApp();
  const { layout, catalog, mode, focusRoom, panel, apartmentId, role, proMode } = s;
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<number>();
  const total = useTotalEstimate();

  useEffect(() => {
    useApp.getState().init();
  }, []);

  const say = (t: string) => {
    setToast(t);
    clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 3200);
  };

  const floorColors = useMemo(() => {
    const out: Record<string, string> = {};
    if (!catalog || !layout) return out;
    for (const r of layout.rooms) {
      const sec = s.sections[`${apartmentId}|flooring:${r.id}`];
      const pid = sec?.selection['floor.laminate']?.productId;
      const c = pid ? findProduct(catalog, pid)?.attrs.color : undefined;
      if (c) out[r.id] = c;
    }
    return out;
  }, [catalog, layout, s.sections, apartmentId]);

  if (!layout) return <div className="loading">Загрузка…</div>;

  const openAcademy = (academyId: string, room: Room | null, el: LayoutElement | null) => {
    const def = academyById(academyId);
    if (!def || !catalog) return;
    const sectionRoom = def.scope === 'room' ? room : null;
    const id = `${apartmentId}|${sectionIdFor(def, sectionRoom)}`;
    const ctx = { catalog, layout, room: sectionRoom, element: el, proMode, role };
    useApp.getState().openSection(id, def.id, sectionRoom?.id ?? null, () => def.defaultParams(ctx), el?.id ?? null);
  };

  const onElement = (el: LayoutElement) => {
    if (!el.academy) return;
    openAcademy(el.academy, layout.rooms.find((r) => r.id === el.roomId) ?? null, el);
  };

  const onFloor = (room: Room) => {
    const st = useApp.getState();
    if (st.mode !== 'encyclopedia' && st.focusRoom !== room.id) {
      st.set('focusRoom', room.id);
      if (room.floorFinish === 'laminate') say(`${room.name}: нажмите на пол ещё раз, чтобы открыть академию напольных покрытий`);
      return;
    }
    const el = layout.elements.find((e) => e.kind === 'floor' && e.roomId === room.id) ?? null;
    if (el?.academy) openAcademy(el.academy, room, el);
    else say(`Покрытие «${room.name}» — плитка. Академия плитки запланирована в следующих этапах.`);
  };

  const apt = findApartment(apartmentId);
  const sectionsCount = total?.included.length ?? 0;

  return (
    <div className={`app ${panel ? 'with-panel' : ''}`}>
      <header className="topbar">
        <div className="brand">
          <span className="logo" aria-hidden>
            <svg viewBox="0 0 32 32">
              <rect width="32" height="32" rx="9" fill="#0066fa" />
              <path d="M7 16l9-8 9 8v9H7z" fill="#fff" />
              <path d="M13 25v-6h6v6" fill="#0066fa" />
            </svg>
          </span>
          <div>
            <b>3D Home Academy</b>
            <select className="apt-select" value={apartmentId} onChange={(e) => useApp.getState().setApartment(e.target.value)} aria-label="Квартира">
              {listApartments().map((a) => (
                <option key={a.apartment.id} value={a.apartment.id}>
                  {a.complex.name} · {a.buildingName} · кв. {a.apartment.number}
                  {a.apartment.mirrored ? ' (зеркальная)' : ''}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="seg modes" role="tablist" aria-label="Режим просмотра">
          {MODES.map((m) => (
            <button key={m.id} className={mode === m.id ? 'on' : ''} onClick={() => (s.set('mode', m.id), say(m.hint))}>
              {m.label}
            </button>
          ))}
        </div>
        <div className="top-right">
          <label className="toggle" title="Профессиональный режим показывает технические детали для мастеров">
            <input type="checkbox" checked={proMode} onChange={(e) => s.set('proMode', e.target.checked)} />
            <span>Для мастера</span>
          </label>
          <select value={role} onChange={(e) => s.set('role', e.target.value as Role)} aria-label="Роль (демо)">
            {(Object.keys(ROLE_LABELS) as Role[]).map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r]}
              </option>
            ))}
          </select>
        </div>
      </header>

      <main className="stage">
        <ApartmentScene layout={layout} floorColors={floorColors} onElement={onElement} onFloor={onFloor} />

        <div className="overlay-top">
          <div className="crumbs">
            {apt && (
              <span>
                {apt.complex.name} → {apt.buildingName} → {apt.entranceName} → этаж {apt.floor} → кв. {apt.apartment.number}
              </span>
            )}
            {layout.isDemo && <span className="badge demo">Демо-планировка · {totalArea(layout)} м²</span>}
            {catalog?.status === 'demo' && <span className="badge demo">Демо-цены</span>}
          </div>
          <div className="rooms" role="tablist" aria-label="Помещения">
            <button className={!focusRoom ? 'chip on' : 'chip'} onClick={() => s.set('focusRoom', null)}>
              Вся квартира
            </button>
            {layout.rooms.map((r) => (
              <button key={r.id} className={focusRoom === r.id ? 'chip on' : 'chip'} onClick={() => s.set('focusRoom', r.id)}>
                {r.name} <span className="muted">{roomArea(r)}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="view-tools">
          <label className="toggle">
            <input type="checkbox" checked={!s.ceilingHidden} onChange={(e) => s.set('ceilingHidden', !e.target.checked)} />
            <span>Потолок</span>
          </label>
          <label className="toggle">
            <input type="checkbox" checked={s.wallsTransparent} onChange={(e) => s.set('wallsTransparent', e.target.checked)} />
            <span>Прозрачные стены</span>
          </label>
        </div>

        {mode === 'xray' && (
          <div className="legend">
            <b>Инженерные системы</b>
            {(Object.keys(SYSTEM_META) as UtilitySystem[]).map((k) => (
              <label key={k}>
                <input type="checkbox" checked={s.xraySystems.includes(k)} onChange={() => s.toggleSystem(k)} />
                <i style={{ background: SYSTEM_META[k].color }} />
                {SYSTEM_META[k].label}
              </label>
            ))}
            <div className="conf">
              <div>
                <span className="dash" /> условно (демо)
              </div>
              <div>
                <span className="solid" /> проектные данные
              </div>
              <div>
                <span className="solid dot" /> подтверждено
              </div>
            </div>
            <p className="muted small">Все линии этой квартиры — условные: исполнительная документация не загружена.</p>
          </div>
        )}

        {toast && (
          <div className="toast" role="status">
            {toast}
          </div>
        )}
      </main>

      <nav className="dock">
        <button className={panel === 'estimate' ? 'on' : ''} onClick={() => s.set('panel', panel === 'estimate' ? null : 'estimate')}>
          <span className="ico">🧾</span>
          <span>Смета</span>
          {sectionsCount > 0 && <em>{money(total?.estimate.total)}</em>}
        </button>
        <button className={panel === 'orders' ? 'on' : ''} onClick={() => s.set('panel', panel === 'orders' ? null : 'orders')}>
          <span className="ico">🛠</span>
          <span>Заказы</span>
          {s.orders.filter((o) => o.apartmentId === apartmentId).length > 0 && <em>{s.orders.filter((o) => o.apartmentId === apartmentId).length}</em>}
        </button>
        <button className={panel === 'passport' ? 'on' : ''} onClick={() => s.set('panel', panel === 'passport' ? null : 'passport')}>
          <span className="ico">📘</span>
          <span>Паспорт</span>
        </button>
        <button className={panel === 'about' ? 'on' : ''} onClick={() => s.set('panel', panel === 'about' ? null : 'about')}>
          <span className="ico">ⓘ</span>
          <span>Данные</span>
        </button>
      </nav>

      {panel === 'academy' && <AcademyPanel />}
      {panel === 'estimate' && <EstimatePanel />}
      {panel === 'orders' && <OrdersPanel />}
      {panel === 'passport' && <PassportPanel />}
      {panel === 'about' && <AboutPanel />}
    </div>
  );
}
