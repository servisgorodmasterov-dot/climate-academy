import { lazy, Suspense, useEffect, type ComponentType } from 'react';
import { MODULES, type ModuleId } from './core/modules';
import { useApp } from './core/store';
import { Shell } from './ui/Shell';

// Каждый раздел грузится отдельно — новые модули подключаются одной строкой.
const ROUTES: Record<ModuleId, ComponentType> = {
  home: lazy(() => import('./modules/home/HomeModule').then((m) => ({ default: m.HomeModule }))),
  device: lazy(() => import('./modules/device/DeviceModule').then((m) => ({ default: m.DeviceModule }))),
  cycle: lazy(() => import('./modules/cycle/CycleModule').then((m) => ({ default: m.CycleModule }))),
  calculator: lazy(() => import('./modules/calculator/CalculatorModule').then((m) => ({ default: m.CalculatorModule }))),
  roadmap: lazy(() => import('./modules/roadmap/RoadmapModule').then((m) => ({ default: m.RoadmapModule }))),
};

export function App() {
  const route = useApp((s) => s.route);
  // Переход по ссылке с якорем (#cycle и т. п.) и кнопка «Назад» браузера.
  useEffect(() => {
    const onHash = () => {
      const id = location.hash.replace('#', '') as ModuleId;
      if (MODULES.some((m) => m.id === id) && id !== useApp.getState().route) useApp.setState({ route: id });
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  const Page = ROUTES[route];
  return (
    <Shell>
      <Suspense fallback={<main className="page"><p className="dim">Загрузка раздела…</p></main>}>
        <Page key={route} />
      </Suspense>
    </Shell>
  );
}
