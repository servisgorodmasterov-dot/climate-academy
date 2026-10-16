import type { Catalog, Product, Room, Tier } from '../../core/types';
import type { Selection } from '../../core/academy';
import type { EstimateSection, SelectionItem } from '../../estimate/engine';
import { roomArea } from '../../apartment/layout';

export interface ClimateParams {
  area: number;
  height: number;
  sun: 'low' | 'mid' | 'high';
  people: number;
  appliancesW: number;
  routeM: number;
  chase: boolean;
}

/** Удельная теплонагрузка, Вт/м³ — упрощённая методика предварительной оценки. */
export const SUN_LOAD = { low: 30, mid: 35, high: 40 } as const;
export const SUN_LABEL = { low: 'Мало солнца (север, тень)', mid: 'Среднее', high: 'Много солнца (юг, большие окна)' } as const;
/** Тепловыделение одного человека в спокойном состоянии, Вт. */
export const PERSON_W = 100;

export function defaultClimateParams(room: Room | null, ceiling: number): ClimateParams {
  const living = room?.type === 'living';
  return {
    area: room ? roomArea(room) : 20,
    height: ceiling,
    sun: 'mid',
    people: 2,
    appliancesW: living ? 300 : 100,
    routeM: 5,
    chase: false,
  };
}

/**
 * Предварительная холодопроизводительность, кВт:
 * Q = S·h·q + N·0.1 кВт + тепло техники.
 * Это оценка для выбора класса мощности; окончательный подбор выполняет мастер.
 */
export function coolingLoadKw(p: ClimateParams) {
  const q1 = (p.area * p.height * SUN_LOAD[p.sun]) / 1000;
  const q2 = (p.people * PERSON_W) / 1000;
  const q3 = p.appliancesW / 1000;
  const total = q1 + q2 + q3;
  return { q1: +q1.toFixed(2), q2: +q2.toFixed(2), q3: +q3.toFixed(2), total: +total.toFixed(2) };
}

/** Подбор модели серии: минимальная мощность не ниже Q·0.95 (допуск −5 %). */
export function recommendModel(catalog: Catalog, series: string, requiredKw: number): { product: Product | null; note: string } {
  const list = catalog.products
    .filter((p) => p.slot === 'ac.split' && p.attrs.series === series)
    .sort((a, b) => Number(a.attrs.capacity_kw) - Number(b.attrs.capacity_kw));
  if (!list.length) return { product: null, note: 'В каталоге нет моделей этой серии' };
  const fit = list.find((p) => Number(p.attrs.capacity_kw) >= requiredKw * 0.95);
  if (fit) {
    const cap = Number(fit.attrs.capacity_kw);
    return { product: fit, note: cap > requiredKw * 1.3 ? 'Модель заметно мощнее расчёта — проверьте, нет ли модели меньше в другой серии' : 'Мощность соответствует расчёту' };
  }
  return { product: list[list.length - 1], note: 'Расчётная нагрузка выше самой мощной модели серии — нужен мастер (возможно, два блока или мульти-сплит)' };
}

export function seriesOf(tier: Tier) {
  return tier;
}

export function buildClimateSection(catalog: Catalog, room: Room, tier: Tier, p: ClimateParams, sel: Selection): EstimateSection {
  const items: SelectionItem[] = [];
  const split = sel['ac.split'];
  if (split?.productId) items.push({ slot: 'ac.split', productId: split.productId, workId: split.workId, needQty: 1, workQty: 1, basis: { pcs: 1 } });
  const route = sel['ac.route'];
  if (route?.productId) items.push({ slot: 'ac.route', productId: route.productId, workId: route.workId, needQty: p.routeM, workQty: p.routeM, basis: { m: p.routeM } });
  const cable = sel['ac.cable'];
  if (cable?.productId) items.push({ slot: 'ac.cable', productId: cable.productId, workId: cable.workId, needQty: p.routeM, workQty: 0, basis: { m: p.routeM } });
  const br = sel['ac.bracket'];
  if (br?.productId) items.push({ slot: 'ac.bracket', productId: br.productId, workId: br.workId, needQty: 1, workQty: 0, basis: { pcs: 1 } });
  if (p.chase) {
    const w = catalog.works.find((x) => x.slot === 'ac.chase');
    items.push({ slot: 'ac.chase', productId: null, workId: w?.id ?? null, needQty: 0, workQty: p.routeM, basis: { m: p.routeM } });
  }
  return { id: `climate:${room.id}`, academy: 'climate', label: `Кондиционер — ${room.name}`, tier, items, params: {} };
}
