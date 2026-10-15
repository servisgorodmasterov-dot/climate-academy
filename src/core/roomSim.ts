/**
 * Учебная модель температурного поля комнаты (план 6 × 5 м, сетка ячеек).
 * Не CFD: упрощённая модель, которая качественно верно показывает
 *  - охлаждение/нагрев зоны, куда направлена струя внутреннего блока;
 *  - теплоприток от окна на солнечной стороне;
 *  - перемешивание воздуха и выход на уставку с плавной модуляцией (инвертор);
 *  - расслоение по высоте: тёплый воздух поднимается под потолок.
 * 1 секунда реального времени ≈ 1 минута модельного.
 */
export type AcMode = 'cool' | 'heat';

export const ROOM = { x0: -3, x1: 3, z0: -2.5, z1: 2.5, h: 2.7 };
export const NX = 12;
export const NZ = 10;
/** Внутренний блок висит на наружной (задней) стене, z = z0. */
export const UNIT_POS = { x: 1.6, y: 2.25, z: ROOM.z0 + 0.15 };
/** Окно на той же наружной стене, левее блока. */
export const WINDOW_POS = { x: -1.2, w: 1.8 };

export interface SimState {
  t: Float32Array; // температура рабочей зоны (≈1,1 м), °C
  ceilingDelta: number; // насколько под потолком теплее рабочей зоны
  supply: number; // температура выходящего воздуха
  capacity: number; // текущая загрузка компрессора 0..1
  minutes: number;
  integ: number; // интегральная часть регулятора
}

export interface SimParams {
  on: boolean;
  mode: AcMode;
  setpoint: number;
  outdoor: number;
  sunny: boolean;
}

export function createSim(start: number): SimState {
  const t = new Float32Array(NX * NZ).fill(start);
  return { t, ceilingDelta: 1.5, supply: start, capacity: 0, minutes: 0, integ: 0 };
}

export function cellCenter(i: number, k: number) {
  return {
    x: ROOM.x0 + ((i + 0.5) / NX) * (ROOM.x1 - ROOM.x0),
    z: ROOM.z0 + ((k + 0.5) / NZ) * (ROOM.z1 - ROOM.z0),
  };
}

/** Насколько ячейка «попадает» в струю: максимум вдоль оси струи, затухает с расстоянием. */
function jetWeight(x: number, z: number, mode: AcMode) {
  const d = z - ROOM.z0; // расстояние от стены с блоком
  const spread = 0.6 + d * 0.35;
  const lateral = Math.exp(-((x - UNIT_POS.x) ** 2) / (spread * spread));
  // Холодный воздух стелется дальше и опускается; тёплый — направляют вниз, он быстрее поднимается.
  const reach = mode === 'cool' ? 4.2 : 3.0;
  const fall = mode === 'cool' ? Math.min(1, 0.35 + d / 2.2) : Math.min(1, 0.55 + d / 3);
  return lateral * Math.exp(-d / reach) * fall;
}

export function averageT(s: SimState) {
  let a = 0;
  for (let i = 0; i < s.t.length; i++) a += s.t[i];
  return a / s.t.length;
}

export function stepSim(s: SimState, p: SimParams, dtMin: number) {
  const avg = averageT(s);
  // Регулятор: загрузка зависит от отклонения от уставки (инверторная модуляция).
  const err = p.mode === 'cool' ? avg - p.setpoint : p.setpoint - avg;
  if (p.on) s.integ = Math.max(-0.3, Math.min(0.6, s.integ + err * dtMin * 0.03));
  else s.integ = 0;
  const target = p.on ? Math.max(0.12, Math.min(1, 0.2 + err * 0.35 + s.integ)) : 0;
  s.capacity += (target - s.capacity) * Math.min(1, dtMin * 0.6);
  if (p.on && err < -0.6) s.capacity = Math.max(0, s.capacity - dtMin * 0.5);

  const dtSupply = p.mode === 'cool' ? -12 : 20; // ΔT воздуха на теплообменнике при полной загрузке
  s.supply = avg + dtSupply * s.capacity;

  const next = new Float32Array(s.t.length);
  for (let k = 0; k < NZ; k++) {
    for (let i = 0; i < NX; i++) {
      const idx = k * NX + i;
      const { x, z } = cellCenter(i, k);
      const T = s.t[idx];
      // Теплоприток снаружи (через стену, окно, солнце) — сильнее у наружной стены и окна.
      const nearWall = Math.exp(-(z - ROOM.z0) / 1.2);
      const nearWindow = Math.exp(-((x - WINDOW_POS.x) ** 2) / 1.2) * nearWall;
      const gainTarget = p.outdoor + (p.sunny && p.mode === 'cool' ? 10 * nearWindow : 0);
      let dT = (gainTarget - T) * (0.004 + 0.015 * nearWall + 0.012 * nearWindow);
      // Внутренние источники: люди и техника в зоне дивана (+ немного тепла).
      if (x < 0 && z > 0.6) dT += 0.02;
      // Струя внутреннего блока.
      if (p.on) dT += (s.supply - T) * jetWeight(x, z, p.mode) * 0.35 * s.capacity;
      // Перемешивание с соседями.
      let nb = 0;
      let n = 0;
      if (i > 0) (nb += s.t[idx - 1]), n++;
      if (i < NX - 1) (nb += s.t[idx + 1]), n++;
      if (k > 0) (nb += s.t[idx - NX]), n++;
      if (k < NZ - 1) (nb += s.t[idx + NX]), n++;
      dT += (nb / n - T) * (p.on ? 0.8 : 0.3);
      next[idx] = T + dT * dtMin;
    }
  }
  s.t = next;
  // Расслоение: при обогреве тёплый воздух уходит под потолок.
  const strat = p.on ? (p.mode === 'heat' ? 3.5 : 1.0) : 1.5;
  s.ceilingDelta += (strat - s.ceilingDelta) * Math.min(1, dtMin * 0.2);
  s.minutes += dtMin;
}

export function sampleAt(s: SimState, x: number, z: number) {
  const i = Math.max(0, Math.min(NX - 1, Math.floor(((x - ROOM.x0) / (ROOM.x1 - ROOM.x0)) * NX)));
  const k = Math.max(0, Math.min(NZ - 1, Math.floor(((z - ROOM.z0) / (ROOM.z1 - ROOM.z0)) * NZ)));
  return s.t[k * NX + i];
}

/** Цвет температуры: синий (холодно) → голубой → нейтральный → оранжевый → красный. */
export function tempColor(T: number): [number, number, number] {
  const stops: [number, [number, number, number]][] = [
    [12, [0.12, 0.35, 0.95]],
    [18, [0.25, 0.7, 1.0]],
    [23, [0.75, 0.88, 0.95]],
    [27, [1.0, 0.72, 0.3]],
    [33, [1.0, 0.36, 0.18]],
    [45, [0.9, 0.12, 0.12]],
  ];
  if (T <= stops[0][0]) return stops[0][1];
  for (let j = 1; j < stops.length; j++) {
    if (T <= stops[j][0]) {
      const [t0, c0] = stops[j - 1];
      const [t1, c1] = stops[j];
      const u = (T - t0) / (t1 - t0);
      return [c0[0] + (c1[0] - c0[0]) * u, c0[1] + (c1[1] - c0[1]) * u, c0[2] + (c1[2] - c0[2]) * u];
    }
  }
  return stops[stops.length - 1][1];
}

export function cssTemp(T: number) {
  const [r, g, b] = tempColor(T);
  return `rgb(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)})`;
}
