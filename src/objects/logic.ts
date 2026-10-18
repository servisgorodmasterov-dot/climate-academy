// Универсальная логика конфигуратора: тип объекта, его позиции и расчёт — всё из таблицы.
// Код не знает, что такое «дверь» или «краска»: он умножает нормы из листа «Позиции объектов»
// на размеры из геометрии и берёт цены из листов «Цены» и «Работы».
import type { Basis, Catalog, Layout, LayoutElement, ObjectSlotDef, Product, Tier } from '../core/types';
import { BASES } from '../core/types';
import type { Selection } from '../core/academy';
import type { EstimateSection, SelectionItem } from '../estimate/engine';
import { round2 } from '../estimate/engine';
import { findProduct, objectType, slotsOfType } from '../catalog/sheetParser';
import { generateObjectElements, measure } from './geometry';

export const OBJECT_PREFIX = 'obj:';
export const academyIdForType = (typeId: string) => `${OBJECT_PREFIX}${typeId}`;
export const typeIdFromAcademy = (academy: string) => (academy.startsWith(OBJECT_PREFIX) ? academy.slice(OBJECT_PREFIX.length) : null);

/** Связь «место в планировке → тип из таблицы»: placement типа совпадает с видом элемента. */
export function typeForElement(catalog: Catalog, el: LayoutElement) {
  if (el.typeId) return objectType(catalog, el.typeId);
  return catalog.objectTypes.find((t) => t.placement === placementOf(el));
}

/** Место объекта в планировке: door | entrance | window | room_walls | furniture:<тип предмета> */
export function placementOf(el: LayoutElement, layout?: Layout) {
  if (el.kind !== 'furniture') return el.kind;
  const type = layout && el.furniture != null ? layout.furniture[el.furniture]?.type : el.id.replace(/^furn-/, '').replace(/-\d+$/, '');
  return `furniture:${type}`;
}

/** Добавляет в планировку объекты из геометрии (если их ещё нет). Без каталога они не выбираются. */
export function withGeneratedObjects(layout: Layout): Layout {
  if (layout.elements.some((e) => e.kind === 'room_walls')) return layout;
  return { ...layout, elements: [...layout.elements, ...generateObjectElements(layout)] };
}

/** Назначает объектам тип и академию по каталогу. Тип убрали из таблицы — объект перестаёт быть выбираемым. */
export function bindObjectTypes(layout: Layout, catalog: Catalog | null): Layout {
  const generated = new Set(['door', 'entrance', 'window', 'room_walls', 'furniture']);
  return {
    ...layout,
    elements: layout.elements.map((e) => {
      if (!generated.has(e.kind)) return e;
      const t = catalog ? catalog.objectTypes.find((x) => x.placement === placementOf(e, layout)) : undefined;
      if (!t) return { ...e, typeId: undefined, academy: undefined };
      return { ...e, typeId: t.id, academy: academyIdForType(t.id), label: e.label.replace(/^[^:]+:/, `${t.name}:`) };
    }),
  };
}

/**
 * Комплектация по умолчанию: товары по умолчанию из «Позиций объектов»,
 * поверх — строки листа «Комплектации» для выбранного уровня (academy = id типа).
 * Если для уровня есть строки, необязательные позиции без строки выключаются.
 */
export function objectSelection(catalog: Catalog, typeId: string, tier: Tier): Selection {
  const slots = slotsOfType(catalog, typeId);
  const kit = catalog.kits.filter((k) => (k.academy === typeId || k.academy === academyIdForType(typeId)) && k.tier === tier);
  const sel: Selection = {};
  for (const s of slots) {
    const row = kit.find((k) => k.slot === s.slot);
    if (row) sel[s.slot] = { productId: row.productId, workId: row.workId };
    else if (kit.length && s.optional) sel[s.slot] = { productId: null, workId: null };
    else sel[s.slot] = { productId: s.defaultProductId, workId: s.workId };
  }
  return sel;
}

const num = (v: string | undefined) => {
  if (v == null || v === '') return null;
  const n = Number(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};
const isBasis = (v: string | undefined): v is Basis => !!v && Object.prototype.hasOwnProperty.call(BASES, v);

/**
 * Норма для выбранного товара. Товар может переопределить норму позиции в колонке attrs:
 * rate=0.1 (рулон обоев на 1 м²), per=wall_m2, waste=0.15, work=W-WL-WP, work_per=wall_m2.
 */
export function ruleFor(slot: ObjectSlotDef, p: Product | undefined) {
  const a = p?.attrs ?? {};
  return {
    rate: num(a.rate) ?? slot.qty,
    per: isBasis(a.per) ? a.per : slot.per,
    waste: num(a.waste) ?? slot.waste,
    workId: a.work || slot.workId,
    workPer: isBasis(a.work_per) ? a.work_per : a.work ? (isBasis(a.per) ? a.per : slot.workPer) : slot.workPer,
  };
}

export interface ObjectLine {
  slot: ObjectSlotDef;
  product: Product | undefined;
  need: number;
  workId: string | null;
  workQty: number;
}

/** Расчёт позиций одного объекта. */
export function objectLines(catalog: Catalog, layout: Layout, el: LayoutElement, selection: Selection): ObjectLine[] {
  const t = typeForElement(catalog, el);
  if (!t) return [];
  const m = measure(layout, el);
  return slotsOfType(catalog, t.id).map((slot) => {
    const choice = selection[slot.slot];
    const pid = choice === undefined ? slot.defaultProductId : choice.productId;
    const product = pid ? findProduct(catalog, pid) : undefined;
    if (!product) return { slot, product: undefined, need: 0, workId: null, workQty: 0 };
    const r = ruleFor(slot, product);
    return { slot, product, need: round2(r.rate * m[r.per] * (1 + r.waste)), workId: r.workId, workQty: round2(m[r.workPer]) };
  });
}

/** Раздел сметы для объекта: позиции идут в общий движок, где одинаковые товары складываются без дублей. */
export function buildObjectSection(catalog: Catalog, layout: Layout, el: LayoutElement, tier: Tier, selection: Selection, sectionId: string): EstimateSection {
  const t = typeForElement(catalog, el);
  const m = measure(layout, el);
  const items: SelectionItem[] = objectLines(catalog, layout, el, selection)
    .filter((l) => l.product)
    .map((l) => ({
      slot: l.slot.slot,
      productId: l.product!.id,
      workId: l.workId,
      needQty: l.need,
      workQty: l.workId ? l.workQty : 0,
      basis: { ...m, m2: m.wall_m2 || m.opening_m2 || m.floor_m2, m: m.opening_perimeter_m || m.perimeter_m },
    }));
  return { id: sectionId, academy: academyIdForType(t?.id ?? 'unknown'), label: el.label, tier, items, params: { type: t?.id ?? '' } };
}

/** Начальная комплектация любого раздела: объекты конфигуратора — по «Позициям объектов», академии — по «Комплектациям». */
export function selectionFor(catalog: Catalog, academy: string, tier: Tier): Selection {
  const typeId = typeIdFromAcademy(academy);
  if (typeId) return objectSelection(catalog, typeId, tier);
  const sel: Selection = {};
  for (const k of catalog.kits) if (k.academy === academy && k.tier === tier) sel[k.slot] = { productId: k.productId, workId: k.workId };
  return sel;
}

/** Комплектация объекта, которую видит пользователь до первого изменения (уровень «Комфорт», как при открытии панели). */
export const DEFAULT_TIER: Tier = 'comfort';
const effective = (catalog: Catalog, typeId: string, selection: Selection | undefined) => selection ?? objectSelection(catalog, typeId, DEFAULT_TIER);

/** Главный товар объекта (для вида в 3D и карточки). */
export function primaryProduct(catalog: Catalog, el: LayoutElement, selection: Selection | undefined): Product | undefined {
  const t = typeForElement(catalog, el);
  if (!t) return undefined;
  const pid = effective(catalog, t.id, selection)[t.primarySlot]?.productId;
  return pid ? findProduct(catalog, pid) : undefined;
}

/** Атрибуты внешнего вида объекта: главный товар + остальные позиции (ручка, коробка). */
export function lookOf(catalog: Catalog, el: LayoutElement, selection: Selection | undefined): Record<string, string> {
  const t = typeForElement(catalog, el);
  if (!t) return {};
  const sel = effective(catalog, t.id, selection);
  const out: Record<string, string> = {};
  for (const slot of slotsOfType(catalog, t.id)) {
    if (slot.slot === t.primarySlot) continue;
    const pid = sel[slot.slot]?.productId;
    const p = pid ? findProduct(catalog, pid) : undefined;
    if (p) for (const [k, v] of Object.entries(p.attrs)) if (!['color', 'tier', 'model', 'rate', 'per', 'waste', 'work', 'work_per'].includes(k)) out[k] = v;
  }
  const main = primaryProduct(catalog, el, sel);
  if (main) Object.assign(out, main.attrs);
  return out;
}
