// Схема сантехники квартиры: стояк → узел ввода (краны, фильтры, счётчики) → коллектор →
// трубы холодной и горячей воды к каждому прибору, канализация от приборов к стояку с уклоном.
// Строится из планировки: где стояк и где стоят ванна, унитаз, раковина, стиральная машина, мойка.
// Это условная схема для понимания, не проект.
import type { FurnitureItem, Layout, Room } from '../core/types';
import { EDGE_INSET, snapToWall, wallRoute, type Vec3 } from './electric';
import { openingPlace } from '../objects/geometry';

export type PlGroup = 'cold' | 'hot' | 'sewer' | 'riser';
export type PlPointKind = 'riser' | 'meter' | 'manifold' | 'fixture';

export interface PlPoint {
  id: string;
  kind: PlPointKind;
  roomId: string;
  position: Vec3;
  label: string;
  /** подпись прибора на схеме: «Ванна», «Унитаз» */
  short?: string;
}

export interface PlLine {
  id: string;
  roomId: string;
  group: PlGroup;
  points: Vec3[];
  label: string;
  /** материал и диаметр: «ПП 20 мм», «ПВХ 110 мм» */
  pipe: string;
  /** к какому прибору */
  fixture?: string;
}

export interface PlScheme {
  points: PlPoint[];
  lines: PlLine[];
  /** длина труб по виду, м */
  length: Record<PlGroup, number>;
}

/** Приборы: высота вывода воды, есть ли горячая, высота и диаметр канализации. */
const FIXTURES: Record<string, { name: string; water: number; hot: boolean; sewer: number; dn: number }> = {
  bathtub: { name: 'Ванна', water: 0.8, hot: true, sewer: 0.08, dn: 50 },
  toilet: { name: 'Унитаз', water: 0.2, hot: false, sewer: 0.12, dn: 110 },
  vanity: { name: 'Раковина', water: 0.55, hot: true, sewer: 0.5, dn: 50 },
  washer: { name: 'Стиральная машина', water: 0.6, hot: false, sewer: 0.5, dn: 50 },
  sink: { name: 'Кухонная мойка', water: 0.5, hot: true, sewer: 0.45, dn: 50 },
};

// Все горизонтальные трубы — в полу (в стяжке, ниже чистового пола). Над полом только вертикальные выводы к приборам.
const WALL_H = -0.04; // вода: холодная в стяжке на 4 см ниже пола
const FLOOR_H = -0.04; // переходы между комнатами — там же, под порогами
const HOT_DY = -0.02; // горячая — рядом, на 2 см ниже холодной
const SEWER_START = -0.07; // канализация у прибора — глубже воды
const SEWER_END = -0.12; // у стояка ещё ниже (уклон 2–3 %)

const len = (pts: Vec3[]) => pts.reduce((s, p, i) => (i ? s + Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1], p[2] - pts[i - 1][2]) : 0), 0);
const roomAtPoint = (layout: Layout, x: number, z: number) => layout.rooms.find((r) => x >= r.rect[0] - 0.01 && x <= r.rect[2] + 0.01 && z >= r.rect[1] - 0.01 && z <= r.rect[3] + 0.01);

/** Точка прибора: у ближайшей стены его комнаты. Для кухни — место мойки внутри гарнитура. */
function fixtureSpot(f: FurnitureItem): { x: number; z: number; type: string } {
  if (f.type === 'kitchen_run') {
    const s = f.sink ?? 0.6;
    const r = f.rotationY ?? 0;
    return { x: f.position[0] + Math.cos(r) * s, z: f.position[2] - Math.sin(r) * s, type: 'sink' };
  }
  return { x: f.position[0], z: f.position[2], type: f.type };
}

/** Дверь между двумя комнатами: центр проёма, направление стены (горизонтальная ли). */
function doorBetween(layout: Layout, a: Room, b: Room): { x: number; z: number; horizontal: boolean } | null {
  for (const w of layout.walls)
    for (const o of w.openings) {
      if (o.kind === 'window') continue;
      const p = openingPlace(layout, w, o);
      const ids = [p.plus?.id, p.minus?.id];
      if (ids.includes(a.id) && ids.includes(b.id)) return { x: p.cx, z: p.cz, horizontal: p.horizontal };
    }
  return null;
}

/** Путь по полу (в стяжке, под порогами) строго по осям: из комнаты в комнату через двери (при необходимости через прихожую). */
export function floorRoute(layout: Layout, from: Room, to: Room, a: Vec3, b: Vec3, y: number): Vec3[] {
  const hall = layout.rooms.find((r) => r.type === 'hall');
  const chain: Room[] = [from];
  if (from.id !== to.id) {
    if (doorBetween(layout, from, to)) chain.push(to);
    else if (hall) chain.push(hall, to);
    else chain.push(to);
  }
  const path: Vec3[] = [[a[0], y, a[2]]];
  for (let i = 1; i < chain.length; i++) {
    const d = doorBetween(layout, chain[i - 1], chain[i]);
    if (!d) continue;
    const last = path[path.length - 1];
    // к двери: сначала вдоль стены с дверью, затем сквозь проём и на 20 см внутрь следующей комнаты (не идти внутри стены)
    const next = chain[i];
    const cx = (next.rect[0] + next.rect[2]) / 2;
    const cz = (next.rect[1] + next.rect[3]) / 2;
    if (d.horizontal) {
      const inZ = d.z + Math.sign(cz - d.z) * 0.2;
      path.push([d.x, y, last[2]], [d.x, y, inZ]);
    } else {
      const inX = d.x + Math.sign(cx - d.x) * 0.2;
      path.push([last[0], y, d.z], [inX, y, d.z]);
    }
  }
  const last = path[path.length - 1];
  // в последней комнате: от проёма сначала поперёк стены двери, затем к цели
  path.push([last[0], y, b[2]], [b[0], y, b[2]]);
  return path.filter((p, i) => i === 0 || Math.hypot(p[0] - path[i - 1][0], p[1] - path[i - 1][1], p[2] - path[i - 1][2]) > 1e-6);
}

/** Входная дверь: точка снаружи (подъезд) и внутри (прихожая), у края проёма — трубы идут под порогом. t — направление вдоль стены. */
export function entryPoint(layout: Layout): { out: Vec3; inn: Vec3; roomId: string; t: [number, number] } | null {
  for (const w of layout.walls)
    for (const o of w.openings) {
      if (o.kind !== 'entrance') continue;
      const p = openingPlace(layout, w, o);
      const room = p.plus ?? p.minus;
      if (!room) continue;
      const side = room === p.plus ? 1 : -1; // внутрь квартиры
      const n: [number, number] = p.horizontal ? [0, side] : [side, 0];
      const shift = (o.to - o.from) / 2 - 0.12; // у края проёма, под порогом
      const cx = p.horizontal ? p.cx - shift : p.cx;
      const cz = p.horizontal ? p.cz : p.cz - shift;
      const d = w.thickness / 2 + 0.3;
      return { out: [cx - n[0] * d, 0, cz - n[1] * d], inn: [cx + n[0] * 0.2, 0, cz + n[1] * 0.2], roomId: room.id, t: p.horizontal ? [1, 0] : [0, 1] };
    }
  return null;
}

/** Гидроузел: в санузле у канализационного стояка, у стены (шкаф с дверцей). */
export function hydroNode(_layout: Layout, room: Room, riser: Vec3): Vec3 {
  const [x, z] = snapToWall(room, riser[0] + 0.3, riser[2]);
  return [x, 0.9, z];
}

export function buildPlumbingScheme(layout: Layout): PlScheme {
  const points: PlPoint[] = [];
  const lines: PlLine[] = [];
  const riserEl = layout.elements.find((e) => e.kind === 'riser');
  const length: Record<PlGroup, number> = { cold: 0, hot: 0, sewer: 0, riser: 0 };
  if (!riserEl) return { points, lines, length };
  const H = layout.ceilingHeight;
  const rRoom = layout.rooms.find((r) => r.id === riserEl.roomId)!;
  const R: Vec3 = [riserEl.position[0], 0, riserEl.position[2]];

  // 1. В квартире — только канализационный стояк. Вода приходит из подъезда (поэтажный узел).
  const rs: Vec3 = [R[0], 0, R[2] + 0.05];
  lines.push({ id: 'riser-sewer', roomId: rRoom.id, group: 'sewer', points: [[rs[0], H, rs[2]], [rs[0], 0, rs[2]]], label: 'Канализационный стояк (общедомовой) — проходит через квартиру', pipe: 'ПВХ 110 мм' });
  points.push({ id: 'riser', kind: 'riser', roomId: rRoom.id, position: [R[0], 1.9, R[2] + 0.05], label: 'Канализационный стояк: сюда уходят стоки от всех приборов', short: 'Стояк канализации' });

  // 2. Ввод из подъезда: поэтажный узел (стояки ХВС, ГВС, отопления, общие краны) → в полу в гидроузел
  const entry = entryPoint(layout);
  const G = hydroNode(layout, rRoom, R);
  const meter: Vec3 = [G[0], 0.9, G[2]];
  if (entry) {
    points.push({ id: 'entry', kind: 'riser', roomId: entry.roomId, position: [entry.out[0], 1.4, entry.out[2]], label: 'Поэтажный узел в подъезде: стояки холодной и горячей воды и отопления, краны на квартиру. Отсюда трубы заходят в квартиру в полу', short: 'Подъезд: стояки' });
    for (const [g, dz, pipe, name] of [['cold', 0, 'ПП 25 мм', 'холодной'], ['hot', 0.06, 'ПП 25 мм (армир.)', 'горячей']] as const) {
      const y = FLOOR_H + (g === 'hot' ? HOT_DY : 0);
      const start: Vec3 = [entry.out[0] + entry.t[0] * dz, 1.0, entry.out[2] + entry.t[1] * dz];
      const inside: Vec3 = [entry.inn[0] + entry.t[0] * dz, y, entry.inn[2] + entry.t[1] * dz];
      const hall = layout.rooms.find((r) => r.id === entry.roomId)!;
      const path: Vec3[] = [start, [start[0], y, start[2]], inside, ...floorRoute(layout, hall, rRoom, inside, [meter[0] + dz, y, meter[2] + dz], y).slice(1), [meter[0] + dz, meter[1] - (g === 'hot' ? 0.05 : 0), meter[2] + dz]];
      lines.push({ id: `in-${g}`, roomId: rRoom.id, group: g, points: path, label: `Ввод ${name} воды: из подъезда в полу под порогами — в гидроузел`, pipe });
    }
  }

  // 3. Гидроузел: краны, фильтр, редуктор давления, счётчики и коллектор воды (рядом — коллектор отопления)
  points.push({ id: 'meter', kind: 'meter', roomId: rRoom.id, position: meter, label: 'Гидроузел: шаровой кран → фильтр → редуктор давления → счётчики холодной и горячей воды. Здесь же коллекторы воды и отопления — всё в одном шкафу с дверцей', short: 'Гидроузел' });
  const [mx, mz] = snapToWall(rRoom, meter[0] + 0.45, meter[2]);
  const manifold: Vec3 = [mx, 0.5, mz];
  points.push({ id: 'manifold', kind: 'manifold', roomId: rRoom.id, position: manifold, label: 'Коллектор воды: от него к каждому прибору идёт своя труба со своим краном — можно отключить один прибор, не перекрывая всю квартиру', short: 'Коллектор воды' });
  lines.push({ id: 'meter-manifold-cold', roomId: rRoom.id, group: 'cold', points: [meter, [meter[0], 0.5, meter[2]], [manifold[0], 0.5, meter[2]], manifold], label: 'От счётчика ХВС к коллектору', pipe: 'ПП 25 мм' });
  lines.push({ id: 'meter-manifold-hot', roomId: rRoom.id, group: 'hot', points: [[meter[0], 0.85, meter[2] + 0.06], [meter[0], 0.42, meter[2] + 0.06], [manifold[0], 0.42, meter[2] + 0.06], [manifold[0], 0.42, manifold[2] + 0.06]], label: 'От счётчика ГВС к коллектору', pipe: 'ПП 25 мм (армир.)' });

  // 4. Приборы: вода от коллектора, канализация к стояку
  layout.furniture.forEach((f, i) => {
    const sp = fixtureSpot(f);
    const meta = FIXTURES[sp.type];
    if (!meta) return;
    const room = roomAtPoint(layout, sp.x, sp.z) ?? layout.rooms.find((r) => r.id === f.roomId);
    if (!room) return;
    const [wx, wz] = snapToWall(room, sp.x, sp.z);
    const id = `${sp.type}-${i}`;
    const water: Vec3 = [wx, meta.water, wz];
    points.push({ id: `fx-${id}`, kind: 'fixture', roomId: room.id, position: [wx, meta.water + 0.15, wz], label: `${meta.name}: ${meta.hot ? 'холодная и горячая вода' : 'только холодная вода'}, канализация ${meta.dn} мм`, short: meta.name });

    const route = (y: number, dz: number): Vec3[] => {
      const a: Vec3 = [manifold[0], y, manifold[2] + dz];
      const b: Vec3 = [wx, y, wz + dz];
      if (room.id === rRoom.id) {
        // в той же комнате — вдоль стен на высоте штробы, под дверью — в стяжке пола
        return [[manifold[0], manifold[1], manifold[2] + dz], a, ...wallRoute(layout, rRoom, a, b, y, y)];
      }
      // в другую комнату — в стяжке пола под порогами
      return [[manifold[0], manifold[1], manifold[2] + dz], [manifold[0], FLOOR_H, manifold[2] + dz], ...floorRoute(layout, rRoom, room, [manifold[0], FLOOR_H, manifold[2] + dz], [wx, FLOOR_H, wz + dz], FLOOR_H).slice(1), [wx, y, wz + dz]];
    };
    const cold = [...route(WALL_H, 0), water];
    lines.push({ id: `cold-${id}`, roomId: room.id, group: 'cold', points: cold, label: `Холодная вода → ${meta.name.toLowerCase()}`, pipe: 'ПП 20 мм', fixture: meta.name });
    length.cold += len(cold);
    if (meta.hot) {
      const hot = [...route(WALL_H + HOT_DY, 0.06), [wx, meta.water, wz + 0.06] as Vec3];
      lines.push({ id: `hot-${id}`, roomId: room.id, group: 'hot', points: hot, label: `Горячая вода → ${meta.name.toLowerCase()}`, pipe: 'ПП 20 мм (армир.)', fixture: meta.name });
      length.hot += len(hot);
    }

    // канализация: от прибора вниз, по полу вдоль стен к стояку; высота падает к стояку (уклон)
    const sIn: Vec3 = [wx, meta.sewer, wz - 0.06];
    let base: Vec3[];
    if (room.id === rRoom.id) base = [sIn, [wx, SEWER_START, wz - 0.06], ...wallRoute(layout, rRoom, [wx, SEWER_START, wz - 0.06], [rs[0] + EDGE_INSET, SEWER_START, rs[2]], SEWER_START, SEWER_START)];
    else base = [sIn, [wx, SEWER_START, wz - 0.06], ...floorRoute(layout, room, rRoom, [wx, SEWER_START, wz - 0.06], [rs[0] + EDGE_INSET, SEWER_START, rs[2]], SEWER_START).slice(1)];
    base.push([rs[0], SEWER_START, rs[2]]);
    // уклон: линейно по длине от SEWER_START до SEWER_END (вертикальный спуск у прибора не трогаем)
    const total = len(base.slice(1));
    let acc = 0;
    const sewer = base.map((p, k) => {
      if (k <= 1) return p;
      acc += Math.hypot(p[0] - base[k - 1][0], p[2] - base[k - 1][2]);
      const y = SEWER_START - ((SEWER_START - SEWER_END) * acc) / (total || 1);
      return [p[0], y, p[2]] as Vec3;
    });
    lines.push({ id: `sewer-${id}`, roomId: room.id, group: 'sewer', points: sewer, label: `Канализация от ${meta.name === 'Ванна' ? 'ванны' : meta.name === 'Унитаз' ? 'унитаза' : meta.name === 'Раковина' ? 'раковины' : meta.name === 'Стиральная машина' ? 'стиральной машины' : 'мойки'} к стояку, уклон 2–3 %`, pipe: `ПВХ ${meta.dn} мм`, fixture: meta.name });
    length.sewer += len(sewer);
  });

  for (const k of Object.keys(length) as PlGroup[]) length[k] = Math.round(length[k] * 10) / 10;
  return { points, lines, length };
}
