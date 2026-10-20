import { describe, expect, it } from 'vitest';
import { getLayout } from '../apartment/layout';
import { buildElectricScheme, defaultCounts } from '../apartment/electric';

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
      expect(s.lines.find((l) => l.group === 'trunk' && l.roomId === r.id)!.points[0]).toEqual(s.panel);
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
});
