import { useMemo } from 'react';
import type { AcademyContext } from '../core/academy';
import type { Catalog, Layout, PriceOverride, Role } from '../core/types';
import { academyById } from '../academies';
import { computeEstimate, type EstimateSection } from './engine';
import { useApp, type SectionState } from '../store';

export function contextFor(s: SectionState, catalog: Catalog, layout: Layout, proMode: boolean, role: Role, elementId: string | null = null): AcademyContext {
  return {
    catalog,
    layout,
    room: s.roomId ? layout.rooms.find((r) => r.id === s.roomId) ?? null : null,
    element: (() => {
      const id = s.params?.elementId ?? elementId;
      return id ? layout.elements.find((e) => e.id === id) ?? null : null;
    })(),
    proMode,
    role,
  };
}

export function buildSection(s: SectionState, catalog: Catalog, layout: Layout): EstimateSection | null {
  const def = academyById(s.academy);
  if (!def) return null;
  const ctx = contextFor(s, catalog, layout, false, 'resident');
  if (def.scope === 'room' && !ctx.room) return null;
  if (def.scope === 'element' && !ctx.element) return null;
  return def.buildSection(ctx, s.tier, s.params, s.selection);
}

export function estimateFor(states: SectionState[], catalog: Catalog, layout: Layout, overrides: Record<string, PriceOverride>) {
  const sections = states.map((s) => buildSection(s, catalog, layout)).filter((x): x is EstimateSection => !!x);
  return { sections, estimate: computeEstimate(catalog, sections, overrides) };
}

/** Общая смета: все разделы, включённые пользователем. */
export function useTotalEstimate() {
  const { catalog, layout, sections, overrides, apartmentId } = useApp();
  return useMemo(() => {
    if (!catalog || !layout) return null;
    const included = Object.values(sections).filter((s) => s.included && s.apartmentId === apartmentId);
    return { included, ...estimateFor(included, catalog, layout, overrides) };
  }, [catalog, layout, sections, overrides, apartmentId]);
}
