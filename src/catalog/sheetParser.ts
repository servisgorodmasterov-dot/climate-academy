// Преобразование «листов» (двумерных массивов строк) в каталог.
// Одинаково работает для локальных CSV (демо) и ответа Google Sheets API (values.batchGet).
import {
  BASES,
  RENDERERS,
  UNITS,
  type Basis,
  type BulkRule,
  type CategoryDef,
  type ObjectSlotDef,
  type ObjectType,
  type Renderer,
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
  categories: 'Категории',
  objectTypes: 'Объекты',
  objectSlots: 'Позиции объектов',
  bulk: 'Опт',
} as const;
export type SheetKey = keyof typeof SHEETS;
/** Листы конфигуратора объектов. Если их нет в таблице, берутся встроенные (демо) — старые таблицы продолжают работать. */
export const CONFIG_SHEETS = ['categories', 'objectTypes', 'objectSlots', 'bulk'] as const;
export type ConfigSheetKey = (typeof CONFIG_SHEETS)[number];
export type CoreSheetKey = Exclude<SheetKey, ConfigSheetKey>;
export type SheetValues = Record<CoreSheetKey, string[][]> & Partial<Record<ConfigSheetKey, string[][]>>;

/** Обязательные колонки каждого листа. Порядок колонок в таблице может быть любым. */
export const REQUIRED_COLUMNS: Record<SheetKey, string[]> = {
  products: ['product_id', 'slot', 'academy', 'category', 'name', 'unit', 'pack_size', 'supplier_id'],
  prices: ['product_id', 'sale_price', 'currency', 'updated_at'],
  works: ['work_id', 'academy', 'slot', 'name', 'unit', 'price', 'updated_at'],
  kits: ['kit_id', 'academy', 'tier', 'slot', 'product_id'],
  suppliers: ['supplier_id', 'name', 'delivery_price'],
  consumables: ['product_id', 'for_slot', 'rate', 'rate_per'],
  categories: ['category_id', 'name'],
  objectTypes: ['type_id', 'category_id', 'name', 'renderer', 'placement', 'primary_slot'],
  objectSlots: ['type_id', 'slot', 'label', 'qty', 'per'],
  bulk: ['kind', 'ref_id', 'min_participants', 'price'],
};

/** Есть ли в листе все обязательные колонки (пустой лист или чужой лист — нет). */
export function hasRequiredColumns(sheet: SheetKey, values: string[][] | undefined) {
  if (!values || !values.length) return false;
  const header = values[0].map((h) => h.trim());
  return REQUIRED_COLUMNS[sheet].every((c) => header.includes(c));
}

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

export function buildCatalog(values: SheetValues, opts: { status: DataStatus; sourceName: string; fallback?: Partial<SheetValues>; hidePurchase?: boolean }): Catalog {
  const issues: CatalogIssue[] = [];
  const S = SHEETS;
  values = { ...values };
  for (const k of CONFIG_SHEETS) {
    if (hasRequiredColumns(k, values[k])) continue;
    if (opts.fallback?.[k]) {
      values[k] = opts.fallback[k];
      issues.push({ sheet: S[k], row: 0, message: `Лист «${S[k]}» не найден — используется встроенный (демо). Добавьте лист, чтобы управлять им из таблицы.` });
    }
  }

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
      purchase: opts.hidePurchase ? null : purchase,
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

  // --- Категории
  const categories: CategoryDef[] = [];
  if (values.categories)
    for (const r of toObjects('categories', values.categories, issues)) {
      const id = r.get('category_id');
      if (!id || r.get('active') === '0') continue;
      categories.push({ id, name: r.get('name'), icon: r.get('icon') || '•', order: parseNumber(r.get('order')) ?? 99, description: r.get('description') });
    }
  categories.sort((a, b) => a.order - b.order);
  const catIds = new Set(categories.map((c) => c.id));

  // --- Типы объектов
  const objectTypes: ObjectType[] = [];
  if (values.objectTypes)
    for (const r of toObjects('objectTypes', values.objectTypes, issues)) {
      const id = r.get('type_id');
      if (!id || r.get('active') === '0') continue;
      const renderer = (r.get('renderer') || 'none') as Renderer;
      if (!RENDERERS.includes(renderer)) {
        issues.push({ sheet: S.objectTypes, row: r.row, message: `${id}: неизвестный вид отрисовки «${renderer}». Допустимо: ${RENDERERS.join(', ')}` });
        continue;
      }
      const category = r.get('category_id');
      if (catIds.size && !catIds.has(category)) issues.push({ sheet: S.objectTypes, row: r.row, message: `${id}: категория «${category}» не найдена на листе «${S.categories}»` });
      const list = (v: string) => v.split('|').map((x) => x.trim()).filter(Boolean);
      objectTypes.push({
        id,
        category,
        name: r.get('name'),
        icon: r.get('icon') || '•',
        renderer,
        placement: r.get('placement'),
        primarySlot: r.get('primary_slot'),
        description: r.get('description'),
        lessonSteps: list(r.get('lesson_steps')),
        mistakes: list(r.get('mistakes')),
        roomTypes: list(r.get('room_types')),
      });
    }
  const typeIds = new Set(objectTypes.map((t) => t.id));

  // --- Позиции объектов
  const isBasis = (b: string): b is Basis => Object.prototype.hasOwnProperty.call(BASES, b);
  const objectSlots: ObjectSlotDef[] = [];
  if (values.objectSlots)
    for (const r of toObjects('objectSlots', values.objectSlots, issues)) {
      const typeId = r.get('type_id');
      const slot = r.get('slot');
      if (!typeId || !slot) continue;
      if (!typeIds.has(typeId)) {
        issues.push({ sheet: S.objectSlots, row: r.row, message: `Позиция ${slot}: тип объекта «${typeId}» не найден на листе «${S.objectTypes}»` });
        continue;
      }
      const per = r.get('per');
      const workPer = r.get('work_per') || per;
      const qty = parseNumber(r.get('qty'));
      if (!isBasis(per) || !isBasis(workPer) || qty == null) {
        issues.push({ sheet: S.objectSlots, row: r.row, message: `${typeId}/${slot}: нужна норма qty и база per (${Object.keys(BASES).join(', ')})` });
        continue;
      }
      const def = r.get('default_product_id') || null;
      if (def && !ids.has(def)) issues.push({ sheet: S.objectSlots, row: r.row, message: `${typeId}/${slot}: товар по умолчанию ${def} не найден` });
      const workId = r.get('work_id') || null;
      if (workId && !workIds.has(workId)) issues.push({ sheet: S.objectSlots, row: r.row, message: `${typeId}/${slot}: работа ${workId} не найдена` });
      if (!products.some((p) => fitsSlot(p, slot))) issues.push({ sheet: S.objectSlots, row: r.row, message: `${typeId}/${slot}: на листе «${S.products}» нет товаров с этим slot` });
      objectSlots.push({
        typeId,
        slot,
        label: r.get('label') || slot,
        qty,
        per,
        waste: parseNumber(r.get('waste')) ?? 0,
        optional: r.get('optional') === '1',
        defaultProductId: def && ids.has(def) ? def : null,
        workId: workId && workIds.has(workId) ? workId : null,
        workPer,
        order: parseNumber(r.get('order')) ?? objectSlots.length,
        layerMm: parseNumber(r.get('layer_mm')),
        layerOptions: (r.get('layer_options') || '')
          .split(/[|;]/)
          .map((x) => parseNumber(x.trim()))
          .filter((x): x is number => x != null && x > 0),
        workLayerMm: parseNumber(r.get('work_layer_mm')),
        hint: r.get('hint') || '',
        qtyDefault: parseNumber(r.get('qty_default')),
        qtyPerM2: parseNumber(r.get('qty_per_m2')),
        qtyMin: parseNumber(r.get('qty_min')),
        qtyOptions: (r.get('qty_options') || '')
          .split(/[|;]/)
          .map((x) => parseNumber(x.trim()))
          .filter((x): x is number => x != null && x >= 0),
        qtySumOf: (r.get('qty_sum_of') || '')
          .split(/[|;]/)
          .map((x) => x.trim())
          .filter(Boolean),
      });
    }
  objectSlots.sort((a, b) => a.order - b.order);

  // --- Опт (коллективные закупки)
  const bulk: BulkRule[] = [];
  if (values.bulk)
    for (const r of toObjects('bulk', values.bulk, issues)) {
      const kind = r.get('kind') as BulkRule['kind'];
      const refId = r.get('ref_id');
      const minP = parseNumber(r.get('min_participants'));
      const price = parseNumber(r.get('price'));
      if (!['product', 'work', 'delivery'].includes(kind) || !refId || minP == null || price == null) {
        issues.push({ sheet: S.bulk, row: r.row, message: `Опт: нужны kind (product|work|delivery), ref_id, min_participants и price` });
        continue;
      }
      const known = kind === 'product' ? ids.has(refId) : kind === 'work' ? workIds.has(refId) : suppliers.some((x) => x.id === refId);
      if (!known) {
        issues.push({ sheet: S.bulk, row: r.row, message: `Опт: ${refId} не найден в каталоге` });
        continue;
      }
      bulk.push({ kind, refId, minParticipants: minP, price, note: r.get('note') });
    }

  const dates = [...prices.map((p) => p.updatedAt), ...works.map((w) => w.updatedAt)].filter(Boolean).sort();
  return {
    products,
    prices,
    works,
    kits,
    suppliers,
    consumables,
    categories,
    objectTypes,
    objectSlots,
    bulk,
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
/** Товар подходит позиции: свой slot или дополнительные в attrs «slots=floor.grout|wall.grout» (клей, затирка — и для стен, и для пола). */
export const fitsSlot = (p: Product, slot: string) => p.slot === slot || (p.attrs.slots ?? '').split('|').some((x) => x.trim() === slot);
export const productsForSlot = (c: Catalog, slot: string) => c.products.filter((p) => fitsSlot(p, slot));
export const objectType = (c: Catalog, id: string | undefined) => (id ? c.objectTypes.find((t) => t.id === id) : undefined);
export const slotsOfType = (c: Catalog, typeId: string) => c.objectSlots.filter((s) => s.typeId === typeId);
export const kitFor = (c: Catalog, academy: string, tier: Tier) => c.kits.filter((k) => k.academy === academy && k.tier === tier);
