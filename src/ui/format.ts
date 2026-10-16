import { UNITS, type Unit } from '../core/types';

export const money = (n: number | null | undefined, cur = 'KZT') =>
  n == null ? '—' : `${Math.round(n).toLocaleString('ru-RU')} ${cur === 'KZT' ? '₸' : cur}`;

export const unitLabel = (u: Unit | 'trip') => (u === 'trip' ? 'рейс' : UNITS[u]);

export const qty = (n: number) => (Number.isInteger(n) ? String(n) : n.toLocaleString('ru-RU', { maximumFractionDigits: 2 }));

export const date = (iso: string) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('ru-RU');
};

export const dateTime = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' });
};

export function downloadText(name: string, text: string, mime = 'text/plain') {
  const blob = new Blob([text], { type: `${mime};charset=utf-8` });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

/** В демо-просмотре (Artifact) браузер не даёт скачивать файлы — кнопки выгрузки скрываются. */
export const CAN_DOWNLOAD = import.meta.env?.VITE_TARGET !== 'artifact';
