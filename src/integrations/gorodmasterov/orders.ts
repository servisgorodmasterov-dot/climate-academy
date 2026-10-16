// Заказ услуг «Города мастеров». Прототип: демонстрационный процесс без платежей и без передачи данных.
import type { Estimate, EstimateLine, Role } from '../../core/types';
import { uid } from '../../passport/passport';

export type OrderStatus = 'sent' | 'accepted' | 'done' | 'cancelled';
export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  sent: 'Отправлен (демо)',
  accepted: 'Принят мастером',
  done: 'Выполнен',
  cancelled: 'Отменён',
};

export interface Order {
  id: string;
  number: string;
  apartmentId: string;
  createdAt: string;
  status: OrderStatus;
  history: { at: string; status: OrderStatus; by: Role }[];
  sections: string[];
  /** Раздел сметы → помещение (для раскладки по цифровому паспорту) */
  sectionRooms: Record<string, string | null>;
  /** Зафиксированные позиции: цены заказа не меняются при обновлении каталога */
  lines: EstimateLine[];
  totals: Estimate['totals'];
  total: number;
  currency: string;
  priceStatus: Estimate['priceStatus'];
  pricesFrozenAt: string;
  catalogSource: string;
  contact: { name: string; phone: string };
  comment: string;
  gateway: string;
}

export interface OrderGateway {
  readonly id: string;
  readonly isDemo: boolean;
  submit(order: Order): Promise<{ externalId: string | null; message: string }>;
}

/** Демонстрационный шлюз: заказ остаётся в браузере. Реальный шлюз — после согласования API «Города мастеров». */
export const demoGateway: OrderGateway = {
  id: 'gorodmasterov-demo',
  isDemo: true,
  async submit() {
    return { externalId: null, message: 'Демонстрационный заказ сохранён в этом браузере. В «Город мастеров» данные не передавались.' };
  },
};

export function freezeOrder(apartmentId: string, estimate: Estimate, sections: { id: string; label: string }[], catalogSource: string, contact: Order['contact'], comment: string): Order {
  const now = new Date().toISOString();
  return {
    id: uid(),
    number: `ДЕМО-${now.slice(2, 10).replace(/-/g, '')}-${Math.floor(Math.random() * 900 + 100)}`,
    apartmentId,
    createdAt: now,
    status: 'sent',
    history: [{ at: now, status: 'sent', by: 'resident' }],
    sections: sections.map((s) => s.label),
    sectionRooms: Object.fromEntries(sections.map((s) => [s.label, s.id.endsWith(':apartment') ? null : s.id.split(':')[1] ?? null])),
    lines: structuredClone(estimate.lines.filter((l) => l.total != null)),
    totals: { ...estimate.totals },
    total: estimate.total,
    currency: estimate.currency,
    priceStatus: estimate.priceStatus,
    pricesFrozenAt: now,
    catalogSource,
    contact,
    comment,
    gateway: demoGateway.id,
  };
}

/** Допустимые переходы статусов и роли, которые могут их выполнять. */
export const TRANSITIONS: { from: OrderStatus; to: OrderStatus; roles: Role[]; label: string }[] = [
  { from: 'sent', to: 'accepted', roles: ['master', 'admin'], label: 'Принять заказ' },
  { from: 'accepted', to: 'done', roles: ['master', 'admin'], label: 'Отметить выполненным' },
  { from: 'sent', to: 'cancelled', roles: ['resident', 'admin'], label: 'Отменить' },
];

export function nextActions(o: Order, role: Role) {
  return TRANSITIONS.filter((t) => t.from === o.status && t.roles.includes(role));
}

export function advance(o: Order, to: OrderStatus, role: Role): Order {
  const t = TRANSITIONS.find((x) => x.from === o.status && x.to === to && x.roles.includes(role));
  if (!t) throw new Error(`Переход ${o.status} → ${to} недоступен для роли ${role}`);
  const at = new Date().toISOString();
  return { ...o, status: to, history: [...o.history, { at, status: to, by: role }] };
}
