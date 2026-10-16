// Поиск выгодных цен. Интерфейс готов к подключению Naidu.kz.
// API Naidu.kz здесь НЕ описывается и не выдумывается: реальный адаптер пишется после согласования контракта.
import type { Catalog, PriceOverride, Product, Unit } from '../../core/types';
import { parseCsv, parseKeyValues, parseNumber } from '../../catalog/sheetParser';
import offersCsv from '../../../data/naidu/offers.csv?raw';

export interface PriceQuery {
  productId: string;
  sku: string;
  name: string;
  unit: Unit;
  packSize: number;
  qty: number; // потребность в единицах товара
  specs: Record<string, string>;
  city?: string;
}

export interface Offer {
  offerId: string;
  sku: string;
  name: string;
  seller: string;
  unit: string;
  packSize: number;
  price: number;
  inStock: boolean;
  deliveryPrice: number;
  deliveryDays: number | null;
  specs: Record<string, string>;
  updatedAt: string;
  source: string;
}

export type Compatibility = 'same' | 'equivalent' | 'incompatible';

export interface ComparedOffer extends Offer {
  compatibility: Compatibility;
  reasons: string[];
  unitPriceInProductUnit: number | null; // цена за единицу товара сметы
  buyQty: number | null; // сколько единиц товара придётся купить
  goodsTotal: number | null;
  total: number | null; // товар + доставка
}

export interface PriceComparisonAdapter {
  readonly id: string;
  readonly label: string;
  readonly isDemo: boolean;
  search(q: PriceQuery): Promise<Offer[]>;
}

/** Демонстрационный адаптер: тестовые предложения из data/naidu/offers.csv. */
export class DemoNaiduAdapter implements PriceComparisonAdapter {
  readonly id = 'naidu-demo';
  readonly label = 'Naidu.kz (демо-данные)';
  readonly isDemo = true;
  private rows = parseCsv(offersCsv);
  async search(q: PriceQuery): Promise<Offer[]> {
    const [h, ...rest] = this.rows;
    const g = (r: string[], k: string) => (r[h.indexOf(k)] ?? '').trim();
    return rest
      .filter((r) => g(r, 'query_product_id') === q.productId)
      .map((r) => ({
        offerId: g(r, 'offer_id'),
        sku: g(r, 'sku'),
        name: g(r, 'name'),
        seller: g(r, 'seller'),
        unit: g(r, 'unit'),
        packSize: parseNumber(g(r, 'pack_size')) ?? 1,
        price: parseNumber(g(r, 'price')) ?? 0,
        inStock: g(r, 'in_stock') === '1',
        deliveryPrice: parseNumber(g(r, 'delivery_price')) ?? 0,
        deliveryDays: parseNumber(g(r, 'delivery_days')),
        specs: parseKeyValues(g(r, 'specs')),
        updatedAt: g(r, 'updated_at'),
        source: g(r, 'source') || 'DEMO',
      }));
  }
}

/**
 * Каркас реального адаптера. Endpoint и формат будут определены совместно с Naidu.kz.
 * Пока не настроен — честно сообщает об этом, а интерфейс использует демо-адаптер.
 */
export class NaiduHttpAdapter implements PriceComparisonAdapter {
  readonly id = 'naidu';
  readonly label = 'Naidu.kz';
  readonly isDemo = false;
  constructor(private endpoint?: string) {}
  async search(q: PriceQuery): Promise<Offer[]> {
    if (!this.endpoint) throw new Error('Интеграция Naidu.kz ещё не настроена (нет согласованного API)');
    const res = await fetch(this.endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(q) });
    if (!res.ok) throw new Error(`Naidu.kz ответил ${res.status}`);
    return (await res.json()) as Offer[];
  }
}

/** Характеристики, расхождение в которых делает предложение несовместимым. */
const KEY_SPECS = ['Класс износостойкости', 'Толщина (мм)', 'Холодопроизводительность (кВт)', 'Тип компрессора', 'Протокол', 'Нейтраль'];

export function compareOffer(product: Product, qty: number, offer: Offer): ComparedOffer {
  const reasons: string[] = [];
  let compatibility: Compatibility = offer.sku === product.sku ? 'same' : 'equivalent';
  for (const k of KEY_SPECS) {
    const a = product.specs[k];
    const b = offer.specs[k];
    if (a != null && b != null && a !== b) {
      compatibility = 'incompatible';
      reasons.push(`${k}: ${b} вместо ${a}`);
    } else if (a != null && b == null && compatibility === 'equivalent') reasons.push(`Не указано: ${k}`);
  }
  if (compatibility === 'equivalent' && reasons.length) compatibility = 'incompatible';
  if (offer.sku !== product.sku && compatibility !== 'incompatible') reasons.push('Другой артикул — проверьте характеристики');

  // Приведение единиц: offer.unit === product.unit или продажа упаковками с известным содержимым
  let unitPrice: number | null = null;
  let buyQty: number | null = null;
  if (offer.unit === product.unit) {
    unitPrice = offer.price;
    buyQty = Math.ceil(qty / offer.packSize - 1e-9) * offer.packSize;
  } else if (offer.unit === 'pack') {
    const perPack = parseNumber(offer.specs[`${unitLabel(product.unit)} в упаковке`]) ?? (offer.sku === product.sku ? product.packSize : null);
    if (perPack) {
      unitPrice = +(offer.price / perPack).toFixed(2);
      buyQty = +(Math.ceil(qty / perPack - 1e-9) * perPack).toFixed(2);
      reasons.push(`Цена за упаковку пересчитана: ${perPack} ${unitLabel(product.unit)} в упаковке`);
    }
  }
  if (unitPrice == null) {
    reasons.push(`Единица «${offer.unit}» не сопоставима с «${product.unit}»`);
    compatibility = 'incompatible';
  }
  if (!offer.inStock) reasons.push('Нет в наличии');
  const goodsTotal = unitPrice != null && buyQty != null ? Math.round(unitPrice * buyQty) : null;
  return { ...offer, compatibility, reasons, unitPriceInProductUnit: unitPrice, buyQty: buyQty != null ? +buyQty.toFixed(2) : null, goodsTotal, total: goodsTotal != null ? goodsTotal + offer.deliveryPrice : null };
}

const unitLabel = (u: Unit) => ({ m2: 'м²', m: 'м', pcs: 'шт', set: 'компл.', kg: 'кг', l: 'л', pack: 'уп.' })[u];

export function toOverride(o: ComparedOffer, productId: string): PriceOverride | null {
  if (o.compatibility === 'incompatible' || o.unitPriceInProductUnit == null) return null; // не подменяем несовместимым аналогом
  return { productId, offerId: o.offerId, seller: o.seller, unitPrice: o.unitPriceInProductUnit, deliveryPrice: o.deliveryPrice, updatedAt: o.updatedAt, source: o.source === 'DEMO' ? 'Naidu.kz (демо)' : 'Naidu.kz' };
}

export function queryFor(product: Product, qty: number): PriceQuery {
  return { productId: product.id, sku: product.sku, name: product.name, unit: product.unit, packSize: product.packSize, qty, specs: product.specs };
}

export function currentPrice(catalog: Catalog, productId: string) {
  return catalog.prices.find((p) => p.productId === productId)?.sale ?? null;
}

export function createPriceAdapter(): PriceComparisonAdapter {
  const url = import.meta.env?.VITE_NAIDU_ENDPOINT as string | undefined;
  return url ? new NaiduHttpAdapter(url) : new DemoNaiduAdapter();
}
