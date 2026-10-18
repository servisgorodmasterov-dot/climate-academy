import { useState } from 'react';
import { ACADEMIES } from '../academies';
import { parseSheetRef, savedSheetId } from '../catalog/CatalogProvider';
import { useApp } from '../store';
import { date } from './format';
import { FURNITURE_TYPES } from '../apartment/scene/Furniture';

const INTEGRATIONS = [
  { name: 'Google Таблица (цены, товары, работы, объекты)', status: 'Работает', text: 'Подключается по ссылке выше без сервера (таблица «всем по ссылке — читатель»). Вариант с закрытой таблицей и закупочными ценами — через свой сервер, см. docs/GOOGLE-SHEETS.md.' },
  { name: 'Naidu.kz — «Найти дешевле»', status: 'Демо-адаптер', text: 'PriceComparisonAdapter с тестовыми предложениями. Реальный API Naidu.kz не описан — подключается после согласования контракта.' },
  { name: '«Город мастеров» — заказы', status: 'Демо-процесс', text: 'Заказ фиксирует цены и проходит статусы «отправлен → принят → выполнен», без оплаты и без передачи данных.' },
  { name: 'E-Shanyraq', status: 'Контракт подготовлен', text: 'Переход из кабинета по ?source=eshanyraq&apartment=72, сопоставление ролей и категорий паспорта. Действующий E-Shanyraq не изменялся.' },
  { name: 'ClimateCool — каталог кондиционеров', status: 'Место подготовлено', text: 'Лист «Поставщики» содержит поставщика климатической техники; каталог подключается как новые строки листов «Товары» и «Цены».' },
];

/** Поле подключения Google Таблицы: вставил ссылку — цены и каталог читаются из неё. */
function SheetConnect() {
  const app = useApp.getState();
  const catalog = useApp((s) => s.catalog);
  const [value, setValue] = useState(savedSheetId() ?? '');
  const [busy, setBusy] = useState(false);
  const current = savedSheetId();
  const connect = async (ref: string | null) => {
    setBusy(true);
    await app.connectSheet(ref);
    setBusy(false);
  };
  const valid = parseSheetRef(value);
  return (
    <section className="sheet-connect">
      <h4>Google Таблица с ценами</h4>
      <p className="small">
        Шаблон: <code>docs/templates/3d-home-academy-catalog-template.xlsx</code> → открыть в Google Таблицах → «Файл → Поделиться → Все, у кого есть ссылка (читатель)» → вставьте ссылку сюда. Изменили цену в таблице — нажмите «Обновить».
      </p>
      <div className="sheet-row">
        <input type="url" placeholder="https://docs.google.com/spreadsheets/d/…" value={value} onChange={(e) => setValue(e.target.value)} aria-label="Ссылка на Google Таблицу" />
        <button className="btn" disabled={!valid || busy} onClick={() => connect(value)}>
          {busy ? '…' : current && valid === current ? 'Обновить' : 'Подключить'}
        </button>
      </div>
      {current && (
        <p className="small muted">
          Подключена таблица <code>{current.slice(0, 10)}…</code> · {catalog?.status === 'live' ? 'цены из таблицы' : 'не удалось прочитать'} ·{' '}
          <button className="link" onClick={() => (setValue(''), connect(null))}>
            отключить и вернуть демо
          </button>
        </p>
      )}
      <p className="small muted">Ссылку можно передать и в адресе: <code>?sheet=ID_таблицы</code>. В этом режиме закупочные цены не читаются — таблица открыта по ссылке.</p>
    </section>
  );
}

export function AboutPanel() {
  const { catalog, catalogError, layout, role } = useApp();
  const app = useApp.getState();
  return (
    <aside className="panel">
      <header className="panel-head">
        <div>
          <div className="eyebrow">Статус данных</div>
          <h2>Что реальное, а что демо</h2>
        </div>
        <button className="icon-btn" aria-label="Закрыть" onClick={() => app.set('panel', null)}>
          ✕
        </button>
      </header>
      <div className="panel-scroll about">
        {catalogError && <div className="notice warn">{catalogError}</div>}
        <SheetConnect />
        <h4>Каталог</h4>
        {catalog && (
          <ul className="kv">
            <li>
              <span>Источник</span>
              <b>{catalog.status === 'demo' ? 'Демонстрационный каталог (тестовые числа)' : catalog.sourceName}</b>
            </li>
            <li>
              <span>Товаров / работ / комплектаций</span>
              <b>
                {catalog.products.length} / {catalog.works.length} / {new Set(catalog.kits.map((k) => k.kitId)).size}
              </b>
            </li>
            <li>
              <span>Категорий / типов объектов / позиций</span>
              <b>
                {catalog.categories.length} / {catalog.objectTypes.length} / {catalog.objectSlots.length}
              </b>
            </li>
            <li>
              <span>Цены обновлены</span>
              <b>{date(catalog.pricesUpdatedAt)}</b>
            </li>
            <li>
              <span>Проверка таблицы</span>
              <b>{catalog.issues.length ? `${catalog.issues.length} замечаний` : 'без ошибок'}</b>
            </li>
          </ul>
        )}
        {catalog && catalog.issues.length > 0 && (
          <ul className="issues">
            {catalog.issues.slice(0, 30).map((i, k) => (
              <li key={k}>
                {i.sheet}
                {i.row ? `, строка ${i.row}` : ''}: {i.message}
              </li>
            ))}
          </ul>
        )}
        {role === 'admin' && (
          <button className="btn ghost" onClick={() => app.reloadCatalog()}>
            Перечитать каталог
          </button>
        )}
        <h4>Планировка</h4>
        <p>{layout?.note}</p>
        <p className="muted small">
          Версия планировки {layout?.version} · {layout?.name}
        </p>
        <h4>Академии</h4>
        <ul>
          {ACADEMIES.map((a) => (
            <li key={a.id}>
              <b>{a.title}</b> — {a.description}
            </li>
          ))}
        </ul>
        <h4>Как добавить новую позицию</h4>
        <ol className="small">
          <li>Новая модель двери, краски, окна: строка на листе «Товары» с тем же <code>slot</code> (например <code>door.leaf</code>) и строка на листе «Цены». Больше ничего.</li>
          <li>Новая часть объекта (например, порог у двери): строка на листе «Позиции объектов» + товары для её <code>slot</code>.</li>
          <li>Новый тип объекта (например, «Потолок»): строка на листе «Объекты» с <code>placement</code> = <code>room_walls</code>/<code>door</code>/<code>window</code>, его позиции и товары. Код не меняется.</li>
        </ol>
        <h4>Интеграции</h4>
        <ul className="integrations">
          {INTEGRATIONS.map((i) => (
            <li key={i.name}>
              <div>
                <b>{i.name}</b>
                <span className="tag">{i.status}</span>
              </div>
              <p className="small">{i.text}</p>
            </li>
          ))}
        </ul>
        <h4>3D-ресурсы для замены</h4>
        <p className="small">
          Мебель ({FURNITURE_TYPES.length} типов), кондиционеры, датчики и текстуры созданы процедурно как временные модели. Для фотореалистичной версии их нужно заменить GLB-моделями и PBR-текстурами — список в docs/ASSETS.md.
        </p>
      </div>
    </aside>
  );
}
