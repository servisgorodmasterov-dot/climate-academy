// Цифровой паспорт квартиры: Квартира → Помещение → Категория → Запись (+ файлы).
// Прототип хранит данные в IndexedDB браузера. Серверное хранение — через PassportRepository (см. docs/INTEGRATION.md).
import type { Role } from '../core/types';

export const PASSPORT_CATEGORIES = [
  { id: 'repair_photo', label: 'Фото ремонта', eshanyraq: 'document' },
  { id: 'hidden_work', label: 'Фото скрытых работ', eshanyraq: 'hidden_work' },
  { id: 'material', label: 'Материалы', eshanyraq: 'document' },
  { id: 'equipment', label: 'Оборудование', eshanyraq: 'equipment' },
  { id: 'warranty', label: 'Гарантии', eshanyraq: 'document' },
  { id: 'receipt', label: 'Чеки', eshanyraq: 'document' },
  { id: 'act', label: 'Акты', eshanyraq: 'document' },
  { id: 'manual', label: 'Инструкции', eshanyraq: 'document' },
  { id: 'service', label: 'История обслуживания', eshanyraq: 'service' },
] as const;
export type PassportCategory = (typeof PASSPORT_CATEGORIES)[number]['id'];

export interface FileMeta {
  id: string;
  name: string;
  mime: string;
  size: number;
}

export interface PassportEntry {
  id: string;
  apartmentId: string;
  roomId: string; // 'apartment' — вся квартира
  category: PassportCategory;
  zone: string; // участок: «стена у окна», «пол у ванны» — без точных координат
  title: string;
  description: string;
  files: FileMeta[];
  authorRole: Role;
  createdAt: string;
  orderId?: string;
  productId?: string;
  warrantyUntil?: string;
  /** Задел на будущее: привязка к стене и измерениям */
  anchor?: { wallId?: string; offsetM?: number; heightM?: number };
}

export const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
export const MAX_FILE_BYTES = 15 * 1024 * 1024;

export function validateFile(f: { type: string; size: number; name: string }): string | null {
  if (!ALLOWED_MIME.includes(f.type)) return `«${f.name}»: допустимы JPG, PNG, WEBP и PDF`;
  if (f.size > MAX_FILE_BYTES) return `«${f.name}»: файл больше 15 МБ`;
  return null;
}

// ---------- Права доступа ----------
export const permissions = {
  canView(role: Role, e: Pick<PassportEntry, 'category'>) {
    // Мастер не видит финансовые документы жильца
    return !(role === 'master' && e.category === 'receipt');
  },
  canCreate(role: Role, category: PassportCategory) {
    if (role === 'master') return category !== 'receipt';
    return true;
  },
  canDelete(role: Role, e: Pick<PassportEntry, 'authorRole' | 'category'>) {
    if (role === 'admin') return true;
    // Фото скрытых работ мастера — доказательная база, жилец удалить не может
    if (e.category === 'hidden_work' && e.authorRole === 'master') return false;
    return e.authorRole === role;
  },
};

// ---------- Хранилище (IndexedDB) ----------
const DB = 'home-academy-passport';
const VERSION = 1;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('entries')) db.createObjectStore('entries', { keyPath: 'id' }).createIndex('apartmentId', 'apartmentId');
      if (!db.objectStoreNames.contains('files')) db.createObjectStore('files');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(stores: string[], mode: IDBTransactionMode, fn: (t: IDBTransaction) => IDBRequest<T> | void): Promise<T | undefined> {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const t = db.transaction(stores, mode);
        const r = fn(t);
        let result: T | undefined;
        if (r) r.onsuccess = () => (result = r.result);
        t.oncomplete = () => {
          db.close();
          resolve(result);
        };
        t.onerror = () => reject(t.error);
        t.onabort = () => reject(t.error);
      }),
  );
}

export const uid = () => (globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`);

export interface PassportRepository {
  list(apartmentId: string): Promise<PassportEntry[]>;
  add(entry: Omit<PassportEntry, 'id' | 'createdAt' | 'files'>, files: { blob: Blob; name: string }[]): Promise<PassportEntry>;
  remove(id: string): Promise<void>;
  file(id: string): Promise<Blob | undefined>;
}

export const localPassport: PassportRepository = {
  async list(apartmentId) {
    const all = (await tx<PassportEntry[]>(['entries'], 'readonly', (t) => t.objectStore('entries').index('apartmentId').getAll(apartmentId))) ?? [];
    return all.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },
  async add(entry, files) {
    const metas: FileMeta[] = [];
    const blobs: [string, Blob][] = [];
    for (const f of files) {
      const id = uid();
      metas.push({ id, name: f.name, mime: f.blob.type, size: f.blob.size });
      blobs.push([id, f.blob]);
    }
    const full: PassportEntry = { ...entry, id: uid(), createdAt: new Date().toISOString(), files: metas };
    await tx(['entries', 'files'], 'readwrite', (t) => {
      t.objectStore('entries').put(full);
      for (const [id, b] of blobs) t.objectStore('files').put(b, id);
    });
    return full;
  },
  async remove(id) {
    const e = await tx<PassportEntry>(['entries'], 'readonly', (t) => t.objectStore('entries').get(id));
    await tx(['entries', 'files'], 'readwrite', (t) => {
      t.objectStore('entries').delete(id);
      for (const f of e?.files ?? []) t.objectStore('files').delete(f.id);
    });
  },
  async file(id) {
    return tx<Blob>(['files'], 'readonly', (t) => t.objectStore('files').get(id));
  },
};

/** Сжатие фото перед сохранением (экономия места на телефоне). PDF и мелкие файлы не трогаем. */
export async function compressImage(file: File, maxSide = 1920, quality = 0.85): Promise<Blob> {
  if (!file.type.startsWith('image/') || file.size < 400 * 1024 || typeof createImageBitmap === 'undefined') return file;
  try {
    const bmp = await createImageBitmap(file);
    const k = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bmp.width * k);
    canvas.height = Math.round(bmp.height * k);
    canvas.getContext('2d')!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', quality));
    return blob && blob.size < file.size ? blob : file;
  } catch {
    return file;
  }
}
