// Работа с планировками: геометрия хранится отдельно от индивидуальных данных квартиры.
import type { ApartmentInstance, ComplexRef, Layout, LayoutElement, Room, Wall } from '../core/types';
import layout2k68 from '../../data/layouts/type-2k-68.json';
import demoComplex from '../../data/complexes/demo-complex.json';

const LAYOUTS: Record<string, Layout> = { 'type-2k-68': layout2k68 as unknown as Layout };
export const COMPLEXES: ComplexRef[] = [demoComplex as unknown as ComplexRef];

export function getLayout(id: string): Layout {
  const l = LAYOUTS[id];
  if (!l) throw new Error(`Планировка ${id} не найдена`);
  return l;
}

/** Плоский список квартир с путём ЖК → корпус → подъезд → этаж → квартира. */
export function listApartments(complexes = COMPLEXES) {
  const out: { complex: ComplexRef; buildingName: string; entranceName: string; floor: number; apartment: ApartmentInstance }[] = [];
  for (const c of complexes)
    for (const b of c.buildings)
      for (const e of b.entrances)
        for (const f of e.floors) for (const a of f.apartments) out.push({ complex: c, buildingName: b.name, entranceName: e.name, floor: f.number, apartment: a });
  return out;
}

export function findApartment(id: string, complexes = COMPLEXES) {
  return listApartments(complexes).find((x) => x.apartment.id === id || x.apartment.number === id);
}

/** Зеркальная планировка: отражение по оси X с сохранением порядка точек стен. */
export function mirrorLayout(l: Layout): Layout {
  const W = l.size[0];
  const mx = (x: number) => +(W - x).toFixed(4);
  const rooms: Room[] = l.rooms.map((r) => ({ ...r, rect: [mx(r.rect[2]), r.rect[1], mx(r.rect[0]), r.rect[3]] }));
  const walls: Wall[] = l.walls.map((w) => {
    let a: [number, number] = [mx(w.a[0]), w.a[1]];
    let b: [number, number] = [mx(w.b[0]), w.b[1]];
    let openings = w.openings;
    if (a[1] === b[1] && a[0] > b[0]) {
      const len = a[0] - b[0];
      [a, b] = [b, a];
      openings = w.openings.map((o) => ({ ...o, from: +(len - o.to).toFixed(4), to: +(len - o.from).toFixed(4) }));
    }
    return { ...w, a, b, openings };
  });
  const elements: LayoutElement[] = l.elements.map((e) => ({
    ...e,
    position: [mx(e.position[0]), e.position[1], e.position[2]],
    rotationY: e.rotationY != null ? -e.rotationY : undefined,
  }));
  const utilities = l.utilities.map((u) => ({ ...u, points: u.points.map((p) => [mx(p[0]), p[1], p[2]] as [number, number, number]) }));
  const furniture = l.furniture.map((f) => ({ ...f, position: [mx(f.position[0]), f.position[1], f.position[2]] as [number, number, number], rotationY: -f.rotationY }));
  return { ...l, rooms, walls, elements, utilities, furniture, name: `${l.name} (зеркальная)` };
}

/** Геометрия конкретной квартиры: типовая планировка + зеркалирование + индивидуальные изменения. */
export function resolveLayout(apt: ApartmentInstance): Layout {
  let l = getLayout(apt.layoutId);
  if (apt.mirrored) l = mirrorLayout(l);
  for (const o of apt.overrides) {
    if (o.op === 'hideElement') l = { ...l, elements: l.elements.filter((e) => e.id !== o.target) };
    if (o.op === 'addElement') l = { ...l, elements: [...l.elements, o.value as LayoutElement] };
    if (o.op === 'setRoomName') l = { ...l, rooms: l.rooms.map((r) => (r.id === o.target ? { ...r, name: String(o.value) } : r)) };
  }
  return l;
}

export const roomArea = (r: Room) => +((r.rect[2] - r.rect[0]) * (r.rect[3] - r.rect[1])).toFixed(2);
export const roomSize = (r: Room) => [+(r.rect[2] - r.rect[0]).toFixed(2), +(r.rect[3] - r.rect[1]).toFixed(2)] as const;

/** Суммарная ширина дверных проёмов, выходящих в помещение. */
export function doorWidthInRoom(l: Layout, r: Room): number {
  const [x0, z0, x1, z1] = r.rect;
  let sum = 0;
  for (const w of l.walls) {
    for (const o of w.openings) {
      if (o.kind === 'window') continue;
      if (w.a[1] === w.b[1]) {
        const z = w.a[1];
        if (z !== z0 && z !== z1) continue;
        const s = w.a[0] + o.from;
        const e = w.a[0] + o.to;
        sum += Math.max(0, Math.min(e, x1) - Math.max(s, x0));
      } else {
        const x = w.a[0];
        if (x !== x0 && x !== x1) continue;
        const s = w.a[1] + o.from;
        const e = w.a[1] + o.to;
        sum += Math.max(0, Math.min(e, z1) - Math.max(s, z0));
      }
    }
  }
  return +sum.toFixed(2);
}

export function roomPerimeter(r: Room) {
  const [w, d] = roomSize(r);
  return +(2 * (w + d)).toFixed(2);
}

export function totalArea(l: Layout) {
  return +l.rooms.reduce((s, r) => s + roomArea(r), 0).toFixed(1);
}
