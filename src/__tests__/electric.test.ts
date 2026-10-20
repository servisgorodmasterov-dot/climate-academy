import { describe, expect, it } from 'vitest';
import { getLayout } from '../apartment/layout';
import { buildElectricScheme, defaultCounts } from '../apartment/electric';
import { openingPlace } from '../objects/geometry';

const layout = getLayout('type-2k-68');

describe('схема электрики', () => {
  it('строится для каждой комнаты: магистраль от щита, розетки по периметру, выключатель у двери, свет на потолке', () => {
    const s = buildElectricScheme(layout, (r) => ({ ...defaultCounts(r), power: r.type === 'kitchen' ? 2 : 0 }));
    expect(s.points.find((p) => p.kind === 'panel')).toBeTruthy();
    for (const r of layout.rooms) {
      const d = defaultCounts(r);
      expect(s.points.filter((p) => p.kind === 'socket' && p.roomId === r.id).length).toBe(d.sockets);
      expect(s.points.filter((p) => p.kind === 'light' && p.roomId === r.id).length).toBe(d.lights);
      expect(s.points.filter((p) => p.kind === 'switch' && p.roomId === r.id).length).toBe(1);
      const trunkLine = s.lines.find((l) => l.group === 'trunk' && l.roomId === r.id)!;
      expect(trunkLine.points[0]).toEqual(s.panel);
      const box = s.points.find((p) => p.kind === 'box' && p.roomId === r.id)!;
      expect(trunkLine.points[trunkLine.points.length - 1]).toEqual(box.position); // магистраль заканчивается в коробке
      for (const g of ['sockets', 'light']) for (const l of s.lines.filter((x) => x.group === g && x.roomId === r.id)) expect(l.points[0]).toEqual(box.position); // ветки начинаются в коробке
      // все отрезки — по осям (прямые углы), без диагоналей
      for (const l of s.lines.filter((x) => x.roomId === r.id)) for (let i = 1; i < l.points.length; i++) { const a = l.points[i - 1], b = l.points[i]; const axes = [Math.abs(a[0] - b[0]) > 1e-6, Math.abs(a[1] - b[1]) > 1e-6, Math.abs(a[2] - b[2]) > 1e-6].filter(Boolean).length; expect(axes).toBeLessThanOrEqual(1); }
      expect(s.cableByRoom[r.id]).toBeGreaterThan(5);
      // розетки внутри комнаты, на высоте 30 см
      for (const p of s.points.filter((p) => p.kind === 'socket' && p.roomId === r.id)) {
        expect(p.position[1]).toBe(0.3);
        expect(p.position[0]).toBeGreaterThanOrEqual(r.rect[0]);
        expect(p.position[0]).toBeLessThanOrEqual(r.rect[2]);
        expect(p.position[2]).toBeGreaterThanOrEqual(r.rect[1]);
        expect(p.position[2]).toBeLessThanOrEqual(r.rect[3]);
      }
    }
    expect(s.points.filter((p) => p.kind === 'power').length).toBe(2);
    expect(s.lines.filter((l) => l.group === 'power').every((l) => l.cable.includes('3×4'))).toBe(true);
  });

  it('количество точек задаёт пользователь, марка кабеля — из выбранного товара', () => {
    const s = buildElectricScheme(layout, (r) => ({ sockets: r.id === 'living' ? 14 : 2, switches: 2, lights: 4, power: 0, cable: 'NYM 3×2.5', cableLight: 'NYM 3×1.5' }));
    expect(s.points.filter((p) => p.kind === 'socket' && p.roomId === 'living').length).toBe(14);
    expect(s.points.filter((p) => p.kind === 'switch' && p.roomId === 'living').length).toBe(2);
    expect(s.lines.find((l) => l.group === 'sockets' && l.roomId === 'living')!.cable).toBe('NYM 3×2.5');
    expect(s.lines.find((l) => l.group === 'light' && l.roomId === 'living')!.cable).toBe('NYM 3×1.5');
  });

  it('розетки, выключатели и кабели не попадают в дверные проёмы и в окна', () => {
    const s = buildElectricScheme(layout, (r) => ({ ...defaultCounts(r), sockets: 12, power: r.type === 'kitchen' ? 2 : 0 }));
    const ops: { x: number; z: number; w: number; h: boolean; sill: number; head: number }[] = [];
    for (const w of layout.walls) for (const o of w.openings) { const p = openingPlace(layout, w, o); ops.push({ x: p.cx, z: p.cz, w: o.to - o.from, h: p.horizontal, sill: o.kind === 'window' ? o.sill ?? 0.9 : 0, head: o.head }); }
    const inOpening = (x: number, z: number, y: number) => ops.some((o) => y > o.sill + 0.05 && y < o.head - 0.05 && (o.h ? Math.abs(z - o.z) < 0.25 && Math.abs(x - o.x) < o.w / 2 : Math.abs(x - o.x) < 0.25 && Math.abs(z - o.z) < o.w / 2));
    for (const p of s.points) if (p.kind !== 'box' && p.kind !== 'panel') expect(inOpening(p.position[0], p.position[2], p.position[1]), `точка ${p.id} в проёме`).toBe(false);
    for (const l of s.lines) if (l.group === 'sockets') for (let i = 1; i < l.points.length; i++) { const a = l.points[i - 1], b = l.points[i]; for (let t = 0; t <= 1; t += 0.05) { const x = a[0] + (b[0] - a[0]) * t, y = a[1] + (b[1] - a[1]) * t, z = a[2] + (b[2] - a[2]) * t; expect(inOpening(x, z, y), `линия ${l.id} сегмент ${i} y=${y.toFixed(2)} в проёме`).toBe(false); } }
  });

  it('каждый кондиционер — на отдельной линии от щита с автоматом 16 А', () => {
    const s = buildElectricScheme(layout, (r) => ({ ...defaultCounts(r), power: 0 }));
    const acs = layout.elements.filter((e) => e.kind === 'ac_indoor');
    expect(acs.length).toBeGreaterThan(0);
    for (const ac of acs) {
      const l = s.lines.find((x) => x.id === `ac-${ac.id}`)!;
      expect(l.group).toBe('ac');
      expect(l.cable).toContain('3×2.5');
      expect(l.label).toContain('16 А');
      expect(Math.hypot(l.points[0][0] - s.panel[0], l.points[0][2] - s.panel[2])).toBeLessThan(0.3); // от щита, не от коробки
    }
  });

  it('к каждому окну — кабель к мотору умного карниза от распредкоробки комнаты', () => {
    const s = buildElectricScheme(layout, defaultCounts);
    const windows = layout.walls.reduce((n, w) => n + w.openings.filter((o) => o.kind === 'window').length, 0);
    const lines = s.lines.filter((l) => l.group === 'cornice');
    expect(lines.length).toBe(windows);
    for (const l of lines) {
      const box = s.points.find((p) => p.kind === 'box' && p.roomId === l.roomId)!;
      expect(l.points[0]).toEqual(box.position);
      expect(l.cable).toContain('3×1.5');
      const end = l.points[l.points.length - 1];
      expect(s.points.find((p) => p.kind === 'cornice' && p.position === end)).toBeTruthy();
    }
  });
});
