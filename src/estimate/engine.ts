// Движок сметы. Чистые функции: одинаковые входные данные → одинаковый результат.
// Все цены, нормы расхода и кратности берутся только из каталога.
import {
  GROUP_LABELS,
  type BulkRule,
  type BulkSummary,
  type Catalog,
  type Estimate,
  type EstimateGroup,
  type EstimateLine,
  type PriceOverride,
  type Product,
  type Tier,
} from '../core/types';
import { findPrice, findProduct, findSupplier, findWork } from '../catalog/sheetParser';

/** Позиция комплектации, рассчитанная академией. */
export interface SelectionItem {
  slot: string;
  productId: string | null;
  workId: string | null;
  needQty: number; // потребность в единицах товара (с учётом запаса)
  workQty: number; // объём работ в единицах работы
  basis: Record<string, number>; // базы для норм расхода: m2, m, pcs, mm
}

/** Раздел сметы: одна академия в одном помещении (или во всей квартире). */
export interface EstimateSection {
  id: string;
  academy: string;
  label: string;
  tier: Tier;
  items: SelectionItem[];
  params: Record<string, string>;
}

export const round2 = (n: number) => Math.round(n * 100) / 100;

/** Количество к покупке с учётом кратности упаковки. */
export function roundToPack(need: number, packSize: number): number {
  if (need <= 0) return 0;
  const packs = Math.ceil(need / packSize - 1e-9);
  return round2(packs * packSize);
}

const groupOf = (p: Product): EstimateGroup =>
  p.category === 'equipment' ? 'equipment' : p.category === 'consumable' ? 'consumables' : 'materials';

function conditionMatches(cond: Record<string, string>, params: Record<string, string>) {
  return Object.entries(cond).every(([k, v]) => params[k] === v);
}

/** Потребность в расходниках для позиции по нормам листа «Расходники». */
export function consumablesFor(catalog: Catalog, item: SelectionItem, params: Record<string, string>) {
  const out: { productId: string; need: number; note: string }[] = [];
  for (const rule of catalog.consumables) {
    if (rule.forSlot !== item.slot || !conditionMatches(rule.condition, params)) continue;
    const base = rule.ratePer.split('*').reduce((acc, k) => acc * (item.basis[k.trim()] ?? 0), 1);
    const need = round2(rule.rate * base);
    if (need > 0) out.push({ productId: rule.productId, need, note: rule.note });
  }
  return out;
}

export function computeEstimate(
  catalog: Catalog,
  sections: EstimateSection[],
  overrides: Record<string, PriceOverride> = {},
  participants = 1,
): Estimate {
  const warnings: string[] = [];
  type Acc = { need: number; sections: Set<string>; notes: Set<string> };
  const productNeed = new Map<string, Acc>();
  const workNeed = new Map<string, Acc>();
  const add = (map: Map<string, Acc>, id: string, need: number, section: string, note?: string) => {
    const a = map.get(id) ?? { need: 0, sections: new Set(), notes: new Set() };
    a.need = round2(a.need + need);
    a.sections.add(section);
    if (note) a.notes.add(note);
    map.set(id, a);
  };

  for (const s of sections) {
    for (const item of s.items) {
      if (item.productId && item.needQty > 0) add(productNeed, item.productId, item.needQty, s.label);
      if (item.workId && item.workQty > 0) add(workNeed, item.workId, item.workQty, s.label);
      for (const c of consumablesFor(catalog, item, s.params)) add(productNeed, c.productId, c.need, s.label, c.note);
    }
  }

  const lines: EstimateLine[] = [];
  const suppliersUsed = new Set<string>();
  const overrideSellers = new Map<string, number>();

  for (const [id, acc] of productNeed) {
    const p = findProduct(catalog, id);
    if (!p) {
      warnings.push(`Товар ${id} отсутствует в каталоге`);
      continue;
    }
    const qty = roundToPack(acc.need, p.packSize);
    const ov = overrides[id];
    const price = findPrice(catalog, id);
    const unitPrice = ov ? ov.unitPrice : price?.sale ?? null;
    const line: EstimateLine = {
      key: `p:${id}`,
      group: groupOf(p),
      section: [...acc.sections].join(', '),
      refId: id,
      name: p.name,
      unit: p.unit,
      needQty: acc.need,
      qty,
      unitPrice,
      total: unitPrice == null ? null : Math.round(unitPrice * qty),
      priceSource: ov ? `${ov.source}: ${ov.seller}` : price?.source ?? '—',
      priceUpdatedAt: ov ? ov.updatedAt : price?.updatedAt ?? '',
      note: [...acc.notes].join(' ') || (qty !== acc.need ? `Кратность продажи: ${p.packSize}` : undefined),
    };
    if (unitPrice == null) {
      line.warning = 'Нет цены в каталоге — позиция не включена в итог';
      warnings.push(`Нет цены: ${p.name}`);
    }
    lines.push(line);
    if (ov) overrideSellers.set(ov.seller, Math.max(overrideSellers.get(ov.seller) ?? 0, ov.deliveryPrice));
    else suppliersUsed.add(p.supplierId);
  }

  for (const [id, acc] of workNeed) {
    const w = findWork(catalog, id);
    if (!w) {
      warnings.push(`Работа ${id} отсутствует в каталоге`);
      continue;
    }
    const qty = round2(acc.need);
    lines.push({
      key: `w:${id}`,
      group: 'works',
      section: [...acc.sections].join(', '),
      refId: id,
      name: w.name,
      unit: w.unit,
      needQty: qty,
      qty,
      unitPrice: w.price,
      total: w.price == null ? null : Math.round(w.price * qty),
      priceSource: w.source,
      priceUpdatedAt: w.updatedAt,
      warning: w.price == null ? 'Нет расценки — позиция не включена в итог' : undefined,
    });
    if (w.price == null) warnings.push(`Нет расценки: ${w.name}`);
  }

  for (const sid of suppliersUsed) {
    const s = findSupplier(catalog, sid);
    if (!s) {
      warnings.push(`Поставщик ${sid} не найден — доставка не рассчитана`);
      continue;
    }
    lines.push({
      key: `d:${sid}`,
      group: 'delivery',
      section: 'Вся смета',
      refId: sid,
      name: `Доставка: ${s.name}`,
      unit: 'trip',
      needQty: 1,
      qty: 1,
      unitPrice: s.deliveryPrice,
      total: s.deliveryPrice,
      priceSource: catalog.status === 'demo' ? 'DEMO' : catalog.sourceName,
      priceUpdatedAt: s.updatedAt,
      warning: s.deliveryPrice == null ? 'Стоимость доставки не указана' : undefined,
    });
  }
  for (const [seller, price] of overrideSellers)
    lines.push({
      key: `d:offer:${seller}`,
      group: 'delivery',
      section: 'Вся смета',
      refId: seller,
      name: `Доставка: ${seller}`,
      unit: 'trip',
      needQty: 1,
      qty: 1,
      unitPrice: price,
      total: price,
      priceSource: 'Предложение поиска цен',
      priceUpdatedAt: '',
    });

  const order: EstimateGroup[] = ['materials', 'equipment', 'consumables', 'works', 'delivery'];
  lines.sort((a, b) => order.indexOf(a.group) - order.indexOf(b.group) || a.name.localeCompare(b.name, 'ru'));
  const totals = Object.fromEntries(order.map((g) => [g, 0])) as Record<EstimateGroup, number>;
  for (const l of lines) if (l.total != null) totals[l.group] += l.total;
  const total = order.reduce((s, g) => s + totals[g], 0);
  const est: Estimate = { lines, totals, total, warnings, currency: catalog.prices[0]?.currency ?? 'KZT', priceStatus: catalog.status };
  if (participants > 1) est.bulk = applyBulk(catalog, est, participants);
  return est;
}

/**
 * Коллективная закупка: для каждой позиции берётся лучшее условие листа «Опт», порог которого достигнут
 * числом участников. Нет условия — цена остаётся розничной. Доставка поставщика делится по условию «delivery».
 */
export function applyBulk(catalog: Catalog, est: Estimate, participants: number): BulkSummary {
  const savings = Object.fromEntries(Object.keys(est.totals).map((g) => [g, 0])) as Record<EstimateGroup, number>;
  let total = 0;
  let linesWithOffer = 0;
  const best = (kind: BulkRule['kind'], refId: string) =>
    catalog.bulk
      .filter((b) => b.kind === kind && b.refId === refId && b.minParticipants <= participants)
      .sort((a, b) => b.minParticipants - a.minParticipants)[0];
  for (const l of est.lines) {
    const kind: BulkRule['kind'] = l.key.startsWith('p:') ? 'product' : l.key.startsWith('w:') ? 'work' : 'delivery';
    const rule = l.key.startsWith('d:offer:') ? undefined : best(kind, l.refId);
    if (!rule || l.unitPrice == null || l.total == null) {
      l.bulkUnitPrice = l.unitPrice;
      l.bulkTotal = l.total;
      total += l.total ?? 0;
      continue;
    }
    const unit = Math.min(rule.price, l.unitPrice);
    const sum = Math.round(unit * l.qty);
    l.bulkUnitPrice = unit;
    l.bulkTotal = sum;
    l.bulkNote = rule.note || `от ${rule.minParticipants} участников`;
    savings[l.group] += l.total - sum;
    total += sum;
    if (sum < l.total) linesWithOffer++;
  }
  const savingsTotal = Object.values(savings).reduce((a, b) => a + b, 0);
  return { participants, total, savings, savingsTotal, linesWithOffer };
}

export { GROUP_LABELS };
