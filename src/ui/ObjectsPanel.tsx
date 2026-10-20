import { useMemo } from 'react';
import type { LayoutElement } from '../core/types';
import { categoriesOf, selectableObjects } from '../apartment/objects';
import { useApp, useAppState } from '../store';

/** Список всех объектов квартиры: фильтр по категориям, группировка по помещениям. Масштабируется на любое число объектов. */
export function ObjectsPanel({ onPick }: { onPick: (el: LayoutElement) => void }) {
  const { layout, catalog, categoryFilter, sections, apartmentId, selectedElement } = useAppState();
  const app = useApp.getState();
  const objects = useMemo(() => (layout ? selectableObjects(layout, catalog) : []), [layout, catalog]);
  if (!layout) return null;
  const visible = objects.filter((o) => categoryFilter === 'all' || o.category === categoryFilter);
  const inEstimate = (o: { academy: string | null; roomId: string; id: string }) =>
    !!o.academy &&
    Object.values(sections).some(
      (s) => s.apartmentId === apartmentId && s.academy === o.academy && s.included && (s.params?.elementId ? s.params.elementId === o.id : s.roomId === o.roomId || s.roomId === null),
    );

  return (
    <aside className="panel">
      <header className="panel-head">
        <div>
          <div className="eyebrow">Квартира {apartmentId.replace('apt-', '№')}</div>
          <h2>Объекты</h2>
        </div>
        <button className="icon-btn" aria-label="Закрыть" onClick={() => app.set('panel', null)}>
          ✕
        </button>
      </header>
      <div className="panel-scroll">
        <div className="chips" role="tablist" aria-label="Категории">
          <button className={categoryFilter === 'all' ? 'chip on' : 'chip'} onClick={() => app.set('categoryFilter', 'all')}>
            Все <span className="muted">{objects.length}</span>
          </button>
          {categoriesOf(catalog).map((c) => {
            const n = objects.filter((o) => o.category === c.id).length;
            if (!n) return null;
            return (
              <button key={c.id} className={categoryFilter === c.id ? 'chip on' : 'chip'} onClick={() => app.set('categoryFilter', c.id)}>
                {c.icon} {c.name} <span className="muted">{n}</span>
              </button>
            );
          })}
        </div>
        <p className="muted small">Выбранная категория определяет и метки в 3D: на общем виде они показываются для всей квартиры.</p>
        {layout.rooms.map((r) => {
          const list = visible.filter((o) => o.roomId === r.id);
          if (!list.length) return null;
          return (
            <section key={r.id} className="obj-group">
              <h4>{r.name}</h4>
              <ul className="obj-list">
                {list.map((o) => (
                  <li key={o.id}>
                    <button className={selectedElement === o.id ? 'obj on' : 'obj'} onClick={() => onPick(o.element)}>
                      <span className="obj-ico">{o.icon}</span>
                      <span className="obj-name">{o.label}</span>
                      {inEstimate(o) && <span className="tag">в смете</span>}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </aside>
  );
}
