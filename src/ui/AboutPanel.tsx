import { ACADEMIES } from '../academies';
import { useApp } from '../store';
import { date } from './format';
import { FURNITURE_TYPES } from '../apartment/scene/Furniture';

const INTEGRATIONS = [
  { name: 'Google Таблица (цены, товары, работы)', status: 'Подготовлено', text: 'GoogleSheetsCatalogProvider + серверный эндпоинт /api/catalog с сервисным аккаунтом. Включается переменными окружения — см. docs/GOOGLE-SHEETS.md.' },
  { name: 'Naidu.kz — «Найти дешевле»', status: 'Демо-адаптер', text: 'PriceComparisonAdapter с тестовыми предложениями. Реальный API Naidu.kz не описан — подключается после согласования контракта.' },
  { name: '«Город мастеров» — заказы', status: 'Демо-процесс', text: 'Заказ фиксирует цены и проходит статусы «отправлен → принят → выполнен», без оплаты и без передачи данных.' },
  { name: 'E-Shanyraq', status: 'Контракт подготовлен', text: 'Переход из кабинета по ?source=eshanyraq&apartment=72, сопоставление ролей и категорий паспорта. Действующий E-Shanyraq не изменялся.' },
  { name: 'ClimateCool — каталог кондиционеров', status: 'Место подготовлено', text: 'Лист «Поставщики» содержит поставщика климатической техники; каталог подключается как новые строки листов «Товары» и «Цены».' },
];

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
