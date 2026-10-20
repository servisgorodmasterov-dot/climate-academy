import { describe, expect, it } from 'vitest';
import { buildCatalog, parseCsv, parseNumber, type SheetValues, fitsSlot } from '../catalog/sheetParser';
import { DemoCatalogProvider, GoogleSheetsCatalogProvider, type CacheStore } from '../catalog/CatalogProvider';

const minimal = (): SheetValues => ({
  products: [
    ['product_id', 'slot', 'academy', 'category', 'name', 'unit', 'pack_size', 'supplier_id'],
    ['P1', 'floor.laminate', 'flooring', 'material', 'Ламинат', 'm2', '2,13', 'S1'],
  ],
  prices: [['product_id', 'sale_price', 'purchase_price', 'currency', 'updated_at'], ['P1', '4 400', '3500', 'KZT', '2026-10-16']],
  works: [['work_id', 'academy', 'slot', 'name', 'unit', 'price', 'updated_at']],
  kits: [['kit_id', 'academy', 'tier', 'slot', 'product_id']],
  suppliers: [['supplier_id', 'name', 'delivery_price'], ['S1', 'Поставщик', '5000']],
  consumables: [['product_id', 'for_slot', 'rate', 'rate_per']],
});

describe('CSV и числа', () => {
  it('разбирает кавычки, запятые и переводы строк', () => {
    expect(parseCsv('a,b\n"x, y","say ""hi"""\r\n')).toEqual([
      ['a', 'b'],
      ['x, y', 'say "hi"'],
    ]);
  });
  it('понимает пробелы-разделители и запятую', () => {
    expect(parseNumber('1 234,5')).toBe(1234.5);
    expect(parseNumber('')).toBeNull();
    expect(parseNumber('abc')).toBeNull();
  });
});

describe('Каталог из листов', () => {
  it('строит каталог и разделяет закупочную и продажную цены', () => {
    const c = buildCatalog(minimal(), { status: 'live', sourceName: 't' });
    expect(c.products[0].packSize).toBe(2.13);
    expect(c.prices[0]).toMatchObject({ sale: 4400, purchase: 3500 });
    expect(c.issues).toEqual([]);
  });
  it('отклоняет неизвестную единицу измерения', () => {
    const v = minimal();
    v.products[1][5] = 'кв.м';
    const c = buildCatalog(v, { status: 'live', sourceName: 't' });
    expect(c.products).toHaveLength(0);
    expect(c.issues.some((i) => i.message.includes('неизвестная единица'))).toBe(true);
  });
  it('сообщает о дублях идентификаторов, отсутствии цены и колонок', () => {
    const v = minimal();
    v.products.push([...v.products[1]]);
    v.prices = [['product_id', 'sale_price', 'currency', 'updated_at']];
    v.works = [['work_id']];
    const c = buildCatalog(v, { status: 'live', sourceName: 't' });
    const msgs = c.issues.map((i) => i.message).join('\n');
    expect(msgs).toContain('Повтор идентификатора P1');
    expect(msgs).toContain('Нет цены для товара P1');
    expect(msgs).toContain('Нет обязательных колонок');
  });
  it('демо-каталог загружается без ошибок и согласован', async () => {
    const c = await new DemoCatalogProvider().load();
    expect(c.status).toBe('demo');
    expect(c.issues).toEqual([]);
    expect(c.products.length).toBeGreaterThan(30);
    for (const k of c.kits) expect(fitsSlot(c.products.find((p) => p.id === k.productId)!, k.slot)).toBe(true);
    for (const p of c.products) expect(c.prices.find((x) => x.productId === p.id)?.source).toBe('DEMO');
  });
});

describe('GoogleSheetsCatalogProvider', () => {
  const mem = (): CacheStore => {
    const m = new Map<string, string>();
    return { get: (k) => m.get(k) ?? null, set: (k, v) => void m.set(k, v) };
  };
  it('загружает с сервера, кэширует и работает из кэша при сбое', async () => {
    const cache = mem();
    let calls = 0;
    const ok = (async () => {
      calls++;
      return new Response(JSON.stringify({ sheets: minimal(), fetchedAt: '2026-10-16T00:00:00Z' }));
    }) as typeof fetch;
    const p1 = new GoogleSheetsCatalogProvider('/api/catalog', 60_000, cache, ok);
    expect((await p1.load()).products).toHaveLength(1);
    await p1.load();
    expect(calls).toBe(1); // второй раз — из кэша
    const fail = (async () => new Response('', { status: 502 })) as typeof fetch;
    const p2 = new GoogleSheetsCatalogProvider('/api/catalog', 0, cache, fail);
    const c = await p2.load();
    expect(c.products).toHaveLength(1);
    expect(c.issues[0].message).toContain('кэша');
  });
  it('без кэша и без сервера — ошибка (приложение переключится на демо)', async () => {
    const fail = (async () => new Response('', { status: 503 })) as typeof fetch;
    await expect(new GoogleSheetsCatalogProvider('/api/catalog', 0, mem(), fail).load()).rejects.toThrow();
  });
});
