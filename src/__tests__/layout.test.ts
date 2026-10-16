import { describe, expect, it } from 'vitest';
import { getLayout, mirrorLayout, resolveLayout, totalArea, listApartments } from '../apartment/layout';
import { edgeSegments, wallPieces } from '../apartment/geometry';

const l = getLayout('type-2k-68');

describe('Планировка', () => {
  it('помещения покрывают квартиру без наложений', () => {
    expect(totalArea(l)).toBe(68.4);
    const [W, D] = l.size;
    expect(l.rooms.reduce((s, r) => s + (r.rect[2] - r.rect[0]) * (r.rect[3] - r.rect[1]), 0)).toBeCloseTo(W * D, 5);
  });
  it('все элементы и мебель находятся внутри своих помещений (кроме наружных блоков)', () => {
    for (const e of l.elements) {
      if (e.kind === 'ac_outdoor') continue;
      const r = l.rooms.find((x) => x.id === e.roomId)!;
      expect(e.position[0], e.id).toBeGreaterThanOrEqual(r.rect[0]);
      expect(e.position[0], e.id).toBeLessThanOrEqual(r.rect[2]);
      expect(e.position[2], e.id).toBeGreaterThanOrEqual(r.rect[1]);
      expect(e.position[2], e.id).toBeLessThanOrEqual(r.rect[3]);
    }
  });
  it('все условные коммуникации помечены как условные', () => {
    expect(l.utilities.every((u) => u.confidence === 'conditional')).toBe(true);
  });
  it('зеркальная квартира: геометрия отражена, площади сохранены', () => {
    const m = mirrorLayout(l);
    const bed = m.rooms.find((r) => r.id === 'bedroom')!;
    expect(bed.rect).toEqual([5, 0, 9, 4]);
    expect(totalArea(m)).toBe(68.4);
    const n = m.walls.find((w) => w.id === 'W-N')!;
    expect(n.a[0]).toBeLessThan(n.b[0]);
    expect(n.openings.map((o) => [o.from, o.to])).toEqual([
      [6.2, 7.8],
      [1.6, 3.6],
    ]);
  });
  it('индивидуальные изменения применяются к экземпляру, а не к типовой планировке', () => {
    const apt73 = listApartments().find((a) => a.apartment.number === '73')!.apartment;
    const r = resolveLayout(apt73);
    expect(r.rooms.find((x) => x.id === 'bedroom')?.name).toBe('Детская');
    expect(l.rooms.find((x) => x.id === 'bedroom')?.name).toBe('Спальня');
  });
});

describe('Геометрия стен', () => {
  it('стена с окном: простенки, перемычка, подоконная часть и проём', () => {
    const w = l.walls.find((x) => x.id === 'W-N')!;
    const p = wallPieces(w, 2.7);
    expect(p.windows).toHaveLength(2);
    expect(p.solids).toHaveLength(3 + 2 * 2); // 3 простенка + перемычки и подоконники
  });
  it('плинтус не идёт через дверные проёмы', () => {
    const living = l.rooms.find((r) => r.id === 'living')!;
    const len = edgeSegments(living.rect, l.walls).reduce((s, e) => s + Math.hypot(e.b[0] - e.a[0], e.b[1] - e.a[1]), 0);
    expect(len).toBeCloseTo(15.8, 5);
  });
});
