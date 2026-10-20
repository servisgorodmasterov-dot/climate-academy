// Левый каталог категорий — как в конструкторе ремонта. Список категорий и их порядок задаются в таблице (лист «Категории»).
// Выбор категории подсвечивает её объекты в 3D и в списке «Объекты».
import { useMemo, useState } from 'react';
import { categoriesOf, selectableObjects } from '../apartment/objects';
import { useApp, useAppState } from '../store';

export function CatalogBar() {
  const { layout, catalog, categoryFilter, panel } = useAppState();
  const app = useApp.getState();
  // на широком экране каталог открыт сразу, на узком — по кнопке
  const wide = () => typeof window !== 'undefined' && window.innerWidth >= 1100 && !useApp.getState().embed;
  const [open, setOpen] = useState(wide);
  const objects = useMemo(() => (layout ? selectableObjects(layout, catalog) : []), [layout, catalog]);
  const mode = useApp((s) => s.mode);
  if (!layout || panel || mode === 'electric' || mode === 'xray') return null;
  const cats = categoriesOf(catalog);
  const pick = (id: string | 'all') => {
    app.set('categoryFilter', id);
    app.set('selectedElement', null);
    if (id !== 'all') app.set('focusRoom', null);
    if (!wide()) setOpen(false);
  };
  return (
    <>
      <button className="chip catalog-toggle" onClick={() => setOpen(!open)} aria-expanded={open}>
        ☰ Каталог
      </button>
      <nav className={open ? 'catalog-bar open' : 'catalog-bar'} aria-label="Каталог категорий">
        <h5>Конструктор ремонта</h5>
        <button className={categoryFilter === 'all' ? 'on' : ''} onClick={() => pick('all')}>
          <span className="cat-ico">⌂</span>Вся квартира<span className="n">{objects.length}</span>
        </button>
        {cats.map((c) => {
          const n = objects.filter((o) => o.category === c.id).length;
          return (
            <button key={c.id} className={`${categoryFilter === c.id ? 'on' : ''} ${n ? '' : 'soon'}`} onClick={() => (n ? pick(c.id) : undefined)} title={n ? c.description : 'Позиции появятся, когда добавите их в таблицу'}>
              <span className="cat-ico">{c.icon}</span>
              {c.name}
              <span className="n">{n || 'скоро'}</span>
            </button>
          );
        })}
      </nav>
    </>
  );
}
