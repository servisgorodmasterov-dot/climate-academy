// Единая модель выбираемых объектов квартиры.
// Всё, что можно выбрать (пол, кондиционер, датчик...), описывается здесь одинаково,
// поэтому новые типы объектов и академии добавляются без изменения логики выбора.
import type { ElementKind, Layout, LayoutElement } from '../core/types';

export type ObjectCategory = 'finish' | 'climate' | 'smarthome' | 'engineering';

export const CATEGORIES: { id: ObjectCategory; label: string; icon: string }[] = [
  { id: 'finish', label: 'Отделка', icon: '▦' },
  { id: 'climate', label: 'Климат', icon: '❄' },
  { id: 'smarthome', label: 'Умный дом', icon: '◉' },
  { id: 'engineering', label: 'Инженерия', icon: '⚙' },
];

const KIND_META: Record<ElementKind, { category: ObjectCategory; icon: string; short: string }> = {
  floor: { category: 'finish', icon: '▦', short: 'Пол' },
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
export function selectableObjects(layout: Layout): SelectableObject[] {
  return layout.elements
    .filter((e) => !!e.academy && !e.partOf)
    .map((e) => {
      const m = KIND_META[e.kind];
      const anchor: [number, number, number] =
        e.kind === 'floor' ? [e.position[0], 0.05, e.position[2]] : [e.position[0], e.position[1] + (e.kind === 'leak_sensor' ? 0.12 : 0.22), e.position[2]];
      return { id: e.id, element: e, category: m.category, icon: m.icon, short: m.short, label: e.label, roomId: e.roomId, anchor, academy: e.academy ?? null };
    });
}

/** Касание считается выбором, только если палец/мышь почти не сдвинулись (иначе это вращение камеры). */
export const TAP_THRESHOLD_PX = 6;

/** Наружный блок и другие составные части выбираются как свой основной объект. */
export function resolveSelectable(layout: Layout, el: LayoutElement): LayoutElement {
  return el.partOf ? layout.elements.find((e) => e.id === el.partOf) ?? el : el;
}
