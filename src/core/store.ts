import { create } from 'zustand';
import type { ModuleId } from './modules';

/** Режим аудитории: покупатель — простые объяснения; монтажник — технические детали. */
export type Audience = 'buyer' | 'installer';
export type Quality = 'high' | 'low';

export interface ModuleProgress {
  visited: boolean;
  quizBest: number; // лучший результат, доля 0..1
  quizDone: boolean; // тест пройден (>= 70%)
}

interface PersistedState {
  audience: Audience;
  quality: Quality;
  reducedMotion: boolean;
  force2D: boolean;
  progress: Partial<Record<ModuleId, ModuleProgress>>;
}

interface AppState extends PersistedState {
  route: ModuleId;
  go: (id: ModuleId) => void;
  setAudience: (a: Audience) => void;
  setQuality: (q: Quality) => void;
  setReducedMotion: (v: boolean) => void;
  setForce2D: (v: boolean) => void;
  markVisited: (id: ModuleId) => void;
  saveQuiz: (id: ModuleId, score: number) => void;
  resetProgress: () => void;
}

const KEY = 'climate-academy:v1';

function load(): Partial<PersistedState> {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Partial<PersistedState>) : {};
  } catch {
    return {};
  }
}

function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

function webglAvailable(): boolean {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

/** Слабое устройство: мало ядер или мобильный экран — по умолчанию упрощённая графика. */
function guessQuality(): Quality {
  const cores = navigator.hardwareConcurrency || 4;
  const small = Math.min(window.innerWidth, window.innerHeight) < 500;
  return cores <= 4 || small ? 'low' : 'high';
}

const saved = load();
export const HAS_WEBGL = webglAvailable();

function initialRoute(): ModuleId {
  const h = location.hash.replace('#', '');
  const ids: ModuleId[] = ['home', 'device', 'cycle', 'calculator', 'roadmap'];
  return (ids as string[]).includes(h) ? (h as ModuleId) : 'home';
}

export const useApp = create<AppState>((set, get) => {
  const persist = () => {
    const s = get();
    const data: PersistedState = {
      audience: s.audience,
      quality: s.quality,
      reducedMotion: s.reducedMotion,
      force2D: s.force2D,
      progress: s.progress,
    };
    try {
      localStorage.setItem(KEY, JSON.stringify(data));
    } catch {
      /* хранилище недоступно — работаем без сохранения */
    }
  };
  return {
    audience: saved.audience ?? 'buyer',
    quality: saved.quality ?? guessQuality(),
    reducedMotion: saved.reducedMotion ?? prefersReducedMotion(),
    force2D: saved.force2D ?? !HAS_WEBGL,
    progress: saved.progress ?? {},
    route: initialRoute(),
    go: (id) => {
      set({ route: id });
      try {
        if (location.hash !== '#' + id) history.pushState(null, '', '#' + id);
      } catch {
        /* ignore */
      }
      window.scrollTo({ top: 0 });
    },
    setAudience: (audience) => (set({ audience }), persist()),
    setQuality: (quality) => (set({ quality }), persist()),
    setReducedMotion: (reducedMotion) => (set({ reducedMotion }), persist()),
    setForce2D: (force2D) => (set({ force2D: force2D || !HAS_WEBGL }), persist()),
    markVisited: (id) => {
      const p = get().progress[id];
      if (p?.visited) return;
      set({ progress: { ...get().progress, [id]: { visited: true, quizBest: p?.quizBest ?? 0, quizDone: p?.quizDone ?? false } } });
      persist();
    },
    saveQuiz: (id, score) => {
      const p = get().progress[id] ?? { visited: true, quizBest: 0, quizDone: false };
      const best = Math.max(p.quizBest, score);
      set({ progress: { ...get().progress, [id]: { visited: true, quizBest: best, quizDone: best >= 0.7 } } });
      persist();
    },
    resetProgress: () => (set({ progress: {} }), persist()),
  };
});

/** Можно ли рисовать 3D прямо сейчас. */
export function use3D(): boolean {
  return useApp((s) => !s.force2D) && HAS_WEBGL;
}
