import { describe, expect, it } from 'vitest';
import { getLayout, roomArea } from '../apartment/layout';
import { buildHeatingScheme, buildSmartScheme } from '../apartment/nets';

const layout = getLayout('type-2k-68');

describe('схема отопления', () => {
  it('ввод из подъезда в коллектор гидроузла; к каждому радиатору подача и обратка в полу снизу, без стояков; секции — из расчёта или по площади', () => {
    const rads = layout.elements.filter((e) => e.kind === 'radiator');
    const s = buildHeatingScheme(layout);
    const coll = s.points.find((p) => p.kind === 'collector')!;
    expect(coll).toBeTruthy();
    expect(layout.rooms.find((r) => r.id === coll.roomId)!.type).toBe('bath');
    expect(s.lines.find((l) => l.id === 'heat-in-supply')).toBeTruthy();
    expect(s.lines.find((l) => l.id === 'heat-in-return')).toBeTruthy();
    expect(s.lines.some((l) => l.group === 'riser' || l.group === 'bypass')).toBe(false);
    for (const r of rads) {
      for (const id of [`sup-${r.id}`, `ret-${r.id}`]) {
        const l = s.lines.find((x) => x.id === id)!;
        expect(l, id).toBeTruthy();
        // начинается у коллектора, идёт в полу, заканчивается снизу радиатора
        expect(Math.hypot(l.points[0][0] - coll.position[0], l.points[0][2] - coll.position[2])).toBeLessThan(0.1);
        expect(l.points.slice(1, -1).every((p) => p[1] < 0)).toBe(true);
        expect(l.points[l.points.length - 1][1]).toBeCloseTo(r.position[1] - 0.25, 5);
      }
      const room = layout.rooms.find((x) => x.id === r.roomId)!;
      expect(s.points.find((p) => p.id === `rad-${r.id}`)!.short).toContain(`${Math.max(4, Math.ceil(roomArea(room) * 0.56 - 1e-9))} секц`);
    }
    const custom = buildHeatingScheme(layout, () => 12);
    expect(custom.points.filter((p) => p.kind === 'radiator' && p.short.includes('12 секц')).length).toBe(rads.length);
    expect(s.lines.find((l) => l.id === 'towel')).toBeTruthy(); // полотенцесушитель
  });
});

describe('трубы отопления', () => {
  it('из комнаты в комнату — только через дверные проёмы', () => {
    const s = buildHeatingScheme(layout);
    for (const l of s.lines.filter((x) => x.group === 'supply' || x.group === 'return')) {
      for (let i = 1; i < l.points.length; i++) {
        const a = l.points[i - 1], b = l.points[i];
        for (const w of layout.walls) {
          const h = w.a[1] === w.b[1];
          const fa = h ? a[2] - w.a[1] : a[0] - w.a[0];
          const fb = h ? b[2] - w.a[1] : b[0] - w.a[0];
          if (fa * fb >= 0 || Math.abs(fa) < 0.02 || Math.abs(fb) < 0.02) continue;
          const t = fa / (fa - fb);
          const along = h ? a[0] + (b[0] - a[0]) * t - Math.min(w.a[0], w.b[0]) : a[2] + (b[2] - a[2]) * t - Math.min(w.a[1], w.b[1]);
          const wlen = h ? Math.abs(w.b[0] - w.a[0]) : Math.abs(w.b[1] - w.a[1]);
          if (along < 0 || along > wlen) continue;
          expect(w.openings.some((o) => o.kind !== 'window' && along > o.from - 0.01 && along < o.to + 0.01), `${l.id}: отрезок ${i} сквозь стену ${w.id}`).toBe(true);
        }
      }
    }
  });
});

describe('схема умного дома', () => {
  it('хаб связан по радио со всеми устройствами; на каждом окне умный карниз с кабелем питания от распредкоробки', () => {
    const s = buildSmartScheme(layout);
    const windows = layout.walls.reduce((n, w) => n + w.openings.filter((o) => o.kind === 'window').length, 0);
    const cornices = s.lines.filter((l) => l.group === 'cornice');
    expect(cornices.length).toBe(windows);
    for (const c of cornices) expect(s.lines.find((l) => l.id === `pw-${c.id}`), `питание ${c.id}`).toBeTruthy();
    for (const kind of ['leak', 'motion', 'switch', 'cornice', 'thermo', 'valve']) expect(s.points.some((p) => p.kind === kind), kind).toBe(true);
    // к каждому устройству (кроме самого хаба) идёт радиосвязь
    const radio = new Set(s.lines.filter((l) => l.wireless).map((l) => l.id.replace(/^z-/, '')));
    for (const p of s.points.filter((x) => x.kind !== 'hub')) expect(radio.has(p.id), `связь с ${p.id}`).toBe(true);
  });
});
