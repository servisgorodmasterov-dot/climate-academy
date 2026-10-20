// Левый каталог категорий — как в конструкторе ремонта. Список категорий и их порядок задаются в таблице (лист «Категории»).
// Выбор категории подсвечивает её объекты в 3D и в списке «Объекты». Категории с инженерной сетью (электрика, сантехника,
// отопление, умный дом) сразу открывают её схему — квартира становится прозрачной.
import { useMemo, useState } from 'react';
import { categoriesOf, selectableObjects } from '../apartment/objects';
import { useApp, useAppState, NET_MODES } from '../store';
import type { ViewMode } from '../store';

const CAT_NET: Record<string, ViewMode> = { electric: 'electric', plumbing: 'plumbing', engineering: 'heating', smarthome: 'smart' };

export function CatalogBar() {
  const { layout, catalog, categoryFilter, panel } = useAppState();
  const app = useApp.getState();
  // на широком экране каталог открыт сразу, на узком — по кнопке
  const wide = () => typeof window !== 'undefined' && window.innerWidth >= 1100 && !useApp.getState().embed;
  const [open, setOpen] = useState(wide);
  const objects = useMemo(() => (layout ? selectableObjects(layout, catalog) : []), [layout, catalog]);
  const mode = useApp((s) => s.mode);
  if (!layout || panel) return null;
  const inNet = NET_MODES.includes(mode);
  const cats = categoriesOf(catalog);
  // категории с инженерной сетью: нажатие сразу показывает схему (квартира прозрачная, видны провода/трубы)
  const pick = (id: string | 'all', forceMode?: ViewMode) => {
    const again = id !== 'all' && categoryFilter === id && inNet;
    const net = forceMode ?? (again ? 'apartment' : CAT_NET[id] ?? 'apartment');
    app.set('mode', net);
    app.set('electricStep', 0);
    app.set('categoryFilter', again || net === 'xray' ? 'all' : id);
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
        <button className={!inNet && categoryFilter === 'all' ? 'on' : ''} onClick={() => pick('all', 'apartment')}>
          <span className="cat-ico">⌂</span>Вся квартира<span className="n">{objects.length}</span>
        </button>
        {cats.map((c) => {
          const n = objects.filter((o) => o.category === c.id).length;
          return (
            <button key={c.id} className={`${categoryFilter === c.id && (!inNet || mode === CAT_NET[c.id]) ? 'on' : ''} ${n || CAT_NET[c.id] ? '' : 'soon'}`} onClick={() => (n || CAT_NET[c.id] ? pick(c.id) : undefined)} title={CAT_NET[c.id] ? `${c.description}. Показывает схему: что и где проложено` : n ? c.description : 'Позиции появятся, когда добавите их в таблицу'}>
              <span className="cat-ico">{c.icon}</span>
              {c.id === 'engineering' ? 'Отопление и стояки' : c.name}
              {CAT_NET[c.id] && <span className="net-tag" aria-hidden>схема</span>}
              <span className="n">{n || (CAT_NET[c.id] ? '' : 'скоро')}</span>
            </button>
          );
        })}
        <button className={mode === 'xray' ? 'on' : ''} title="Все инженерные системы условно, одним видом" onClick={() => pick('all', mode === 'xray' ? 'apartment' : 'xray')}>
          <span className="cat-ico">▦</span>Все сети сразу
        </button>
      </nav>
    </>
  );
}
