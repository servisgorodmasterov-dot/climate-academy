// Одна универсальная «академия» на любой тип объекта из листа «Объекты».
// Двери, окна, отделка стен — и всё, что будет добавлено в таблицу позже, — работают через неё.
import type { AcademyDefinition } from '../core/academy';
import type { Catalog } from '../core/types';
import { objectType, slotsOfType } from '../catalog/sheetParser';
import { academyIdForType, buildObjectSection, objectSelection, typeIdFromAcademy, type Layers } from './logic';
import { ObjectCalculator, ObjectLesson } from './ObjectUI';

export interface ObjectParams {
  elementId: string | null;
  /** Толщины слоёв (штукатурка, шпаклёвка), мм — выбирает пользователь в расчёте */
  layers?: Layers;
}

let current: Catalog | null = null;
const cache = new Map<string, AcademyDefinition<ObjectParams>>();

/** Вызывается при каждой загрузке каталога: названия, позиции и цвета типов берутся из новой версии таблицы. */
export function setObjectCatalog(catalog: Catalog | null) {
  current = catalog;
  cache.clear();
}

const COLORS: Record<string, string> = { doors: '#8a5a3c', windows: '#2f86c9', walls: '#c06a4a', ceiling: '#7d8a99', lighting: '#d79b00' };

export function objectAcademy(academyId: string): AcademyDefinition<ObjectParams> | undefined {
  const typeId = typeIdFromAcademy(academyId);
  if (!typeId) return undefined;
  const hit = cache.get(typeId);
  if (hit) return hit;
  const t = current ? objectType(current, typeId) : undefined;
  if (current && !t) return undefined;
  const def: AcademyDefinition<ObjectParams> = {
    id: academyIdForType(typeId),
    title: t?.name ?? typeId,
    description: t?.description ?? '',
    color: COLORS[t?.category ?? ''] ?? '#0066fa',
    elementKinds: [],
    scope: 'element',
    slots: [],
    slotsFor: (c) => slotsOfType(c, typeId).map((s) => ({ slot: s.slot, label: s.label, optional: s.optional })),
    initialSelection: (c, tier) => objectSelection(c, typeId, tier),
    primarySlot: () => t?.primarySlot ?? '',
    defaultParams: (ctx) => ({ elementId: ctx.element?.id ?? null }),
    buildSection: (ctx, tier, params, sel) => {
      const el = ctx.element ?? ctx.layout.elements.find((e) => e.id === params.elementId);
      if (!el) return { id: def.id, academy: def.id, label: def.title, tier, items: [], params: {} };
      return buildObjectSection(ctx.catalog, ctx.layout, el, tier, sel, `${def.id}:${el.id}`, params.layers);
    },
    Lesson: ObjectLesson,
    Calculator: ObjectCalculator,
  };
  cache.set(typeId, def);
  return def;
}
