// Универсальное ядро академий. Новая академия = объект AcademyDefinition + регистрация в academies/index.ts.
// Ядро (панель, карточки, сравнение, сметы, заказы, паспорт) не меняется при добавлении направлений.
import type { ComponentType } from 'react';
import type { Catalog, ElementKind, Layout, LayoutElement, Role, Room, Tier } from './types';
import type { EstimateSection } from '../estimate/engine';

export interface SlotChoice {
  productId: string | null; // null — позиция исключена пользователем
  workId: string | null;
}
export type Selection = Record<string, SlotChoice>;

export interface AcademyContext {
  catalog: Catalog;
  layout: Layout;
  room: Room | null; // null — академия на всю квартиру
  element: LayoutElement | null;
  proMode: boolean;
  role: Role;
}

export interface SlotDef {
  slot: string;
  label: string;
  optional?: boolean;
}

export interface AcademyViewProps<P> {
  ctx: AcademyContext;
  params: P;
  setParams: (p: P) => void;
  selection: Selection;
  tier: Tier;
}

export interface AcademyDefinition<P = any> {
  id: string;
  title: string;
  description: string;
  color: string;
  /** Какие объекты 3D-сцены открывают академию */
  elementKinds: ElementKind[];
  /** room — раздел на каждое помещение; apartment — один раздел на квартиру; element — на каждый объект (дверь, окно) */
  scope: 'room' | 'apartment' | 'element';
  slots: SlotDef[];
  /** Позиции, заданные в таблице (для объектов конфигуратора). Если есть — заменяют slots. */
  slotsFor?: (catalog: Catalog) => SlotDef[];
  /** Начальная комплектация уровня tier (по умолчанию — строки листа «Комплектации»). */
  initialSelection?: (catalog: Catalog, tier: Tier) => Selection;
  /** Позиция комплектации, карточку которой показывать по умолчанию */
  primarySlot: (el: LayoutElement | null) => string;
  defaultParams: (ctx: AcademyContext) => P;
  buildSection: (ctx: AcademyContext, tier: Tier, params: P, selection: Selection) => EstimateSection;
  Lesson: ComponentType<AcademyViewProps<P>>;
  Calculator: ComponentType<AcademyViewProps<P>>;
}

export function sectionIdFor(def: AcademyDefinition, room: Room | null, element: LayoutElement | null = null) {
  if (def.scope === 'element' && element) return `${def.id}:${element.id}`;
  return def.scope === 'apartment' || !room ? `${def.id}:apartment` : `${def.id}:${room.id}`;
}

export const slotsOf = (def: AcademyDefinition, catalog: Catalog) => def.slotsFor?.(catalog) ?? def.slots;

/** Комплектация уровня tier из листа «Комплектации». */
export function selectionFromKit(catalog: Catalog, academy: string, tier: Tier): Selection {
  const sel: Selection = {};
  for (const k of catalog.kits) if (k.academy === academy && k.tier === tier) sel[k.slot] = { productId: k.productId, workId: k.workId };
  return sel;
}
