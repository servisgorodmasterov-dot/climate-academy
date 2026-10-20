// Схемы отопления и умного дома. Общий формат: линии (трубы, кабели, радиосвязь) и узлы с подписями.
// Строятся из планировки и расчёта (число секций радиатора). Условные схемы для понимания, не проект.
import type { Layout, LayoutElement, Room } from '../core/types';
import { roomArea } from './layout';
import { openingPlace } from '../objects/geometry';
import { buildElectricScheme, defaultCounts, type Vec3 } from './electric';
import { buildPlumbingScheme } from './plumbing';

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
  const H = layout.ceilingHeight;
  const lines: NetLine[] = [];
  const points: NetPoint[] = [];
  let pipes = 0;
  let sectionsTotal = 0;
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
    // стояк — сбоку от радиатора, у стены (в 25 см от края)
    const rx = cx - along[0] * (half + 0.25);
    const rz = cz - along[1] * (half + 0.25);
    const left: Vec3 = [cx - along[0] * half, 0, cz - along[1] * half];
    const right: Vec3 = [cx + along[0] * half, 0, cz + along[1] * half];
    lines.push({ id: `riser-${el.id}`, roomId: el.roomId, group: 'riser', points: [[rx, 0, rz], [rx, H, rz]], title: 'Стояк отопления', label: 'Общедомовая труба: горячая вода из котельной идёт сверху вниз через все квартиры этого стояка', step: 1 });
    lines.push({ id: `sup-${el.id}`, roomId: el.roomId, group: 'supply', points: [[rx, top, rz], [left[0], top, left[2]]], title: 'Подача', label: 'Горячая вода от стояка в радиатор — сверху. Здесь стоит кран и термоголовка', step: 2 });
    lines.push({ id: `ret-${el.id}`, roomId: el.roomId, group: 'return', points: [[left[0], bottom, left[2]], [rx, bottom, rz]], title: 'Обратка', label: 'Остывшая вода из радиатора обратно в стояк — снизу. Тоже с краном', step: 2 });
    lines.push({ id: `byp-${el.id}`, roomId: el.roomId, group: 'bypass', points: [[rx + along[0] * 0.08, top, rz + along[1] * 0.08], [rx + along[0] * 0.08, bottom, rz + along[1] * 0.08]], title: 'Байпас', label: 'Перемычка между подачей и обраткой: если закрыть краны радиатора, вода пойдёт мимо — соседи снизу не останутся без тепла', step: 3 });
    // сам радиатор — контур
    lines.push({ id: `rad-${el.id}`, roomId: el.roomId, group: 'radiator', points: [[left[0], top, left[2]], [right[0], top, right[2]], [right[0], bottom, right[2]], [left[0], bottom, left[2]], [left[0], top, left[2]]], title: `Радиатор, ${n} секций`, label: `${n} секций × ≈180 Вт = ${n * 180} Вт — по площади комнаты ${room ? roomArea(room) : '?'} м² (100 Вт на м²)`, step: 2 });
    points.push({ id: `rad-${el.id}`, roomId: el.roomId, kind: 'radiator', position: [cx, top + 0.18, cz], short: `Радиатор · ${n} секц.`, label: `${n * 180} Вт тепла. Число секций — из расчёта в карточке радиатора`, step: 2 });
    points.push({ id: `valve-${el.id}`, roomId: el.roomId, kind: 'valve', position: [(rx + left[0]) / 2, top, (rz + left[2]) / 2], short: 'Кран', label: 'Кран на подаче: можно снять радиатор, не сливая стояк. С термоголовкой — держит заданную температуру', step: 3 });
    points.push({ id: `mayev-${el.id}`, roomId: el.roomId, kind: 'mayevsky', position: [right[0], top, right[2]], short: 'Маевского', label: 'Кран Маевского: стравить воздух, если радиатор холодный сверху', step: 3 });
    pipes += H + 2 * Math.hypot(rx - left[0], rz - left[2]) + 0.5;
  }
  // полотенцесушитель на стояке горячей воды в санузле
  const pl = buildPlumbingScheme(layout);
  const hot = pl.lines.find((l) => l.id === 'riser-hot');
  const bath = layout.rooms.find((r) => r.type === 'bath');
  if (hot && bath) {
    const [hx, , hz] = hot.points[0];
    const wx = bath.rect[0] + 0.06;
    const z0 = hz + 0.35;
    const z1 = z0 + 0.5;
    lines.push({ id: 'towel', roomId: bath.id, group: 'radiator', points: [[wx, 1.6, z0], [wx, 1.6, z1], [wx, 1.0, z1], [wx, 1.0, z0], [wx, 1.6, z0]], title: 'Полотенцесушитель', label: 'Греется от стояка горячей воды (а не от отопления) — тёплый круглый год', step: 4 });
    lines.push({ id: 'towel-sup', roomId: bath.id, group: 'supply', points: [[hx, 1.5, hz], [hx, 1.5, z0], [wx, 1.5, z0]], title: 'Подача ГВС', label: 'От стояка горячей воды к полотенцесушителю', step: 4 });
    lines.push({ id: 'towel-ret', roomId: bath.id, group: 'return', points: [[wx, 1.1, z0], [hx, 1.1, z0], [hx, 1.1, hz]], title: 'Обратно в стояк ГВС', label: 'Из полотенцесушителя обратно в стояк', step: 4 });
    points.push({ id: 'towel', roomId: bath.id, kind: 'radiator', position: [wx, 1.75, (z0 + z1) / 2], short: 'Полотенцесушитель', label: 'Водяной, на стояке горячей воды', step: 4 });
  }
  return { lines, points, stats: [`Радиаторов: ${layout.elements.filter((e) => e.kind === 'radiator').length}, секций всего: ${sectionsTotal} (≈${(sectionsTotal * 0.18).toFixed(1)} кВт)`, `Труб подключения ≈${Math.round(pipes)} м (полипропилен 25 мм армированный или сталь)`] };
}

// ---------------- Умный дом ----------------

export function buildSmartScheme(layout: Layout): NetScheme {
  const lines: NetLine[] = [];
  const points: NetPoint[] = [];
  const hubEl = layout.elements.find((e) => e.kind === 'smart_hub');
  if (!hubEl) return { lines, points, stats: [] };
  const hub: Vec3 = [...hubEl.position] as Vec3;
  const H = layout.ceilingHeight;
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

  // умные карнизы на каждом окне: рейка под потолком, мотор с краю, питание кабелем от распредкоробки
  const el = buildElectricScheme(layout, (r) => ({ ...defaultCounts(r), power: 0 }));
  let cornices = 0;
  let cable = 0;
  for (const w of layout.walls)
    for (const o of w.openings) {
      if (o.kind !== 'window') continue;
      const p = openingPlace(layout, w, o);
      const room = p.plus ?? p.minus;
      if (!room) continue;
      const side = room === p.plus ? 1 : -1;
      const n: [number, number] = p.horizontal ? [0, side] : [side, 0];
      const off = w.thickness / 2 + 0.12;
      const y = Math.min(H - 0.06, o.head + 0.2);
      const halfW = (o.to - o.from) / 2 + 0.2;
      const a: Vec3 = p.horizontal ? [p.cx - halfW, y, p.cz + n[1] * off] : [p.cx + n[0] * off, y, p.cz - halfW];
      const b: Vec3 = p.horizontal ? [p.cx + halfW, y, p.cz + n[1] * off] : [p.cx + n[0] * off, y, p.cz + halfW];
      const id = `cornice-${w.id}-${o.from}`;
      cornices++;
      lines.push({ id, roomId: room.id, group: 'cornice', points: [a, b], title: 'Карниз с электроприводом', label: `Шторы открываются и закрываются сами: по расписанию, на рассвете, по команде с телефона. Длина ${(halfW * 2).toFixed(1)} м`, step: 4 });
      points.push({ id, roomId: room.id, kind: 'cornice', position: b, short: 'Умный карниз', label: 'Мотор карниза: питание 220 В кабелем от распредкоробки, команды — по Zigbee от хаба', step: 4 });
      radio(id, room.id, b, 'Zigbee', 'Хаб → мотор карниза', 4);
      // питание: от распредкоробки комнаты под потолком прямыми углами к мотору
      const box = el.points.find((q) => q.kind === 'box' && q.roomId === room.id);
      if (box) {
        const bp = box.position;
        const path: Vec3[] = [bp, [b[0], bp[1], bp[2]], [b[0], bp[1], b[2]], b];
        lines.push({ id: `pw-${id}`, roomId: room.id, group: 'power', points: path, title: 'Питание карниза', label: 'Кабель 3×1.5 мм² от распредкоробки комнаты к мотору карниза (закладывается до натяжного потолка!)', step: 4 });
        cable += len(path);
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
