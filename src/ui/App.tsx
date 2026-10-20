import { useEffect, useMemo, useRef, useState } from 'react';
import { ROLE_LABELS, type LayoutElement, type Role, type Room, type UtilitySystem } from '../core/types';
import { sectionIdFor, type Selection } from '../core/academy';
import { academyById } from '../academies';
import { findPrice, findProduct } from '../catalog/sheetParser';
import { primaryProduct } from '../objects/logic';
import { ApartmentScene, isMobile } from '../apartment/scene/ApartmentScene';
import { findApartment, listApartments, roomArea, totalArea } from '../apartment/layout';
import { useTotalEstimate } from '../estimate/useEstimate';
import { useApp, useAppState, SYSTEM_META, type AcademyTab, type ViewMode } from '../store';
import { AcademyPanel } from './AcademyPanel';
import { EstimatePanel } from './EstimatePanel';
import { OrdersPanel } from './OrdersPanel';
import { PassportPanel } from './PassportPanel';
import { AboutPanel } from './AboutPanel';
import { ObjectsPanel } from './ObjectsPanel';
import { CatalogBar } from './CatalogBar';
import { categoriesOf, resolveSelectable, selectableObjects } from '../apartment/objects';
import { money } from './format';

// «На весь экран» из встроенного на сайт конструктора: открываем в той же вкладке (не в новой),
// помечаем full=1 и запоминаем страницу сайта, чтобы кнопка «← На сайт» могла вернуть обратно.
const params = typeof location !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams();
/** Страница сайта, с которой пришли (на телефоне сайт открывает конструктор вместо себя). Помним её при перезагрузке. */
const siteBack: string | null = (() => {
  if (typeof location === 'undefined') return null;
  const ok = (u: string | null) => !!u && /^https?:\/\//.test(u) && new URL(u).origin !== location.origin;
  let back = params.get('back');
  if (!ok(back) && ok(document.referrer)) back = document.referrer;
  try {
    if (ok(back)) sessionStorage.setItem('home3d:back', back!);
    else back = sessionStorage.getItem('home3d:back');
  } catch {
    /* хранилище недоступно — обойдёмся */
  }
  return ok(back) ? back : null;
})();
const isFull = params.get('full') === '1' || !!siteBack;

function fullScreenUrl() {
  const u = new URL(location.href);
  u.searchParams.delete('embed');
  u.searchParams.set('full', '1');
  const site = document.referrer;
  if (site && /^https?:\/\//.test(site)) u.searchParams.set('back', site);
  return u.toString();
}

function goBackToSite() {
  // обычно сайт — предыдущая страница в истории: возвращаемся туда же, где был пользователь
  if (history.length > 1) {
    history.back();
    return;
  }
  if (siteBack) location.href = siteBack;
  else {
    const u = new URL(location.href);
    u.searchParams.delete('full');
    u.searchParams.delete('back');
    location.href = u.toString();
  }
}

const MODES: { id: ViewMode; label: string; hint: string }[] = [
  { id: 'apartment', label: 'Моя квартира', hint: 'Выберите комнату, затем объект по метке. Список всех объектов — кнопка «Объекты»' },
  { id: 'xray', label: 'Рентген', hint: 'Условная схема инженерных систем — не исполнительная документация' },
  { id: 'encyclopedia', label: 'Энциклопедия', hint: 'Выберите объект — главной станет кнопка «Как устроено»' },
];

export function App() {
  const s = useAppState();
  const { layout, catalog, mode, focusRoom, panel, apartmentId, role, proMode, embed } = s;
  const [toast, setToast] = useState<string | null>(null);
  // Компактный экран: телефон или встраивание на сайт — меньше надписей, всё лишнее в меню «Вид»
  const [compact, setCompact] = useState(() => typeof window !== 'undefined' && (window.innerWidth < 760 || new URLSearchParams(location.search).get('embed') === '1'));
  const [toolsOpen, setToolsOpen] = useState(false);
  useEffect(() => {
    const on = () => setCompact(window.innerWidth < 760 || useApp.getState().embed);
    on();
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, [embed]);
  const toastTimer = useRef<number>();
  const total = useTotalEstimate();

  // Встраивание на сайт: сообщаем родительской странице итог сметы и число разделов
  useEffect(() => {
    if (!embed || window.parent === window) return;
    window.parent.postMessage({ type: 'home3d:estimate', total: total?.estimate.total ?? 0, sections: total?.included.length ?? 0, apartment: apartmentId }, '*');
  }, [embed, total, apartmentId]);

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

  /** Выбор по объектам конфигуратора (двери, окна, стены) → для отрисовки в 3D */
  const looks = useMemo(() => {
    const out: Record<string, Selection | undefined> = {};
    for (const sec of Object.values(s.sections)) {
      const id = sec.params?.elementId as string | undefined;
      if (sec.apartmentId === apartmentId && id) out[id] = sec.selection;
    }
    return out;
  }, [s.sections, apartmentId]);

  if (!layout) return <div className="loading">Загрузка…</div>;

  const openAcademy = (academyId: string, room: Room | null, el: LayoutElement | null, tab: AcademyTab = 'card') => {
    const def = academyById(academyId);
    if (!def || !catalog) return;
    const sectionRoom = def.scope === 'room' ? room : null;
    const id = `${apartmentId}|${sectionIdFor(def, sectionRoom, el)}`;
    const ctx = { catalog, layout, room: sectionRoom, element: el, proMode, role };
    useApp.getState().openSection(id, def.id, sectionRoom?.id ?? null, () => def.defaultParams(ctx), el?.id ?? null, tab);
  };

  /** Выбор объекта: только подсветка и плашка снизу. Панель открывается кнопкой на плашке. */
  const onElement = (picked: LayoutElement) => {
    const el = resolveSelectable(layout, picked);
    if (!el.academy) return;
    const st = useApp.getState();
    if (st.panel === 'academy' || st.panel === 'objects') st.set('panel', null);
    st.set('focusRoom', el.roomId);
    st.set('selectedElement', el.id);
  };

  /** Касание пола только выбирает комнату. */
  const onFloor = (room: Room) => {
    const st = useApp.getState();
    if (st.focusRoom === room.id) return;
    st.set('selectedElement', null);
    st.set('focusRoom', room.id);
    say(`${room.name}: нажмите на метку объекта, чтобы узнать о нём`);
  };

  const selected = s.selectedElement ? layout.elements.find((e) => e.id === s.selectedElement) ?? null : null;
  const selectedObj = selected ? selectableObjects(layout, catalog).find((o) => o.id === selected.id) ?? null : null;
  const openSelected = (tab: AcademyTab) => {
    if (!selected?.academy) return;
    openAcademy(selected.academy, layout.rooms.find((r) => r.id === selected.roomId) ?? null, selected, tab);
  };

  const apt = findApartment(apartmentId);
  const sectionsCount = total?.included.length ?? 0;

  return (
    <div className={`app ${panel ? 'with-panel' : ''} ${embed ? 'embed' : ''} ${compact ? 'compact' : ''} ${toolsOpen ? 'tools-open' : ''}`}>
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
          {embed && (
            <a className="btn ghost sm" href={fullScreenUrl()} target="_top" title="Открыть конструктор на весь экран">
              ⤢ На весь экран
            </a>
          )}
          {!embed && isFull && (
            <button className="btn ghost sm back-btn" onClick={goBackToSite} title="Вернуться на сайт">
              ← На сайт
            </button>
          )}
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
        <ApartmentScene layout={layout} floorColors={floorColors} looks={looks} onElement={onElement} onFloor={onFloor} />
        <CatalogBar />

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
            {s.categoryFilter !== 'all' && (
              <button className="chip filter-chip" title="Показать метки всех объектов" onClick={() => s.set('categoryFilter', 'all')}>
                Показано: {categoriesOf(catalog).find((c) => c.id === s.categoryFilter)?.icon} {categoriesOf(catalog).find((c) => c.id === s.categoryFilter)?.name ?? s.categoryFilter} ✕
              </button>
            )}
            <button className={!focusRoom ? 'chip on' : 'chip'} onClick={() => (s.set('focusRoom', null), s.set('selectedElement', null))}>
              Вся квартира
            </button>
            {layout.rooms.map((r) => (
              <button key={r.id} className={focusRoom === r.id ? 'chip on' : 'chip'} onClick={() => (s.set('focusRoom', r.id), s.set('selectedElement', null))}>
                {r.name} <span className="muted">{roomArea(r)}</span>
              </button>
            ))}
          </div>
        </div>

        <button className="chip tools-btn" aria-expanded={toolsOpen} onClick={() => setToolsOpen(!toolsOpen)}>
          {toolsOpen ? '✕ Закрыть' : '⚙ Вид'}
        </button>
        <div className="view-tools">
          {compact && (
            <div className="seg modes-inline" role="tablist" aria-label="Режим просмотра">
              {MODES.map((m) => (
                <button key={m.id} className={mode === m.id ? 'on' : ''} onClick={() => (s.set('mode', m.id), say(m.hint))}>
                  {m.label}
                </button>
              ))}
            </div>
          )}
          <div className="graphics-pick">
            <span>Графика</span>
            <div className="seg small" role="radiogroup" aria-label="Качество графики">
              {(
                [
                  ['low', 'Быстро', 'Без теней — для слабых компьютеров и телефонов'],
                  ['mid', 'Обычно', 'Тени без эффектов'],
                  ['high', 'Красиво', 'Мягкие тени и объёмное затенение — для мощных компьютеров'],
                ] as const
              ).map(([id, label, title]) => {
                const cur = s.graphics === 'auto' ? (isMobile ? 'low' : 'mid') : s.graphics;
                return (
                  <button key={id} className={cur === id ? 'on' : ''} title={title} onClick={() => s.set('graphics', id)}>
                    {label}
                  </button>
                );
              })}
            </div>
          </div>
          <label className="toggle" title="Камера на уровне глаз: стрелки или W/A/S/D, на телефоне — кнопки">
            <input type="checkbox" checked={s.walk} onChange={(e) => (s.set('walk', e.target.checked), e.target.checked && s.set('ceilingHidden', false), say(e.target.checked ? 'Прогулка: W/S — вперёд-назад, A/D — поворот, мышь — осмотр' : 'Обзор квартиры'))} />
            <span>Прогулка</span>
          </label>
          <label className="toggle">
            <input type="checkbox" checked={!s.ceilingHidden} onChange={(e) => s.set('ceilingHidden', !e.target.checked)} />
            <span>Потолок</span>
          </label>
          <label className="toggle">
            <input type="checkbox" checked={s.wallsTransparent} onChange={(e) => s.set('wallsTransparent', e.target.checked)} />
            <span>Прозрачные стены</span>
          </label>
        </div>

        {s.walk && (
          <div className="walk-pad" aria-label="Управление прогулкой">
            <button aria-label="Повернуть влево" onClick={() => (window as any).__walk?.turn(0.25)}>↶</button>
            <button aria-label="Вперёд" onClick={() => (window as any).__walk?.forward(0.6)}>▲</button>
            <button aria-label="Повернуть вправо" onClick={() => (window as any).__walk?.turn(-0.25)}>↷</button>
            <span />
            <button aria-label="Назад" onClick={() => (window as any).__walk?.forward(-0.6)}>▼</button>
            <span />
          </div>
        )}
        <HoverTip />
        {!s.walk && (
          <div className="nav-pad" aria-label="Управление камерой">
            <div className="drag-mode seg" role="group" aria-label="Левая кнопка мыши">
              <button className={s.dragMode === 'pan' ? 'on' : ''} title="Левая кнопка двигает квартиру (пробел — временно вращать)" onClick={() => s.set('dragMode', 'pan')}>✋ Двигать</button>
              <button className={s.dragMode === 'orbit' ? 'on' : ''} title="Левая кнопка вращает камеру вокруг точки под курсором" onClick={() => s.set('dragMode', 'orbit')}>⟳ Вращать</button>
            </div>
            <button title="Повернуть влево (Q)" aria-label="Повернуть влево" onClick={() => (window as any).__nav?.rotate(0.5)}>⟲</button>
            <button title="Приблизить (+)" aria-label="Приблизить" onClick={() => (window as any).__nav?.zoom(2)}>＋</button>
            <button title="Повернуть вправо (E)" aria-label="Повернуть вправо" onClick={() => (window as any).__nav?.rotate(-0.5)}>⟳</button>
            <button title="Вид сверху" aria-label="Вид сверху" onClick={() => (window as any).__nav?.top()}>⬒</button>
            <button title="Отдалить (−)" aria-label="Отдалить" onClick={() => (window as any).__nav?.zoom(-2)}>－</button>
            <button title="Вся квартира (H)" aria-label="Вся квартира" onClick={() => (window as any).__nav?.reset()}>⌂</button>
          </div>
        )}
        <div className="nav-hint">
          <b>Мышь:</b> левая — {s.dragMode === 'pan' ? 'тянуть квартиру' : 'вращать'} (кнопки ✋ ⟳ справа) · правая — {s.dragMode === 'pan' ? 'вращать вокруг точки' : 'тянуть'} · колесо — ближе к курсору · <b>Клавиши:</b> WASD — ехать · Q/E — поворот · R/F — наклон · Shift — быстрее · H — вся квартира
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

        {selectedObj && !panel && (
          <div className="selbar" role="region" aria-label="Выбранный объект">
            <span className="selbar-ico">{selectedObj.icon}</span>
            <div className="selbar-text">
              <b>{selectedObj.label}</b>
              <span className="muted small">{categoriesOf(catalog).find((c) => c.id === selectedObj.category)?.name} · {layout.rooms.find((r) => r.id === selectedObj.roomId)?.name}</span>
            </div>
            <div className="selbar-actions">
              <button className={mode === 'encyclopedia' ? 'btn' : 'btn ghost'} onClick={() => openSelected('lesson')}>
                Как устроено
              </button>
              <button className={mode === 'encyclopedia' ? 'btn ghost' : 'btn'} onClick={() => openSelected('card')}>
                Цена и варианты
              </button>
            </div>
            <button className="icon-btn sm" aria-label="Снять выбор" onClick={() => s.set('selectedElement', null)}>
              ✕
            </button>
          </div>
        )}

        {toast && (
          <div className="toast" role="status">
            {toast}
          </div>
        )}
      </main>

      <nav className="dock">
        <button className={panel === 'objects' ? 'on' : ''} onClick={() => s.set('panel', panel === 'objects' ? null : 'objects')}>
          <span className="ico">☰</span>
          <span>Объекты</span>
        </button>
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
      {panel === 'objects' && <ObjectsPanel onPick={onElement} />}
      {panel === 'estimate' && <EstimatePanel />}
      {panel === 'orders' && <OrdersPanel />}
      {panel === 'passport' && <PassportPanel />}
      {panel === 'about' && <AboutPanel />}
    </div>
  );
}

/** Подсказка при наведении: название объекта и цена выбранного главного товара. */
function HoverTip() {
  const hover = useApp((st) => st.hover);
  const { layout, catalog, sections, apartmentId } = useAppState();
  const [pos, setPos] = useState({ x: 0, y: 0 });
  useEffect(() => {
    if (!hover) return;
    const move = (e: PointerEvent) => setPos({ x: e.clientX, y: e.clientY });
    window.addEventListener('pointermove', move);
    return () => window.removeEventListener('pointermove', move);
  }, [hover]);
  if (!hover || !layout || !catalog || window.matchMedia?.('(pointer: coarse)').matches) return null;
  const el = layout.elements.find((e) => e.id === hover);
  if (!el) return null;
  let price: string | null = null;
  let sub = '';
  if (el.typeId) {
    const sec = sections[`${apartmentId}|${el.academy}:${el.id}`];
    const p = primaryProduct(catalog, el, sec?.selection);
    if (p) {
      sub = p.name;
      price = money(findPrice(catalog, p.id)?.sale);
    }
  } else {
    sub = 'Нажмите, чтобы открыть варианты и расчёт';
  }
  return (
    <div className="hovertip" style={{ left: pos.x + 14, top: pos.y + 14 }}>
      <b>{el.label}</b>
      {sub && <span>{sub}</span>}
      {price && <em>{price}</em>}
    </div>
  );
}
