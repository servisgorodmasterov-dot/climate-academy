/**
 * Упрощённый поэлементный расчёт холодильной нагрузки помещения (пиковый летний час).
 * Метод учебный: показывает, ИЗ ЧЕГО складывается нагрузка. Для объектов со сложным
 * остеклением, большой нагрузкой или нестандартной планировкой нужен инженерный расчёт.
 *
 * Все коэффициенты — типичные справочные значения, вынесены в константы ниже.
 */

export type Orientation = 'N' | 'E' | 'S' | 'W';
export type Shading = 'none' | 'inner' | 'outer' | 'trees';
export type Insulation = 'poor' | 'medium' | 'good';
export type Region = 'moderate' | 'hot' | 'veryhot';

export interface RoomInput {
  length: number; // м
  width: number; // м
  height: number; // м
  windows: number; // шт.
  glazing: number; // м², суммарно
  orientation: Orientation;
  shading: Shading;
  people: number;
  appliances: Record<ApplianceId, number>;
  insulation: Insulation;
  region: Region;
  topFloor: boolean;
}

export type ApplianceId = 'tv' | 'pc' | 'laptop' | 'fridge' | 'cooking';

export const APPLIANCES: Record<ApplianceId, { name: string; watts: number }> = {
  tv: { name: 'Телевизор', watts: 120 },
  pc: { name: 'Настольный ПК', watts: 300 },
  laptop: { name: 'Ноутбук', watts: 60 },
  fridge: { name: 'Холодильник', watts: 150 },
  cooking: { name: 'Плита/духовка (в работе)', watts: 1500 },
};

export const ORIENT_LABEL: Record<Orientation, string> = { N: 'Север', E: 'Восток', S: 'Юг', W: 'Запад' };
export const SHADING_LABEL: Record<Shading, string> = {
  none: 'Нет затенения',
  inner: 'Внутренние жалюзи/шторы',
  outer: 'Наружные ставни/маркизы',
  trees: 'Деревья, козырёк, соседнее здание',
};
export const INSULATION_LABEL: Record<Insulation, string> = {
  poor: 'Слабое (старая панель, без утепления)',
  medium: 'Среднее',
  good: 'Хорошее (утеплённый фасад)',
};
export const REGION_LABEL: Record<Region, string> = {
  moderate: 'Умеренный (расч. наружная +28 °C)',
  hot: 'Жаркий (+33 °C, напр. Астана, Алматы)',
  veryhot: 'Очень жаркий (+38 °C, напр. Шымкент, Туркестан)',
};

const T_INSIDE = 24; // °C — расчётная внутренняя
const T_OUT: Record<Region, number> = { moderate: 28, hot: 33, veryhot: 38 };

/** Пиковый солнечный теплоприток через двойной стеклопакет, Вт/м² (≈ 45–50° с. ш., лето). */
const SOLAR: Record<Orientation, number> = { N: 60, E: 280, S: 220, W: 320 };
/** Доля солнечного тепла, проходящего через защиту. */
const SHADE_K: Record<Shading, number> = { none: 1, inner: 0.7, outer: 0.35, trees: 0.6 };
/** Коэффициент теплопередачи наружной стены, Вт/(м²·К). */
const U_WALL: Record<Insulation, number> = { poor: 1.4, medium: 0.8, good: 0.35 };
const U_ROOF: Record<Insulation, number> = { poor: 1.2, medium: 0.6, good: 0.25 };
const U_WINDOW = 2.7; // двухкамерный/однокамерный стеклопакет, Вт/(м²·К)
/** Добавка к ΔT для освещённой солнцем стены/кровли («эквивалентная температура»), К. */
const SOLAR_WALL_DT: Record<Orientation, number> = { N: 0, E: 6, S: 7, W: 9 };
const ROOF_SOLAR_DT = 18;
const PERSON_W = 130; // явное + скрытое тепло, лёгкая активность
const LIGHT_W_M2 = 6; // светодиодное освещение
const AIR_CHANGES = 0.5; // 1/ч, инфильтрация + проветривание
const RESERVE = 1.15; // запас на неучтённое

/** Номинальные классы бытовых сплит-систем. Холодопроизводительность — типичная, точная — в паспорте. */
export const CLASSES = [
  { btu: 7000, kw: 2.1 },
  { btu: 9000, kw: 2.6 },
  { btu: 12000, kw: 3.5 },
  { btu: 18000, kw: 5.3 },
  { btu: 24000, kw: 7.0 },
];

export const BTU_PER_KW = 3412.14;

export interface LoadItem {
  key: string;
  label: string;
  watts: number;
}

export interface LoadResult {
  items: LoadItem[];
  sumW: number;
  totalKW: number; // с запасом
  area: number;
  volume: number;
  byAreaKW: number; // «1 кВт на 10 м²»
  cls: (typeof CLASSES)[number] | null;
  electricKW: number; // потребление выбранного класса при типичном EER
  eer: number;
  warnings: string[];
  dT: number;
}

export function computeLoad(r: RoomInput): LoadResult {
  const area = r.length * r.width;
  const volume = area * r.height;
  const dT = T_OUT[r.region] - T_INSIDE;
  // Окна — на наружной стене длиной r.length.
  const extWall = Math.max(0, r.length * r.height - r.glazing);

  const items: LoadItem[] = [
    { key: 'solar', label: 'Солнце через окна', watts: r.glazing * SOLAR[r.orientation] * SHADE_K[r.shading] },
    { key: 'glass', label: 'Теплопередача через стёкла', watts: r.glazing * U_WINDOW * dT },
    { key: 'wall', label: 'Наружная стена', watts: extWall * U_WALL[r.insulation] * (dT + SOLAR_WALL_DT[r.orientation]) },
    ...(r.topFloor ? [{ key: 'roof', label: 'Кровля (последний этаж)', watts: area * U_ROOF[r.insulation] * (dT + ROOF_SOLAR_DT) }] : []),
    { key: 'air', label: 'Наружный воздух (инфильтрация)', watts: 0.335 * AIR_CHANGES * volume * dT },
    { key: 'people', label: 'Люди', watts: r.people * PERSON_W },
    {
      key: 'appl',
      label: 'Техника',
      watts: (Object.keys(r.appliances) as ApplianceId[]).reduce((s, k) => s + r.appliances[k] * APPLIANCES[k].watts, 0),
    },
    { key: 'light', label: 'Освещение', watts: area * LIGHT_W_M2 },
  ];
  for (const i of items) i.watts = Math.max(0, i.watts);
  const sumW = items.reduce((s, i) => s + i.watts, 0);
  const totalKW = (sumW * RESERVE) / 1000;
  const cls = CLASSES.find((c) => c.kw >= totalKW) ?? null;
  const eer = 3.2;
  const electricKW = (cls ? cls.kw : totalKW) / eer;

  const warnings: string[] = [];
  const glazingShare = r.glazing / Math.max(area, 1);
  if (!cls) warnings.push('Нагрузка выше 7 кВт — больше, чем у бытовой настенной модели. Нужен инженерный расчёт: несколько блоков или другой тип системы.');
  if (glazingShare > 0.3) warnings.push('Остекление больше 30 % площади пола (панорамные окна). Солнечная нагрузка резко меняется в течение дня — рекомендуем инженерную проверку.');
  if (area > 45) warnings.push('Большое помещение: один блок может не обеспечить равномерное распределение воздуха.');
  if (r.height > 3.2) warnings.push('Высокие потолки: возможна температурная стратификация, расчёт по площади здесь особенно неточен.');
  if (r.appliances.cooking > 0) warnings.push('Кухня с плитой: часть тепла уходит в вытяжку, но пиковые нагрузки высоки — уточните режим использования.');
  if (cls && totalKW > cls.kw * 0.92) warnings.push('Нагрузка близка к верхней границе класса — сравните фактическую холодопроизводительность моделей по паспорту.');

  return { items, sumW, totalKW, area, volume, byAreaKW: area / 10, cls, electricKW, eer, warnings, dT };
}

export const DEFAULT_ROOM: RoomInput = {
  length: 5,
  width: 4,
  height: 2.7,
  windows: 1,
  glazing: 2.4,
  orientation: 'W',
  shading: 'inner',
  people: 2,
  appliances: { tv: 1, pc: 0, laptop: 1, fridge: 0, cooking: 0 },
  insulation: 'medium',
  region: 'hot',
  topFloor: false,
};
