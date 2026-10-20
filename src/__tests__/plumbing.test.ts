import { describe, expect, it } from 'vitest';
import { getLayout } from '../apartment/layout';
import { buildPlumbingScheme } from '../apartment/plumbing';

const layout = getLayout('type-2k-68');
const s = buildPlumbingScheme(layout);

describe('схема сантехники', () => {
  it('стояк, узел ввода, коллектор и все приборы на месте', () => {
    expect(s.points.map((p) => p.kind)).toEqual(expect.arrayContaining(['riser', 'meter', 'manifold', 'fixture']));
    expect(s.points.filter((p) => p.kind === 'fixture').map((p) => p.short).sort()).toEqual(['Ванна', 'Кухонная мойка', 'Раковина', 'Стиральная машина', 'Унитаз']);
  });

  it('холодная вода — ко всем приборам, горячая — только к ванне, раковине и мойке; канализация от каждого прибора к стояку', () => {
    const fx = (g: string) => s.lines.filter((l) => l.group === g && l.fixture).map((l) => l.fixture).sort();
    expect(fx('cold')).toEqual(['Ванна', 'Кухонная мойка', 'Раковина', 'Стиральная машина', 'Унитаз']);
    expect(fx('hot')).toEqual(['Ванна', 'Кухонная мойка', 'Раковина']);
    expect(fx('sewer')).toEqual(['Ванна', 'Кухонная мойка', 'Раковина', 'Стиральная машина', 'Унитаз']);
    const riser = layout.elements.find((e) => e.kind === 'riser')!;
    for (const l of s.lines.filter((x) => x.group === 'sewer' && x.fixture)) {
      const end = l.points[l.points.length - 1];
      expect(Math.hypot(end[0] - riser.position[0], end[2] - riser.position[2])).toBeLessThan(0.15);
      // уклон: к стояку ниже, чем у прибора
      expect(end[1]).toBeLessThan(l.points[1][1]);
    }
    expect(s.lines.find((l) => l.group === 'sewer' && l.fixture === 'Унитаз')!.pipe).toContain('110');
  });

  it('из комнаты в комнату трубы проходят только через дверные проёмы, не сквозь стены', () => {
    for (const l of s.lines) {
      for (let i = 1; i < l.points.length; i++) {
        const a = l.points[i - 1], b = l.points[i];
        for (const w of layout.walls) {
          const h = w.a[1] === w.b[1];
          // пересечение отрезка a-b с линией стены
          const fa = h ? a[2] - w.a[1] : a[0] - w.a[0];
          const fb = h ? b[2] - w.a[1] : b[0] - w.a[0];
          if (fa * fb >= 0 || Math.abs(fa) < 0.02 || Math.abs(fb) < 0.02) continue;
          const t = fa / (fa - fb);
          const along = h ? a[0] + (b[0] - a[0]) * t - Math.min(w.a[0], w.b[0]) : a[2] + (b[2] - a[2]) * t - Math.min(w.a[1], w.b[1]);
          const wlen = h ? Math.abs(w.b[0] - w.a[0]) : Math.abs(w.b[1] - w.a[1]);
          if (along < 0 || along > wlen) continue;
          const throughDoor = w.openings.some((o) => o.kind !== 'window' && along > o.from - 0.01 && along < o.to + 0.01);
          expect(throughDoor, `${l.id}: отрезок ${i} проходит сквозь стену ${w.id}`).toBe(true);
        }
      }
    }
  });
});
