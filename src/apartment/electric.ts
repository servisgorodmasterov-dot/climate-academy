// Схема электрики квартиры: строится из планировки и количества точек, выбранного в карточке «Электрика».
// От щита — магистраль по потолку в каждую комнату; в комнате — группа розеток (по стенам, 30 см от пола),
// группа света (потолочные точки), выключатель у двери. Это условная схема для понимания, не проект.
import type { Layout, LayoutElement, Room } from '../core/types';
import { doorWidthInRoom, roomArea } from './layout';
import { openingPlace } from '../objects/geometry';

export type Vec3 = [number, number, number];
export type ElPointKind = 'socket' | 'switch' | 'light' | 'panel' | 'power' | 'box';

export interface ElPoint {
  id: string;
  kind: ElPointKind;
  roomId: string;
  position: Vec3;
  /** куда «смотрит» точка (нормаль стены) — для розеток и выключателей */
  normal?: [number, number];
  label: string;
  cable?: string;
}

export interface ElLine {
  id: string;
  roomId: string;
  group: 'sockets' | 'light' | 'trunk' | 'power';
  points: Vec3[];
  label: string;
  /** марка и сечение: «ВВГнг(А)-LS 3×2.5» */
  cable: string;
}

export interface ElScheme {
  panel: Vec3;
  points: ElPoint[];
  lines: ElLine[];
  /** длина кабеля по комнатам, м */
  cableByRoom: Record<string, number>;
}

/** Сколько точек в комнате: из выбора пользователя (params.layers) или по площади, как в расчёте. */
export interface RoomCounts {
  sockets: number;
  switches: number;
  lights: number;
  /** отдельные силовые линии 3×4 (плита, бойлер) */
  power: number;
  /** марки кабеля из выбранного товара */
  cable?: string;
  cableLight?: string;
  cablePower?: string;
}
export const defaultCounts = (room: Room): RoomCounts => {
  const a = roomArea(room);
  // силовые линии по умолчанию: кухня — плита и духовка, санузел — бойлер или стиральная машина
  const power = room.type === 'kitchen' ? 2 : room.type === 'bath' ? 1 : 0;
  return { sockets: Math.max(2, Math.ceil(a * 0.5 - 1e-9)), switches: 1, lights: Math.max(1, Math.ceil(a * 0.5 - 1e-9)), power };
};

const SOCKET_H = 0.3;
const SWITCH_H = 0.9;
const CABLE_H = 2.55; // штроба под потолком

/** Дверь комнаты: точка на стене внутри комнаты и нормаль внутрь. */
export function roomDoor(layout: Layout, room: Room): { pos: Vec3; normal: [number, number]; along: [number, number] } | null {
  for (const w of layout.walls)
    for (const o of w.openings) {
      if (o.kind === 'window') continue;
      const p = openingPlace(layout, w, o);
      const inside = p.plus?.id === room.id ? 1 : p.minus?.id === room.id ? -1 : 0;
      if (!inside) continue;
      const n: [number, number] = p.horizontal ? [0, inside] : [inside, 0];
      const along: [number, number] = p.horizontal ? [1, 0] : [0, 1];
      return { pos: [p.cx + n[0] * (w.thickness / 2), 0, p.cz + n[1] * (w.thickness / 2)], normal: n, along };
    }
  return null;
}

/** Все проёмы комнаты: положение на периметре (расстояние вдоль обхода), ширина, вид, высота низа (окно — подоконник). */
interface RoomOpening {
  edge: number; // индекс стены в обходе
  from: number; // вдоль стены, м
  to: number;
  kind: 'door' | 'window' | 'entrance';
  sill: number; // низ проёма от пола (дверь — 0)
  head: number;
}
export const EDGE_INSET = 0.08;
function roomEdges(room: Room) {
  const [x0, z0, x1, z1] = room.rect;
  return [
    { a: [x0, z0] as [number, number], b: [x1, z0] as [number, number], normal: [0, 1] as [number, number] },
    { a: [x1, z0] as [number, number], b: [x1, z1] as [number, number], normal: [-1, 0] as [number, number] },
    { a: [x1, z1] as [number, number], b: [x0, z1] as [number, number], normal: [0, -1] as [number, number] },
    { a: [x0, z1] as [number, number], b: [x0, z0] as [number, number], normal: [1, 0] as [number, number] },
  ];
}
function roomOpenings(layout: Layout, room: Room): RoomOpening[] {
  const edges = roomEdges(room);
  const out: RoomOpening[] = [];
  for (const w of layout.walls)
    for (const o of w.openings) {
      const p = openingPlace(layout, w, o);
      if (p.plus?.id !== room.id && p.minus?.id !== room.id) continue;
      // к какой стене комнаты относится проём
      edges.forEach((e, ei) => {
        const horizontal = e.a[1] === e.b[1];
        if (horizontal !== p.horizontal) return;
        const fixed = horizontal ? e.a[1] : e.a[0];
        const pf = horizontal ? p.cz : p.cx;
        if (Math.abs(fixed - pf) > w.thickness / 2 + 0.05) return;
        const len = Math.hypot(e.b[0] - e.a[0], e.b[1] - e.a[1]);
        const dir = horizontal ? Math.sign(e.b[0] - e.a[0]) : Math.sign(e.b[1] - e.a[1]);
        const center = horizontal ? (p.cx - e.a[0]) * dir : (p.cz - e.a[1]) * dir;
        const half = (o.to - o.from) / 2;
        if (center + half < 0 || center - half > len) return;
        out.push({ edge: ei, from: Math.max(0, center - half), to: Math.min(len, center + half), kind: o.kind, sill: o.kind === 'window' ? o.sill ?? 0.9 : 0, head: o.head });
      });
    }
  return out;
}

/** Точки вдоль периметра комнаты: равномерно по свободным участкам стен, не ближе 25 см к проёмам и углам. */
function perimeterSpots(layout: Layout, room: Room, n: number, h: number): { pos: Vec3; normal: [number, number] }[] {
  const edges = roomEdges(room);
  const ops = roomOpenings(layout, room);
  const GAP = 0.25;
  // свободные отрезки на каждой стене (на высоте h: окно мешает только если h ниже подоконника+0.1... розетки под окном допустимы, но не в дверях)
  const free: { edge: number; from: number; to: number }[] = [];
  edges.forEach((e, ei) => {
    const len = Math.hypot(e.b[0] - e.a[0], e.b[1] - e.a[1]);
    const blocks = ops.filter((o) => o.edge === ei && (o.kind !== 'window' || h > o.sill - 0.15)).map((o) => [o.from - GAP, o.to + GAP] as [number, number]).sort((x, y) => x[0] - y[0]);
    let cur = 0.2;
    for (const [bf, bt] of blocks) {
      if (bf > cur) free.push({ edge: ei, from: cur, to: Math.min(bf, len - 0.2) });
      cur = Math.max(cur, bt);
    }
    if (cur < len - 0.2) free.push({ edge: ei, from: cur, to: len - 0.2 });
  });
  const usable = free.filter((f) => f.to - f.from > 0.15);
  const total = usable.reduce((s, f) => s + (f.to - f.from), 0);
  const out: { pos: Vec3; normal: [number, number] }[] = [];
  if (!usable.length || total <= 0) return out;
  for (let i = 0; i < n; i++) {
    let d = ((i + 0.5) / n) * total;
    for (const f of usable) {
      const len = f.to - f.from;
      if (d > len) {
        d -= len;
        continue;
      }
      const e = edges[f.edge];
      const L = Math.hypot(e.b[0] - e.a[0], e.b[1] - e.a[1]);
      const t = (f.from + d) / L;
      out.push({ pos: [e.a[0] + (e.b[0] - e.a[0]) * t + e.normal[0] * EDGE_INSET, h, e.a[1] + (e.b[1] - e.a[1]) * t + e.normal[1] * EDGE_INSET], normal: e.normal });
      break;
    }
  }
  return out;
}

/** Точка, прижатая к ближайшей стене комнаты с отступом EDGE_INSET (как стоят розетки). */
export function snapToWall(room: Room, x: number, z: number): [number, number] {
  const edges = roomEdges(room);
  let best: { d: number; p: [number, number] } = { d: 1e9, p: [x, z] };
  for (const e of edges) {
    const dx = e.b[0] - e.a[0], dz = e.b[1] - e.a[1];
    const L2 = dx * dx + dz * dz;
    const t = Math.min(1, Math.max(0, ((x - e.a[0]) * dx + (z - e.a[1]) * dz) / L2));
    const px = e.a[0] + dx * t + e.normal[0] * EDGE_INSET, pz = e.a[1] + dz * t + e.normal[1] * EDGE_INSET;
    const d = Math.hypot(x - px, z - pz);
    if (d < best.d) best = { d, p: [px, pz] };
  }
  return best.p;
}

/** Маршрут вдоль стен от точки к точке по периметру (кратчайшей стороной), с обходом проёмов поверху. */
export function wallRoute(layout: Layout, room: Room, from: Vec3, to: Vec3, h: number, ceil: number): Vec3[] {
  const edges = roomEdges(room);
  const ops = roomOpenings(layout, room);
  const L = edges.map((e) => Math.hypot(e.b[0] - e.a[0], e.b[1] - e.a[1]));
  const P = L.reduce((a, b) => a + b, 0);
  // параметр вдоль периметра для точки у стены
  const param = (p: Vec3) => {
    let best = { d: 1e9, s: 0 };
    let acc = 0;
    edges.forEach((e, i) => {
      const dx = e.b[0] - e.a[0], dz = e.b[1] - e.a[1];
      const t = Math.min(1, Math.max(0, ((p[0] - e.a[0]) * dx + (p[2] - e.a[1]) * dz) / (L[i] * L[i])));
      const x = e.a[0] + dx * t + e.normal[0] * EDGE_INSET, z = e.a[1] + dz * t + e.normal[1] * EDGE_INSET;
      const d = Math.hypot(p[0] - x, p[2] - z);
      if (d < best.d) best = { d, s: acc + t * L[i] };
      acc += L[i];
    });
    return best.s;
  };
  const at = (sParam: number, y: number): Vec3 => {
    let sp = ((sParam % P) + P) % P;
    for (let i = 0; i < edges.length; i++) {
      if (sp <= L[i] + 1e-9) {
        const e = edges[i];
        const t = sp / L[i];
        // в углу сдвигаем по обеим нормалям, чтобы отрезки между стенами шли строго по осям
        const prev = edges[(i + edges.length - 1) % edges.length].normal;
        const next = edges[(i + 1) % edges.length].normal;
        const cornerA = t < 1e-6 ? prev : [0, 0];
        const cornerB = t > 1 - 1e-6 ? next : [0, 0];
        return [e.a[0] + (e.b[0] - e.a[0]) * t + (e.normal[0] + cornerA[0] + cornerB[0]) * EDGE_INSET, y, e.a[1] + (e.b[1] - e.a[1]) * t + (e.normal[1] + cornerA[1] + cornerB[1]) * EDGE_INSET];
      }
      sp -= L[i];
    }
    return [edges[0].a[0], y, edges[0].a[1]];
  };
  // проёмы в параметрах периметра
  const offs = edges.map((_, i) => L.slice(0, i).reduce((a, b) => a + b, 0));
  const blocks = ops.filter((o) => o.kind !== 'window' || h > o.sill - 0.15).map((o) => ({ from: offs[o.edge] + o.from - 0.1, to: offs[o.edge] + o.to + 0.1 }));
  const path: Vec3[] = [];
  const s0 = param(from), s1 = param(to);
  // стартуем из точки на периметре в тех же координатах, что и остальной маршрут (иначе в углу получается косой отрезок)
  const start = at(s0, h);
  if (Math.abs(start[0] - from[0]) > 1e-6 || Math.abs(start[2] - from[2]) > 1e-6) {
    if (Math.abs(start[0] - from[0]) > 1e-6 && Math.abs(start[2] - from[2]) > 1e-6) path.push([from[0], h, start[2]]);
    path.push(start);
  }
  // идём в сторону, где короче (с учётом замыкания периметра)
  let delta = s1 - s0;
  if (delta > P / 2) delta -= P;
  if (delta < -P / 2) delta += P;
  const dir = Math.sign(delta) || 1;
  // ключевые параметры: углы стен и границы проёмов между s0 и s1
  const marks: number[] = [];
  for (let i = 0; i < edges.length; i++) marks.push(offs[i]);
  for (const bl of blocks) marks.push(bl.from, bl.to);
  const inRange = (m: number) => {
    let d = m - s0;
    if (dir > 0) { d = ((d % P) + P) % P; return d > 1e-6 && d < Math.abs(delta) - 1e-6; }
    d = ((-d % P) + P) % P; return d > 1e-6 && d < Math.abs(delta) - 1e-6;
  };
  const sorted = marks.filter(inRange).sort((a, b) => { const da = ((dir * (a - s0)) % P + P) % P; const db = ((dir * (b - s0)) % P + P) % P; return da - db; });
  let cur = s0;
  let up = false;
  const over = (sp: number) => blocks.some((bl) => sp > bl.from && sp < bl.to);
  for (const m of sorted) {
    const mid = (cur + m) / 2;
    const needUp = over(((mid % P) + P) % P);
    if (needUp && !up) { path.push(at(cur, h), at(cur, ceil)); up = true; }
    if (!needUp && up) { path.push(at(cur, ceil), at(cur, h)); up = false; }
    path.push(at(m, up ? ceil : h));
    cur = m;
  }
  const needUp = over((((cur + s1) / 2 % P) + P) % P);
  if (needUp && !up) { path.push(at(cur, h), at(cur, ceil)); up = true; }
  if (!needUp && up) { path.push(at(cur, ceil), at(cur, h)); up = false; }
  if (up) path.push(at(s1, ceil));
  const last = path[path.length - 1] ?? from;
  // довести до цели по осям
  if (last && Math.abs(last[0] - to[0]) > 1e-6 && Math.abs(last[2] - to[2]) > 1e-6) path.push([last[0], h, to[2]]);
  path.push([to[0], h, to[2]]);
  return path;
}

/** Потолочные точки сеткой по площади. */
function ceilingSpots(room: Room, n: number, h: number): Vec3[] {
  const [x0, z0, x1, z1] = room.rect;
  const w = x1 - x0;
  const d = z1 - z0;
  if (n <= 1) return [[(x0 + x1) / 2, h, (z0 + z1) / 2]];
  const cols = Math.max(1, Math.round(Math.sqrt((n * w) / d)));
  const rows = Math.max(1, Math.ceil(n / cols));
  const out: Vec3[] = [];
  for (let r = 0; r < rows && out.length < n; r++) for (let c = 0; c < cols && out.length < n; c++) out.push([x0 + (w * (c + 0.5)) / cols, h, z0 + (d * (r + 0.5)) / rows]);
  return out;
}

const len = (pts: Vec3[]) => pts.reduce((s, p, i) => (i ? s + Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1], p[2] - pts[i - 1][2]) : 0), 0);

export function buildElectricScheme(layout: Layout, counts: (room: Room) => RoomCounts): ElScheme {
  const panelEl = layout.elements.find((e) => e.kind === 'electric_panel');
  const panel: Vec3 = panelEl ? [panelEl.position[0], panelEl.position[1], panelEl.position[2]] : [layout.size[0] / 2, 1.6, layout.size[1] / 2];
  const points: ElPoint[] = [{ id: 'panel', kind: 'panel', roomId: panelEl?.roomId ?? '', position: panel, label: 'Электрощит' }];
  const lines: ElLine[] = [];
  const cableByRoom: Record<string, number> = {};
  const H = layout.ceilingHeight;

  for (const room of layout.rooms) {
    const c = counts(room);
    const door = roomDoor(layout, room);
    const [x0, z0, x1, z1] = room.rect;
    const cab = c.cable ?? 'ВВГнг(А)-LS 3×2.5';
    const cabL = c.cableLight ?? 'ВВГнг(А)-LS 3×1.5';
    const cabP = c.cablePower ?? 'ВВГнг(А)-LS 3×4';
    let total = 0;

    // 1. Распредкоробка — над дверью внутри комнаты, под потолком
    const box: Vec3 = door
      ? [door.pos[0] + door.normal[0] * 0.25, CABLE_H, door.pos[2] + door.normal[1] * 0.25]
      : [(x0 + x1) / 2, CABLE_H, (z0 + z1) / 2];
    points.push({ id: `box-${room.id}`, kind: 'box', roomId: room.id, position: box, normal: door?.normal, label: `Распредкоробка · ${room.name}: сюда приходит кабель от щита, отсюда расходится на розетки и свет` });

    // 2. Магистраль от щита до коробки — по потолку, прямыми углами (вверх от щита, по X, по Z)
    const t: Vec3[] = [panel, [panel[0], CABLE_H, panel[2]], [box[0], CABLE_H, panel[2]], box];
    lines.push({ id: `trunk-${room.id}`, roomId: room.id, group: 'trunk', points: t, label: `Щит → распредкоробка «${room.name}»: ${cab} (розетки) + ${cabL} (свет)`, cable: `${cab} + ${cabL}` });
    total += len(t) * 2;

    // 3. Розетки: от коробки вниз по стене до высоты 30 см, затем шлейф вдоль стен по периметру
    const sockets = perimeterSpots(layout, room, c.sockets, SOCKET_H);
    sockets.forEach((sp, i) => points.push({ id: `sock-${room.id}-${i}`, kind: 'socket', roomId: room.id, position: sp.pos, normal: sp.normal, label: `Розетка ${i + 1} · ${room.name}` }));
    if (sockets.length) {
      // кабель идёт по стене: коробка → вниз у стены → вдоль стен (через углы) к каждой розетке
      // спуск от коробки — сбоку от двери (не над проёмом), затем шлейф вдоль стен с обходом проёмов поверху
      // door.pos уже на внутренней грани стены; розетки стоят с отступом EDGE_INSET от этой грани
      const side = door ? snapToWall(room, door.pos[0] + door.along[0] * ((doorWidthInRoom(layout, room) || 0.9) / 2 + 0.3), door.pos[2] + door.along[1] * ((doorWidthInRoom(layout, room) || 0.9) / 2 + 0.3)) : [box[0], box[2]];
      const wallTop: Vec3 = [side[0], CABLE_H, side[1]];
      const wall: Vec3 = [side[0], SOCKET_H, side[1]];
      // коробка стоит в 25 см от стены, боковая точка — у стены: сначала к стене, потом вдоль неё, потом вниз
      const toWall: Vec3 = door ? [door.normal[0] ? side[0] : box[0], CABLE_H, door.normal[1] ? side[1] : box[2]] : box;
      const pts: Vec3[] = [box, toWall, wallTop, wall];

      let cur = wall;
      for (const sp of sockets) {
        const seg = wallRoute(layout, room, cur, sp.pos, SOCKET_H, CABLE_H);
        for (const q of seg) pts.push(q);
        cur = sp.pos;
      }
      lines.push({ id: `sock-${room.id}`, roomId: room.id, group: 'sockets', points: pts, label: `Группа розеток · ${room.name}: ${cab}, автомат 16 А — шлейфом от коробки`, cable: cab });
      total += len(pts);
    }

    // 4. Выключатель у двери: от коробки вниз по стене
    const sw: Vec3 = door
      ? [door.pos[0] + door.normal[0] * 0.08 + door.along[0] * ((doorWidthInRoom(layout, room) || 0.9) / 2 + 0.2), SWITCH_H, door.pos[2] + door.normal[1] * 0.08 + door.along[1] * ((doorWidthInRoom(layout, room) || 0.9) / 2 + 0.2)]
      : [box[0], SWITCH_H, box[2]];
    for (let i = 0; i < c.switches; i++) points.push({ id: `sw-${room.id}-${i}`, kind: 'switch', roomId: room.id, position: [sw[0] + i * 0.12 * (door?.along?.[0] ?? 0), SWITCH_H, sw[2] + i * 0.12 * (door?.along?.[1] ?? 0)], normal: door?.normal, label: `Выключатель ${i + 1} · ${room.name}` });
    if (c.switches) {
      const swl: Vec3[] = [box, [sw[0], CABLE_H, box[2]], [sw[0], CABLE_H, sw[2]], sw];
      lines.push({ id: `sw-${room.id}`, roomId: room.id, group: 'light', points: swl, label: `Коробка → выключатель · ${room.name}: ${cabL}`, cable: cabL });
      total += len(swl);
    }

    // 5. Свет: от коробки по потолку к светильникам, по прямым углам (сначала по X до ряда, потом по Z)
    const lights = ceilingSpots(room, c.lights, H - 0.02);
    lights.forEach((pt, i) => points.push({ id: `light-${room.id}-${i}`, kind: 'light', roomId: room.id, position: pt, label: `Вывод света ${i + 1} · ${room.name}` }));
    if (lights.length) {
      const lp: Vec3[] = [box];
      let cur: Vec3 = box;
      for (const pt of lights) {
        const mid: Vec3 = [pt[0], CABLE_H, cur[2]];
        if (Math.abs(mid[0] - cur[0]) > 0.05) lp.push(mid);
        lp.push([pt[0], CABLE_H, pt[2]], pt, [pt[0], CABLE_H, pt[2]]);
        cur = [pt[0], CABLE_H, pt[2]];
      }
      lines.push({ id: `light-${room.id}`, roomId: room.id, group: 'light', points: lp, label: `Коробка → светильники · ${room.name}: ${cabL}, автомат 10 А`, cable: cabL });
      total += len(lp);
    }

    // 6. Силовые линии — своим кабелем от щита, минуя коробку, по потолку прямыми углами, вниз у стены
    const powerSpots = perimeterSpots(layout, room, Math.max(1, c.power) + c.sockets, SOCKET_H).slice(c.sockets, c.sockets + c.power);
    powerSpots.forEach((sp, i) => {
      const pos: Vec3 = [sp.pos[0], SOCKET_H + 0.25, sp.pos[2]];
      points.push({ id: `power-${room.id}-${i}`, kind: 'power', roomId: room.id, position: pos, normal: sp.normal, label: `Силовая розетка ${i + 1} · ${room.name} (плита, бойлер, кондиционер) — своя линия от щита`, cable: cabP } as ElPoint);
      // своя трасса: ниже магистрали на 15 см и со сдвигом от щита, чтобы не сливалась с синей
      const PH = CABLE_H - 0.15 - i * 0.06;
      const off = 0.12 + i * 0.06;
      const start: Vec3 = [panel[0], panel[1], panel[2] + off];
      const pp: Vec3[] = [start, [start[0], PH, start[2]], [pos[0], PH, start[2]], [pos[0], PH, pos[2]], pos];
      lines.push({ id: `power-${room.id}-${i}`, roomId: room.id, group: 'power', points: pp, label: `Щит → силовая розетка ${i + 1} · ${room.name}: ${cabP}, автомат 25 А`, cable: cabP });
      total += len(pp);
    });
    cableByRoom[room.id] = Math.round(total * 10) / 10;
  }
  return { panel, points, lines, cableByRoom };
}

/** Количество точек из состояния раздела «Электрика» комнаты (как в расчёте). */
export function countsFromSections(
  layout: Layout,
  sections: Record<string, { apartmentId: string; params?: any; selection: Record<string, { productId: string | null }> }>,
  apartmentId: string,
  catalogProducts?: { id: string; attrs: Record<string, string> }[],
) {
  return (room: Room): RoomCounts => {
    const el = layout.elements.find((e: LayoutElement) => e.kind === 'room_electric' && e.roomId === room.id);
    const sec = el ? Object.values(sections).find((s) => s.apartmentId === apartmentId && s.params?.elementId === el.id) : undefined;
    const d = defaultCounts(room);
    const l = sec?.params?.layers ?? {};
    const off = (slot: string) => sec?.selection?.[slot]?.productId === null;
    const cableId = sec?.selection?.['el.cable']?.productId ?? null;
    const cableProduct = cableId ? catalogProducts?.find((p) => p.id === cableId) : undefined;
    const powerId = sec?.selection?.['el.power']?.productId ?? null;
    const powerProduct = powerId ? catalogProducts?.find((p) => p.id === powerId) : undefined;
    return {
      sockets: off('el.socket') ? 0 : l['el.socket'] ?? d.sockets,
      switches: off('el.switch') ? 0 : l['el.switch'] ?? d.switches,
      lights: off('el.light') ? 0 : l['el.light'] ?? d.lights,
      power: sec ? (!powerId ? 0 : l['el.power'] ?? 1) : d.power,
      cable: cableProduct?.attrs.cable,
      cableLight: cableProduct?.attrs.cable_light,
      cablePower: powerProduct?.attrs.cable,
    };
  };
}
