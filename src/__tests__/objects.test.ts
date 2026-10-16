import { describe, expect, it } from 'vitest';
import { getLayout } from '../apartment/layout';
import { selectableObjects } from '../apartment/objects';

describe('Модель выбираемых объектов', () => {
  const objs = selectableObjects(getLayout('type-2k-68'));
  it('в список попадают только объекты с академией', () => {
    expect(objs.every((o) => o.academy)).toBe(true);
    expect(objs.some((o) => o.element.kind === 'radiator')).toBe(false);
  });
  it('каждый объект относится к категории и помещению', () => {
    const cats = new Set(objs.map((o) => o.category));
    expect([...cats].sort()).toEqual(['climate', 'finish', 'smarthome']);
    expect(objs.filter((o) => o.element.kind === 'floor')).toHaveLength(4); // плитка санузла без академии
  });
});
