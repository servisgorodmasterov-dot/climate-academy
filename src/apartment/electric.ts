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
      // путь вдоль стен строго по осям: одна точка на той же стене — прямая; на другой стене — через угол
      const onX = (p: Vec3) => Math.abs(p[0] - x0) < 0.2 || Math.abs(p[0] - x1) < 0.2; // точка на левой/правой стене
      const wallPath = (from: Vec3, to: Vec3): Vec3[] => {
        if (Math.abs(from[0] - to[0]) < 1e-6 || Math.abs(from[2] - to[2]) < 1e-6) return [to];
        // угол: X берём у того, кто на боковой стене, Z — у того, кто на передней/задней
        const corner: Vec3 = onX(from) ? [from[0], from[1], to[2]] : [to[0], from[1], from[2]];
        return [corner, to];
      };
      // от коробки к стене двери (в её плоскость), затем вниз до высоты розеток
      const wall: Vec3 = door ? [door.pos[0] + door.normal[0] * 0.08, SOCKET_H, door.pos[2] + door.normal[1] * 0.08] : [box[0], SOCKET_H, box[2]];
      const pts: Vec3[] = [box, [wall[0], CABLE_H, wall[2]], wall];
      let cur = wall;
      for (const sp of sockets) {
        for (const q of wallPath(cur, sp.pos)) pts.push(q);
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
      const pp: Vec3[] = [panel, [panel[0], CABLE_H, panel[2]], [pos[0], CABLE_H, panel[2]], [pos[0], CABLE_H, pos[2]], pos];
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
