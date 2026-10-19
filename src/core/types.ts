// Доменные типы 3D Home Academy. Ядро не зависит от конкретных академий, 3D-сцены и источников данных.

/** Допустимые единицы измерения. Проверяются при загрузке каталога. */
export const UNITS = {
  m2: 'м²',
  m: 'м',
  pcs: 'шт',
  set: 'компл.',
  kg: 'кг',
  l: 'л',
  pack: 'уп.',
} as const;
export type Unit = keyof typeof UNITS;

export type Tier = 'econom' | 'comfort' | 'premium';
export const TIERS: { id: Tier; label: string }[] = [
  { id: 'econom', label: 'Эконом' },
  { id: 'comfort', label: 'Комфорт' },
  { id: 'premium', label: 'Премиум' },
];

export type ProductCategory = 'material' | 'equipment' | 'consumable';
export type DataStatus = 'demo' | 'live';

export interface Product {
  id: string;
  slot: string; // взаимозаменяемая позиция в комплектации (floor.laminate, ac.split ...)
  academy: string;
  category: ProductCategory;
  name: string;
  purpose: string;
  unit: Unit;
  packSize: number; // кратность продажи в единицах unit
  specs: Record<string, string>; // человекочитаемые характеристики
  attrs: Record<string, string>; // машинные атрибуты (цвет, мощность, протокол)
  principle: string;
  warrantyMonths: number;
  service: string;
  supplierId: string;
  sku: string;
}

export interface Price {
  productId: string;
  purchase: number | null; // закупочная — видна только администратору
  sale: number | null; // продажная
  currency: string;
  updatedAt: string;
  source: string; // DEMO | имя таблицы/поставщика
}

export interface Work {
  id: string;
  academy: string;
  slot: string;
  name: string;
  unit: Unit;
  price: number | null;
  updatedAt: string;
  source: string;
}

export interface KitRow {
  kitId: string;
  academy: string;
  tier: Tier;
  slot: string;
  productId: string;
  workId: string | null;
}

export interface Supplier {
  id: string;
  name: string;
  city: string;
  deliveryPrice: number | null;
  deliveryDays: number | null;
  contact: string;
  catalogSource: string;
  updatedAt: string;
}

export interface ConsumableRule {
  productId: string;
  forSlot: string;
  rate: number;
  ratePer: string; // m2 | m | pcs | m2*mm
  condition: Record<string, string>; // параметры, при которых правило активно
  note: string;
}

// ---------- Конфигуратор объектов (листы «Категории», «Объекты», «Позиции объектов») ----------

/** Раздел левого каталога: двери, окна, полы, стены… Порядок и названия задаются в таблице. */
export interface CategoryDef {
  id: string;
  name: string;
  icon: string;
  order: number;
  description: string;
}

/**
 * Откуда берётся количество. Значения считаются из геометрии конкретного объекта квартиры:
 * pcs — 1 на объект; opening_m2 / opening_w / opening_h / opening_perimeter_m — размеры проёма;
 * wall_m2 — площадь стен помещения за вычетом дверей и окон; floor_m2; perimeter_m; ceiling_m2.
 */
export const BASES = {
  pcs: 'шт. объектов',
  opening_m2: 'площадь проёма, м²',
  opening_w: 'ширина проёма, м',
  opening_h: 'высота проёма, м',
  opening_perimeter_m: 'периметр проёма (без порога), м',
  wall_m2: 'площадь стен без проёмов, м²',
  floor_m2: 'площадь пола, м²',
  perimeter_m: 'периметр помещения, м',
  ceiling_m2: 'площадь потолка, м²',
  length_m: 'длина предмета, м',
} as const;
export type Basis = keyof typeof BASES;

/** Как объект выглядит в 3D. Новый вид отрисовки требует кода; новые модели и цвета — нет. */
export const RENDERERS = ['door', 'entrance', 'window', 'wall', 'furniture', 'none'] as const;
export type Renderer = (typeof RENDERERS)[number];

/** Тип объекта квартиры: «Межкомнатная дверь», «Окно», «Отделка стен»… */
export interface ObjectType {
  id: string; // door.interior
  category: string; // doors
  name: string;
  icon: string;
  renderer: Renderer;
  /** Какие места планировки становятся объектами этого типа: door | entrance | window | room_walls */
  placement: string;
  primarySlot: string;
  description: string;
  lessonSteps: string[];
  mistakes: string[];
}

/** Позиция внутри объекта: полотно, коробка, наличник, ручка… или краска, грунт. */
export interface ObjectSlotDef {
  typeId: string;
  slot: string;
  label: string;
  qty: number; // норма на единицу базы
  per: Basis;
  waste: number; // запас, доля (0.1 = 10 %)
  optional: boolean;
  defaultProductId: string | null;
  workId: string | null;
  workPer: Basis;
  order: number;
  /** Слой, мм: норма qty (или rate товара) задана на 1 мм толщины. null — позиция без слоя. */
  layerMm: number | null;
  /** Толщины на выбор, мм (колонка layer_options: «5|10|15|20»). */
  layerOptions: number[];
  /** Работа дорожает со слоя толще этого, мм: объём работ × (слой / work_layer_mm). */
  workLayerMm: number | null;
  /** Зачем нужен шаг и когда его можно пропустить — подсказка для клиента. */
  hint: string;
}

/** Лист «Опт»: условия коллективной закупки. Свои пороги у каждого товара, работы и поставщика — без единого процента. */
export interface BulkRule {
  kind: 'product' | 'work' | 'delivery';
  refId: string; // product_id | work_id | supplier_id
  minParticipants: number;
  /** product: цена за единицу при закупке от minParticipants; work: цена за единицу работы; delivery: стоимость доставки на одного участника */
  price: number;
  note: string;
}

export interface CatalogIssue {
  sheet: string;
  row: number;
  message: string;
}

export interface Catalog {
  products: Product[];
  prices: Price[];
  works: Work[];
  kits: KitRow[];
  suppliers: Supplier[];
  consumables: ConsumableRule[];
  categories: CategoryDef[];
  objectTypes: ObjectType[];
  objectSlots: ObjectSlotDef[];
  bulk: BulkRule[];
  issues: CatalogIssue[];
  status: DataStatus;
  sourceName: string;
  loadedAt: string;
  /** Самая поздняя дата обновления цен в каталоге */
  pricesUpdatedAt: string;
}

// ---------- Смета ----------

export type EstimateGroup = 'materials' | 'equipment' | 'consumables' | 'works' | 'delivery';
export const GROUP_LABELS: Record<EstimateGroup, string> = {
  materials: 'Материалы',
  equipment: 'Оборудование',
  consumables: 'Расходники',
  works: 'Работы',
  delivery: 'Доставка',
};

export interface PriceOverride {
  productId: string;
  offerId: string;
  seller: string;
  unitPrice: number; // за единицу product.unit
  deliveryPrice: number;
  updatedAt: string;
  source: string;
}

export interface EstimateLine {
  key: string;
  group: EstimateGroup;
  section: string; // академия/помещение
  refId: string; // product/work/supplier id
  name: string;
  unit: Unit | 'trip';
  needQty: number; // расчётная потребность
  qty: number; // к покупке с учётом кратности
  unitPrice: number | null;
  total: number | null;
  priceSource: string;
  priceUpdatedAt: string;
  note?: string;
  warning?: string;
  /** Цена и сумма при коллективной закупке (если для позиции есть условие в листе «Опт») */
  bulkUnitPrice?: number | null;
  bulkTotal?: number | null;
  bulkNote?: string;
}

export interface BulkSummary {
  participants: number;
  total: number; // итог при коллективной закупке
  savings: Record<EstimateGroup, number>;
  savingsTotal: number;
  linesWithOffer: number;
}

export interface Estimate {
  lines: EstimateLine[];
  totals: Record<EstimateGroup, number>;
  total: number;
  warnings: string[];
  currency: string;
  priceStatus: DataStatus;
  bulk?: BulkSummary;
}

// ---------- Объекты недвижимости ----------

export interface ComplexRef {
  id: string;
  name: string;
  buildings: {
    id: string;
    name: string;
    entrances: { id: string; name: string; floors: { number: number; apartments: ApartmentInstance[] }[] }[];
  }[];
}

/** Индивидуальные данные квартиры. Геометрия — отдельно в Layout. */
export interface ApartmentInstance {
  id: string;
  number: string;
  layoutId: string;
  layoutVersion: number;
  mirrored: boolean;
  overrides: LayoutOverride[];
  ownerName?: string;
}

export interface LayoutOverride {
  /** Индивидуальное изменение: скрыть/добавить элемент или поменять параметр */
  op: 'hideElement' | 'addElement' | 'setRoomName';
  target: string;
  value?: unknown;
}

export type RoomType = 'living' | 'bedroom' | 'kitchen' | 'bath' | 'hall';
export interface Room {
  id: string;
  name: string;
  type: RoomType;
  rect: [number, number, number, number]; // x0, z0, x1, z1 в метрах
  floorFinish: 'laminate' | 'tile' | 'porcelain';
}

export interface Opening {
  kind: 'door' | 'window' | 'entrance';
  from: number; // отступ вдоль стены, м
  to: number;
  sill?: number; // высота подоконника для окна
  head: number; // верх проёма
}

export interface Wall {
  id: string;
  a: [number, number];
  b: [number, number];
  thickness: number;
  exterior: boolean;
  openings: Opening[];
}

export type ElementKind =
  | 'floor'
  | 'ac_indoor'
  | 'ac_outdoor'
  | 'smart_switch'
  | 'motion_sensor'
  | 'leak_sensor'
  | 'smart_hub'
  | 'radiator'
  | 'electric_panel'
  | 'riser'
  // создаются автоматически из геометрии планировки (проёмы и стены помещений)
  | 'door'
  | 'entrance'
  | 'window'
  | 'room_walls'
  | 'furniture';

/** Объекты, которые рисует каркас квартиры (стены, проёмы, мебель), а не отдельная 3D-модель. */
export const GEOMETRY_KINDS: ElementKind[] = ['door', 'entrance', 'window', 'room_walls', 'furniture'];

export interface LayoutElement {
  id: string;
  kind: ElementKind;
  roomId: string;
  position: [number, number, number];
  rotationY?: number;
  academy?: string; // какая академия открывается
  /** Часть другого объекта (наружный блок → кондиционер): выбирается как основной объект */
  partOf?: string;
  label: string;
  /** Тип объекта из листа «Объекты» (для объектов конфигуратора) */
  typeId?: string;
  /** Проём в стене, к которому привязан объект */
  opening?: { wallId: string; index: number };
  /** Все помещения, которые объект соединяет (дверь между комнатами) */
  rooms?: string[];
  /** Индекс предмета в layout.furniture (для мебели) */
  furniture?: number;
}

export type UtilitySystem = 'electric' | 'water' | 'sewer' | 'heating' | 'ventilation' | 'ac' | 'smarthome';
export type UtilityConfidence = 'conditional' | 'design' | 'confirmed';
export interface UtilityRun {
  id: string;
  system: UtilitySystem;
  confidence: UtilityConfidence;
  points: [number, number, number][];
  wireless?: boolean;
  label: string;
}

export interface FurnitureItem {
  type: string;
  /** Можно ли выбирать и менять предмет (тип объекта из таблицы: placement = furniture:<type>) */
  selectable?: boolean;
  roomId: string;
  position: [number, number, number];
  rotationY: number;
  length?: number;
  size?: [number, number];
  sink?: number;
  stove?: number;
}

export interface Layout {
  id: string;
  version: number;
  name: string;
  isDemo: boolean;
  note: string;
  ceilingHeight: number;
  size: [number, number];
  rooms: Room[];
  walls: Wall[];
  elements: LayoutElement[];
  utilities: UtilityRun[];
  furniture: FurnitureItem[];
  history: { version: number; date: string; note: string }[];
}

// ---------- Пользователь ----------
export type Role = 'resident' | 'master' | 'admin';
export const ROLE_LABELS: Record<Role, string> = { resident: 'Жилец', master: 'Мастер', admin: 'Администратор' };
