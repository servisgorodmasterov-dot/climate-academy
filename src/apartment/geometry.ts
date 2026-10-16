// Построение 3D-геометрии стен из планировки (чистые функции).
import type { Opening, Wall } from '../core/types';

export interface Box {
  center: [number, number, number];
  size: [number, number, number];
}

export interface WallPieces {
  solids: Box[];
  windows: { box: Box; opening: Opening }[];
  doors: { box: Box; opening: Opening }[];
}

/** Делит прямую стену на сплошные участки, перемычки, подоконные части и проёмы. Стены — только по осям. */
export function wallPieces(w: Wall, height: number): WallPieces {
  const horizontal = w.a[1] === w.b[1];
  const len = horizontal ? w.b[0] - w.a[0] : w.b[1] - w.a[1];
  const t = w.thickness;
  // для наружных стен добавляем полтолщины в углах, чтобы не было щелей
  const ext = w.exterior ? t / 2 : 0;
  const mk = (s: number, e: number, y0: number, y1: number): Box => {
    const mid = (s + e) / 2;
    const L = e - s;
    const cy = (y0 + y1) / 2;
    const h = y1 - y0;
    return horizontal
      ? { center: [w.a[0] + mid, cy, w.a[1]], size: [L, h, t] }
      : { center: [w.a[0], cy, w.a[1] + mid], size: [t, h, L] };
  };
  const ops = [...w.openings].sort((a, b) => a.from - b.from);
  const solids: Box[] = [];
  const windows: WallPieces['windows'] = [];
  const doors: WallPieces['doors'] = [];
  let cursor = -ext;
  for (const o of ops) {
    if (o.from > cursor) solids.push(mk(cursor, o.from, 0, height));
    if (o.head < height) solids.push(mk(o.from, o.to, o.head, height));
    if (o.kind === 'window') {
      const sill = o.sill ?? 0.9;
      solids.push(mk(o.from, o.to, 0, sill));
      windows.push({ box: mk(o.from, o.to, sill, o.head), opening: o });
    } else doors.push({ box: mk(o.from, o.to, 0, o.head), opening: o });
    cursor = Math.max(cursor, o.to);
  }
  if (cursor < len + ext) solids.push(mk(cursor, len + ext, 0, height));
  return { solids, windows, doors };
}

/** Участки кромки помещения без дверных проёмов (для плинтуса). */
export function edgeSegments(rect: [number, number, number, number], walls: Wall[]) {
  const [x0, z0, x1, z1] = rect;
  const edges: { a: [number, number]; b: [number, number]; normal: [number, number] }[] = [
    { a: [x0, z0], b: [x1, z0], normal: [0, 1] },
    { a: [x0, z1], b: [x1, z1], normal: [0, -1] },
    { a: [x0, z0], b: [x0, z1], normal: [1, 0] },
    { a: [x1, z0], b: [x1, z1], normal: [-1, 0] },
  ];
  const out: { a: [number, number]; b: [number, number]; normal: [number, number] }[] = [];
  for (const e of edges) {
    const horiz = e.a[1] === e.b[1];
    const fixed = horiz ? e.a[1] : e.a[0];
    const s0 = horiz ? e.a[0] : e.a[1];
    const s1 = horiz ? e.b[0] : e.b[1];
    const cuts: [number, number][] = [];
    for (const w of walls) {
      const wh = w.a[1] === w.b[1];
      if (wh !== horiz) continue;
      if ((wh ? w.a[1] : w.a[0]) !== fixed) continue;
      const base = wh ? w.a[0] : w.a[1];
      for (const o of w.openings) if (o.kind !== 'window') cuts.push([base + o.from, base + o.to]);
    }
    cuts.sort((a, b) => a[0] - b[0]);
    let c = s0;
    for (const [cs, ce] of cuts) {
      if (ce <= s0 || cs >= s1) continue;
      if (cs > c) out.push(seg(horiz, fixed, c, cs, e.normal));
      c = Math.max(c, ce);
    }
    if (c < s1) out.push(seg(horiz, fixed, c, s1, e.normal));
  }
  return out;
}

function seg(horiz: boolean, fixed: number, s: number, e: number, normal: [number, number]) {
  return horiz
    ? { a: [s, fixed] as [number, number], b: [e, fixed] as [number, number], normal }
    : { a: [fixed, s] as [number, number], b: [fixed, e] as [number, number], normal };
}
