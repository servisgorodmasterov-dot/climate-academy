import type { Catalog, Room, Layout, Tier } from '../../core/types';
import type { Selection } from '../../core/academy';
import type { EstimateSection, SelectionItem } from '../../estimate/engine';
import { doorWidthInRoom, roomArea, roomPerimeter } from '../../apartment/layout';
import { round2 } from '../../estimate/engine';

export interface FlooringParams {
  base: 'concrete' | 'wood';
  method: 'straight' | 'diagonal';
  wastePct: number; // запас на подрезку
  needScreed: boolean;
  screedMm: number;
  areaOverride: number | null; // уточнённая площадь от замерщика
}

/** Типовой запас на подрезку: прямая укладка 5–7 %, диагональная 10–15 %. Значение редактируется пользователем. */
export const DEFAULT_WASTE = { straight: 7, diagonal: 12 } as const;

export function defaultFlooringParams(): FlooringParams {
  return { base: 'concrete', method: 'straight', wastePct: DEFAULT_WASTE.straight, needScreed: false, screedMm: 10, areaOverride: null };
}

export interface FlooringGeometry {
  area: number;
  perimeter: number;
  doors: number;
  skirting: number;
}

export function flooringGeometry(layout: Layout, room: Room, p: FlooringParams): FlooringGeometry {
  const area = p.areaOverride && p.areaOverride > 0 ? p.areaOverride : roomArea(room);
  const perimeter = roomPerimeter(room);
  const doors = doorWidthInRoom(layout, room);
  return { area, perimeter, doors, skirting: round2(Math.max(0, perimeter - doors)) };
}

export function buildFlooringSection(
  catalog: Catalog,
  layout: Layout,
  room: Room,
  tier: Tier,
  p: FlooringParams,
  sel: Selection,
): EstimateSection {
  const g = flooringGeometry(layout, room, p);
  const items: SelectionItem[] = [];
  const lam = sel['floor.laminate'];
  if (lam?.productId)
    items.push({ slot: 'floor.laminate', productId: lam.productId, workId: lam.workId, needQty: round2(g.area * (1 + p.wastePct / 100)), workQty: g.area, basis: { m2: g.area } });
  const und = sel['floor.underlay'];
  if (und?.productId) items.push({ slot: 'floor.underlay', productId: und.productId, workId: und.workId, needQty: g.area, workQty: g.area, basis: { m2: g.area } });
  const skr = sel['floor.skirting'];
  if (skr?.productId) items.push({ slot: 'floor.skirting', productId: skr.productId, workId: skr.workId, needQty: g.skirting, workQty: g.skirting, basis: { m: g.skirting } });
  if (p.needScreed) {
    const w = catalog.works.find((x) => x.slot === 'floor.screed');
    items.push({ slot: 'floor.screed', productId: null, workId: w?.id ?? null, needQty: 0, workQty: g.area, basis: { m2: g.area, mm: p.screedMm } });
  }
  return {
    id: `flooring:${room.id}`,
    academy: 'flooring',
    label: `Пол — ${room.name}`,
    tier,
    items,
    params: { base: p.base, screed: p.needScreed ? '1' : '0' },
  };
}

/** Слои конструкции пола снизу вверх (для обучения и 3D-разреза). */
export const FLOOR_LAYERS = [
  { id: 'slab', name: 'Основание — плита перекрытия', thickness: 0.22, color: '#9ea3a8', text: 'Железобетонная плита — несущая часть. Её ровность проверяют двухметровой рейкой.' },
  { id: 'screed', name: 'Стяжка (при необходимости)', thickness: 0.05, color: '#c4beb4', text: 'Нужна, если перепады основания больше 2 мм на 2 м. Ламинат кладут только на сухую стяжку — время высыхания по паспорту смеси.', optional: true },
  { id: 'film', name: 'Пароизоляционная плёнка', thickness: 0.006, color: '#d9eef7', text: 'Полиэтилен 200 мкм с нахлёстом 20 см защищает ламинат от остаточной влаги бетона.' },
  { id: 'underlay', name: 'Подложка', thickness: 0.012, color: '#8fb7a1', text: 'Компенсирует мелкие неровности, гасит шаги. Укладывается встык, без нахлёста.' },
  { id: 'laminate', name: 'Ламинат', thickness: 0.03, color: '#b08a5e', text: '«Плавающий» пол: панели соединены замком и не приклеиваются. По периметру — зазор 8–10 мм на расширение.' },
  { id: 'skirting', name: 'Плинтус', thickness: 0.08, color: '#efe9df', text: 'Крепится к стене, не к ламинату, и закрывает компенсационный зазор.' },
] as const;
