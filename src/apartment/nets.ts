// Схемы отопления и умного дома. Общий формат: линии (трубы, кабели, радиосвязь) и узлы с подписями.
// Строятся из планировки и расчёта (число секций радиатора). Условные схемы для понимания, не проект.
import type { Layout, LayoutElement, Room } from '../core/types';
import { roomArea } from './layout';
import { buildElectricScheme, cornicePlaces, defaultCounts, snapToWall, type Vec3 } from './electric';
import { buildPlumbingScheme, entryPoint, floorRoute } from './plumbing';

export interface NetLine {
  id: string;
  roomId: string;
  group: string;
  points: Vec3[];
  /** что это: «Подача», «Zigbee» */
  title: string;
  /** пояснение одной строкой */
  label: string;
  /** пунктир — беспроводная связь */
  wireless?: boolean;
  /** шаг объяснения, с которого линия видна */
  step: number;
}

export interface NetPoint {
  id: string;
  roomId: string;
  kind: string;
  position: Vec3;
  short: string;
  label: string;
  step: number;
}

export interface NetScheme {
  lines: NetLine[];
  points: NetPoint[];
  stats: string[];
}

const len = (pts: Vec3[]) => pts.reduce((s, p, i) => (i ? s + Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1], p[2] - pts[i - 1][2]) : 0), 0);
const roomOf = (layout: Layout, id: string) => layout.rooms.find((r) => r.id === id);

/** Число секций радиатора: из расчёта (params.layers) или по площади комнаты, как в карточке. */
export type SectionsOf = (el: LayoutElement, room: Room | undefined) => number;
export const defaultSections: SectionsOf = (_el, room) => Math.max(4, Math.ceil((room ? roomArea(room) : 10) * 0.56 - 1e-9));

// ---------------- Отопление ----------------

export function buildHeatingScheme(layout: Layout, sectionsOf: SectionsOf = defaultSections): NetScheme {
  const lines: NetLine[] = [];
  const points: NetPoint[] = [];
  let pipes = 0;
  let sectionsTotal = 0;
  // Гидроузел: коллектор отопления рядом с коллектором воды (в санузле). Ввод — из поэтажного узла в подъезде, в полу.
  const pl = buildPlumbingScheme(layout);
  const wm = pl.points.find((p) => p.kind === 'manifold');
  const bath = layout.rooms.find((r) => r.id === wm?.roomId) ?? layout.rooms.find((r) => r.type === 'bath');
  const FY = -0.05; // трубы отопления в стяжке, чуть ниже водопровода
  let coll: Vec3 | null = null;
  if (wm && bath) {
    const [x, z] = snapToWall(bath, wm.position[0] + 0.4, wm.position[2]);
    coll = [x, 0.45, z];
    points.push({ id: 'heat-coll', roomId: bath.id, kind: 'collector', position: coll, short: 'Коллектор отопления', label: 'Гребёнка отопления в гидроузле: от неё к каждому радиатору своя пара труб (подача и обратка). На каждой паре — кран и балансировочный вентиль', step: 1 });
    const entry = entryPoint(layout);
    if (entry) {
      const hall = roomOf(layout, entry.roomId)!;
      for (const [g, dz, title] of [['supply', 0, 'Ввод: подача'], ['return', 0.07, 'Ввод: обратка']] as const) {
        const y = FY - (g === 'return' ? 0.02 : 0);
        const k = 0.14 + dz;
        const s0: Vec3 = [entry.out[0] + entry.t[0] * k, 1.0, entry.out[2] + entry.t[1] * k];
        const inn: Vec3 = [entry.inn[0] + entry.t[0] * k, y, entry.inn[2] + entry.t[1] * k];
        const path: Vec3[] = [s0, [s0[0], y, s0[2]], inn, ...floorRoute(layout, hall, bath, inn, [coll[0] + dz, y, coll[2]], y).slice(1), [coll[0] + dz, coll[1], coll[2]]];
        lines.push({ id: `heat-in-${g}`, roomId: bath.id, group: g, points: g === 'return' ? [...path].reverse() : path, title, label: g === 'supply' ? 'Горячая вода от стояка отопления в подъезде (там кран и счётчик тепла) — в полу в гидроузел' : 'Остывшая вода из коллектора обратно в стояк в подъезде', step: 1 });
        pipes += len(path);
      }
      points.push({ id: 'heat-entry', roomId: entry.roomId, kind: 'entry', position: [entry.out[0] + entry.t[0] * 0.2, 1.15, entry.out[2] + entry.t[1] * 0.2], short: 'Подъезд: стояк отопления', label: 'Поэтажный узел в подъезде: стояки отопления, краны на квартиру и счётчик тепла. Общедомовое — трогать только через УК', step: 1 });
    }
  }
  for (const el of layout.elements.filter((e) => e.kind === 'radiator')) {
    const room = roomOf(layout, el.roomId);
    const r = el.rotationY ?? 0;
    const along: [number, number] = [Math.cos(r), -Math.sin(r)];
    const n = sectionsOf(el, room);
    sectionsTotal += n;
    const half = (n * 0.08) / 2;
    const [cx, cy, cz] = el.position;
    const top = cy + 0.25;
    const bottom = cy - 0.25;
    const left: Vec3 = [cx - along[0] * half, 0, cz - along[1] * half];
    const right: Vec3 = [cx + along[0] * half, 0, cz + along[1] * half];
    // нижнее подключение: подача — в левый край, обратка — из правого; обе трубы в полу до коллектора
    if (coll && bath && room) {
      for (const [g, end, dz] of [['supply', left, 0], ['return', right, 0.07]] as const) {
        const y = FY - (g === 'return' ? 0.02 : 0);
        const c0: Vec3 = [coll[0] + dz, coll[1], coll[2]];
        const route = floorRoute(layout, bath, room, [c0[0], y, c0[2]], [end[0], y, end[2]], y);
        const path: Vec3[] = [c0, ...route, [end[0], bottom, end[2]]];
        lines.push({ id: `${g === 'supply' ? 'sup' : 'ret'}-${el.id}`, roomId: el.roomId, group: g, points: g === 'return' ? [...path].reverse() : path, title: g === 'supply' ? 'Подача' : 'Обратка', label: g === 'supply' ? 'Горячая вода от коллектора в гидроузле — в полу, в радиатор снизу' : 'Остывшая вода из радиатора — в полу обратно в коллектор', step: 2 });
        pipes += len(path);
      }
    }
    lines.push({ id: `rad-${el.id}`, roomId: el.roomId, group: 'radiator', points: [[left[0], top, left[2]], [right[0], top, right[2]], [right[0], bottom, right[2]], [left[0], bottom, left[2]], [left[0], top, left[2]]], title: `Радиатор, ${n} секций`, label: `${n} секций × ≈180 Вт = ${n * 180} Вт — по площади комнаты ${room ? roomArea(room) : '?'} м² (100 Вт на м²)`, step: 3 });
    points.push({ id: `rad-${el.id}`, roomId: el.roomId, kind: 'radiator', position: [cx, top + 0.18, cz], short: `Радиатор · ${n} секц.`, label: `${n * 180} Вт тепла. Число секций — из расчёта в карточке радиатора`, step: 3 });
    points.push({ id: `valve-${el.id}`, roomId: el.roomId, kind: 'valve', position: [left[0], bottom + 0.06, left[2]], short: 'Кран', label: 'Узел нижнего подключения с кранами: радиатор можно снять, не сливая систему. Термоголовка держит заданную температуру', step: 3 });
    points.push({ id: `mayev-${el.id}`, roomId: el.roomId, kind: 'mayevsky', position: [right[0], top, right[2]], short: 'Маевского', label: 'Кран Маевского: стравить воздух, если радиатор холодный сверху', step: 3 });
  }
  // полотенцесушитель — от коллектора горячей воды
  const hotM = pl.lines.find((l) => l.id === 'meter-manifold-hot');
  if (wm && bath && hotM) {
    const hp = hotM.points[hotM.points.length - 1];
    const wx = bath.rect[0] + 0.06;
    const z0 = Math.min(bath.rect[3] - 0.7, Math.max(bath.rect[1] + 0.15, hp[2] + 0.35));
    const z1 = z0 + 0.5;
    lines.push({ id: 'towel', roomId: bath.id, group: 'radiator', points: [[wx, 1.6, z0], [wx, 1.6, z1], [wx, 1.0, z1], [wx, 1.0, z0], [wx, 1.6, z0]], title: 'Полотенцесушитель', label: 'Греется от горячей воды (а не от отопления) — тёплый круглый год', step: 4 });
    lines.push({ id: 'towel-sup', roomId: bath.id, group: 'supply', points: [[hp[0], hp[1], hp[2]], [hp[0], 1.5, hp[2]], [hp[0], 1.5, z0], [wx, 1.5, z0]], title: 'Подача ГВС', label: 'От коллектора горячей воды в гидроузле к полотенцесушителю', step: 4 });
    lines.push({ id: 'towel-ret', roomId: bath.id, group: 'return', points: [[wx, 1.1, z0], [hp[0] + 0.05, 1.1, z0], [hp[0] + 0.05, hp[1], hp[2]]], title: 'Обратно в ГВС', label: 'Из полотенцесушителя обратно в коллектор горячей воды', step: 4 });
    points.push({ id: 'towel', roomId: bath.id, kind: 'radiator', position: [wx, 1.75, (z0 + z1) / 2], short: 'Полотенцесушитель', label: 'Водяной, на горячей воде', step: 4 });
  }
  return { lines, points, stats: [`Радиаторов: ${layout.elements.filter((e) => e.kind === 'radiator').length}, секций всего: ${sectionsTotal} (≈${(sectionsTotal * 0.18).toFixed(1)} кВт)`, `Труб в полу ≈${Math.round(pipes)} м (сшитый полиэтилен PE-Xa 16–20 мм в теплоизоляции)`] };
}

// ---------------- Умный дом ----------------

export function buildSmartScheme(layout: Layout): NetScheme {
  const lines: NetLine[] = [];
  const points: NetPoint[] = [];
  const hubEl = layout.elements.find((e) => e.kind === 'smart_hub');
  if (!hubEl) return { lines, points, stats: [] };
  const hub: Vec3 = [...hubEl.position] as Vec3;
  points.push({ id: 'hub', roomId: hubEl.roomId, kind: 'hub', position: hub, short: 'Хаб умного дома', label: 'Центр системы: по радио (Zigbee) связан со всеми датчиками и устройствами. Сценарии работают даже без интернета', step: 1 });
  const radio = (id: string, roomId: string, to: Vec3, title: string, label: string, step: number) => lines.push({ id: `z-${id}`, roomId, group: 'zigbee', points: [hub, to], title, label, wireless: true, step });

  // датчики протечки + краны с электроприводом на вводе воды
  const pl = buildPlumbingScheme(layout);
  const meter = pl.points.find((p) => p.kind === 'meter');
  for (const e of layout.elements.filter((x) => x.kind === 'leak_sensor')) {
    points.push({ id: e.id, roomId: e.roomId, kind: 'leak', position: e.position, short: 'Датчик протечки', label: 'Лежит на полу. Попала вода — сигнал хабу, хаб закрывает краны на вводе за 5 секунд и присылает уведомление', step: 2 });
    radio(e.id, e.roomId, e.position, 'Zigbee', 'Датчик протечки → хаб', 2);
  }
  if (meter) {
    const v: Vec3 = [meter.position[0], meter.position[1] - 0.25, meter.position[2]];
    points.push({ id: 'valves', roomId: meter.roomId, kind: 'valve', position: v, short: 'Краны от протечки', label: 'Шаровые краны с электроприводом на холодной и горячей воде. Закрываются сами по сигналу датчика протечки', step: 2 });
    radio('valves', meter.roomId, v, 'Zigbee', 'Хаб → краны с электроприводом', 2);
  }

  // движение и выключатели
  for (const e of layout.elements.filter((x) => x.kind === 'motion_sensor')) {
    points.push({ id: e.id, roomId: e.roomId, kind: 'motion', position: e.position, short: 'Датчик движения', label: 'Вошли в прихожую — свет включается сам, через минуту без движения выключается', step: 3 });
    radio(e.id, e.roomId, e.position, 'Zigbee', 'Датчик движения → хаб', 3);
  }
  for (const e of layout.elements.filter((x) => x.kind === 'smart_switch')) {
    points.push({ id: e.id, roomId: e.roomId, kind: 'switch', position: e.position, short: 'Умный выключатель', label: 'Работает и рукой, и с телефона, и по сценарию. Ставится на место обычного', step: 3 });
    radio(e.id, e.roomId, e.position, 'Zigbee', 'Хаб ↔ умный выключатель', 3);
  }

  // умные карнизы на каждом окне: рейка под потолком, мотор с краю, питание — тот же кабель, что в схеме электрики
  const el = buildElectricScheme(layout, (r) => ({ ...defaultCounts(r), power: 0 }));
  let cornices = 0;
  let cable = 0;
  for (const c of cornicePlaces(layout)) {
    cornices++;
    lines.push({ id: c.id, roomId: c.roomId, group: 'cornice', points: [c.a, c.b], title: 'Карниз с электроприводом', label: `Шторы открываются и закрываются сами: по расписанию, на рассвете, по команде с телефона. Длина ${c.width.toFixed(1)} м`, step: 4 });
    points.push({ id: c.id, roomId: c.roomId, kind: 'cornice', position: c.b, short: 'Умный карниз', label: 'Мотор карниза: питание 220 В кабелем от распредкоробки, команды — по Zigbee от хаба', step: 4 });
    radio(c.id, c.roomId, c.b, 'Zigbee', 'Хаб → мотор карниза', 4);
    const pw = el.lines.find((l) => l.id === `pw-${c.id}`);
    if (pw) {
      lines.push({ id: pw.id, roomId: c.roomId, group: 'power', points: pw.points, title: 'Питание карниза', label: 'Кабель 3×1.5 мм² от распредкоробки комнаты к мотору карниза (закладывается до натяжного потолка!)', step: 4 });
      cable += len(pw.points);
    }
  }

  // термоголовки на радиаторах
  const heat = buildHeatingScheme(layout);
  for (const v of heat.points.filter((p) => p.kind === 'valve')) {
    points.push({ id: `th-${v.id}`, roomId: v.roomId, kind: 'thermo', position: v.position, short: 'Умная термоголовка', label: 'Держит температуру в комнате по расписанию: ночью 19 °C, днём 22 °C, когда никого нет — 17 °C', step: 5 });
    radio(`th-${v.id}`, v.roomId, v.position, 'Zigbee', 'Хаб → термоголовка радиатора', 5);
  }

  return {
    lines,
    points,
    stats: [
      `Устройств на связи с хабом: ${lines.filter((l) => l.wireless).length}`,
      `Умных карнизов: ${cornices}, кабеля питания к ним ≈${Math.round(cable)} м`,
    ],
  };
}
