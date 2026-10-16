import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Catalog, Layout, PriceOverride, Role, Tier, UtilitySystem } from './core/types';
import type { ObjectCategory } from './apartment/objects';
import type { Selection } from './core/academy';
import { selectionFromKit } from './core/academy';
import { createCatalogProvider, DemoCatalogProvider } from './catalog/CatalogProvider';
import { findApartment, listApartments, resolveLayout } from './apartment/layout';
import type { Order, OrderStatus } from './integrations/gorodmasterov/orders';
import { advance } from './integrations/gorodmasterov/orders';
import { readLaunchContext } from './integrations/eshanyraq/bridge';

export type ViewMode = 'apartment' | 'xray' | 'encyclopedia';
export type Panel = 'academy' | 'objects' | 'estimate' | 'passport' | 'orders' | 'about' | null;
export type AcademyTab = 'card' | 'lesson' | 'variants' | 'calc';

export interface SectionState {
  id: string;
  apartmentId: string;
  academy: string;
  roomId: string | null;
  tier: Tier;
  selection: Selection;
  params: any;
  included: boolean; // включён в общую смету
}

interface State {
  // данные
  catalog: Catalog | null;
  catalogError: string | null;
  apartmentId: string;
  layout: Layout | null;
  launchSource: 'eshanyraq' | 'standalone';
  // вид
  mode: ViewMode;
  focusRoom: string | null;
  ceilingHidden: boolean;
  wallsTransparent: boolean;
  xraySystems: UtilitySystem[];
  selectedElement: string | null;
  categoryFilter: ObjectCategory | 'all';
  academyTab: AcademyTab;
  panel: Panel;
  activeSection: string | null;
  proMode: boolean;
  role: Role;
  // планирование
  sections: Record<string, SectionState>;
  overrides: Record<string, PriceOverride>;
  orders: Order[];

  init(): Promise<void>;
  reloadCatalog(): Promise<void>;
  setApartment(id: string): void;
  set<K extends keyof State>(k: K, v: State[K]): void;
  toggleSystem(s: UtilitySystem): void;
  openSection(sectionId: string, academy: string, roomId: string | null, defaultParams: () => unknown, elementId?: string | null, tab?: AcademyTab): void;
  setTier(sectionId: string, tier: Tier): void;
  setSlot(sectionId: string, slot: string, productId: string | null): void;
  setParams(sectionId: string, params: unknown): void;
  setIncluded(sectionId: string, v: boolean): void;
  setOverride(o: PriceOverride): void;
  clearOverride(productId: string): void;
  addOrder(o: Order): void;
  advanceOrder(id: string, to: OrderStatus): Order;
}

const ALL_SYSTEMS: UtilitySystem[] = ['electric', 'water', 'sewer', 'heating', 'ventilation', 'ac', 'smarthome'];

export const useApp = create<State>()(
  persist(
    (set, get) => ({
      catalog: null,
      catalogError: null,
      apartmentId: 'apt-72',
      layout: null,
      launchSource: 'standalone',
      mode: 'apartment',
      focusRoom: null,
      ceilingHidden: true,
      wallsTransparent: false,
      xraySystems: ALL_SYSTEMS,
      selectedElement: null,
      categoryFilter: 'all',
      academyTab: 'card',
      panel: null,
      activeSection: null,
      proMode: false,
      role: 'resident',
      sections: {},
      overrides: {},
      orders: [],

      async init() {
        const ctx = readLaunchContext(location.search);
        if (ctx.apartment) {
          const found = findApartment(ctx.apartment);
          if (found) set({ apartmentId: found.apartment.id });
        }
        if (ctx.role) set({ role: ctx.role });
        set({ launchSource: ctx.source });
        get().setApartment(get().apartmentId);
        await get().reloadCatalog();
      },

      async reloadCatalog() {
        const provider = createCatalogProvider();
        try {
          set({ catalog: await provider.load({ force: true }), catalogError: null });
        } catch (e) {
          const demo = await new DemoCatalogProvider().load();
          set({ catalog: demo, catalogError: `${provider.label}: ${(e as Error).message}. Используется демонстрационный каталог.` });
        }
      },

      setApartment(id) {
        const found = findApartment(id) ?? listApartments()[0];
        set({ apartmentId: found.apartment.id, layout: resolveLayout(found.apartment), focusRoom: null, selectedElement: null });
      },

      set: (k, v) => set({ [k]: v } as Partial<State>),

      toggleSystem(s) {
        const cur = get().xraySystems;
        set({ xraySystems: cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s] });
      },

      openSection(sectionId, academy, roomId, defaultParams, elementId = null, tab = 'card') {
        const { catalog } = get();
        const sections = { ...get().sections };
        if (!sections[sectionId] && catalog) {
          const tier: Tier = 'comfort';
          sections[sectionId] = { id: sectionId, apartmentId: get().apartmentId, academy, roomId, tier, selection: selectionFromKit(catalog, academy, tier), params: defaultParams(), included: false };
        }
        set({ sections, activeSection: sectionId, panel: 'academy', selectedElement: elementId, academyTab: tab });
      },

      setTier(sectionId, tier) {
        const { sections, catalog } = get();
        const s = sections[sectionId];
        if (!s || !catalog) return;
        set({ sections: { ...sections, [sectionId]: { ...s, tier, selection: selectionFromKit(catalog, s.academy, tier) } } });
      },

      setSlot(sectionId, slot, productId) {
        const { sections, catalog } = get();
        const s = sections[sectionId];
        if (!s || !catalog) return;
        const prev = s.selection[slot];
        const work = prev?.workId ?? catalog.kits.find((k) => k.academy === s.academy && k.slot === slot)?.workId ?? null;
        set({ sections: { ...sections, [sectionId]: { ...s, selection: { ...s.selection, [slot]: { productId, workId: work } } } } });
      },

      setParams(sectionId, params) {
        const { sections } = get();
        const s = sections[sectionId];
        if (s) set({ sections: { ...sections, [sectionId]: { ...s, params } } });
      },

      setIncluded(sectionId, v) {
        const { sections } = get();
        const s = sections[sectionId];
        if (s) set({ sections: { ...sections, [sectionId]: { ...s, included: v } } });
      },

      setOverride: (o) => set({ overrides: { ...get().overrides, [o.productId]: o } }),
      clearOverride(productId) {
        const o = { ...get().overrides };
        delete o[productId];
        set({ overrides: o });
      },
      addOrder: (o) => set({ orders: [o, ...get().orders] }),
      advanceOrder(id, to) {
        const o = get().orders.find((x) => x.id === id)!;
        const next = advance(o, to, get().role);
        set({ orders: get().orders.map((x) => (x.id === id ? next : x)) });
        return next;
      },
    }),
    {
      name: 'home-academy-state-v1',
      partialize: (s) => ({ role: s.role, proMode: s.proMode, sections: s.sections, overrides: s.overrides, orders: s.orders, apartmentId: s.apartmentId }),
    },
  ),
);

export const SYSTEM_META: Record<UtilitySystem, { label: string; color: string }> = {
  electric: { label: 'Электрика', color: '#f5b400' },
  water: { label: 'Водоснабжение', color: '#1e88e5' },
  sewer: { label: 'Канализация', color: '#8d6e63' },
  heating: { label: 'Отопление', color: '#e53935' },
  ventilation: { label: 'Вентиляция', color: '#78909c' },
  ac: { label: 'Кондиционирование', color: '#00acc1' },
  smarthome: { label: 'Умный дом', color: '#8e44ff' },
};
