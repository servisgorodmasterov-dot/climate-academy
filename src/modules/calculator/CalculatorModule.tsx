import { useEffect, useMemo, useState } from 'react';
import { use3D, useApp } from '../../core/store';
import {
  APPLIANCES,
  BTU_PER_KW,
  CLASSES,
  DEFAULT_ROOM,
  INSULATION_LABEL,
  ORIENT_LABEL,
  REGION_LABEL,
  SHADING_LABEL,
  computeLoad,
  type ApplianceId,
  type Insulation,
  type Orientation,
  type Region,
  type RoomInput,
  type Shading,
} from '../../core/load';
import { Quiz } from '../quiz/Quiz';
import { RoomViz } from './RoomViz';

const fmt = (n: number, d = 2) => n.toLocaleString('ru-RU', { minimumFractionDigits: d, maximumFractionDigits: d });

export function CalculatorModule() {
  const audience = useApp((s) => s.audience);
  const quality = useApp((s) => s.quality);
  const reduced = useApp((s) => s.reducedMotion);
  const markVisited = useApp((s) => s.markVisited);
  const can3D = use3D();
  useEffect(() => markVisited('calculator'), []);

  const [r, setR] = useState<RoomInput>(DEFAULT_ROOM);
  const set = <K extends keyof RoomInput>(k: K, v: RoomInput[K]) => setR((x) => ({ ...x, [k]: v }));
  const res = useMemo(() => computeLoad(r), [r]);
  const maxItem = Math.max(...res.items.map((i) => i.watts), 1);

  const setAppl = (id: ApplianceId, d: number) => setR((x) => ({ ...x, appliances: { ...x.appliances, [id]: Math.max(0, Math.min(3, x.appliances[id] + d)) } }));

  return (
    <main className="page">
      <div className="page-head">
        <div>
          <div className="eyebrow">04 · Подбор мощности</div>
          <h1 style={{ marginTop: 6 }}>Из чего складывается холодильная нагрузка</h1>
          <p className="lead">
            Меняйте параметры комнаты — модель и расчёт обновляются сразу. Стрелки в сцене показывают основные теплопритоки: жёлтые — солнце, оранжевые — стена и кровля.
          </p>
        </div>
        <button className="btn small" onClick={() => setR(DEFAULT_ROOM)}>Пример по умолчанию</button>
      </div>

      <div className="stage wide">
        <div style={{ display: 'grid', gap: 14, minWidth: 0 }}>
          <div className="viewport" style={{ height: 'min(56vh, 560px)', minHeight: 340 }}>
            {can3D ? <RoomViz r={r} res={res} quality={quality} reduced={reduced} /> : <Plan2D r={r} />}
            <div className="vp-overlay">
              <div className="vp-tl">
                <span className="hint">пример: {r.length}×{r.width}×{r.height} м · {r.windows} окн. {fmt(r.glazing, 1)} м² · {ORIENT_LABEL[r.orientation].toLowerCase()}</span>
              </div>
            </div>
          </div>
          <Result res={res} audience={audience} maxItem={maxItem} />
        </div>

        <aside className="panel" aria-label="Параметры комнаты">
          <div className="eyebrow">Помещение</div>
          <Range id="c-l" label="Длина (стена с окнами)" unit="м" min={2} max={10} step={0.1} value={r.length} onChange={(v) => set('length', v)} />
          <Range id="c-w" label="Ширина" unit="м" min={2} max={8} step={0.1} value={r.width} onChange={(v) => set('width', v)} />
          <Range id="c-h" label="Высота потолка" unit="м" min={2.4} max={4} step={0.05} value={r.height} onChange={(v) => set('height', v)} />
          <label className="check">
            <input id="c-top" type="checkbox" checked={r.topFloor} onChange={(e) => set('topFloor', e.target.checked)} /> Последний этаж (кровля над комнатой)
          </label>
          <hr />
          <div className="eyebrow">Окна и солнце</div>
          <Range id="c-win" label="Количество окон" unit="шт." min={0} max={4} step={1} value={r.windows} onChange={(v) => setR((x) => ({ ...x, windows: v, glazing: v === 0 ? 0 : x.glazing || 1.5 }))} />
          <Range id="c-gl" label="Площадь остекления" unit="м²" min={0} max={Math.max(1, +(r.length * (r.height - 0.3)).toFixed(1))} step={0.1} value={r.glazing} disabled={r.windows === 0} onChange={(v) => set('glazing', v)} />
          <div className="field">
            <span className="lbl">Окна выходят на</span>
            <div className="seg" style={{ width: '100%' }}>
              {(['N', 'E', 'S', 'W'] as Orientation[]).map((o) => (
                <button key={o} style={{ flex: 1 }} aria-pressed={r.orientation === o} onClick={() => set('orientation', o)}>{ORIENT_LABEL[o]}</button>
              ))}
            </div>
          </div>
          <Select id="c-sh" label="Затенение" value={r.shading} options={SHADING_LABEL} onChange={(v) => set('shading', v as Shading)} />
          <hr />
          <div className="eyebrow">Люди и техника</div>
          <Range id="c-p" label="Людей одновременно" unit="" min={0} max={8} step={1} value={r.people} onChange={(v) => set('people', v)} />
          <div style={{ display: 'grid', gap: 6 }}>
            {(Object.keys(APPLIANCES) as ApplianceId[]).map((id) => (
              <div key={id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                <span className="muted" style={{ fontSize: 14 }}>{APPLIANCES[id].name} <span className="dim mono" style={{ fontSize: 12 }}>{APPLIANCES[id].watts} Вт</span></span>
                <span className="stepper">
                  <button onClick={() => setAppl(id, -1)} aria-label={`Меньше: ${APPLIANCES[id].name}`}>−</button>
                  <span>{r.appliances[id]}</span>
                  <button onClick={() => setAppl(id, 1)} aria-label={`Больше: ${APPLIANCES[id].name}`}>+</button>
                </span>
              </div>
            ))}
          </div>
          <hr />
          <div className="eyebrow">Здание и климат</div>
          <Select id="c-ins" label="Утепление наружной стены" value={r.insulation} options={INSULATION_LABEL} onChange={(v) => set('insulation', v as Insulation)} />
          <Select id="c-reg" label="Климатический район" value={r.region} options={REGION_LABEL} onChange={(v) => set('region', v as Region)} />
        </aside>
      </div>
      <Quiz module="calculator" />
    </main>
  );
}

function Result({ res, audience, maxItem }: { res: ReturnType<typeof computeLoad>; audience: string; maxItem: number }) {
  const btu = res.totalKW * BTU_PER_KW;
  return (
    <section className="panel" style={{ maxHeight: 'none' }} aria-live="polite">
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 18, alignItems: 'end', justifyContent: 'space-between' }}>
        <div>
          <div className="eyebrow">Расчётная холодильная нагрузка</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginTop: 6 }}>
            <span className="mono" style={{ fontSize: 44, fontWeight: 600, lineHeight: 1 }}>{fmt(res.totalKW)}</span>
            <span className="muted">кВт</span>
            <span className="dim mono">≈ {Math.round(btu / 100) * 100} BTU/h</span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {CLASSES.map((c) => (
            <div
              key={c.btu}
              style={{
                padding: '8px 10px',
                borderRadius: 9,
                border: '1px solid ' + (res.cls?.btu === c.btu ? 'var(--heat)' : 'var(--line-soft)'),
                background: res.cls?.btu === c.btu ? 'color-mix(in srgb, var(--heat) 16%, var(--navy-950))' : 'var(--navy-950)',
                textAlign: 'center',
                minWidth: 64,
              }}
            >
              <div className="mono" style={{ fontWeight: 600, color: res.cls?.btu === c.btu ? 'var(--heat-2)' : 'var(--fg-2)' }}>{c.btu / 1000}k</div>
              <div className="dim mono" style={{ fontSize: 11 }}>{fmt(c.kw, 1)} кВт</div>
            </div>
          ))}
        </div>
      </div>

      <div className="readout">
        <div>
          <b style={{ color: 'var(--heat-2)' }}>{res.cls ? `${res.cls.btu / 1000} 000` : '> 24 000'}</b>
          <span>ориентировочный класс, BTU/h</span>
        </div>
        <div>
          <b style={{ color: 'var(--sky)' }}>{res.cls ? fmt(res.cls.kw, 1) : '—'}</b>
          <span>кВт холода (номинал класса)</span>
        </div>
        <div>
          <b>{fmt(res.electricKW)}</b>
          <span>кВт из сети при EER≈{fmt(res.eer, 1)}</span>
        </div>
        <div>
          <b className="dim">{fmt(res.byAreaKW)}</b>
          <span>кВт «по площади» (1 кВт / 10 м²)</span>
        </div>
      </div>

      <div style={{ display: 'grid', gap: 7 }}>
        <div className="eyebrow">Теплопритоки</div>
        {res.items.map((i) => (
          <div key={i.key} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 200px) 1fr 70px', gap: 10, alignItems: 'center', fontSize: 13 }}>
            <span className="muted" style={{ minWidth: 0 }}>{i.label}</span>
            <span style={{ height: 10, borderRadius: 5, background: 'var(--navy-800)', overflow: 'hidden' }}>
              <span style={{ display: 'block', height: '100%', width: `${(i.watts / maxItem) * 100}%`, background: i.key === 'solar' ? 'var(--warn)' : i.key === 'people' || i.key === 'appl' || i.key === 'light' ? 'var(--sky-dim)' : 'var(--heat)' }} />
            </span>
            <span className="mono" style={{ textAlign: 'right' }}>{Math.round(i.watts)} Вт</span>
          </div>
        ))}
        <p className="dim" style={{ fontSize: 12 }}>
          Сумма {Math.round(res.sumW)} Вт + 15 % запаса. Расчётная наружная температура даёт перепад {res.dT} К к внутренним +24 °C.
        </p>
      </div>

      <p className="note">
        <b>Холодопроизводительность ≠ потребляемая мощность.</b> Класс «{res.cls ? res.cls.btu / 1000 : '24+'}» переносит около {res.cls ? fmt(res.cls.kw, 1) : '7+'} кВт тепла, а из сети берёт примерно {fmt(res.electricKW)} кВт. Точные значения холодопроизводительности, EER и диапазона мощности — в паспорте конкретной модели; при высокой уличной температуре реальная производительность ниже номинала.
      </p>
      <p className="note">
        Расчёт «по площади» дал бы {fmt(res.byAreaKW)} кВт{Math.abs(res.byAreaKW - res.totalKW) > 0.4 ? ` — отличие ${fmt(Math.abs(res.byAreaKW - res.totalKW), 1)} кВт` : ''}. Он не видит окна, сторону света, людей, технику и утепление, поэтому годится только как первая прикидка.
      </p>
      {res.warnings.map((w) => (
        <p key={w} className="note warn">{w}</p>
      ))}
      {audience === 'installer' && (
        <p className="note heat">
          Метод учебный, поэлементный, на пиковый час: солнце через стекло × коэффициент затенения, теплопередача стен и стёкол по U·A·ΔT (для освещённой стены — с добавкой эквивалентной температуры), инфильтрация 0,5 1/ч, люди по 130 Вт, техника по паспортной мощности. Для проектирования используют нормативные методики с почасовым расчётом.
        </p>
      )}
    </section>
  );
}

function Range({ id, label, unit, min, max, step, value, onChange, disabled }: { id: string; label: string; unit: string; min: number; max: number; step: number; value: number; onChange: (v: number) => void; disabled?: boolean }) {
  return (
    <div className="field">
      <label htmlFor={id}>
        {label} <output>{step < 1 ? value.toLocaleString('ru-RU', { maximumFractionDigits: 2 }) : value} {unit}</output>
      </label>
      <input id={id} type="range" min={min} max={max} step={step} value={value} disabled={disabled} onChange={(e) => onChange(+e.target.value)} />
    </div>
  );
}

function Select({ id, label, value, options, onChange }: { id: string; label: string; value: string; options: Record<string, string>; onChange: (v: string) => void }) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
        {Object.entries(options).map(([k, v]) => (
          <option key={k} value={k}>{v}</option>
        ))}
      </select>
    </div>
  );
}

/** 2D-план комнаты для режима без 3D. */
function Plan2D({ r }: { r: RoomInput }) {
  const s = Math.min(560 / r.length, 300 / r.width);
  const w = r.length * s;
  const h = r.width * s;
  const n = Math.max(1, r.windows);
  const ww = r.windows ? Math.min(w / n - 10, (r.glazing / n / 1.5) * s) : 0;
  return (
    <div className="svgwrap" style={{ height: '100%', display: 'grid', alignItems: 'center' }}>
      <svg viewBox={`-40 -60 ${w + 80} ${h + 100}`} role="img" aria-label="План комнаты">
        <rect x="0" y="0" width={w} height={h} fill="var(--navy-850)" stroke="var(--fg-3)" strokeWidth="3" />
        <rect x="0" y="-10" width={w} height="10" fill={r.insulation === 'good' ? 'var(--heat-2)' : r.insulation === 'medium' ? 'var(--fg-3)' : 'var(--line)'} />
        {r.windows > 0 &&
          Array.from({ length: n }).map((_, i) => (
            <rect key={i} x={(w / n) * (i + 0.5) - ww / 2} y="-12" width={ww} height="14" fill="var(--sky-2)" />
          ))}
        <text x={w / 2} y="-30" fill="var(--warn)" fontSize="14" textAnchor="middle">окна → {ORIENT_LABEL[r.orientation]}</text>
        {Array.from({ length: r.people }).map((_, i) => (
          <circle key={i} cx={30 + (i % 4) * 30} cy={h - 30 - Math.floor(i / 4) * 30} r="10" fill="var(--heat)" />
        ))}
        <text x={w / 2} y={h / 2} fill="var(--fg)" fontSize="16" textAnchor="middle" fontFamily="var(--f-mono)">{(r.length * r.width).toFixed(1)} м²</text>
      </svg>
    </div>
  );
}
