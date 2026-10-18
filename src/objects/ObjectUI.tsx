// Урок и калькулятор универсального конфигуратора. Тексты урока (шаги, ошибки) — из листа «Объекты».
import { OrbitControls } from '@react-three/drei';
import { Canvas, useFrame } from '@react-three/fiber';
import { useMemo, useRef, useState } from 'react';
import type * as THREE from 'three';
import type { AcademyViewProps } from '../core/academy';
import { BASES, type Basis } from '../core/types';
import { findPrice, findProduct, findWork, productsForSlot, slotsOfType } from '../catalog/sheetParser';
import { useApp } from '../store';
import { money, qty as fq, unitLabel } from '../ui/format';
import type { ObjectParams } from './academy';
import { measure, openingOf } from './geometry';
import { lookOf, objectLines, ruleFor, typeForElement } from './logic';
import { DoorFrame, DoorHinges, DoorLeaf } from './models';

type Props = AcademyViewProps<ObjectParams>;

const DOOR_PARTS = [
  { id: 'leaf', name: 'Полотно', text: 'Подвижная часть двери. Наполнение (соты, ДСП, массив) определяет вес и шумоизоляцию.' },
  { id: 'frame', name: 'Коробка', text: 'Рама в проёме, на которую вешается полотно. Должна стоять строго по уровню.' },
  { id: 'casing', name: 'Наличники', text: 'Закрывают монтажный шов между коробкой и стеной с двух сторон.' },
  { id: 'hinges', name: 'Петли', text: 'Держат полотно. Скрытые петли не видны и регулируются в трёх плоскостях.' },
  { id: 'handle', name: 'Ручка и защёлка', text: 'Ручка поворачивает язычок защёлки, ответная планка в коробке фиксирует дверь.' },
];

export function ObjectLesson({ ctx, selection }: Props) {
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
      {type.renderer === 'wall' && <WallLayers color={look.color ?? '#f3f1ec'} finish={look.finish ?? 'paint'} step={steps.length ? step : -1} />}
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

/** Слои отделки стены — простая наглядная схема. */
function WallLayers({ color, finish, step }: { color: string; finish: string; step: number }) {
  const layers = [
    { name: 'Основание (бетон, кирпич, ГКЛ)', color: '#a7a39c' },
    { name: 'Выравнивание и шпаклёвка', color: '#e3ded4' },
    { name: 'Грунт', color: '#d9e6ef' },
    { name: finish === 'wallpaper' ? 'Обои' : finish === 'plaster' ? 'Декоративная штукатурка' : finish === 'panel' ? 'Реечные панели' : 'Краска, 2 слоя', color },
  ];
  return (
    <div className="wall-layers" aria-label="Слои отделки стены">
      {layers.map((l, i) => (
        <div key={i} className={step < 0 || i <= step ? 'wl on' : 'wl'} style={{ background: l.color }}>
          <span>{l.name}</span>
        </div>
      ))}
    </div>
  );
}

// ---------- Калькулятор ----------

export function ObjectCalculator({ ctx, selection }: Props) {
  const el = ctx.element;
  const app = useApp.getState();
  const sectionId = useApp((s) => s.activeSection);
  const closed = useApp((s) => (el ? !!s.closedDoors[el.id] : false));
  const [applied, setApplied] = useState<number | null>(null);
  const type = el ? typeForElement(ctx.catalog, el) : undefined;
  const m = useMemo(() => (el ? measure(ctx.layout, el) : null), [ctx.layout, el]);
  if (!el || !type || !m || !sectionId) return null;
  const lines = objectLines(ctx.catalog, ctx.layout, el, selection);
  const slots = slotsOfType(ctx.catalog, type.id);
  const used = new Set<Basis>(slots.flatMap((s) => [s.per, s.workPer]));
  const op = openingOf(ctx.layout, el);
  const sameType = ctx.layout.elements.filter((e) => e.typeId === type.id).length;

  return (
    <div className="calc">
      <h4>Размеры (из планировки)</h4>
      <table className="spec">
        <tbody>
          {op && (
            <tr>
              <th>Проём</th>
              <td>
                {fq(m.opening_w)} × {fq(m.opening_h)} м
              </td>
            </tr>
          )}
          {(Object.keys(BASES) as Basis[])
            .filter((b) => used.has(b) && b !== 'pcs' && b !== 'opening_w' && b !== 'opening_h')
            .map((b) => (
              <tr key={b}>
                <th>{BASES[b][0].toUpperCase() + BASES[b].slice(1)}</th>
                <td>{fq(m[b])}</td>
              </tr>
            ))}
        </tbody>
      </table>
      {ctx.layout.isDemo && <p className="muted small">Размеры демо-планировки условные. Для реальной квартиры — по обмеру или чертежу.</p>}

      <h4>Состав и количество</h4>
      <div className="obj-lines">
        {lines.map((l) => {
          const options = productsForSlot(ctx.catalog, l.slot.slot);
          const r = ruleFor(l.slot, l.product);
          const work = findWork(ctx.catalog, l.workId);
          return (
            <div key={l.slot.slot} className="obj-line">
              <div className="obj-line-head">
                <b>{l.slot.label}</b>
                <select
                  value={l.product?.id ?? ''}
                  onChange={(e) => app.setSlot(sectionId, l.slot.slot, e.target.value || null)}
                  aria-label={l.slot.label}
                >
                  {l.slot.optional && <option value="">Не нужно</option>}
                  {options.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} — {money(findPrice(ctx.catalog, p.id)?.sale)}/{unitLabel(p.unit)}
                    </option>
                  ))}
                </select>
              </div>
              {l.product && (
                <div className="muted small">
                  {fq(r.rate)} {unitLabel(l.product.unit)} × {fq(m[r.per])} ({BASES[r.per]}){r.waste ? ` + запас ${Math.round(r.waste * 100)} %` : ''} = <b>{fq(l.need)} {unitLabel(l.product.unit)}</b>
                  {work && (
                    <>
                      {' '}
                      · работа: {work.name.toLowerCase()} — {fq(l.workQty)} {unitLabel(work.unit)}
                    </>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="row-actions">
        {sameType > 1 && (
          <button className="btn ghost" onClick={() => setApplied(app.applyToAll(sectionId))}>
            Применить ко всем: {type.name.toLowerCase()} ({sameType})
          </button>
        )}
        {(type.renderer === 'door') && (
          <button className="btn ghost" onClick={() => app.toggleDoor(el.id)}>
            {closed ? 'Открыть дверь в 3D' : 'Закрыть дверь в 3D'}
          </button>
        )}
      </div>
      {applied != null && <p className="muted small">Комплектация скопирована ещё на {applied} объект(а). Добавьте их в смету в списке «Объекты» или в смете.</p>}
      <p className="muted small">Одинаковые товары из разных объектов складываются в смете в одну строку и округляются до упаковки один раз.</p>
    </div>
  );
}

export { findProduct };
