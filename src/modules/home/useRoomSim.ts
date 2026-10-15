import { useEffect, useRef, useState } from 'react';
import { averageT, createSim, sampleAt, stepSim, type AcMode, type SimParams, type SimState } from '../../core/roomSim';

export interface Scenario {
  start: number;
  outdoor: number;
  setpoint: number;
}

export const SCENARIOS: Record<AcMode, Scenario> = {
  cool: { start: 30, outdoor: 33, setpoint: 24 },
  heat: { start: 16, outdoor: -5, setpoint: 22 },
};

export interface Readout {
  avg: number;
  window: number;
  center: number;
  sofa: number;
  ceiling: number;
  supply: number;
  capacity: number;
  minutes: number;
}

/** Запускает модель комнаты. Состояние — в ref (для 3D-кадров), сводка — в React-state раз в 0,25 с. */
export function useRoomSim(params: SimParams, resetKey: string, startT: number) {
  const sim = useRef<SimState>(createSim(startT));
  const paramsRef = useRef(params);
  paramsRef.current = params;
  const [readout, setReadout] = useState<Readout>(() => read(sim.current));

  useEffect(() => {
    sim.current = createSim(startT);
    setReadout(read(sim.current));
  }, [resetKey]);

  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    let acc = 0;
    let uiAcc = 0;
    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      acc += dt * 60; // 1 с = 1 мин модели
      while (acc > 0.1) {
        stepSim(sim.current, paramsRef.current, 0.1);
        acc -= 0.1;
      }
      uiAcc += dt;
      if (uiAcc > 0.25) {
        uiAcc = 0;
        setReadout(read(sim.current));
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  return { sim, readout };
}

function read(s: SimState): Readout {
  const avg = averageT(s);
  return {
    avg,
    window: sampleAt(s, -1.2, -2.1),
    center: sampleAt(s, 0, 0),
    sofa: sampleAt(s, -0.8, 1.6),
    ceiling: avg + s.ceilingDelta,
    supply: s.supply,
    capacity: s.capacity,
    minutes: s.minutes,
  };
}
