// Схема электрики квартиры: строится из планировки и количества точек, выбранного в карточке «Электрика».
// От щита — магистраль по потолку в каждую комнату; в комнате — группа розеток (по стенам, 30 см от пола),
// группа света (потолочные точки), выключатель у двери. Это условная схема для понимания, не проект.
import type { Layout, LayoutElement, Room } from '../core/types';
import { doorWidthInRoom, roomArea } from './layout';
import { openingPlace } from '../objects/geometry';

export type Vec3 = [number, number, number];
export type ElPointKind = 'socket' | 'switch' | 'light' | 'panel' | 'power';

export interface ElPoint {
  id: string;
  kind: ElPointKind;
  roomId: string;
  position: Vec3;
  /** куда «смотрит» точка (нормаль стены) — для розеток и выключателей */
  normal?: [number, number];
  label: string;
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
function roomDoor(layout: Layout, room: Room): { pos: Vec3; normal: [number, number]; along: [number, number] } | null {
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

/** Точки вдоль периметра комнаты, равномерно, с отступом от углов и дверей. */
function perimeterSpots(layout: Layout, room: Room, n: number, h: number): { pos: Vec3; normal: [number, number] }[] {
  const [x0, z0, x1, z1] = room.rect;
  const inset = 0.08;
  const edges: { a: [number, number]; b: [number, number]; normal: [number, number] }[] = [
    { a: [x0, z0], b: [x1, z0], normal: [0, 1] },
    { a: [x1, z0], b: [x1, z1], normal: [-1, 0] },
    { a: [x1, z1], b: [x0, z1], normal: [0, -1] },
    { a: [x0, z1], b: [x0, z0], normal: [1, 0] },
  ];
  const total = edges.reduce((s, e) => s + Math.hypot(e.b[0] - e.a[0], e.b[1] - e.a[1]), 0);
  const door = roomDoor(layout, room);
  const doorW = doorWidthInRoom(layout, room) || 0.9;
  const out: { pos: Vec3; normal: [number, number] }[] = [];
  let tries = 0;
  for (let i = 0; i < n && tries < n * 4; i++) {
    tries++;
    let d = ((i + 0.5) / n) * total;
    for (const e of edges) {
      const len = Math.hypot(e.b[0] - e.a[0], e.b[1] - e.a[1]);
      if (d > len) {
        d -= len;
        continue;
      }
      const t = Math.min(Math.max(d / len, 0.08), 0.92);
      const x = e.a[0] + (e.b[0] - e.a[0]) * t + e.normal[0] * inset;
      const z = e.a[1] + (e.b[1] - e.a[1]) * t + e.normal[1] * inset;
      // не ставить в дверной проём
      if (door && Math.hypot(x - door.pos[0], z - door.pos[2]) < doorW / 2 + 0.25) {
        n++;
        break;
      }
      out.push({ pos: [x, h, z], normal: e.normal });
      break;
    }
  }
  return out.slice(0, Math.max(0, out.length));
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

/** Трасса под потолком от щита до точки входа в комнату: вверх, по оси X, по оси Z, вниз не нужен. */
function trunk(from: Vec3, to: Vec3): Vec3[] {
  return [from, [from[0], CABLE_H, from[2]], [to[0], CABLE_H, from[2]], [to[0], CABLE_H, to[2]]];
}

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
    // точка входа кабеля в комнату — над дверью (или центр ближней стены)
    const entry: Vec3 = door ? [door.pos[0] + door.normal[0] * 0.3, CABLE_H, door.pos[2] + door.normal[1] * 0.3] : [(room.rect[0] + room.rect[2]) / 2, CABLE_H, (room.rect[1] + room.rect[3]) / 2];
    const t = trunk(panel, entry);
    const cab = c.cable ?? 'ВВГнг(А)-LS 3×2.5';
    const cabL = c.cableLight ?? 'ВВГнг(А)-LS 3×1.5';
    const cabP = c.cablePower ?? 'ВВГнг(А)-LS 3×4';
    lines.push({ id: `trunk-${room.id}`, roomId: room.id, group: 'trunk', points: t, label: `Магистраль от щита в ${room.name.toLowerCase()}: ${cab} (розетки) + ${cabL} (свет)`, cable: `${cab} + ${cabL}` });
    let total = len(t) * 2; // две линии (розетки и свет) идут параллельно

    // розетки по периметру, 30 см
    const sockets = perimeterSpots(layout, room, c.sockets, SOCKET_H);
    sockets.forEach((s, i) => points.push({ id: `sock-${room.id}-${i}`, kind: 'socket', roomId: room.id, position: s.pos, normal: s.normal, label: `Розетка ${i + 1} · ${room.name}` }));
    // шлейф розеток: от входа вниз по стене до первой, затем по периметру на высоте розеток
    if (sockets.length) {
      const pts: Vec3[] = [entry, [entry[0], SOCKET_H, entry[2]]];
      for (const s of sockets) pts.push(s.pos);
      lines.push({ id: `sock-${room.id}`, roomId: room.id, group: 'sockets', points: pts, label: `Группа розеток · ${room.name}: ${cab}, автомат 16 А`, cable: cab });
      total += len(pts);
    }
    // свет: выключатель у двери (сбоку от проёма), потолочные точки
    const sw: Vec3 = door
      ? [door.pos[0] + door.normal[0] * 0.08 + door.along[0] * ((doorWidthInRoom(layout, room) || 0.9) / 2 + 0.2), SWITCH_H, door.pos[2] + door.normal[1] * 0.08 + door.along[1] * ((doorWidthInRoom(layout, room) || 0.9) / 2 + 0.2)]
      : [entry[0], SWITCH_H, entry[2]];
    for (let i = 0; i < c.switches; i++) points.push({ id: `sw-${room.id}-${i}`, kind: 'switch', roomId: room.id, position: i === 0 ? sw : [sw[0], SWITCH_H, sw[2]], normal: door?.normal, label: `Выключатель ${i + 1} · ${room.name}` });
    const lights = ceilingSpots(room, c.lights, H - 0.02);
    lights.forEach((p, i) => points.push({ id: `light-${room.id}-${i}`, kind: 'light', roomId: room.id, position: p, label: `Вывод света ${i + 1} · ${room.name}` }));
    const lp: Vec3[] = [entry, [sw[0], CABLE_H, sw[2]], sw, [sw[0], CABLE_H, sw[2]]];
    for (const p of lights) lp.push([p[0], CABLE_H, p[2]], p, [p[0], CABLE_H, p[2]]);
    lines.push({ id: `light-${room.id}`, roomId: room.id, group: 'light', points: lp, label: `Группа света · ${room.name}: ${cabL}, автомат 10 А`, cable: cabL });
    total += len(lp);
    // силовые линии: отдельный кабель от щита к точке у стены (кухня — плита/духовка, санузел — бойлер/стиралка)
    const powerSpots = perimeterSpots(layout, room, Math.max(1, c.power) + c.sockets, SOCKET_H).slice(c.sockets, c.sockets + c.power);
    powerSpots.forEach((sp, i) => {
      const pos: Vec3 = [sp.pos[0], SOCKET_H + 0.25, sp.pos[2]];
      points.push({ id: `power-${room.id}-${i}`, kind: 'power', roomId: room.id, position: pos, normal: sp.normal, label: `Силовая розетка ${i + 1} · ${room.name} (плита, бойлер, кондиционер)` });
      const pp: Vec3[] = [...trunk(panel, [pos[0], CABLE_H, pos[2]]), pos];
      lines.push({ id: `power-${room.id}-${i}`, roomId: room.id, group: 'power', points: pp, label: `Силовая линия ${i + 1} · ${room.name}: ${cabP}, автомат 25 А`, cable: cabP });
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
