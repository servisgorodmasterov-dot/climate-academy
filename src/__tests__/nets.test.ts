import { describe, expect, it } from 'vitest';
import { getLayout, roomArea } from '../apartment/layout';
import { buildHeatingScheme, buildSmartScheme } from '../apartment/nets';

const layout = getLayout('type-2k-68');

describe('схема отопления', () => {
  it('у каждого радиатора стояк, подача сверху, обратка снизу, байпас; секции — из расчёта или по площади', () => {
    const rads = layout.elements.filter((e) => e.kind === 'radiator');
    const s = buildHeatingScheme(layout);
    for (const r of rads) {
      for (const g of ['riser', 'supply', 'return', 'bypass']) expect(s.lines.find((l) => l.group === g && l.id.endsWith(r.id)), `${g} у ${r.id}`).toBeTruthy();
      const sup = s.lines.find((l) => l.id === `sup-${r.id}`)!;
      const ret = s.lines.find((l) => l.id === `ret-${r.id}`)!;
      expect(sup.points[0][1]).toBeGreaterThan(ret.points[0][1]); // подача выше обратки
      const room = layout.rooms.find((x) => x.id === r.roomId)!;
      expect(s.points.find((p) => p.id === `rad-${r.id}`)!.short).toContain(`${Math.max(4, Math.ceil(roomArea(room) * 0.56 - 1e-9))} секц`);
    }
    const custom = buildHeatingScheme(layout, () => 12);
    expect(custom.points.filter((p) => p.kind === 'radiator' && p.short.includes('12 секц')).length).toBe(rads.length);
    expect(s.lines.find((l) => l.id === 'towel')).toBeTruthy(); // полотенцесушитель
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
