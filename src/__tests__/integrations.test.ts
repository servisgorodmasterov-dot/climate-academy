import { describe, expect, it } from 'vitest';
import { DemoCatalogProvider } from '../catalog/CatalogProvider';
import { compareOffer, DemoNaiduAdapter, queryFor, toOverride, NaiduHttpAdapter } from '../integrations/naidu/PriceComparisonAdapter';
import { computeEstimate } from '../estimate/engine';
import { selectionFromKit } from '../core/academy';
import { getLayout } from '../apartment/layout';
import { buildFlooringSection, defaultFlooringParams } from '../academies/flooring/logic';
import { advance, freezeOrder, nextActions } from '../integrations/gorodmasterov/orders';
import { mapEShanyraqRole, readLaunchContext, toEShanyraqPassportRecord } from '../integrations/eshanyraq/bridge';

const catalog = await new DemoCatalogProvider().load();
const lam = catalog.products.find((p) => p.id === 'FL-LAM-32-8')!;

describe('Поиск дешевле (демо Naidu.kz)', () => {
  it('сравнивает итоговую стоимость и не подставляет несовместимый аналог', async () => {
    const offers = await new DemoNaiduAdapter().search(queryFor(lam, 21.4));
    const cmp = offers.map((o) => compareOffer(lam, 21.4, o));
    const same = cmp.find((o) => o.offerId === 'OF-1')!;
    expect(same.compatibility).toBe('same');
    expect(same.total).toBe(Math.round(4150 * 23.43) + 7000);
    const pack = cmp.find((o) => o.offerId === 'OF-2')!;
    expect(pack.unitPriceInProductUnit).toBeCloseTo(9100 / 2.13, 1);
    expect(pack.total).toBe(9100 * 11);
    const analog = cmp.find((o) => o.offerId === 'OF-3')!;
    expect(analog.compatibility).toBe('incompatible');
    expect(toOverride(analog, lam.id)).toBeNull();
  });
  it('выбранное предложение меняет цену в смете и доставку', async () => {
    const offer = compareOffer(lam, 21.4, (await new DemoNaiduAdapter().search(queryFor(lam, 21.4)))[0]);
    const ov = toOverride(offer, lam.id)!;
    const layout = getLayout('type-2k-68');
    const sec = buildFlooringSection(catalog, layout, layout.rooms[1], 'comfort', defaultFlooringParams(), selectionFromKit(catalog, 'flooring', 'comfort'));
    const e = computeEstimate(catalog, [sec], { [lam.id]: ov });
    expect(e.lines.find((l) => l.refId === lam.id)?.unitPrice).toBe(4150);
    expect(e.lines.some((l) => l.key === 'd:offer:Демо-продавец А')).toBe(true);
  });
  it('реальный адаптер без настроенного API честно сообщает об этом', async () => {
    await expect(new NaiduHttpAdapter().search(queryFor(lam, 1))).rejects.toThrow('не настроена');
  });
});

describe('Заказы «Города мастеров»', () => {
  const layout = getLayout('type-2k-68');
  const sec = buildFlooringSection(catalog, layout, layout.rooms[1], 'comfort', defaultFlooringParams(), selectionFromKit(catalog, 'flooring', 'comfort'));
  const est = computeEstimate(catalog, [sec]);
  it('фиксирует цены: изменение сметы не влияет на заказ', () => {
    const o = freezeOrder('apt-72', est, [sec], 'DEMO', { name: 'Тест', phone: '+7 700' }, '');
    est.lines[0].unitPrice = 1;
    expect(o.lines[0].unitPrice).not.toBe(1);
    expect(o.total).toBe(211537);
    expect(o.sectionRooms['Пол — Гостиная']).toBe('living');
  });
  it('переходы статусов ограничены ролями', () => {
    const o = freezeOrder('apt-72', est, [sec], 'DEMO', { name: 'Т', phone: '1' }, '');
    expect(nextActions(o, 'resident').map((t) => t.to)).toEqual(['cancelled']);
    expect(() => advance(o, 'accepted', 'resident')).toThrow();
    const a = advance(o, 'accepted', 'master');
    const d = advance(a, 'done', 'master');
    expect(d.history.map((h) => h.status)).toEqual(['sent', 'accepted', 'done']);
  });
});

describe('E-Shanyraq', () => {
  it('читает параметры перехода из личного кабинета', () => {
    expect(readLaunchContext('?source=eshanyraq&apartment=72&ticket=abc&role=master')).toEqual({ source: 'eshanyraq', apartment: '72', ticket: 'abc', role: 'master' });
    expect(readLaunchContext('?role=root').role).toBeNull();
  });
  it('сопоставляет роли и категории паспорта', () => {
    expect(mapEShanyraqRole('dispatcher')).toBe('admin');
    const r = toEShanyraqPassportRecord(
      { id: '1', apartmentId: 'apt-72', roomId: 'living', category: 'hidden_work', zone: 'стена', title: 'Кабель', description: '', files: [], authorRole: 'master', createdAt: '' },
      'uuid-72',
    );
    expect(r.category).toBe('hidden_work');
    expect(r.details.source).toBe('3d-home-academy');
  });
});
