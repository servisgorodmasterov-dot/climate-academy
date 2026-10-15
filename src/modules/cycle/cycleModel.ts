/**
 * Геометрия и термодинамика учебной схемы холодильного цикла (бытовая сплит-система на R32).
 * Значения температур и давлений — типичные ориентировочные для расчётных условий;
 * реальные зависят от модели, нагрузки и погоды.
 */
export type Mode = 'cool' | 'heat';
export type Phase = 'gas' | 'mix' | 'liq';
export type PieceId = 'out_gas' | 'out_coil' | 'out_to_eev' | 'eev' | 'liquid_line' | 'in_coil' | 'gas_line' | 'comp';
type Pt = [number, number];

function serpentine(x0: number, x1: number, yStart: number, dy: number, rows: number, entry: Pt): Pt[] {
  const pts: Pt[] = [entry];
  for (let i = 0; i < rows; i++) {
    const y = yStart + dy * i;
    const x = i % 2 === 0 ? x1 : x0;
    pts.push([x, y]);
    if (i < rows - 1) pts.push([x, y + dy]);
  }
  return pts;
}

/** Порядок кусков — по направлению движения при ОХЛАЖДЕНИИ. */
export const LOOP: { id: PieceId; pts: Pt[] }[] = [
  { id: 'out_gas', pts: [[740, 300], [870, 300], [870, 110]] },
  { id: 'out_coil', pts: serpentine(890, 1010, 110, 40, 9, [870, 110]) },
  { id: 'out_to_eev', pts: [[1010, 430], [1010, 500], [820, 500]] },
  { id: 'eev', pts: [[820, 500], [772, 500]] },
  { id: 'liquid_line', pts: [[772, 500], [390, 500], [390, 230]] },
  { id: 'in_coil', pts: serpentine(360, 110, 230, -30, 5, [390, 230]) },
  { id: 'gas_line', pts: [[110, 110], [110, 50], [600, 50], [600, 300], [660, 300]] },
];
export const COMP: Pt[] = [[720, 320], [720, 405], [700, 445], [680, 405], [680, 320]];

export interface Poly {
  pts: Pt[];
  cum: number[];
  len: number;
}
export function poly(pts: Pt[]): Poly {
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  return { pts, cum, len: cum[cum.length - 1] };
}
export function pointAt(p: Poly, s: number): Pt {
  s = Math.max(0, Math.min(p.len, s));
  let i = 1;
  while (i < p.cum.length - 1 && p.cum[i] < s) i++;
  const seg = p.cum[i] - p.cum[i - 1] || 1;
  const u = (s - p.cum[i - 1]) / seg;
  const a = p.pts[i - 1];
  const b = p.pts[i];
  return [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u];
}

export const LOOP_POLYS = LOOP.map((l) => ({ id: l.id, p: poly(l.pts) }));
export const LOOP_LEN = LOOP_POLYS.reduce((s, x) => s + x.p.len, 0);
export const COMP_POLY = poly(COMP);

/** Где на петле находится расстояние s (по направлению охлаждения). */
export function locate(s: number) {
  let acc = 0;
  for (const piece of LOOP_POLYS) {
    if (s <= acc + piece.p.len) return { id: piece.id, u: (s - acc) / piece.p.len, p: piece.p, local: s - acc };
    acc += piece.p.len;
  }
  const last = LOOP_POLYS[LOOP_POLYS.length - 1];
  return { id: last.id, u: 1, p: last.p, local: last.p.len };
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * Math.max(0, Math.min(1, t));

/**
 * Состояние хладагента. u — доля куска по направлению охлаждения.
 * Для обогрева кусок проходится в обратную сторону: v = 1 − u.
 */
export function state(mode: Mode, id: PieceId, u: number): { T: number; ph: Phase } {
  if (mode === 'cool') {
    switch (id) {
      case 'comp':
        return u < 0.45 ? { T: 14, ph: 'gas' } : { T: lerp(14, 78, (u - 0.45) / 0.55), ph: 'gas' };
      case 'out_gas':
        return { T: lerp(78, 74, u), ph: 'gas' };
      case 'out_coil':
        return u < 0.15 ? { T: lerp(74, 46, u / 0.15), ph: 'gas' } : u < 0.85 ? { T: 45, ph: 'mix' } : { T: lerp(45, 40, (u - 0.85) / 0.15), ph: 'liq' };
      case 'out_to_eev':
        return { T: 40, ph: 'liq' };
      case 'eev':
        return { T: lerp(40, 6, u), ph: u < 0.4 ? 'liq' : 'mix' };
      case 'liquid_line':
        return { T: 6, ph: 'mix' };
      case 'in_coil':
        return u < 0.85 ? { T: 6, ph: 'mix' } : { T: lerp(6, 12, (u - 0.85) / 0.15), ph: 'gas' };
      case 'gas_line':
        return { T: lerp(12, 14, u), ph: 'gas' };
    }
  }
  const v = id === 'comp' ? u : 1 - u;
  switch (id) {
    case 'comp':
      return v < 0.45 ? { T: 0, ph: 'gas' } : { T: lerp(0, 72, (v - 0.45) / 0.55), ph: 'gas' };
    case 'gas_line':
      return { T: lerp(72, 69, v), ph: 'gas' };
    case 'in_coil':
      return v < 0.15 ? { T: lerp(69, 43, v / 0.15), ph: 'gas' } : v < 0.85 ? { T: 42, ph: 'mix' } : { T: lerp(42, 35, (v - 0.85) / 0.15), ph: 'liq' };
    case 'liquid_line':
      return { T: 35, ph: 'liq' };
    case 'eev':
      return { T: lerp(35, -7, v), ph: v < 0.4 ? 'liq' : 'mix' };
    case 'out_to_eev':
      return { T: -7, ph: 'mix' };
    case 'out_coil':
      return v < 0.85 ? { T: -7, ph: 'mix' } : { T: lerp(-7, -2, (v - 0.85) / 0.15), ph: 'gas' };
    case 'out_gas':
      return { T: lerp(-2, 0, v), ph: 'gas' };
  }
}

/** Цвет хладагента: от −10 °C (синий) до 80 °C (красный). */
export function refColor(T: number) {
  const stops: [number, [number, number, number]][] = [
    [-10, [40, 90, 255]],
    [8, [70, 180, 255]],
    [25, [150, 220, 230]],
    [42, [255, 190, 80]],
    [60, [255, 120, 50]],
    [80, [235, 50, 50]],
  ];
  if (T <= stops[0][0]) return `rgb(${stops[0][1].join(',')})`;
  for (let i = 1; i < stops.length; i++) {
    if (T <= stops[i][0]) {
      const [t0, c0] = stops[i - 1];
      const [t1, c1] = stops[i];
      const u = (T - t0) / (t1 - t0);
      return `rgb(${c0.map((c, k) => Math.round(c + (c1[k] - c) * u)).join(',')})`;
    }
  }
  return `rgb(${stops[stops.length - 1][1].join(',')})`;
}

export interface Stage {
  n: number;
  title: string;
  pieces: PieceId[];
  text: string;
  pro: string;
}

export const STAGES: Record<Mode, Stage[]> = {
  cool: [
    {
      n: 1,
      title: 'Сжатие в компрессоре',
      pieces: ['comp'],
      text: 'Компрессор всасывает холодный газ низкого давления и сжимает его. Давление и температура газа растут — газ становится горячее уличного воздуха.',
      pro: 'Всасывание ≈ 9–10 бар, +10…15 °C (перегретый пар). Нагнетание ≈ 27–29 бар, 70–80 °C. Работа сжатия добавляется к теплу, которое уйдёт на улицу.',
    },
    {
      n: 2,
      title: 'Отдача тепла в конденсаторе',
      pieces: ['out_gas', 'out_coil'],
      text: 'Горячий газ в наружном теплообменнике отдаёт тепло уличному воздуху: сначала остывает, затем конденсируется и превращается в жидкость.',
      pro: 'Снятие перегрева 75 → 45 °C, конденсация при ≈ 45 °C (≈ 28 бар для R32), переохлаждение жидкости до ≈ 40 °C.',
    },
    {
      n: 3,
      title: 'Снижение давления в ЭРВ',
      pieces: ['out_to_eev', 'eev'],
      text: 'Тёплая жидкость проходит через сужение расширительного вентиля. Давление резко падает, часть жидкости мгновенно вскипает, и смесь становится холодной.',
      pro: 'Дросселирование 28 → ≈ 9,5 бар, температура падает до ≈ +6 °C. В типичной сплит-системе ЭРВ стоит в наружном блоке — поэтому тонкая труба трассы тоже холодная.',
    },
    {
      n: 4,
      title: 'Поглощение тепла в испарителе',
      pieces: ['liquid_line', 'in_coil'],
      text: 'Холодная смесь кипит в испарителе внутреннего блока. Для кипения нужна теплота — она отбирается у воздуха комнаты. Воздух охлаждается, на рёбрах выпадает влага.',
      pro: 'Кипение при ≈ +6 °C, воздух 26 → 13 °C. На выходе — небольшой перегрев пара, чтобы в компрессор не попала жидкость.',
    },
    {
      n: 5,
      title: 'Возврат к компрессору',
      pieces: ['gas_line'],
      text: 'Холодный газ по толстой трубе через четырёхходовой клапан возвращается к компрессору. Цикл повторяется непрерывно.',
      pro: 'Газовая линия холодная (≈ 12–14 °C) и обязательно в изоляции. Дальше — отделитель жидкости и всасывание компрессора.',
    },
  ],
  heat: [
    {
      n: 1,
      title: 'Сжатие в компрессоре',
      pieces: ['comp'],
      text: 'Компрессор работает так же, как летом: сжимает газ, и тот становится горячим. Меняется только направление, куда этот газ пойдёт.',
      pro: 'Всасывание ≈ 6 бар при 0 °C, нагнетание ≈ 25–26 бар, ≈ 70 °C.',
    },
    {
      n: 2,
      title: 'Отдача тепла в комнату',
      pieces: ['gas_line', 'in_coil'],
      text: 'Четырёхходовой клапан направил горячий газ во внутренний блок. Теперь его теплообменник — конденсатор: газ конденсируется и отдаёт тепло воздуху комнаты.',
      pro: 'Конденсация ≈ 42 °C, воздух 20 → 40 °C. Газовая линия трассы при обогреве горячая.',
    },
    {
      n: 3,
      title: 'Снижение давления в ЭРВ',
      pieces: ['liquid_line', 'eev'],
      text: 'Тёплая жидкость возвращается в наружный блок и проходит расширительный вентиль. Давление падает, смесь становится холоднее уличного воздуха.',
      pro: 'Жидкостная линия при обогреве тёплая (≈ 35 °C). После ЭРВ ≈ −7 °C при уличной ≈ 0 °C.',
    },
    {
      n: 4,
      title: 'Поглощение тепла с улицы',
      pieces: ['out_to_eev', 'out_coil'],
      text: 'Наружный теплообменник стал испарителем. Хладагент холоднее уличного воздуха, поэтому даже зимой забирает у него тепло.',
      pro: 'Кипение ≈ −7 °C, воздух 0 → −4 °C. Влага замерзает на рёбрах — система периодически выполняет оттайку (кратковременно переключается обратно).',
    },
    {
      n: 5,
      title: 'Возврат к компрессору',
      pieces: ['out_gas'],
      text: 'Газ через четырёхходовой клапан возвращается к компрессору. Тепло, взятое с улицы, плюс работа компрессора ушли в комнату.',
      pro: 'Чем холоднее на улице, тем меньше теплопроизводительность и COP. Рабочий диапазон температур — в паспорте модели.',
    },
  ],
};
