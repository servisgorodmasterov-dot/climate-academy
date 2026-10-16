import { describe, expect, it } from 'vitest';
import { DemoCatalogProvider } from '../catalog/CatalogProvider';
import { computeEstimate, roundToPack, type EstimateSection } from '../estimate/engine';
import { selectionFromKit } from '../core/academy';
import { getLayout } from '../apartment/layout';
import { buildFlooringSection, defaultFlooringParams, flooringGeometry } from '../academies/flooring/logic';
import { buildClimateSection, coolingLoadKw, defaultClimateParams, recommendModel } from '../academies/climate/logic';
import { buildSmartHomeSection, defaultSmartHomeParams } from '../academies/smarthome/logic';

const catalog = await new DemoCatalogProvider().load();
const layout = getLayout('type-2k-68');
const living = layout.rooms.find((r) => r.id === 'living')!;

describe('Кратность упаковки', () => {
  it('округляет вверх до целой упаковки', () => {
    expect(roundToPack(21.4, 2.13)).toBe(23.43);
    expect(roundToPack(10, 5)).toBe(10);
    expect(roundToPack(0, 5)).toBe(0);
  });
});

describe('Академия напольных покрытий', () => {
  it('считает геометрию гостиной с учётом проёмов', () => {
    const g = flooringGeometry(layout, living, defaultFlooringParams());
    expect(g.area).toBe(20);
    expect(g.perimeter).toBe(18);
    expect(g.doors).toBe(2.2); // дверь 0.8 + арка 1.4
    expect(g.skirting).toBe(15.8);
  });
  it('смета «Комфорт» для гостиной считается только по каталогу', () => {
    const sel = selectionFromKit(catalog, 'flooring', 'comfort');
    const sec = buildFlooringSection(catalog, layout, living, 'comfort', defaultFlooringParams(), sel);
    const e = computeEstimate(catalog, [sec]);
    const lam = e.lines.find((l) => l.refId === 'FL-LAM-32-8')!;
    expect(lam.needQty).toBe(21.4);
    expect(lam.qty).toBe(23.43);
    expect(lam.total).toBe(Math.round(23.43 * 4400));
    expect(e.lines.find((l) => l.refId === 'FL-FILM-200')?.qty).toBe(30); // 20×1.15=23 → рулон 30
    expect(e.lines.find((l) => l.refId === 'FL-CLIP-50')?.qty).toBe(50);
    expect(e.totals.delivery).toBe(5000);
    expect(e.total).toBe(211537);
    expect(e.warnings).toEqual([]);
  });
  it('стяжка добавляет смесь и грунт по норме расхода', () => {
    const sel = selectionFromKit(catalog, 'flooring', 'econom');
    const p = { ...defaultFlooringParams(), needScreed: true, screedMm: 10 };
    const e = computeEstimate(catalog, [buildFlooringSection(catalog, layout, living, 'econom', p, sel)]);
    expect(e.lines.find((l) => l.refId === 'FL-SCREED-25')?.needQty).toBe(320); // 1.6 × 20 × 10
    expect(e.lines.find((l) => l.refId === 'FL-SCREED-25')?.qty).toBe(325);
    expect(e.lines.find((l) => l.refId === 'W-FL-SCR')?.qty).toBe(20);
  });
  it('исключённая позиция не попадает в смету', () => {
    const sel = selectionFromKit(catalog, 'flooring', 'comfort');
    sel['floor.underlay'] = { productId: null, workId: null };
    const e = computeEstimate(catalog, [buildFlooringSection(catalog, layout, living, 'comfort', defaultFlooringParams(), sel)]);
    expect(e.lines.some((l) => l.refId === 'FL-UND-XPS-3')).toBe(false);
  });
  it('одинаковый товар из разных комнат объединяется до округления', () => {
    const sel = selectionFromKit(catalog, 'flooring', 'comfort');
    const bedroom = layout.rooms.find((r) => r.id === 'bedroom')!;
    const s1 = buildFlooringSection(catalog, layout, living, 'comfort', defaultFlooringParams(), sel);
    const s2 = buildFlooringSection(catalog, layout, bedroom, 'comfort', defaultFlooringParams(), sel);
    const e = computeEstimate(catalog, [s1, s2]);
    expect(e.lines.filter((l) => l.refId === 'FL-LAM-32-8')).toHaveLength(1);
    expect(e.lines.find((l) => l.refId === 'FL-LAM-32-8')?.needQty).toBe(38.52);
  });
});

describe('Академия кондиционирования', () => {
  it('расчёт мощности по упрощённой методике', () => {
    const p = defaultClimateParams(living, 2.7);
    expect(coolingLoadKw(p)).toEqual({ q1: 1.89, q2: 0.2, q3: 0.3, total: 2.39 });
  });
  it('подбор модели в пределах серии', () => {
    expect(recommendModel(catalog, 'comfort', 2.39).product?.id).toBe('AC-C-09');
    expect(recommendModel(catalog, 'comfort', 3.4).product?.id).toBe('AC-C-12'); // 3.5 ≥ 3.4×0.95
    const big = recommendModel(catalog, 'econom', 9);
    expect(big.product?.id).toBe('AC-E-12');
    expect(big.note).toContain('мастер');
  });
  it('трасса тянет дренаж по норме и монтаж по метрам', () => {
    const sel = selectionFromKit(catalog, 'climate', 'comfort');
    const p = { ...defaultClimateParams(living, 2.7), routeM: 7, chase: true };
    const e = computeEstimate(catalog, [buildClimateSection(catalog, living, 'comfort', p, sel)]);
    expect(e.lines.find((l) => l.refId === 'AC-DRAIN')?.qty).toBe(7);
    expect(e.lines.find((l) => l.refId === 'W-AC-ROUTE')?.qty).toBe(7);
    expect(e.lines.find((l) => l.refId === 'W-AC-CHASE')?.qty).toBe(7);
    expect(e.totals.delivery).toBe(0);
  });
});

describe('Академия умного дома', () => {
  it('берёт количество точек из планировки', () => {
    expect(defaultSmartHomeParams(layout)).toMatchObject({ switches: 4, motion: 1, leak: 2 });
  });
  it('без нейтрали добавляет кабель и работу; с нейтралью — нет', () => {
    const sel = selectionFromKit(catalog, 'smarthome', 'comfort');
    const no = computeEstimate(catalog, [buildSmartHomeSection(catalog, 'comfort', { ...defaultSmartHomeParams(layout), neutral: 'no' }, sel)]);
    expect(no.lines.find((l) => l.refId === 'SH-CABLE-15')?.qty).toBe(16);
    expect(no.lines.find((l) => l.refId === 'W-SH-NEUTRAL')?.qty).toBe(4);
    const yes = computeEstimate(catalog, [buildSmartHomeSection(catalog, 'comfort', { ...defaultSmartHomeParams(layout), neutral: 'yes' }, sel)]);
    expect(yes.lines.some((l) => l.refId === 'SH-CABLE-15' || l.refId === 'W-SH-NEUTRAL')).toBe(false);
  });
  it('эконом-комплект Wi-Fi работает без хаба', () => {
    const sel = selectionFromKit(catalog, 'smarthome', 'econom');
    const e = computeEstimate(catalog, [buildSmartHomeSection(catalog, 'econom', defaultSmartHomeParams(layout), sel)]);
    expect(e.lines.some((l) => l.refId.startsWith('SH-HUB'))).toBe(false);
  });
});

describe('Защита от пропусков данных', () => {
  it('позиция без цены не попадает в итог и даёт предупреждение', () => {
    const broken = { ...catalog, prices: catalog.prices.map((p) => (p.productId === 'FL-LAM-32-8' ? { ...p, sale: null } : p)) };
    const sel = selectionFromKit(broken, 'flooring', 'comfort');
    const sec: EstimateSection = buildFlooringSection(broken, layout, living, 'comfort', defaultFlooringParams(), sel);
    const e = computeEstimate(broken, [sec]);
    expect(e.lines.find((l) => l.refId === 'FL-LAM-32-8')?.total).toBeNull();
    expect(e.warnings.join()).toContain('Нет цены');
    expect(e.total).toBe(211537 - Math.round(23.43 * 4400));
  });
});
