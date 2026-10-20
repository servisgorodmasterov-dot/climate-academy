// Урок и калькулятор универсального конфигуратора. Тексты урока (шаги, ошибки) — из листа «Объекты».
import { OrbitControls } from '@react-three/drei';
import { Canvas, useFrame } from '@react-three/fiber';
import { useMemo, useRef, useState } from 'react';
import type * as THREE from 'three';
import type { AcademyViewProps } from '../core/academy';
import type { Product } from '../core/types';
import { BASES, type Basis } from '../core/types';
import { findPrice, findProduct, findWork, productsForSlot, slotsOfType } from '../catalog/sheetParser';
import { useApp } from '../store';
import { money, qty as fq, unitLabel } from '../ui/format';
import type { ObjectParams } from './academy';
import { measure, openingOf } from './geometry';
import { lineCost, lookOf, objectLines, ruleFor, typeForElement } from './logic';
import { DoorFrame, DoorHinges, DoorLeaf } from './models';

type Props = AcademyViewProps<ObjectParams>;

const DOOR_PARTS = [
  { id: 'leaf', name: 'Полотно', text: 'Подвижная часть двери. Наполнение (соты, ДСП, массив) определяет вес и шумоизоляцию.' },
  { id: 'frame', name: 'Коробка', text: 'Рама в проёме, на которую вешается полотно. Должна стоять строго по уровню.' },
  { id: 'casing', name: 'Наличники', text: 'Закрывают монтажный шов между коробкой и стеной с двух сторон.' },
  { id: 'hinges', name: 'Петли', text: 'Держат полотно. Скрытые петли не видны и регулируются в трёх плоскостях.' },
  { id: 'handle', name: 'Ручка и защёлка', text: 'Ручка поворачивает язычок защёлки, ответная планка в коробке фиксирует дверь.' },
];

export function ObjectLesson({ ctx, selection, params }: Props) {
  const el = ctx.element;
  const type = el ? typeForElement(ctx.catalog, el) : undefined;
  const [step, setStep] = useState(0);
  if (!el || !type) return <p className="muted">Объект не найден в планировке.</p>;
  const look = lookOf(ctx.catalog, el, selection);
  const steps = type.lessonSteps;
  const isDoor = type.renderer === 'door' || type.renderer === 'entrance';
  return (
    <div className="lesson">
      <p>{type.description}</p>
      {isDoor && <DoorLesson look={look} entrance={type.renderer === 'entrance'} step={step} steps={steps.length} />}
      {!isDoor && slotsOfType(ctx.catalog, type.id).length >= 3 && <LayerStack ctx={ctx} selection={selection} layers={params.layers} el={el} color={look.color ?? '#f3f1ec'} />}
      {steps.length > 0 && (
        <section className="steps">
          <h4>
            Как устанавливается · шаг {step + 1} из {steps.length}
          </h4>
          <ol className="layers">
            {steps.map((s, i) => (
              <li key={i} className={i === step ? 'on' : ''}>
                <button onClick={() => setStep(i)}>
                  <i style={{ background: i <= step ? 'var(--acc, #0066fa)' : '#d5dbe3' }} />
                  {s}
                </button>
              </li>
            ))}
          </ol>
          <div className="row-actions">
            <button className="btn ghost" disabled={step === 0} onClick={() => setStep(step - 1)}>
              ← Назад
            </button>
            <button className="btn" disabled={step >= steps.length - 1} onClick={() => setStep(step + 1)}>
              Далее →
            </button>
          </div>
        </section>
      )}
      {type.mistakes.length > 0 && (
        <section>
          <h4>Частые ошибки</h4>
          <ul className="mistakes">
            {type.mistakes.map((m, i) => (
              <li key={i}>{m}</li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

/** Дверной блок: разборка на части, открывание, сборка по шагам. */
function DoorLesson({ look, entrance, step, steps }: { look: Record<string, string>; entrance: boolean; step: number; steps: number }) {
  const [manual, setManual] = useState<number | null>(null);
  const [open, setOpen] = useState(false);
  const [part, setPart] = useState<string>('leaf');
  // по шагам дверь «собирается»: на первом шаге разобрана, на последнем — собрана
  const explode = manual ?? (steps > 1 ? 1 - step / (steps - 1) : 0);
  const info = DOOR_PARTS.find((p) => p.id === part);
  return (
    <>
      <div className="viewer3d">
        <Canvas shadows camera={{ position: [1.9, 1.5, 2.6], fov: 40 }} dpr={[1, 2]}>
          <color attach="background" args={['#f3f6fa']} />
          <hemisphereLight args={['#fff', '#cbd3dc', 0.9]} />
          <directionalLight position={[2, 4, 3]} intensity={1.5} castShadow />
          <group position={[-0.4, -1, 0]}>
            <DoorFrame w={0.86} h={2.07} t={0.12} look={entrance ? { ...look, hidden: '1' } : look} explode={explode} highlight={part === 'frame' || part === 'casing'} />
            <SwingingLeaf open={open} explode={explode}>
              <DoorLeaf w={0.8} h={2.0} look={look} highlight={part === 'leaf' || part === 'handle'} explode={part === 'handle' ? Math.max(explode, 0.3) : explode} />
              <DoorHinges h={2.0} hidden={look.hidden === '1'} explode={part === 'hinges' ? Math.max(explode, 0.5) : explode} />
            </SwingingLeaf>
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0.43, -0.001, 0]} receiveShadow>
              <planeGeometry args={[3, 2]} />
              <meshStandardMaterial color="#e6e1d8" />
            </mesh>
          </group>
          <OrbitControls enablePan={false} minDistance={1.5} maxDistance={6} target={[0, 0, 0]} />
        </Canvas>
        <label className="slider">
          Собрать
          <input type="range" min={0} max={1} step={0.01} value={explode} onChange={(e) => setManual(+e.target.value)} />
          Разобрать
        </label>
      </div>
      <div className="row-actions">
        <button className="btn" onClick={() => setOpen(!open)}>
          {open ? 'Закрыть дверь' : 'Открыть дверь'}
        </button>
        {manual != null && (
          <button className="btn ghost" onClick={() => setManual(null)}>
            Сборка по шагам
          </button>
        )}
      </div>
      {!entrance && (
        <ol className="layers">
          {DOOR_PARTS.map((p) => (
            <li key={p.id} className={part === p.id ? 'on' : ''}>
              <button onClick={() => setPart(p.id)}>
                <i style={{ background: p.id === 'leaf' || p.id === 'frame' || p.id === 'casing' ? look.color ?? '#efe9df' : look.handle ?? '#9aa0a6' }} />
                {p.name}
              </button>
            </li>
          ))}
        </ol>
      )}
      {!entrance && info && <p className="muted">{info.text}</p>}
    </>
  );
}

function SwingingLeaf({ open, explode, children }: { open: boolean; explode: number; children: React.ReactNode }) {
  const ref = useRef<THREE.Group>(null);
  useFrame(() => {
    const g = ref.current;
    if (!g) return;
    const target = open ? -1.25 : 0;
    g.rotation.y += (target - g.rotation.y) * 0.1;
  });
  return (
    <group ref={ref} position={[0.03, 0.01, explode * 0.45]}>
      {children}
    </group>
  );
}

/** Слои отделки снизу вверх — из шагов расчёта: что выбрано, то и показано (с толщиной слоя). */
function LayerStack({ ctx, el, selection, layers, color }: { ctx: Props['ctx']; el: NonNullable<Props['ctx']['element']>; selection: Props['selection']; layers?: Record<string, number>; color: string }) {
  const lines = objectLines(ctx.catalog, ctx.layout, el, selection, layers);
  const greys = ['#d8d2c6', '#e2ddd3', '#cfe0ea', '#ece8e0', '#f2efe9', '#e9e4da'];
  return (
    <div className="wall-layers" aria-label="Слои отделки">
      <div className="wl on" style={{ background: '#a7a39c' }}>
        <span>Основание (бетон, кирпич, плита)</span>
      </div>
      {lines.map((l, i) => {
        const last = l.slot.slot === typeForElement(ctx.catalog, el)?.primarySlot;
        return (
          <div key={l.slot.slot} className={l.product ? 'wl on' : 'wl'} style={{ background: last && l.product ? color : greys[i % greys.length] }}>
            <span>
              {l.slot.label}
              {l.product ? ` — ${l.product.name.split(',')[0]}` : ' — не нужно'}
              {l.product && l.layer != null ? `, ${fq(l.layer)} мм` : ''}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ---------- Калькулятор: весь процесс по шагам ----------

const plural = (n: number, one: string, few: string, many: string) => {
  const a = Math.abs(n) % 100;
  const b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b > 1 && b < 5) return few;
  if (b === 1) return one;
  return many;
};
const CONTAINERS: [RegExp, [string, string, string]][] = [
  [/мешок/i, ['мешок', 'мешка', 'мешков']],
  [/ведро/i, ['ведро', 'ведра', 'вёдер']],
  [/рулон/i, ['рулон', 'рулона', 'рулонов']],
  [/банка/i, ['банка', 'банки', 'банок']],
];
/** «15 мешков по 30 кг» — как покупать материал. */
function packText(p: Product, packs: number) {
  if (p.packSize <= 1) return `${fq(packs)} ${unitLabel(p.unit)}`;
  const c = CONTAINERS.find(([re]) => re.test(p.name))?.[1] ?? ['упаковка', 'упаковки', 'упаковок'];
  return `${packs} ${plural(packs, ...c)} по ${fq(p.packSize)} ${unitLabel(p.unit)}`;
}

/** Подсказка «какой слой штукатурки»: по самому большому отклонению стены от правила 2 м. */
const CURVES: { label: string; mm: number | null }[] = [
  { label: 'Ровные, до 3 мм', mm: null },
  { label: 'до 10 мм', mm: 10 },
  { label: 'до 20 мм', mm: 15 },
  { label: 'до 30 мм', mm: 20 },
  { label: 'до 50 мм', mm: 30 },
];

/** «Насколько ровный пол?» — по перепаду (правило 2 м) сразу включает стяжку и наливной пол с нужной толщиной. */
const FLOOR_LEVELS: { label: string; screed: number | null; self: number | null }[] = [
  { label: 'Ровный, до 2 мм', screed: null, self: null },
  { label: '2–10 мм', screed: null, self: 5 },
  { label: '10–30 мм', screed: 40, self: 5 },
  { label: '30–60 мм', screed: 60, self: 5 },
  { label: 'больше 60 мм', screed: 80, self: 5 },
];
const WET_LEVELS: { label: string; screed: number | null }[] = [
  { label: 'Ровный, до 3 мм', screed: null },
  { label: 'до 10 мм', screed: 20 },
  { label: 'до 30 мм', screed: 40 },
  { label: 'больше 30 мм', screed: 50 },
];

/** Единица нормы: «кг/м²», «м/м» (плинтус на метр периметра), «шт». */
const perUnit = (b: Basis) => (b.endsWith('m2') ? 'м²' : b.endsWith('_m') || b === 'opening_w' || b === 'opening_h' ? 'м' : 'шт');

export function ObjectCalculator({ ctx, selection, params, setParams }: Props) {
  const el = ctx.element;
  const app = useApp.getState();
  const sectionId = useApp((s) => s.activeSection);
  const closed = useApp((s) => (el ? !!s.closedDoors[el.id] : false));
  const [applied, setApplied] = useState<number | null>(null);
  const type = el ? typeForElement(ctx.catalog, el) : undefined;
  const m = useMemo(() => (el ? measure(ctx.layout, el) : null), [ctx.layout, el]);
  if (!el || !type || !m || !sectionId) return null;
  const layers = params.layers ?? {};
  const lines = objectLines(ctx.catalog, ctx.layout, el, selection, layers);
  const slots = slotsOfType(ctx.catalog, type.id);
  const used = new Set<Basis>(slots.flatMap((s) => [s.per, s.workPer]));
  const op = openingOf(ctx.layout, el);
  const sameType = ctx.layout.elements.filter((e) => e.typeId === type.id).length;
  const costs = lines.map((l) => lineCost(ctx.catalog, l));
  const sum = costs.reduce((a, c) => ({ mat: a.mat + c.material + c.consumables.reduce((x, y) => x + y.cost, 0), work: a.work + c.work }), { mat: 0, work: 0 });
  const setLayer = (slot: string, mm: number) => setParams({ ...params, layers: { ...layers, [slot]: mm } });
  const turn = (slot: string, on: boolean) => {
    const def = slots.find((x) => x.slot === slot)?.defaultProductId ?? productsForSlot(ctx.catalog, slot)[0]?.id ?? null;
    app.setSlot(sectionId, slot, on ? def : null);
  };
  const isProcess = lines.length > 2 || lines.some((l) => l.slot.layerMm != null);

  return (
    <div className="calc">
      <div className="calc-size">
        {(Object.keys(BASES) as Basis[])
          .filter((b) => used.has(b) && b !== 'pcs' && b !== 'opening_w' && b !== 'opening_h')
          .map((b) => (
            <span key={b}>
              {BASES[b][0].toUpperCase() + BASES[b].slice(1)}: <b>{fq(m[b])}</b>
            </span>
          ))}
        {op && (
          <span>
            Проём: <b>{fq(m.opening_w)} × {fq(m.opening_h)} м</b>
          </span>
        )}
      </div>
      {ctx.layout.isDemo && <p className="muted small">Размеры демо-планировки условные. Для реальной квартиры — по обмеру или чертежу.</p>}

      {(() => {
        const screed = lines.find((l) => l.slot.slot === 'floor.screed.base' || l.slot.slot === 'floor.wet.screed');
        if (!screed) return null;
        const self = lines.find((l) => l.slot.slot === 'floor.self');
        const levels = self ? FLOOR_LEVELS : WET_LEVELS.map((x) => ({ ...x, self: null }));
        const apply = (v: { screed: number | null; self: number | null }) => {
          const next = { ...layers };
          turn(screed.slot.slot, v.screed != null);
          if (v.screed != null) next[screed.slot.slot] = v.screed;
          if (self) {
            turn(self.slot.slot, v.self != null);
            if (v.self != null) next[self.slot.slot] = v.self;
          }
          setParams({ ...params, layers: next });
        };
        const now = (v: { screed: number | null; self: number | null }) =>
          (v.screed == null ? !screed.product : !!screed.product && screed.layer === v.screed) && (!self || (v.self == null ? !self.product : !!self.product && self.layer === v.self));
        return (
          <div className="curve level-pick">
            <b className="small">Насколько ровный пол? (перепад под правилом 2 м)</b>
            <div className="chips-row">
              {levels.map((v) => (
                <button key={v.label} className={now(v) ? 'mini on' : 'mini'} onClick={() => apply(v)}>
                  {v.label}
                </button>
              ))}
            </div>
            <span className="muted small">Включит нужные шаги выравнивания и подставит толщину — её можно поправить в шаге.</span>
          </div>
        );
      })()}

      <h4>{isProcess ? 'Весь процесс по шагам' : 'Состав и количество'}</h4>
      <div className="calc-steps">
        {lines.map((l, i) => {
          const c = costs[i];
          const on = !!l.product;
          const options = productsForSlot(ctx.catalog, l.slot.slot);
          const work = findWork(ctx.catalog, l.workId);
          const workK = l.layer != null && l.slot.workLayerMm && l.layer > l.slot.workLayerMm ? l.layer / l.slot.workLayerMm : 1;
          return (
            <section key={l.slot.slot} className={on ? 'calc-step' : 'calc-step off'}>
              <header>
                <span className="step-n">{i + 1}</span>
                <b className="step-name">{l.slot.label}</b>
                {on ? <b className="step-sum">{money(c.total)}</b> : <span className="muted small">не нужно</span>}
                {l.slot.optional && (
                  <label className="toggle" title={on ? 'Убрать шаг из расчёта' : 'Включить шаг'}>
                    <input type="checkbox" checked={on} onChange={(e) => turn(l.slot.slot, e.target.checked)} />
                  </label>
                )}
              </header>
              {l.slot.hint && <p className="step-hint">{l.slot.hint}</p>}
              {l.slot.slot === 'wall.plaster' && (
                <div className="curve">
                  <span className="muted small">Насколько кривые стены (правило 2 м)?</span>
                  <div className="chips-row">
                    {CURVES.map((cv) => {
                      const active = cv.mm == null ? !on : on && l.layer === cv.mm;
                      return (
                        <button
                          key={cv.label}
                          className={active ? 'mini on' : 'mini'}
                          onClick={() => {
                            if (cv.mm == null) return turn(l.slot.slot, false);
                            if (!on) turn(l.slot.slot, true);
                            setLayer(l.slot.slot, cv.mm);
                          }}
                        >
                          {cv.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
              {on && l.product && (
                <>
                  <select value={l.product.id} onChange={(e) => app.setSlot(sectionId, l.slot.slot, e.target.value)} aria-label={l.slot.label}>
                    {options.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} — {money(findPrice(ctx.catalog, p.id)?.sale)}/{unitLabel(p.unit)}
                      </option>
                    ))}
                  </select>
                  {l.layer != null && l.slot.layerOptions.length > 0 && (
                    <div className="layer-row">
                      <span>Толщина слоя</span>
                      <div className="chips-row">
                        {l.slot.layerOptions.map((mm) => (
                          <button key={mm} className={l.layer === mm ? 'mini on' : 'mini'} onClick={() => setLayer(l.slot.slot, mm)}>
                            {fq(mm)} мм
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  <div className="step-calc">
                    <div>
                      <span className="muted">Расход:</span> {fq(l.rate)} {unitLabel(l.product.unit)}/{perUnit(l.per)}
                      {l.layer != null ? ' на 1 мм' : ''} × {fq(m[l.per])}
                      {l.layer != null ? ` × ${fq(l.layer)} мм` : ''}
                      {ruleFor(l.slot, l.product).waste ? ` + запас ${Math.round(ruleFor(l.slot, l.product).waste * 100)} %` : ''} = <b>{fq(l.need)} {unitLabel(l.product.unit)}</b>
                    </div>
                    <div>
                      <span className="muted">Купить:</span> <b>{packText(l.product, c.packs)}</b> — {money(c.material)}
                    </div>
                    {c.consumables.map((cn) => (
                      <div key={cn.product.id} className="muted">
                        + {cn.product.name}: {fq(cn.buyQty)} {unitLabel(cn.product.unit)} — {money(cn.cost)}
                      </div>
                    ))}
                    {work && (
                      <div>
                        <span className="muted">Работа:</span> {work.name.toLowerCase()} — {money(work.price)}/{unitLabel(work.unit)} × {fq(m[l.slot.workPer])}
                        {workK > 1 ? ` × ${fq(Math.round(workK * 100) / 100)} (слой ${fq(l.layer!)} мм толще ${fq(l.slot.workLayerMm!)} мм)` : ''} = <b>{money(c.work)}</b>
                      </div>
                    )}
                  </div>
                </>
              )}
            </section>
          );
        })}
      </div>

      <div className="calc-sum">
        <div>
          <span className="muted small">Материалы</span>
          <b>{money(sum.mat)}</b>
        </div>
        <div>
          <span className="muted small">Работа</span>
          <b>{money(sum.work)}</b>
        </div>
        <div>
          <span className="muted small">Всего по шагам</span>
          <b>{money(sum.mat + sum.work)}</b>
        </div>
      </div>
      <p className="muted small">В смете одинаковые материалы из всех шагов и комнат складываются и округляются до упаковки один раз, плюс доставка — поэтому итог сметы может немного отличаться.</p>

      <div className="row-actions">
        {sameType > 1 && (
          <button className="btn ghost" onClick={() => setApplied(app.applyToAll(sectionId))}>
            Применить ко всем: {type.name.toLowerCase()} ({sameType})
          </button>
        )}
        {type.renderer === 'door' && (
          <button className="btn ghost" onClick={() => app.toggleDoor(el.id)}>
            {closed ? 'Открыть дверь в 3D' : 'Закрыть дверь в 3D'}
          </button>
        )}
      </div>
      {applied != null && <p className="muted small">Комплектация скопирована ещё на {applied} объект(а). Добавьте их в смету в списке «Объекты» или в смете.</p>}
    </div>
  );
}

export { findProduct };
