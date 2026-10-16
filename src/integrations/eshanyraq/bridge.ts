// Мост к E-Shanyraq. Действующая система не изменяется: здесь только контракт и демо-реализация.
// Сопоставление сущностей сделано по открытой схеме E-Shanyraq (passport_records.category, роли, иерархия пространств).
import type { Role } from '../../core/types';
import type { PassportCategory, PassportEntry } from '../../passport/passport';
import { PASSPORT_CATEGORIES } from '../../passport/passport';

export interface LaunchContext {
  source: 'eshanyraq' | 'standalone';
  apartment: string | null; // номер или идентификатор квартиры
  ticket: string | null; // одноразовый билет единого входа (проверяется сервером, не браузером)
  role: Role | null;
}

/** Переход из личного кабинета E-Shanyraq: /?source=eshanyraq&apartment=72&ticket=...&role=resident */
export function readLaunchContext(search: string): LaunchContext {
  const q = new URLSearchParams(search);
  const role = q.get('role');
  return {
    source: q.get('source') === 'eshanyraq' ? 'eshanyraq' : 'standalone',
    apartment: q.get('apartment'),
    ticket: q.get('ticket'),
    role: role === 'resident' || role === 'master' || role === 'admin' ? role : null,
  };
}

/** Роли E-Shanyraq → роли академии. dispatcher/manager/developer работают как администратор объекта. */
export function mapEShanyraqRole(role: string): Role {
  if (role === 'resident') return 'resident';
  if (role === 'master') return 'master';
  return 'admin';
}

export function toEShanyraqCategory(c: PassportCategory) {
  return PASSPORT_CATEGORIES.find((x) => x.id === c)?.eshanyraq ?? 'document';
}

/** Запись паспорта в формате, совместимом с passport_records E-Shanyraq (title + details jsonb). */
export function toEShanyraqPassportRecord(e: PassportEntry, eshanyraqApartmentUuid: string) {
  return {
    apartment_id: eshanyraqApartmentUuid,
    category: toEShanyraqCategory(e.category),
    title: e.title,
    details: { source: '3d-home-academy', entryId: e.id, room: e.roomId, zone: e.zone, category: e.category, description: e.description, orderId: e.orderId ?? null, productId: e.productId ?? null, warrantyUntil: e.warrantyUntil ?? null, files: e.files.map((f) => ({ name: f.name, mime: f.mime, size: f.size })) },
  };
}

export interface EShanyraqClient {
  readonly configured: boolean;
  exchangeTicket(ticket: string): Promise<{ userId: string; role: Role; apartmentIds: string[] }>;
  pushPassportRecord(record: ReturnType<typeof toEShanyraqPassportRecord>): Promise<void>;
}

export const notConfiguredClient: EShanyraqClient = {
  configured: false,
  async exchangeTicket() {
    throw new Error('Единый вход E-Shanyraq не настроен');
  },
  async pushPassportRecord() {
    throw new Error('Синхронизация паспорта с E-Shanyraq не настроена');
  },
};
