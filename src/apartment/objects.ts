// Единая модель выбираемых объектов квартиры.
// Всё, что можно выбрать (пол, дверь, окно, стены, кондиционер, датчик...), описывается одинаково,
// поэтому новые типы объектов добавляются строками таблицы, без изменения логики выбора.
import type { Catalog, CategoryDef, ElementKind, Layout, LayoutElement } from '../core/types';
import { objectType } from '../catalog/sheetParser';

export type ObjectCategory = string;

/** Категории левого каталога по умолчанию — если в таблице нет листа «Категории». */
export const DEFAULT_CATEGORIES: CategoryDef[] = [
  ['doors', 'Двери', '🚪'],
  ['windows', 'Окна', '🪟'],
  ['floor', 'Напольные покрытия', '▦'],
  ['walls', 'Стены и отделка', '🖌'],
  ['ceiling', 'Потолки', '⬜'],
  ['electric', 'Электрика', '⚡'],
  ['plumbing', 'Сантехника', '🚿'],
  ['furniture', 'Мебель', '🛋'],
  ['climate', 'Кондиционирование', '❄'],
  ['smarthome', 'Умный дом', '◉'],
  ['lighting', 'Освещение', '💡'],
  ['engineering', 'Инженерные коммуникации', '⚙'],
].map(([id, name, icon], i) => ({ id, name, icon, order: i + 1, description: '' }));

export const categoriesOf = (catalog: Catalog | null): CategoryDef[] => (catalog?.categories.length ? catalog.categories : DEFAULT_CATEGORIES);

/** Встроенные объекты планировки (у них своя 3D-модель и своя академия). */
const KIND_META: Partial<Record<ElementKind, { category: ObjectCategory; icon: string; short: string }>> = {
  floor: { category: 'floor', icon: '▦', short: 'Пол' },
  ac_indoor: { category: 'climate', icon: '❄', short: 'Кондиционер' },
  ac_outdoor: { category: 'climate', icon: '❄', short: 'Наружный блок' },
  smart_switch: { category: 'smarthome', icon: '⏻', short: 'Выключатель' },
  motion_sensor: { category: 'smarthome', icon: '◎', short: 'Датчик движения' },
  leak_sensor: { category: 'smarthome', icon: '💧', short: 'Датчик протечки' },
  smart_hub: { category: 'smarthome', icon: '◉', short: 'Хаб' },
  radiator: { category: 'engineering', icon: '♨', short: 'Радиатор' },
  electric_panel: { category: 'engineering', icon: '⚡', short: 'Электрощит' },
  riser: { category: 'engineering', icon: '┃', short: 'Стояк' },
};

export interface SelectableObject {
  id: string; // = id элемента планировки
  element: LayoutElement;
  category: ObjectCategory;
  icon: string;
  short: string;
  label: string;
  roomId: string;
  /** Точка, над которой показывается метка */
  anchor: [number, number, number];
  academy: string | null;
}

/** Выбираемыми считаются объекты, у которых есть академия (есть что изучить и посчитать). */
export function selectableObjects(layout: Layout, catalog: Catalog | null = null): SelectableObject[] {
  const out: SelectableObject[] = [];
  for (const e of layout.elements) {
    if (!e.academy || e.partOf) continue;
    const t = catalog ? objectType(catalog, e.typeId) : undefined;
    const m = t ? { category: t.category, icon: t.icon, short: t.name } : KIND_META[e.kind];
    if (!m) continue;
    const anchor: [number, number, number] =
      e.kind === 'floor'
        ? [e.position[0], 0.05, e.position[2]]
        : e.kind === 'room_walls'
          ? [e.position[0], 2.0, e.position[2]]
          : e.kind === 'room_ceiling' || e.kind === 'room_light' || e.kind === 'room_electric'
            ? e.position
          : e.kind === 'furniture'
            ? [e.position[0], 1.0, e.position[2]]
          : [e.position[0], e.position[1] + (e.kind === 'leak_sensor' ? 0.12 : e.kind === 'door' || e.kind === 'entrance' ? 0.75 : 0.22), e.position[2]];
    out.push({ id: e.id, element: e, category: m.category, icon: m.icon, short: m.short, label: e.label, roomId: e.roomId, anchor, academy: e.academy ?? null });
  }
  return out;
}

/** Касание считается выбором, только если палец/мышь почти не сдвинулись (иначе это вращение камеры). */
export const TAP_THRESHOLD_PX = 12;

/** Наружный блок и другие составные части выбираются как свой основной объект. */
export function resolveSelectable(layout: Layout, el: LayoutElement): LayoutElement {
  return el.partOf ? layout.elements.find((e) => e.id === el.partOf) ?? el : el;
}
