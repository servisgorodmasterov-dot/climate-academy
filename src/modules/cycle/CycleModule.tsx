import { useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../../core/store';
import { Quiz } from '../quiz/Quiz';
import {
  COMP_POLY,
  LOOP_LEN,
  LOOP_POLYS,
  STAGES,
  locate,
  pointAt,
  refColor,
  state,
  type Mode,
  type PieceId,
} from './cycleModel';

const NL = 90; // частиц в основной петле
const NC = 12; // частиц в компрессорном участке

const PHASE_R = { gas: 3.6, mix: 3, liq: 2.4 };
const PHASE_OP = { gas: 0.55, mix: 0.85, liq: 1 };

/** Отрезки трубы, раскрашенные по температуре (градиент вдоль трубы). */
function useChunks(mode: Mode) {
  return useMemo(() => {
    const out: { id: PieceId; x1: number; y1: number; x2: number; y2: number; c: string }[] = [];
    const step = 10;
    for (const piece of [...LOOP_POLYS, { id: 'comp' as PieceId, p: COMP_POLY }]) {
      const n = Math.max(1, Math.ceil(piece.p.len / step));
      for (let i = 0; i < n; i++) {
        const a = pointAt(piece.p, (i / n) * piece.p.len);
        const b = pointAt(piece.p, ((i + 1) / n) * piece.p.len);
        const { T } = state(mode, piece.id, (i + 0.5) / n);
        out.push({ id: piece.id, x1: a[0], y1: a[1], x2: b[0], y2: b[1], c: refColor(T) });
      }
    }
    return out;
  }, [mode]);
}

export function CycleModule() {
  const audience = useApp((s) => s.audience);
  const reduced = useApp((s) => s.reducedMotion);
  const markVisited = useApp((s) => s.markVisited);
  useEffect(() => markVisited('cycle'), []);

  const [mode, setMode] = useState<Mode>('cool');
  const [playing, setPlaying] = useState(!reduced);
  const [speed, setSpeed] = useState(reduced ? 0.3 : 1);
  const [stage, setStage] = useState<number | null>(null);
  const [auto, setAuto] = useState(false);
  const [showP, setShowP] = useState(audience === 'installer');
  useEffect(() => setShowP(audience === 'installer'), [audience]);

  const loopRefs = useRef<(SVGCircleElement | null)[]>([]);
  const compRefs = useRef<(SVGCircleElement | null)[]>([]);
  const t = useRef(0);
  const live = useRef<{ playing: boolean; speed: number; mode: Mode; pieces: PieceId[] | null }>({ playing, speed, mode, pieces: null });
  live.current = { playing, speed, mode, pieces: stage !== null ? STAGES[mode][stage].pieces : null };

  // Анимация частиц хладагента
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const draw = () => {
      const m = live.current.mode;
      for (let i = 0; i < NL; i++) {
        const el = loopRefs.current[i];
        if (!el) continue;
        let s = ((i / NL) * LOOP_LEN + t.current * 70) % LOOP_LEN;
        if (m === 'heat') s = LOOP_LEN - s; // обратное направление по петле
        const loc = locate(s);
        const [x, y] = pointAt(loc.p, loc.local);
        const st = state(m, loc.id, loc.u);
        el.setAttribute('cx', x.toFixed(1));
        el.setAttribute('cy', y.toFixed(1));
        el.setAttribute('r', String(PHASE_R[st.ph]));
        el.setAttribute('fill', refColor(st.T));
        const dim = live.current.pieces && !live.current.pieces.includes(loc.id);
        el.setAttribute('fill-opacity', String(dim ? 0.15 : PHASE_OP[st.ph]));
        el.setAttribute('stroke-opacity', dim ? '0.1' : '0.8');
      }
      for (let i = 0; i < NC; i++) {
        const el = compRefs.current[i];
        if (!el) continue;
        const s = ((i / NC) * COMP_POLY.len + t.current * 70) % COMP_POLY.len;
        const [x, y] = pointAt(COMP_POLY, s);
        const st = state(m, 'comp', s / COMP_POLY.len);
        el.setAttribute('cx', x.toFixed(1));
        el.setAttribute('cy', y.toFixed(1));
        el.setAttribute('fill', refColor(st.T));
        const dimC = live.current.pieces && !live.current.pieces.includes('comp');
        el.setAttribute('fill-opacity', dimC ? '0.15' : '1');
        el.setAttribute('stroke-opacity', dimC ? '0.1' : '0.8');
      }
    };
    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (live.current.playing) t.current += dt * live.current.speed;
      draw();
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  // Автопоказ этапов
  useEffect(() => {
    if (!auto) return;
    if (stage === null) setStage(0);
    const id = setInterval(() => setStage((s) => ((s ?? -1) + 1) % 5), 6000);
    return () => clearInterval(id);
  }, [auto]);

  const stages = STAGES[mode];
  const cur = stage !== null ? stages[stage] : null;
  const chunks = useChunks(mode);
  const active = (id: PieceId | 'valve') => !cur || cur.pieces.includes(id as PieceId) || (id === 'valve' && (cur.n === 5 || cur.n === 1));
  const cool = mode === 'cool';

  const go = (d: number) => {
    setAuto(false);
    setStage((s) => (s === null ? 0 : (s + d + 5) % 5));
  };

  return (
    <main className="page">
      <div className="page-head">
        <div>
          <div className="eyebrow">03 · Холодильный цикл</div>
          <h1 style={{ marginTop: 6 }}>Как хладагент переносит тепло</h1>
          <p className="lead">
            Хладагент циркулирует по замкнутому контуру и непрерывно меняет давление и агрегатное состояние. Забирает тепло там, где кипит, и отдаёт там, где конденсируется.
          </p>
        </div>
        <div className="seg cool" role="group" aria-label="Режим">
          <button className="c" aria-pressed={cool} onClick={() => setMode('cool')}>Охлаждение</button>
          <button className="h" aria-pressed={!cool} onClick={() => setMode('heat')}>Обогрев</button>
        </div>
      </div>

      <div className="stage">
        <div className="viewport" style={{ height: 'auto', minHeight: 0, padding: 12 }}>
          <div className="svgwrap">
            <svg viewBox="0 0 1100 600" role="img" aria-label="Схема холодильного цикла">
              {/* зоны */}
              <rect x="20" y="20" width="430" height="560" rx="12" fill="var(--navy-850)" opacity="0.6" />
              <rect x="480" y="20" width="600" height="560" rx="12" fill="var(--navy-850)" opacity="0.35" />
              <text x="36" y="44" fill="var(--fg-3)" fontSize="13" fontFamily="var(--f-mono)" letterSpacing="2">ПОМЕЩЕНИЕ</text>
              <text x="1064" y="44" fill="var(--fg-3)" fontSize="13" fontFamily="var(--f-mono)" letterSpacing="2" textAnchor="end">УЛИЦА</text>
              <rect x="455" y="20" width="20" height="560" fill="var(--line)" opacity="0.5" />

              {/* корпуса блоков */}
              <rect x="70" y="80" width="350" height="180" rx="14" fill="none" stroke="var(--fg-3)" strokeDasharray="5 5" />
              <text x="70" y="345" fill="var(--fg-2)" fontSize="13">
                Внутренний блок — <tspan fill={cool ? 'var(--sky)' : 'var(--heat)'}>{cool ? 'испаритель' : 'конденсатор'}</tspan>
              </text>
              <rect x="630" y="70" width="430" height="470" rx="14" fill="none" stroke="var(--fg-3)" strokeDasharray="5 5" />
              <text x="640" y="560" fill="var(--fg-2)" fontSize="13">
                Наружный блок — теплообменник = <tspan fill={cool ? 'var(--heat)' : 'var(--sky)'}>{cool ? 'конденсатор' : 'испаритель'}</tspan>
              </text>

              {/* воздух через теплообменники */}
              {[150, 245, 340].map((x) => (
                <g key={x} opacity={!cur || cur.pieces.includes('in_coil') ? 1 : 0.3}>
                  <line className="flow" x1={x} y1="82" x2={x} y2="290" stroke={cool ? '#7fd3ff' : '#ffb07a'} strokeWidth="3" />
                  <path d={`M ${x - 6} 284 L ${x} 296 L ${x + 6} 284`} fill={cool ? '#7fd3ff' : '#ffb07a'} />
                </g>
              ))}
              <text x="245" y="72" fill="var(--fg-2)" fontSize="12" textAnchor="middle" fontFamily="var(--f-mono)">
                воздух комнаты {cool ? '26' : '20'} °C
              </text>
              <text x="245" y="316" fill={cool ? 'var(--sky-2)' : 'var(--heat-2)'} fontSize="13" textAnchor="middle" fontFamily="var(--f-mono)" fontWeight="600">
                в комнату {cool ? '13' : '40'} °C
              </text>
              {[170, 270, 370].map((y) => (
                <g key={y} opacity={!cur || cur.pieces.includes('out_coil') ? 1 : 0.3}>
                  <line className="flow" x1="1050" y1={y} x2="852" y2={y} stroke={cool ? '#ffb07a' : '#7fd3ff'} strokeWidth="3" />
                  <path d={`M 858 ${y - 6} L 846 ${y} L 858 ${y + 6}`} fill={cool ? '#ffb07a' : '#7fd3ff'} />
                </g>
              ))}
              <text x="1050" y="96" fill="var(--fg-2)" fontSize="12" textAnchor="end" fontFamily="var(--f-mono)">улица {cool ? '33' : '0'} °C →</text>
              <text x="860" y="455" fill={cool ? 'var(--heat-2)' : 'var(--sky-2)'} fontSize="12" textAnchor="end" fontFamily="var(--f-mono)" fontWeight="600">
                выброс {cool ? '44' : '−4'} °C
              </text>

              {/* трубы, окрашенные по температуре */}
              <g strokeLinecap="round">
                {chunks.map((c, i) => (
                  <line key={i} x1={c.x1} y1={c.y1} x2={c.x2} y2={c.y2} stroke={c.c} strokeWidth={c.id === 'gas_line' || c.id === 'out_gas' ? 9 : c.id === 'liquid_line' ? 5 : 6} opacity={active(c.id) ? 0.55 : 0.14} />
                ))}
              </g>

              {/* частицы хладагента */}
              <g>
                {Array.from({ length: NL }).map((_, i) => (
                  <circle key={i} ref={(el) => (loopRefs.current[i] = el)} r="3" stroke="#ffffff" strokeOpacity="0.8" strokeWidth="1" />
                ))}
                {Array.from({ length: NC }).map((_, i) => (
                  <circle key={'c' + i} ref={(el) => (compRefs.current[i] = el)} r="3.6" stroke="#ffffff" strokeOpacity="0.8" strokeWidth="1" />
                ))}
              </g>

              {/* компрессор */}
              <g opacity={active('comp') ? 1 : 0.35}>
                <circle cx="700" cy="445" r="46" fill="var(--navy-800)" stroke="var(--fg-2)" strokeWidth="3" />
                <g style={{ transformOrigin: '700px 445px' }}>
                  <circle cx="700" cy="445" r="22" fill="none" stroke="var(--sky)" strokeWidth="3" strokeDasharray="10 6">
                    {!reduced && playing && <animateTransform attributeName="transform" type="rotate" from="0 700 445" to="360 700 445" dur={`${1.2 / Math.max(speed, 0.1)}s`} repeatCount="indefinite" />}
                  </circle>
                </g>
                <text x="644" y="450" fill="var(--fg)" fontSize="13" textAnchor="end" fontWeight="600">Компрессор</text>
              </g>

              {/* четырёхходовой клапан */}
              <g opacity={active('valve') ? 1 : 0.35}>
                <rect x="650" y="282" width="100" height="38" rx="6" fill="var(--navy-900)" stroke="var(--fg-2)" strokeWidth="2" />
                {cool ? (
                  <>
                    <path d="M 680 320 C 690 300, 720 300, 740 300" stroke={refColor(76)} strokeWidth="4" fill="none" />
                    <path d="M 660 300 C 680 300, 710 300, 720 320" stroke={refColor(14)} strokeWidth="4" fill="none" />
                  </>
                ) : (
                  <>
                    <path d="M 680 320 C 680 305, 670 300, 660 300" stroke={refColor(72)} strokeWidth="4" fill="none" />
                    <path d="M 740 300 C 730 300, 720 305, 720 320" stroke={refColor(0)} strokeWidth="4" fill="none" />
                  </>
                )}
                <text x="700" y="274" fill="var(--fg-2)" fontSize="12" textAnchor="middle">4-ходовой клапан</text>
              </g>

              {/* ЭРВ */}
              <g opacity={active('eev') ? 1 : 0.35}>
                <path d="M 782 488 L 810 512 L 810 488 L 782 512 Z" fill="var(--navy-900)" stroke="var(--fg)" strokeWidth="2" />
                <text x="796" y="534" fill="var(--fg)" fontSize="12" textAnchor="middle" fontWeight="600">ЭРВ</text>
              </g>

              {/* подписи труб */}
              <text x="520" y="40" fill="var(--fg-3)" fontSize="11">газовая линия (толстая)</text>
              <text x="480" y="522" fill="var(--fg-3)" fontSize="11">жидкостная линия (тонкая)</text>

              {/* давления */}
              {showP && (
                <g fontFamily="var(--f-mono)" fontSize="11.5">
                  <rect x="860" y="470" width="190" height="56" rx="6" fill="var(--navy-950)" stroke="var(--line)" />
                  <text x="870" y="490" fill="var(--heat-2)">высокое ≈ {cool ? '28' : '26'} бар · {cool ? '45' : '42'} °C</text>
                  <text x="870" y="508" fill="var(--sky-2)">низкое ≈ {cool ? '9,5' : '6'} бар · {cool ? '+6' : '−7'} °C</text>
                  <text x="870" y="521" fill="var(--fg-3)" fontSize="9.5">R32, абс., ориентировочно</text>
                </g>
              )}

              {/* поток тепла */}
              <g>
                <line className="flow" x1={cool ? 140 : 980} y1="580" x2={cool ? 960 : 160} y2="580" stroke="var(--heat)" strokeWidth="5" />
                <path d={cool ? 'M 960 570 L 980 580 L 960 590 Z' : 'M 160 570 L 140 580 L 160 590 Z'} fill="var(--heat)" />
                <rect x="440" y="566" width="220" height="28" rx="14" fill="var(--navy-950)" />
                <text x="550" y="585" fill="var(--heat-2)" fontSize="13" textAnchor="middle" fontWeight="600">
                  {cool ? 'тепло из комнаты → на улицу' : 'тепло с улицы → в комнату'}
                </text>
              </g>
            </svg>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', padding: '10px 4px 2px' }}>
            <button className="btn sky" onClick={() => setPlaying(!playing)}>{playing ? 'Пауза' : 'Пуск'}</button>
            <button className="btn" onClick={() => go(-1)} aria-label="Предыдущий этап">← Этап</button>
            <button className="btn" onClick={() => go(1)} aria-label="Следующий этап">Этап →</button>
            <button className="btn" aria-pressed={auto} onClick={() => setAuto(!auto)} style={auto ? { borderColor: 'var(--sky)' } : undefined}>
              {auto ? 'Остановить показ' : 'Показ по этапам'}
            </button>
            <div className="field" style={{ minWidth: 180, flex: '1 1 180px' }}>
              <div className="lbl">Скорость <output>×{speed.toFixed(1)}</output></div>
              <input id="cyc-speed" type="range" min={0.1} max={2} step={0.1} value={speed} onChange={(e) => setSpeed(+e.target.value)} />
            </div>
            <Legend />
          </div>
        </div>

        <aside className="panel">
          <div className="section">
            <div className="eyebrow">Этапы · {cool ? 'охлаждение' : 'обогрев'}</div>
            <div style={{ display: 'grid', gap: 6 }}>
              {stages.map((s, i) => (
                <button
                  key={s.n}
                  className="chip"
                  aria-pressed={stage === i}
                  onClick={() => (setAuto(false), setStage(stage === i ? null : i))}
                  style={{ textAlign: 'left', display: 'flex', gap: 10 }}
                >
                  <span className="mono" style={{ color: 'var(--sky)' }}>{s.n}</span>
                  {s.title}
                </button>
              ))}
            </div>
          </div>
          <hr />
          {cur ? (
            <div className="section" aria-live="polite">
              <h2>{cur.n}. {cur.title}</h2>
              <p>{cur.text}</p>
              {audience === 'installer' && <p className="note heat">{cur.pro}</p>}
            </div>
          ) : (
            <div className="section">
              <h2>Главное</h2>
              <p>Тепло само переходит только от тёплого к холодному. Поэтому хладагент делают <b>холоднее</b> воздуха там, где тепло надо забрать, и <b>горячее</b> — там, где его надо отдать. Это достигается изменением давления.</p>
              <p className="muted">Выберите этап или нажмите «Показ по этапам».</p>
            </div>
          )}
          <hr />
          <div className="section">
            <div className="eyebrow">Энергобаланс (пример)</div>
            <div className="readout">
              {cool ? (
                <>
                  <div><b style={{ color: 'var(--sky)' }}>3,5</b><span>кВт забрано из комнаты</span></div>
                  <div><b>1,1</b><span>кВт работа компрессора</span></div>
                  <div><b style={{ color: 'var(--heat)' }}>4,6</b><span>кВт отдано улице</span></div>
                </>
              ) : (
                <>
                  <div><b style={{ color: 'var(--sky)' }}>2,9</b><span>кВт взято с улицы</span></div>
                  <div><b>1,1</b><span>кВт работа компрессора</span></div>
                  <div><b style={{ color: 'var(--heat)' }}>4,0</b><span>кВт отдано в комнату</span></div>
                </>
              )}
            </div>
            <p className="dim" style={{ fontSize: 13 }}>
              {cool ? 'EER ≈ 3,5 / 1,1 ≈ 3,2: на 1 кВт электричества переносится около 3 кВт тепла.' : 'COP ≈ 4,0 / 1,1 ≈ 3,6: тепла в комнату приходит больше, чем потрачено электричества, — остальное взято с улицы.'}
            </p>
            <label className="check">
              <input id="cyc-p" type="checkbox" checked={showP} onChange={(e) => setShowP(e.target.checked)} /> Показать давления и температуры
            </label>
          </div>
        </aside>
      </div>
      <Quiz module="cycle" />
    </main>
  );
}

function Legend() {
  return (
    <div className="hint" style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
      <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ width: 80, height: 8, borderRadius: 4, background: `linear-gradient(90deg, ${[-10, 8, 25, 42, 60, 80].map(refColor).join(',')})` }} />
        −10…80 °C
      </span>
      <span>● крупные бледные — газ</span>
      <span>● мелкие яркие — жидкость</span>
    </div>
  );
}
