import { useEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import { use3D, useApp } from '../../core/store';
import { PARTS, type PartId, type RunState } from '../../three/splitParts';
import { Quiz } from '../quiz/Quiz';
import { CompressorAnim } from './CompressorAnim';
import { Device2D } from './Device2D';
import { DeviceScene } from './DeviceScene';
import { PART_INFO } from './partInfo';

const NAMES = Object.fromEntries(PARTS.map((p) => [p.id, p.name]));

export function DeviceModule() {
  const audience = useApp((s) => s.audience);
  const quality = useApp((s) => s.quality);
  const reduced = useApp((s) => s.reducedMotion);
  const markVisited = useApp((s) => s.markVisited);
  const can3D = use3D();
  useEffect(() => markVisited('device'), []);

  const [unit, setUnit] = useState<'indoor' | 'outdoor'>('indoor');
  const [exploded, setExploded] = useState(false);
  const [running, setRunning] = useState(true);
  const [mode, setMode] = useState<'cool' | 'heat'>('cool');
  const [isolate, setIsolate] = useState(false);
  const [labels, setLabels] = useState(true);
  const [selected, setSelected] = useState<PartId | null>(null);
  const [hovered, setHovered] = useState<PartId | null>(null);
  const explode = useRef(0);
  const run = useRef<RunState>({ running, mode, speed: 1 });

  useEffect(() => {
    run.current = { running, mode, speed: reduced ? 0.3 : selected === 'out-comp' ? 0.6 : selected === 'in-fan' || selected === 'out-fan' ? 1.6 : 1 };
  }, [running, mode, reduced, selected]);

  const setExplodedAnim = (v: boolean) => {
    setExploded(v);
    gsap.to(explode, { current: v ? 1 : 0, duration: reduced ? 0 : 1.4, ease: 'power3.inOut' });
  };

  const switchUnit = (u: 'indoor' | 'outdoor') => {
    setUnit(u);
    setSelected(null);
  };

  const parts = PARTS.filter((p) => p.unit === unit);
  const info = selected ? PART_INFO[selected] : null;

  return (
    <main className="page">
      <div className="page-head">
        <div>
          <div className="eyebrow">02 · Устройство сплит-системы</div>
          <h1 style={{ marginTop: 6 }}>Разберите кондиционер на детали</h1>
          <p className="lead">Выберите блок, нажмите «Разобрать» и изучите каждый узел. Компрессор показан в разрезе, на теплообменниках видно, как меняется температура воздуха.</p>
        </div>
        <div className="seg" role="group" aria-label="Блок">
          <button aria-pressed={unit === 'indoor'} onClick={() => switchUnit('indoor')}>Внутренний блок</button>
          <button aria-pressed={unit === 'outdoor'} onClick={() => switchUnit('outdoor')}>Наружный блок</button>
        </div>
      </div>

      <div className="stage">
        <div className="viewport">
          {can3D ? (
            <DeviceScene unit={unit} explode={explode} exploded={exploded} run={run} mode={mode} selected={selected} hovered={hovered} isolate={isolate} onSelect={setSelected} onHover={setHovered} quality={quality} reduced={reduced} showLabels={labels} />
          ) : (
            <Device2D unit={unit} selected={selected} onSelect={setSelected} names={NAMES} />
          )}
          <div className="vp-overlay">
            <div className="vp-tl">
              {exploded ? (
                <button className="btn primary" onClick={() => setExplodedAnim(false)} disabled={!can3D}>Собрать обратно</button>
              ) : (
                <button className="btn primary" onClick={() => setExplodedAnim(true)} disabled={!can3D}>Разобрать кондиционер</button>
              )}
              <button className="power" aria-pressed={running} onClick={() => setRunning(!running)}>
                <span className="dot" /> {running ? 'Работает' : 'Стоит'}
              </button>
            </div>
            <div className="vp-tr">
              <div className="seg cool">
                <button className="c" aria-pressed={mode === 'cool'} onClick={() => setMode('cool')}>Охлаждение</button>
                <button className="h" aria-pressed={mode === 'heat'} onClick={() => setMode('heat')}>Обогрев</button>
              </div>
            </div>
            <div className="vp-bl" style={{ pointerEvents: 'none' }}>
              <span className="hint">{hovered ? NAMES[hovered] : can3D ? 'вращайте мышью/пальцем · колесо — масштаб · клик — выбрать деталь' : 'нажмите на узел схемы'}</span>
            </div>
          </div>
        </div>

        <aside className="panel">
          {info && selected ? (
            <div className="section" aria-live="polite">
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'start' }}>
                <div>
                  <div className="eyebrow">{unit === 'indoor' ? 'Внутренний блок' : 'Наружный блок'}</div>
                  <h2 style={{ marginTop: 4 }}>{NAMES[selected]}</h2>
                </div>
                <button className="btn small" onClick={() => setSelected(null)}>К списку</button>
              </div>
              <p>{info.role}</p>
              <p className="muted">{info.how}</p>
              {info.demo === 'compressor' && <CompressorAnim paused={reduced || !running} />}
              {(info.demo === 'evap' || info.demo === 'cond') && (
                <p className="note">
                  {info.demo === 'evap'
                    ? mode === 'cool'
                      ? 'На модели: воздух комнаты ~26 °C проходит через рёбра испарителя и выходит ~13 °C. Тепло ушло в кипящий хладагент.'
                      : 'При обогреве этот же теплообменник работает как конденсатор: воздух нагревается до ~40 °C.'
                    : mode === 'cool'
                      ? 'Уличный воздух ~33 °C забирает тепло конденсатора и выходит ~44 °C.'
                      : 'При обогреве наружный теплообменник — испаритель: уличный воздух остывает, отдавая тепло хладагенту.'}
                </p>
              )}
              {audience === 'installer' && <p className="note heat">{info.pro}</p>}
              <div className="section" style={{ gap: 6 }}>
                <span className="eyebrow" style={{ color: 'var(--warn)' }}>Признаки проблем</span>
                <p className="muted" style={{ fontSize: 14 }}>{info.fault}</p>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'start' }}>
                <span className={'tag ' + (info.service === 'user' ? 'user' : 'pro')}>{info.service === 'user' ? 'пользователь' : 'специалист'}</span>
                <p style={{ fontSize: 13 }} className="muted">{info.serviceNote}</p>
              </div>
            </div>
          ) : (
            <div className="section">
              <div className="eyebrow">Узлы · {parts.length}</div>
              <div className="chips">
                {parts.map((p) => (
                  <button key={p.id} className="chip" aria-pressed={selected === p.id} onClick={() => setSelected(p.id)} onMouseEnter={() => setHovered(p.id)} onMouseLeave={() => setHovered(null)}>
                    {p.name}
                  </button>
                ))}
              </div>
              <p className="muted" style={{ fontSize: 14 }}>
                {unit === 'indoor'
                  ? 'Внутренний блок: воздух комнаты входит сверху через фильтры, проходит через испаритель, его подхватывает вентилятор и выдаёт вниз через жалюзи.'
                  : 'Наружный блок: вентилятор протягивает уличный воздух через конденсатор сзади и сбоку. В правом отсеке — компрессор, клапаны и электроника.'}
              </p>
            </div>
          )}
          <hr />
          <div className="section">
            <label className="check">
              <input id="dev-iso" type="checkbox" checked={isolate} onChange={(e) => setIsolate(e.target.checked)} /> Скрыть остальные детали
            </label>
            <label className="check">
              <input id="dev-lbl" type="checkbox" checked={labels} onChange={(e) => setLabels(e.target.checked)} /> Подписи деталей
            </label>
          </div>
          <p className="dim" style={{ fontSize: 12 }}>Модель обобщённая: компоновка конкретных моделей отличается. Обслуживание — только по инструкции производителя.</p>
        </aside>
      </div>
      <Quiz module="device" />
    </main>
  );
}
