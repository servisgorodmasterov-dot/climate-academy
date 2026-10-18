// Объекты конфигуратора, которые берутся прямо из геометрии планировки:
// каждый дверной проём, входная дверь, окно и стены каждого помещения.
// Новую квартиру не нужно размечать вручную — двери и окна появляются из проёмов автоматически.
import type { Basis, ElementKind, Layout, LayoutElement, Opening, Room, Wall } from '../core/types';
import { roomArea, roomPerimeter } from '../apartment/layout';

/** Проём шире этого значения считается аркой без полотна. */
export const ARCH_WIDTH = 1.05;

const horizontalOf = (w: Wall) => w.a[1] === w.b[1];

/** Помещение, в которое попадает точка плана. */
export function roomAt(layout: Layout, x: number, z: number): Room | undefined {
  return layout.rooms.find((r) => x > r.rect[0] && x < r.rect[2] && z > r.rect[1] && z < r.rect[3]);
}

/** Абсолютные координаты проёма и помещения по обе стороны от него. */
export function openingPlace(layout: Layout, w: Wall, o: Opening) {
  const h = horizontalOf(w);
  const mid = (o.from + o.to) / 2;
  const cx = h ? w.a[0] + mid : w.a[0];
  const cz = h ? w.a[1] : w.a[1] + mid;
  const d = w.thickness / 2 + 0.25;
  const plus = h ? roomAt(layout, cx, cz + d) : roomAt(layout, cx + d, cz);
  const minus = h ? roomAt(layout, cx, cz - d) : roomAt(layout, cx - d, cz);
  return { cx, cz, horizontal: h, plus, minus };
}

const KIND_OF: Record<Opening['kind'], ElementKind> = { door: 'door', entrance: 'entrance', window: 'window' };
const NAMES: Record<string, string> = { door: 'Дверь', entrance: 'Входная дверь', window: 'Окно', room_walls: 'Стены' };

/** Все объекты конфигуратора квартиры (без привязки к каталогу — тип назначается позже по листу «Объекты»). */
export function generateObjectElements(layout: Layout): LayoutElement[] {
  const out: LayoutElement[] = [];
  for (const w of layout.walls) {
    w.openings.forEach((o, index) => {
      if (o.kind === 'door' && o.to - o.from > ARCH_WIDTH) return; // арка — нет полотна
      const p = openingPlace(layout, w, o);
      const rooms = [p.plus, p.minus].filter((r): r is Room => !!r);
      if (!rooms.length) return;
      // дверь относим к комнате, а не к прихожей; окно и входную дверь — к помещению внутри квартиры
      const room = rooms.find((r) => r.type !== 'hall') ?? rooms[0];
      const side = room === p.plus ? 1 : -1;
      const n: [number, number] = p.horizontal ? [0, side] : [side, 0];
      const y = o.kind === 'window' ? ((o.sill ?? 0.9) + o.head) / 2 : 1.05;
      const kind = KIND_OF[o.kind];
      out.push({
        id: `${kind}-${w.id}-${index}`,
        kind,
        roomId: room.id,
        rooms: rooms.map((r) => r.id),
        position: [p.cx + n[0] * (w.thickness / 2), y, p.cz + n[1] * (w.thickness / 2)],
        rotationY: Math.atan2(n[0], n[1]),
        label: `${NAMES[kind]}: ${room.name}`,
        opening: { wallId: w.id, index },
      });
    });
  }
  for (const r of layout.rooms) {
    out.push({
      id: `walls-${r.id}`,
      kind: 'room_walls',
      roomId: r.id,
      rooms: [r.id],
      position: [(r.rect[0] + r.rect[2]) / 2, 1.5, (r.rect[1] + r.rect[3]) / 2],
      label: `${NAMES.room_walls}: ${r.name}`,
    });
  }
  // подписи «Дверь: Спальня» могут повторяться — нумеруем
  const seen: Record<string, number> = {};
  for (const e of out) seen[e.label] = (seen[e.label] ?? 0) + 1;
  const idx: Record<string, number> = {};
  for (const e of out)
    if (seen[e.label] > 1) {
      idx[e.label] = (idx[e.label] ?? 0) + 1;
      e.label = `${e.label} ${idx[e.label]}`;
    }
  return out;
}

export function openingOf(layout: Layout, el: LayoutElement): { wall: Wall; opening: Opening } | null {
  if (!el.opening) return null;
  const wall = layout.walls.find((w) => w.id === el.opening!.wallId);
  const opening = wall?.openings[el.opening.index];
  return wall && opening ? { wall, opening } : null;
}

// ---------- Поверхности стен помещения ----------

/** Прямоугольник отделки на внутренней грани стены помещения. s — вдоль стены, y — по высоте. */
export interface WallRect {
  wallId: string;
  roomId: string;
  horizontal: boolean; // грань вдоль оси X
  fixed: number; // координата линии стены (z для горизонтальной, x для вертикальной)
  normal: [number, number]; // внутрь помещения
  offset: number; // отступ грани от оси стены
  s0: number;
  s1: number;
  y0: number;
  y1: number;
}

function wallsOnLine(layout: Layout, horizontal: boolean, fixed: number) {
  return layout.walls.filter((w) => horizontalOf(w) === horizontal && (horizontal ? w.a[1] : w.a[0]) === fixed);
}

/** Полутолщина стены, которая проходит через точку угла поперёк кромки (чтобы не считать площадь внутри стены). */
function cornerHalf(layout: Layout, horizontal: boolean, cornerS: number, fixed: number) {
  // для горизонтальной кромки ищем вертикальную стену x = cornerS, проходящую через z = fixed
  const w = layout.walls.find((x) => {
    if (horizontalOf(x) === horizontal) return false;
    const line = horizontal ? x.a[0] : x.a[1];
    if (Math.abs(line - cornerS) > 1e-6) return false;
    const a = horizontal ? Math.min(x.a[1], x.b[1]) : Math.min(x.a[0], x.b[0]);
    const b = horizontal ? Math.max(x.a[1], x.b[1]) : Math.max(x.a[0], x.b[0]);
    return fixed >= a - 1e-6 && fixed <= b + 1e-6;
  });
  return w ? w.thickness / 2 : 0;
}

/** Поверхности для отделки: стены помещения за вычетом дверей (на всю высоту) и окон (от подоконника до верха). */
export function roomWallRects(layout: Layout, room: Room): WallRect[] {
  const H = layout.ceilingHeight;
  const [x0, z0, x1, z1] = room.rect;
  const edges = [
    { horizontal: true, fixed: z0, s0: x0, s1: x1, normal: [0, 1] as [number, number] },
    { horizontal: true, fixed: z1, s0: x0, s1: x1, normal: [0, -1] as [number, number] },
    { horizontal: false, fixed: x0, s0: z0, s1: z1, normal: [1, 0] as [number, number] },
    { horizontal: false, fixed: x1, s0: z0, s1: z1, normal: [-1, 0] as [number, number] },
  ];
  const out: WallRect[] = [];
  for (const e of edges) {
    for (const w of wallsOnLine(layout, e.horizontal, e.fixed)) {
      const base = e.horizontal ? w.a[0] : w.a[1];
      const end = e.horizontal ? w.b[0] : w.b[1];
      let s0 = Math.max(e.s0, Math.min(base, end));
      let s1 = Math.min(e.s1, Math.max(base, end));
      if (s1 - s0 < 0.05) continue;
      if (s0 === e.s0) s0 += cornerHalf(layout, e.horizontal, e.s0, e.fixed);
      if (s1 === e.s1) s1 -= cornerHalf(layout, e.horizontal, e.s1, e.fixed);
      // вырезы проёмов в координатах вдоль кромки
      const cuts = w.openings
        .map((o) => ({ a: base + o.from, b: base + o.to, y0: o.kind === 'window' ? o.sill ?? 0.9 : 0, y1: o.head }))
        .filter((c) => c.b > s0 && c.a < s1);
      const marks = [...new Set([s0, s1, ...cuts.flatMap((c) => [c.a, c.b]).filter((v) => v > s0 && v < s1)])].sort((a, b) => a - b);
      for (let i = 0; i < marks.length - 1; i++) {
        const a = marks[i];
        const b = marks[i + 1];
        const mid = (a + b) / 2;
        const holes = cuts.filter((c) => c.a <= mid && c.b >= mid).sort((p, q) => p.y0 - q.y0);
        let y = 0;
        for (const h of holes) {
          if (h.y0 > y + 0.01) out.push(rect(w, room, e, a, b, y, h.y0));
          y = Math.max(y, h.y1);
        }
        if (H > y + 0.01) out.push(rect(w, room, e, a, b, y, H));
      }
    }
  }
  return out;
}

function rect(w: Wall, room: Room, e: { horizontal: boolean; fixed: number; normal: [number, number] }, s0: number, s1: number, y0: number, y1: number): WallRect {
  return { wallId: w.id, roomId: room.id, horizontal: e.horizontal, fixed: e.fixed, normal: e.normal, offset: w.thickness / 2 + 0.004, s0, s1, y0, y1 };
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Базы для расчёта количества по объекту. Все значения — из геометрии, без ручного ввода. */
export function measure(layout: Layout, el: LayoutElement): Record<Basis, number> {
  const room = layout.rooms.find((r) => r.id === el.roomId);
  const op = openingOf(layout, el);
  const ow = op ? op.opening.to - op.opening.from : 0;
  const oh = op ? op.opening.head - (op.opening.kind === 'window' ? op.opening.sill ?? 0.9 : 0) : 0;
  const walls = room ? roomWallRects(layout, room).reduce((s, r) => s + (r.s1 - r.s0) * (r.y1 - r.y0), 0) : 0;
  return {
    pcs: 1,
    opening_m2: r2(ow * oh),
    opening_w: r2(ow),
    opening_h: r2(oh),
    opening_perimeter_m: r2(op ? 2 * oh + ow : 0),
    wall_m2: r2(walls),
    floor_m2: room ? roomArea(room) : 0,
    perimeter_m: room ? roomPerimeter(room) : 0,
    ceiling_m2: room ? roomArea(room) : 0,
  };
}
