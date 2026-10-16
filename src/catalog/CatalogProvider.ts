import type { Catalog } from '../core/types';
import { buildCatalog, parseCsv, type SheetValues } from './sheetParser';

import productsCsv from '../../data/catalog/products.csv?raw';
import pricesCsv from '../../data/catalog/prices.csv?raw';
import worksCsv from '../../data/catalog/works.csv?raw';
import kitsCsv from '../../data/catalog/kits.csv?raw';
import suppliersCsv from '../../data/catalog/suppliers.csv?raw';
import consumablesCsv from '../../data/catalog/consumables.csv?raw';

/** Единый интерфейс источника каталога (товары, цены, работы, комплектации, поставщики, расходники). */
export interface CatalogProvider {
  readonly id: string;
  readonly label: string;
  load(opts?: { force?: boolean }): Promise<Catalog>;
}

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

/**
 * Google Sheets.
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
    const cached = this.readCache();
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

  private readCache(): { sheets: SheetValues; fetchedAt: string; savedAt: number } | null {
    try {
      const raw = this.cache.get(this.cacheKey);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  private toCatalog(sheets: SheetValues, fetchedAt: string, via: string): Catalog {
    const c = buildCatalog(sheets, { status: 'live', sourceName: `Google Таблица (${via})` });
    c.loadedAt = fetchedAt;
    return c;
  }
}

/** Выбор источника: VITE_CATALOG_SOURCE=google-sheets включает таблицу, по умолчанию — демо. */
export function createCatalogProvider(source = import.meta.env?.VITE_CATALOG_SOURCE as string | undefined): CatalogProvider {
  return source === 'google-sheets' ? new GoogleSheetsCatalogProvider() : new DemoCatalogProvider();
}
