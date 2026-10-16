// Преобразование «листов» (двумерных массивов строк) в каталог.
// Одинаково работает для локальных CSV (демо) и ответа Google Sheets API (values.batchGet).
import {
  UNITS,
  type Catalog,
  type CatalogIssue,
  type ConsumableRule,
  type DataStatus,
  type KitRow,
  type Price,
  type Product,
  type ProductCategory,
  type Supplier,
  type Tier,
  type Unit,
  type Work,
} from '../core/types';

/** Названия листов шаблона Google Таблицы и соответствующих CSV-файлов. */
export const SHEETS = {
  products: 'Товары',
  prices: 'Цены',
  works: 'Работы',
  kits: 'Комплектации',
  suppliers: 'Поставщики',
  consumables: 'Расходники',
} as const;
export type SheetKey = keyof typeof SHEETS;
export type SheetValues = Record<SheetKey, string[][]>;

/** Обязательные колонки каждого листа. Порядок колонок в таблице может быть любым. */
export const REQUIRED_COLUMNS: Record<SheetKey, string[]> = {
  products: ['product_id', 'slot', 'academy', 'category', 'name', 'unit', 'pack_size', 'supplier_id'],
  prices: ['product_id', 'sale_price', 'currency', 'updated_at'],
  works: ['work_id', 'academy', 'slot', 'name', 'unit', 'price', 'updated_at'],
  kits: ['kit_id', 'academy', 'tier', 'slot', 'product_id'],
  suppliers: ['supplier_id', 'name', 'delivery_price'],
  consumables: ['product_id', 'for_slot', 'rate', 'rate_per'],
};

/** Простой и корректный CSV-парсер (кавычки, запятые и переводы строк внутри полей). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  const src = text.replace(/^﻿/, '');
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      row.push(field);
      field = '';
      if (row.some((v) => v.trim() !== '')) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((v) => v.trim() !== '')) rows.push(row);
  return rows;
}

export function parseKeyValues(s: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!s) return out;
  for (const part of s.split(';')) {
    const idx = part.indexOf('=');
    if (idx <= 0) continue;
    out[part.slice(0, idx).trim()] = part.slice(idx + 1).trim();
  }
  return out;
}

/** Число из ячейки: поддерживает «1 234,5», пустое значение → null. */
export function parseNumber(v: string | undefined): number | null {
  if (v == null) return null;
  const s = String(v).replace(/\s| /g, '').replace(',', '.');
  if (s === '' || s === '—' || s === '-') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export function isUnit(u: string): u is Unit {
  return Object.prototype.hasOwnProperty.call(UNITS, u);
}

function toObjects(sheet: SheetKey, values: string[][] | undefined, issues: CatalogIssue[]) {
  const name = SHEETS[sheet];
  if (!values || values.length === 0) {
    issues.push({ sheet: name, row: 0, message: 'Лист пуст или отсутствует' });
    return [] as { row: number; get: (k: string) => string }[];
  }
  const header = values[0].map((h) => h.trim());
  const missing = REQUIRED_COLUMNS[sheet].filter((c) => !header.includes(c));
  if (missing.length) {
    issues.push({ sheet: name, row: 1, message: `Нет обязательных колонок: ${missing.join(', ')}` });
    return [];
  }
  return values.slice(1).map((cells, i) => ({
    row: i + 2,
    get: (k: string) => (cells[header.indexOf(k)] ?? '').trim(),
  }));
}

const CATEGORIES: ProductCategory[] = ['material', 'equipment', 'consumable'];
const TIER_IDS: Tier[] = ['econom', 'comfort', 'premium'];

export function buildCatalog(values: SheetValues, opts: { status: DataStatus; sourceName: string }): Catalog {
  const issues: CatalogIssue[] = [];
  const S = SHEETS;

  // --- Товары
  const products: Product[] = [];
  const ids = new Set<string>();
  for (const r of toObjects('products', values.products, issues)) {
    const id = r.get('product_id');
    if (!id) {
      issues.push({ sheet: S.products, row: r.row, message: 'Пустой product_id — строка пропущена' });
      continue;
    }
    if (ids.has(id)) {
      issues.push({ sheet: S.products, row: r.row, message: `Повтор идентификатора ${id} — строка пропущена` });
      continue;
    }
    if (r.get('active') === '0') continue;
    const unit = r.get('unit');
    if (!isUnit(unit)) {
      issues.push({ sheet: S.products, row: r.row, message: `${id}: неизвестная единица «${unit}». Допустимо: ${Object.keys(UNITS).join(', ')}` });
      continue;
    }
    const category = r.get('category') as ProductCategory;
    if (!CATEGORIES.includes(category)) {
      issues.push({ sheet: S.products, row: r.row, message: `${id}: неизвестная категория «${category}»` });
      continue;
    }
    const pack = parseNumber(r.get('pack_size'));
    if (pack == null || pack <= 0) {
      issues.push({ sheet: S.products, row: r.row, message: `${id}: pack_size должен быть > 0` });
      continue;
    }
    ids.add(id);
    products.push({
      id,
      slot: r.get('slot'),
      academy: r.get('academy'),
      category,
      name: r.get('name'),
      purpose: r.get('purpose'),
      unit,
      packSize: pack,
      specs: parseKeyValues(r.get('specs')),
      attrs: parseKeyValues(r.get('attrs')),
      principle: r.get('principle'),
      warrantyMonths: parseNumber(r.get('warranty_months')) ?? 0,
      service: r.get('service'),
      supplierId: r.get('supplier_id'),
      sku: r.get('sku') || id,
    });
  }

  // --- Цены
  const prices: Price[] = [];
  for (const r of toObjects('prices', values.prices, issues)) {
    const productId = r.get('product_id');
    if (!ids.has(productId)) {
      issues.push({ sheet: S.prices, row: r.row, message: `Цена для неизвестного товара ${productId}` });
      continue;
    }
    const sale = parseNumber(r.get('sale_price'));
    const purchase = parseNumber(r.get('purchase_price'));
    if (sale == null) issues.push({ sheet: S.prices, row: r.row, message: `${productId}: нет продажной цены` });
    if (sale != null && purchase != null && purchase > sale)
      issues.push({ sheet: S.prices, row: r.row, message: `${productId}: закупочная цена выше продажной` });
    prices.push({
      productId,
      sale,
      purchase,
      currency: r.get('currency') || 'KZT',
      updatedAt: r.get('updated_at'),
      source: r.get('source') || opts.sourceName,
    });
  }
  for (const p of products)
    if (!prices.some((x) => x.productId === p.id))
      issues.push({ sheet: S.prices, row: 0, message: `Нет цены для товара ${p.id}` });

  // --- Работы
  const works: Work[] = [];
  for (const r of toObjects('works', values.works, issues)) {
    const unit = r.get('unit');
    if (!isUnit(unit)) {
      issues.push({ sheet: S.works, row: r.row, message: `${r.get('work_id')}: неизвестная единица «${unit}»` });
      continue;
    }
    works.push({
      id: r.get('work_id'),
      academy: r.get('academy'),
      slot: r.get('slot'),
      name: r.get('name'),
      unit,
      price: parseNumber(r.get('price')),
      updatedAt: r.get('updated_at'),
      source: r.get('source') || opts.sourceName,
    });
  }
  const workIds = new Set(works.map((w) => w.id));

  // --- Комплектации
  const kits: KitRow[] = [];
  for (const r of toObjects('kits', values.kits, issues)) {
    const tier = r.get('tier') as Tier;
    const productId = r.get('product_id');
    const workId = r.get('work_id') || null;
    if (!TIER_IDS.includes(tier)) {
      issues.push({ sheet: S.kits, row: r.row, message: `Неизвестный уровень «${tier}»` });
      continue;
    }
    if (!ids.has(productId)) {
      issues.push({ sheet: S.kits, row: r.row, message: `Комплектация ссылается на неизвестный товар ${productId}` });
      continue;
    }
    if (workId && !workIds.has(workId))
      issues.push({ sheet: S.kits, row: r.row, message: `Комплектация ссылается на неизвестную работу ${workId}` });
    kits.push({ kitId: r.get('kit_id'), academy: r.get('academy'), tier, slot: r.get('slot'), productId, workId: workId && workIds.has(workId) ? workId : null });
  }

  // --- Поставщики
  const suppliers: Supplier[] = toObjects('suppliers', values.suppliers, issues).map((r) => ({
    id: r.get('supplier_id'),
    name: r.get('name'),
    city: r.get('city'),
    deliveryPrice: parseNumber(r.get('delivery_price')),
    deliveryDays: parseNumber(r.get('delivery_days')),
    contact: r.get('contact'),
    catalogSource: r.get('catalog_source') || 'manual',
    updatedAt: r.get('updated_at'),
  }));

  // --- Расходники
  const consumables: ConsumableRule[] = [];
  for (const r of toObjects('consumables', values.consumables, issues)) {
    const productId = r.get('product_id');
    const rate = parseNumber(r.get('rate'));
    if (!ids.has(productId) || rate == null) {
      issues.push({ sheet: S.consumables, row: r.row, message: `Некорректная норма расхода для ${productId}` });
      continue;
    }
    consumables.push({ productId, forSlot: r.get('for_slot'), rate, ratePer: r.get('rate_per'), condition: parseKeyValues(r.get('condition')), note: r.get('note') });
  }

  const dates = [...prices.map((p) => p.updatedAt), ...works.map((w) => w.updatedAt)].filter(Boolean).sort();
  return {
    products,
    prices,
    works,
    kits,
    suppliers,
    consumables,
    issues,
    status: opts.status,
    sourceName: opts.sourceName,
    loadedAt: new Date().toISOString(),
    pricesUpdatedAt: dates[dates.length - 1] ?? '',
  };
}

// ---------- Удобные выборки ----------
export const findProduct = (c: Catalog, id: string) => c.products.find((p) => p.id === id);
export const findPrice = (c: Catalog, id: string) => c.prices.find((p) => p.productId === id);
export const findWork = (c: Catalog, id: string | null) => (id ? c.works.find((w) => w.id === id) : undefined);
export const findSupplier = (c: Catalog, id: string) => c.suppliers.find((s) => s.id === id);
export const productsForSlot = (c: Catalog, slot: string) => c.products.filter((p) => p.slot === slot);
export const kitFor = (c: Catalog, academy: string, tier: Tier) => c.kits.filter((k) => k.academy === academy && k.tier === tier);
