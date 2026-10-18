import { describe, expect, it } from 'vitest';
import { DemoCatalogProvider, parseSheetRef } from '../catalog/CatalogProvider';
import { getLayout } from '../apartment/layout';
import { generateObjectElements, measure, roomWallRects } from '../objects/geometry';
import { bindObjectTypes, objectLines, objectSelection, withGeneratedObjects } from '../objects/logic';
import { computeEstimate } from '../estimate/engine';
import { buildObjectSection } from '../objects/logic';

const catalog = await new DemoCatalogProvider().load();
const base = getLayout('type-2k-68');
const layout = bindObjectTypes(withGeneratedObjects(base), catalog);

describe('конфигуратор объектов', () => {
  it('демо-каталог читает листы «Категории», «Объекты» и «Позиции объектов» без замечаний', () => {
    expect(catalog.categories.length).toBeGreaterThanOrEqual(12);
    expect(catalog.objectTypes.map((t) => t.id)).toEqual(['door.interior', 'door.entrance', 'window', 'wall.finish', 'furniture.kitchen', 'furniture.bed', 'furniture.wardrobe', 'furniture.sofa']);
    expect(catalog.issues.filter((i) => ['Объекты', 'Позиции объектов', 'Категории'].includes(i.sheet))).toEqual([]);
    expect(catalog.issues.filter((i) => /Нет цены/.test(i.message))).toEqual([]);
  });

  it('двери, входная дверь, окна и стены создаются из геометрии планировки', () => {
    const gen = generateObjectElements(base);
    const kinds = (k: string) => gen.filter((e) => e.kind === k);
    expect(kinds('door')).toHaveLength(4); // 5 проёмов, один — арка шире 1.05 м
    expect(kinds('entrance')).toHaveLength(1);
    expect(kinds('window')).toHaveLength(3);
    expect(kinds('room_walls')).toHaveLength(base.rooms.length);
    for (const e of gen) expect(base.rooms.some((r) => r.id === e.roomId)).toBe(true);
    // дверь спальни относится к спальне, а не к прихожей
    expect(gen.find((e) => e.kind === 'door' && e.rooms?.includes('bedroom'))?.roomId).toBe('bedroom');
  });

  it('объекты получают тип и академию из каталога; без типа в таблице объект не выбирается', () => {
    const door = layout.elements.find((e) => e.kind === 'door')!;
    expect(door.typeId).toBe('door.interior');
    expect(door.academy).toBe('obj:door.interior');
    expect(door.label).toMatch(/^Межкомнатная дверь: /);
    const stripped = bindObjectTypes(layout, { ...catalog, objectTypes: catalog.objectTypes.filter((t) => t.id !== 'window') });
    expect(stripped.elements.find((e) => e.kind === 'window')?.academy).toBeUndefined();
  });

  it('площадь стен считается за вычетом дверей и окон', () => {
    const bedroom = base.rooms.find((r) => r.id === 'bedroom')!;
    const rects = roomWallRects(base, bedroom);
    const area = rects.reduce((s, r) => s + (r.s1 - r.s0) * (r.y1 - r.y0), 0);
    // периметр 16 м × 2.7 м = 43.2 минус углы, окно 1.6×1.5 и дверь 0.8×2.1
    expect(area).toBeGreaterThan(36);
    expect(area).toBeLessThan(40.5);
    const walls = layout.elements.find((e) => e.kind === 'room_walls' && e.roomId === 'bedroom')!;
    expect(measure(layout, walls).wall_m2).toBeCloseTo(area, 1);
  });

  it('позиции двери: периметр проёма ×2 наличника + запас, работа 1 шт', () => {
    const door = layout.elements.find((e) => e.kind === 'door' && e.roomId === 'bedroom')!;
    const m = measure(layout, door);
    expect(m.opening_w).toBe(0.8);
    expect(m.opening_h).toBe(2.1);
    const lines = objectLines(catalog, layout, door, objectSelection(catalog, 'door.interior', 'comfort'));
    const casing = lines.find((l) => l.slot.slot === 'door.casing')!;
    expect(casing.need).toBeCloseTo(2 * (2 * 2.1 + 0.8) * 1.05, 2);
    expect(lines.find((l) => l.slot.slot === 'door.leaf')!.workQty).toBe(1);
    expect(lines.find((l) => l.slot.slot === 'door.leaf')!.product?.id).toBe('DR-LINE-OAK');
  });

  it('товар может переопределить норму (обои — рулоны на м²) и работу', () => {
    const walls = layout.elements.find((e) => e.kind === 'room_walls' && e.roomId === 'living')!;
    const sel = objectSelection(catalog, 'wall.finish', 'comfort');
    sel['wall.finish'] = { productId: 'WL-WP-LINEN', workId: null };
    const lines = objectLines(catalog, layout, walls, sel);
    const fin = lines.find((l) => l.slot.slot === 'wall.finish')!;
    const m = measure(layout, walls);
    expect(fin.need).toBeCloseTo(0.1 * m.wall_m2 * 1.1, 2);
    expect(fin.workId).toBe('W-WL-WP');
  });

  it('две двери с одинаковой комплектацией складываются в смете без дублей и округляются по упаковке', () => {
    const doors = layout.elements.filter((e) => e.kind === 'door').slice(0, 2);
    const sel = objectSelection(catalog, 'door.interior', 'econom');
    const sections = doors.map((d) => buildObjectSection(catalog, layout, d, 'econom', sel, `s-${d.id}`));
    const est = computeEstimate(catalog, sections);
    const leaf = est.lines.filter((l) => l.refId === 'DR-NEO-WHITE');
    expect(leaf).toHaveLength(1);
    expect(leaf[0].qty).toBe(2);
    const casing = est.lines.find((l) => l.refId === 'DR-CAS-70')!;
    expect(Math.round(casing.qty / 2.2) * 2.2).toBeCloseTo(casing.qty, 6);
    expect(est.lines.find((l) => l.refId === 'W-DR-INST')!.qty).toBe(2);
    expect(est.total).toBeGreaterThan(0);
    expect(est.warnings).toEqual([]);
  });

  it('ссылка на Google Таблицу превращается в ID', () => {
    expect(parseSheetRef('https://docs.google.com/spreadsheets/d/1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789/edit#gid=0')).toBe('1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789');
    expect(parseSheetRef('1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789')).toBe('1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789');
    expect(parseSheetRef('просто текст')).toBeNull();
  });
});

describe('коллективная закупка', () => {
  it('пороги из листа «Опт» применяются по числу участников; без условия цена розничная', async () => {
    const { computeEstimate } = await import('../estimate/engine');
    const doors = layout.elements.filter((e) => e.kind === 'door').slice(0, 2);
    const sel = objectSelection(catalog, 'door.interior', 'econom');
    const sections = doors.map((d) => buildObjectSection(catalog, layout, d, 'econom', sel, `s-${d.id}`));
    const one = computeEstimate(catalog, sections, {}, 1);
    expect(one.bulk).toBeUndefined();
    const five = computeEstimate(catalog, sections, {}, 5);
    expect(five.bulk!.total).toBeLessThan(five.total);
    const leaf = five.lines.find((l) => l.refId === 'DR-NEO-WHITE')!;
    expect(leaf.bulkUnitPrice).toBe(25500);
    const twenty = computeEstimate(catalog, sections, {}, 20);
    expect(twenty.lines.find((l) => l.refId === 'DR-NEO-WHITE')!.bulkUnitPrice).toBe(23000);
    expect(twenty.bulk!.savings.delivery).toBeGreaterThan(0);
    // ручка без условия на 5 участников — розница
    const casing = five.lines.find((l) => l.refId === 'DR-CAS-70')!;
    expect(casing.bulkUnitPrice).toBe(casing.unitPrice);
    expect(twenty.bulk!.savingsTotal).toBeGreaterThan(five.bulk!.savingsTotal);
  });
});
