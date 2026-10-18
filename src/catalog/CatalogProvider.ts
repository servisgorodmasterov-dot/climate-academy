import type { Catalog } from '../core/types';
import { buildCatalog, hasRequiredColumns, parseCsv, SHEETS, type CoreSheetKey, type SheetKey, type SheetValues } from './sheetParser';

import productsCsv from '../../data/catalog/products.csv?raw';
import pricesCsv from '../../data/catalog/prices.csv?raw';
import worksCsv from '../../data/catalog/works.csv?raw';
import kitsCsv from '../../data/catalog/kits.csv?raw';
import suppliersCsv from '../../data/catalog/suppliers.csv?raw';
import consumablesCsv from '../../data/catalog/consumables.csv?raw';
import categoriesCsv from '../../data/catalog/categories.csv?raw';
import objectTypesCsv from '../../data/catalog/object_types.csv?raw';
import objectSlotsCsv from '../../data/catalog/object_slots.csv?raw';
import bulkCsv from '../../data/catalog/bulk.csv?raw';

/** Единый интерфейс источника каталога (товары, цены, работы, комплектации, поставщики, расходники, объекты). */
export interface CatalogProvider {
  readonly id: string;
  readonly label: string;
  load(opts?: { force?: boolean }): Promise<Catalog>;
}

/** Встроенные листы конфигуратора: используются, если в подключённой таблице их ещё нет. */
export const BUILTIN_CONFIG: Partial<SheetValues> = {
  categories: parseCsv(categoriesCsv),
  objectTypes: parseCsv(objectTypesCsv),
  objectSlots: parseCsv(objectSlotsCsv),
  bulk: parseCsv(bulkCsv),
};

/** Локальный демонстрационный каталог: CSV-файлы в data/catalog повторяют структуру Google Таблицы. */
export class DemoCatalogProvider implements CatalogProvider {
  readonly id = 'demo';
  readonly label = 'Демонстрационный каталог';
  async load(): Promise<Catalog> {
    const values: SheetValues = {
      products: parseCsv(productsCsv),
      prices: parseCsv(pricesCsv),
      works: parseCsv(worksCsv),
      kits: parseCsv(kitsCsv),
      suppliers: parseCsv(suppliersCsv),
      consumables: parseCsv(consumablesCsv),
      ...BUILTIN_CONFIG,
    };
    return buildCatalog(values, { status: 'demo', sourceName: 'DEMO' });
  }
}

export interface CacheStore {
  get(key: string): string | null;
  set(key: string, value: string): void;
}

const memoryCache = new Map<string, string>();
export const browserCache: CacheStore = {
  get: (k) => {
    try {
      return localStorage.getItem(k);
    } catch {
      return memoryCache.get(k) ?? null;
    }
  },
  set: (k, v) => {
    try {
      localStorage.setItem(k, v);
    } catch {
      memoryCache.set(k, v);
    }
  },
};

type Cached = { sheets: SheetValues; fetchedAt: string; savedAt: number };
function readCache(cache: CacheStore, key: string): Cached | null {
  try {
    const raw = cache.get(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/**
 * Google Sheets через собственный сервер.
 * Браузер НЕ обращается к Google напрямую и не хранит ключей: листы читает собственный сервер
 * (server/index.mjs, сервисный аккаунт, таблица остаётся закрытой) и отдаёт их по /api/catalog
 * в формате { sheets: { products: string[][], ... }, fetchedAt }.
 * Клиент кэширует ответ (TTL) и при недоступности сервера использует последнюю успешную копию.
 */
export class GoogleSheetsCatalogProvider implements CatalogProvider {
  readonly id = 'google-sheets';
  readonly label = 'Google Таблица';
  constructor(
    private endpoint = '/api/catalog',
    private ttlMs = 10 * 60 * 1000,
    private cache: CacheStore = browserCache,
    private fetchImpl: typeof fetch = (...a) => fetch(...a),
  ) {}

  private cacheKey = 'catalog-cache:google-sheets';

  async load(opts?: { force?: boolean }): Promise<Catalog> {
    const cached = readCache(this.cache, this.cacheKey);
    if (!opts?.force && cached && Date.now() - cached.savedAt < this.ttlMs) return this.toCatalog(cached.sheets, cached.fetchedAt, 'кэш');
    try {
      const res = await this.fetchImpl(this.endpoint, { headers: { Accept: 'application/json' } });
      if (!res.ok) throw new Error(`Сервер каталога ответил ${res.status}`);
      const body = (await res.json()) as { sheets: SheetValues; fetchedAt: string };
      if (!body?.sheets?.products) throw new Error('Некорректный ответ сервера каталога');
      this.cache.set(this.cacheKey, JSON.stringify({ ...body, savedAt: Date.now() }));
      return this.toCatalog(body.sheets, body.fetchedAt, 'сервер');
    } catch (e) {
      if (cached) {
        const c = this.toCatalog(cached.sheets, cached.fetchedAt, 'устаревший кэш');
        c.issues.unshift({ sheet: 'Связь', row: 0, message: `Google Таблица недоступна (${(e as Error).message}); показаны данные из кэша` });
        return c;
      }
      throw e;
    }
  }

  private toCatalog(sheets: SheetValues, fetchedAt: string, via: string): Catalog {
    const c = buildCatalog(sheets, { status: 'live', sourceName: `Google Таблица (${via})`, fallback: BUILTIN_CONFIG });
    c.loadedAt = fetchedAt;
    return c;
  }
}

/** Достаёт ID таблицы из ссылки вида https://docs.google.com/spreadsheets/d/<ID>/edit… или из самого ID. */
export function parseSheetRef(input: string | null | undefined): string | null {
  const s = (input ?? '').trim();
  if (!s) return null;
  const m = s.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]{20,})/);
  if (m) return m[1];
  return /^[a-zA-Z0-9-_]{20,}$/.test(s) ? s : null;
}

export const gvizUrl = (sheetId: string, sheetName: string) =>
  `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&headers=1&sheet=${encodeURIComponent(sheetName)}`;

/**
 * Google Таблица напрямую из браузера — без сервера (подходит для GitHub Pages).
 * Таблица должна быть открыта «Всем, у кого есть ссылка — Читатель».
 * Поэтому закупочные цены в этом режиме не читаются и не показываются никогда:
 * держите их в отдельной закрытой таблице или используйте режим с сервером.
 */
export class PublicSheetCatalogProvider implements CatalogProvider {
  readonly id = 'public-sheet';
  readonly label = 'Google Таблица (по ссылке)';
  constructor(
    readonly sheetId: string,
    private ttlMs = 5 * 60 * 1000,
    private cache: CacheStore = browserCache,
    private fetchImpl: typeof fetch = (...a) => fetch(...a),
  ) {}

  private get cacheKey() {
    return `catalog-cache:public-sheet:${this.sheetId}`;
  }

  async load(opts?: { force?: boolean }): Promise<Catalog> {
    const cached = readCache(this.cache, this.cacheKey);
    if (!opts?.force && cached && Date.now() - cached.savedAt < this.ttlMs) return this.toCatalog(cached.sheets, cached.fetchedAt, 'кэш');
    try {
      const sheets = await this.fetchAll();
      const fetchedAt = new Date().toISOString();
      this.cache.set(this.cacheKey, JSON.stringify({ sheets, fetchedAt, savedAt: Date.now() }));
      return this.toCatalog(sheets, fetchedAt, 'онлайн');
    } catch (e) {
      if (cached) {
        const c = this.toCatalog(cached.sheets, cached.fetchedAt, 'сохранённая копия');
        c.issues.unshift({ sheet: 'Связь', row: 0, message: `Таблица недоступна (${(e as Error).message}); показаны последние загруженные цены` });
        return c;
      }
      throw e;
    }
  }

  /** Читает все листы. Обязательные листы проверяются по колонкам: Google при неверном названии листа отдаёт первый лист. */
  async fetchAll(): Promise<SheetValues> {
    const keys = Object.keys(SHEETS) as SheetKey[];
    const results = await Promise.all(
      keys.map(async (k) => {
        try {
          const res = await this.fetchImpl(gvizUrl(this.sheetId, SHEETS[k]));
          if (!res.ok) return [k, null] as const;
          const text = await res.text();
          if (/^\s*</.test(text)) return [k, null] as const; // страница входа Google — доступ закрыт
          const rows = parseCsv(text);
          return [k, hasRequiredColumns(k, rows) ? rows : null] as const;
        } catch {
          return [k, null] as const;
        }
      }),
    );
    const sheets: Partial<SheetValues> = {};
    const missing: string[] = [];
    for (const [k, rows] of results) {
      if (rows) sheets[k] = rows;
      else if (!['categories', 'objectTypes', 'objectSlots', 'bulk'].includes(k)) missing.push(SHEETS[k]);
    }
    if (!sheets.products)
      throw new Error('нет доступа к таблице. Откройте доступ «Все, у кого есть ссылка — Читатель» и проверьте ссылку');
    if (missing.length) throw new Error(`не найдены листы: ${missing.join(', ')}. Названия листов и первую строку менять нельзя`);
    return sheets as SheetValues;
  }

  private toCatalog(sheets: SheetValues, fetchedAt: string, via: string): Catalog {
    const c = buildCatalog(sheets, { status: 'live', sourceName: `Google Таблица (${via})`, fallback: BUILTIN_CONFIG, hidePurchase: true });
    c.loadedAt = fetchedAt;
    return c;
  }
}

// ---------- Выбор источника ----------

const SHEET_KEY = 'catalog-sheet-id';

/** Таблица, выбранная на этом устройстве (поле во вкладке «Данные» или ?sheet= в ссылке). */
export function savedSheetId(cache: CacheStore = browserCache): string | null {
  return parseSheetRef(cache.get(SHEET_KEY));
}
export function saveSheetId(id: string | null, cache: CacheStore = browserCache) {
  cache.set(SHEET_KEY, id ?? '');
}

/** Ссылка вида …?sheet=<ID или ссылка на таблицу> подключает таблицу и запоминает её. */
export function sheetFromUrl(search: string): string | null {
  try {
    return parseSheetRef(new URLSearchParams(search).get('sheet'));
  } catch {
    return null;
  }
}

/**
 * Порядок выбора:
 * 1. VITE_CATALOG_SOURCE=google-sheets — свой сервер с сервисным аккаунтом (таблица закрыта, есть закупочные цены).
 * 2. Таблица по ссылке: сохранённая на устройстве → VITE_GOOGLE_SHEET_ID при сборке.
 * 3. Демо-каталог.
 */
export function createCatalogProvider(
  source = import.meta.env?.VITE_CATALOG_SOURCE as string | undefined,
  defaultSheet = import.meta.env?.VITE_GOOGLE_SHEET_ID as string | undefined,
): CatalogProvider {
  if (source === 'google-sheets') return new GoogleSheetsCatalogProvider();
  const sheet = savedSheetId() ?? parseSheetRef(defaultSheet);
  return sheet ? new PublicSheetCatalogProvider(sheet) : new DemoCatalogProvider();
}

export type { CoreSheetKey };
