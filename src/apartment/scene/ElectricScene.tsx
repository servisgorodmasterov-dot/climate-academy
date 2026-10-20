// Режим «Электрика»: квартира прозрачная, видны щит, кабели и точки. Схема строится из планировки
// и количества точек в карточке «Электрика» каждой комнаты. Наведение — подпись кабеля (марка, сечение, автомат).
import { Html, Line } from '@react-three/drei';
import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { Layout } from '../../core/types';
import { buildElectricScheme, countsFromSections, type ElLine, type ElPoint } from '../electric';
import { useApp } from '../../store';

// цвета заметно разные: магистраль синяя, розетки оранжевые, свет жёлтый, силовые красные
const COLORS: Record<ElLine['group'], string> = { trunk: '#1e6fff', sockets: '#ff6a00', light: '#ffc400', power: '#e0102a', ac: '#00acc1', cornice: '#00897b' };
const WIDTH: Record<ElLine['group'], number> = { trunk: 5.5, sockets: 3, light: 2.4, power: 3.8, ac: 3.6, cornice: 2.6 };

const socketMat = new THREE.MeshStandardMaterial({ color: '#fff7e0', roughness: 0.4, emissive: '#ff6a00', emissiveIntensity: 0.5 });
const switchMat = new THREE.MeshStandardMaterial({ color: '#fffbe8', roughness: 0.4, emissive: '#ffc400', emissiveIntensity: 0.5 });
const lightMat = new THREE.MeshBasicMaterial({ color: '#ffc400' });
const powerMat = new THREE.MeshStandardMaterial({ color: '#ffe3e0', roughness: 0.4, emissive: '#e53935', emissiveIntensity: 0.4 });
const corniceMat = new THREE.MeshStandardMaterial({ color: '#e0f2f1', roughness: 0.4, emissive: '#00897b', emissiveIntensity: 0.5 });
const acMat = new THREE.MeshStandardMaterial({ color: '#e0f7fa', roughness: 0.4, emissive: '#00acc1', emissiveIntensity: 0.5 });
const panelMat = new THREE.MeshStandardMaterial({ color: '#1e6fff', roughness: 0.5, emissive: '#1e6fff', emissiveIntensity: 0.35 });
const boxMat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.4, emissive: '#1e6fff', emissiveIntensity: 0.15 });

/** Что показывать на шаге пошагового объяснения (0 — всё сразу). */
const STEP_GROUPS: Record<number, ElLine['group'][]> = { 1: [], 2: ['trunk'], 3: ['trunk', 'light'], 4: ['trunk', 'light', 'cornice'], 5: ['trunk', 'light', 'cornice', 'sockets'], 6: ['trunk', 'light', 'cornice', 'sockets', 'power', 'ac'] };
const STEP_POINTS: Record<number, ElPoint['kind'][]> = { 1: ['panel'], 2: ['panel', 'box'], 3: ['panel', 'box', 'switch'], 4: ['panel', 'box', 'switch', 'light', 'cornice'], 5: ['panel', 'box', 'switch', 'light', 'cornice', 'socket'], 6: ['panel', 'box', 'switch', 'light', 'cornice', 'socket', 'power', 'ac'] };

export function ElectricScene({ layout, focusRoom, onPickRoom, lightOnly = false }: { layout: Layout; focusRoom: string | null; onPickRoom: (roomId: string) => void; lightOnly?: boolean }) {
  const step = useApp((s) => s.electricStep);
  // режим «Освещение»: только щит, кабель света к коробке, выключатели и светильники
  const LIGHT_LINES: ElLine['group'][] = ['trunk', 'light'];
  const LIGHT_POINTS: ElPoint['kind'][] = ['panel', 'box', 'switch', 'light'];
  const showLine = (l: ElLine) => (!lightOnly || LIGHT_LINES.includes(l.group)) && (step === 0 || (STEP_GROUPS[step] ?? []).includes(l.group) && !(step === 3 && l.group === 'light' && !l.id.startsWith('sw-')));
  const showPoint = (p: ElPoint) => (!lightOnly || LIGHT_POINTS.includes(p.kind)) && (step === 0 || (STEP_POINTS[step] ?? []).includes(p.kind));
  const sections = useApp((s) => s.sections);
  const apartmentId = useApp((s) => s.apartmentId);
  const products = useApp((s) => s.catalog?.products);
  const hover = useApp((s) => s.hover);
  const scheme = useMemo(() => buildElectricScheme(layout, countsFromSections(layout, sections as any, apartmentId, products)), [layout, sections, apartmentId, products]);
  const dim = (roomId: string) => focusRoom != null && roomId !== focusRoom && roomId !== '';
  const setHover = (id: string | null) => useApp.getState().set('hover', id);

  return (
    <group>
      {scheme.lines.filter(showLine).map((l) => {
        const faded = dim(l.roomId);
        const on = hover === `el:${l.id}`;
        return (
          <group key={l.id}>
            <Line points={l.points} color={COLORS[l.group]} lineWidth={on ? WIDTH[l.group] + 2 : WIDTH[l.group]} transparent opacity={faded ? 0.12 : on ? 1 : 0.9} depthTest={false} renderOrder={5} />
            {!faded && <Flow points={l.points} color={COLORS[l.group]} />}
            {!faded && l.group !== 'trunk' && <BranchLabel line={l} />}
            {/* невидимая толстая линия для наведения */}
            <Line
              points={l.points}
              color="#000"
              lineWidth={16}
              transparent
              opacity={0}
              depthTest={false}
              onPointerOver={(e) => {
                e.stopPropagation();
                setHover(`el:${l.id}`);
                document.body.style.cursor = 'help';
              }}
              onPointerOut={() => {
                setHover(null);
                document.body.style.cursor = '';
              }}
              onClick={(e) => {
                e.stopPropagation();
                onPickRoom(l.roomId);
              }}
            />
            {on && (
              <Html position={l.points[Math.floor(l.points.length / 2)]} center zIndexRange={[3, 2]}>
                <div className="el-tip" style={{ borderColor: COLORS[l.group] }}>
                  <b>{lightOnly && l.group === 'trunk' ? l.cable.split(' + ')[1] ?? l.cable : l.cable}</b>
                  <span>{lightOnly && l.group === 'trunk' ? `Щит → распредкоробка: кабель освещения, автомат 10 А (вместе с ним идёт кабель розеток — он в «Электрике»)` : l.label}</span>
                </div>
              </Html>
            )}
          </group>
        );
      })}
      {scheme.points.filter(showPoint).map((p) => (
        <ElPointMesh key={p.id} p={p} faded={dim(p.roomId)} hovered={hover === `el:${p.id}`} onHover={(h) => setHover(h ? `el:${p.id}` : null)} onClick={() => p.roomId && onPickRoom(p.roomId)} />
      ))}
      {/* подпись марки кабеля — у середины магистрали каждой комнаты */}
      {scheme.lines
        .filter((l) => l.group === 'trunk' && !dim(l.roomId) && showLine(l))
        .map((l) => {
          const a = l.points[1];
          const b = l.points[2];
          return (
            <Html key={`lbl-${l.id}`} position={[(a[0] + b[0]) / 2, a[1] + 0.1, (a[2] + b[2]) / 2]} center zIndexRange={[2, 1]}>
              <div className="el-label">→ {l.roomId && l.label.split('«')[1]?.split('»')[0]}: {lightOnly ? `свет ${l.cable.split(' + ')[1] ?? ''}` : l.cable}</div>
            </Html>
          );
        })}
    </group>
  );
}

function ElPointMesh({ p, faded, hovered, onHover, onClick }: { p: ElPoint; faded: boolean; hovered: boolean; onHover: (h: boolean) => void; onClick: () => void }) {
  const rot = p.normal ? Math.atan2(p.normal[0], p.normal[1]) : 0;
  const common = {
    onPointerOver: (e: any) => {
      e.stopPropagation();
      onHover(true);
      document.body.style.cursor = 'pointer';
    },
    onPointerOut: () => {
      onHover(false);
      document.body.style.cursor = '';
    },
    onClick: (e: any) => {
      e.stopPropagation();
      onClick();
    },
  };
  const op = faded ? 0.15 : 1;
  const tip = hovered && (
    <Html position={[0, 0.12, 0]} center zIndexRange={[3, 2]}>
      <div className="el-tip">
        <b>{p.label}</b>
      </div>
    </Html>
  );
  if (p.kind === 'panel')
    return (
      <group position={p.position} rotation={[0, rot, 0]}>
        <mesh material={panelMat} {...common} renderOrder={6}>
          <boxGeometry args={[0.34, 0.44, 0.1]} />
        </mesh>
        <Html position={[0, 0.35, 0]} center zIndexRange={[2, 1]}>
          <div className="el-label strong">Щит · вводной автомат 40 А, УЗО 30 мА</div>
        </Html>
        {tip}
      </group>
    );
  if (p.kind === 'box')
    return (
      <group position={p.position}>
        <mesh material={boxMat} {...common} renderOrder={6}>
          <cylinderGeometry args={[0.11, 0.11, 0.06, 24]} />
        </mesh>
        <mesh renderOrder={6}>
          <torusGeometry args={[0.13, 0.015, 8, 32]} />
          <meshBasicMaterial color="#1e6fff" depthTest={false} />
        </mesh>
        <Html position={[0, -0.22, 0]} center zIndexRange={[2, 1]}>
          <div className="el-label box">⬚ Распредкоробка</div>
        </Html>
        {tip}
      </group>
    );
  if (p.kind === 'cornice')
    return (
      <group>
        {p.rail && <Line points={p.rail} color="#00897b" lineWidth={6} transparent opacity={op * 0.9} depthTest={false} renderOrder={5} />}
        <group position={p.position}>
          <mesh material={corniceMat} {...common} renderOrder={6}>
            <boxGeometry args={[0.1, 0.07, 0.07]} />
          </mesh>
          {tip}
        </group>
      </group>
    );
  if (p.kind === 'light')
    return (
      <group position={p.position}>
        <mesh material={lightMat} {...common} renderOrder={6}>
          <sphereGeometry args={[0.07, 14, 10]} />
        </mesh>
        <mesh renderOrder={6}>
          <sphereGeometry args={[0.11, 14, 10]} />
          <meshBasicMaterial color="#ffc400" transparent opacity={op * 0.25} depthTest={false} />
        </mesh>
        {tip}
      </group>
    );
  const mat = p.kind === 'switch' ? switchMat : p.kind === 'power' ? powerMat : p.kind === 'ac' ? acMat : socketMat;
  const num = p.label.match(/^\D+(\d+)/)?.[1];
  return (
    <group position={p.position} rotation={[0, rot, 0]}>
      <mesh material={mat} {...common} renderOrder={6}>
        <boxGeometry args={[p.kind === 'power' ? 0.12 : 0.09, p.kind === 'power' ? 0.12 : 0.09, 0.03]} />
      </mesh>
      {!faded && num && (
        <Html position={[0, 0, 0.03]} center zIndexRange={[2, 1]}>
          <div className={`el-num ${p.kind}`}>{p.kind === 'switch' ? 'В' : p.kind === 'power' ? 'С' : p.kind === 'ac' ? '❄' : ''}{num}</div>
        </Html>
      )}
      {tip}
    </group>
  );
}

/** Бегущие точки вдоль кабеля — показывают, что ток идёт от щита к точкам. */
export function Flow({ points, color }: { points: [number, number, number][]; color: string }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const curve = useMemo(() => new THREE.CurvePath<THREE.Vector3>(), []);
  const total = useMemo(() => {
    curve.curves.length = 0;
    for (let i = 1; i < points.length; i++) curve.add(new THREE.LineCurve3(new THREE.Vector3(...points[i - 1]), new THREE.Vector3(...points[i])));
    return curve.getLength();
  }, [points, curve]);
  const n = Math.max(1, Math.min(60, Math.round(total / 0.7))); // точки через ~70 см на любой линии
  const m = useMemo(() => new THREE.Matrix4(), []);
  useFrame(({ clock }) => {
    const mesh = ref.current;
    if (!mesh || total === 0) return;
    // одинаковая скорость для всех линий, шаг между точками — по длине
    const t0 = ((clock.getElapsedTime() * 0.3) / total) % 1; // 0.3 м/с — спокойно, одинаково на всех линиях
    for (let i = 0; i < n; i++) {
      const t = (t0 + i / n) % 1;
      const p = curve.getPointAt(t);
      m.makeTranslation(p.x, p.y, p.z);
      mesh.setMatrixAt(i, m);
    }
    mesh.instanceMatrix.needsUpdate = true;
  });
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, n]} renderOrder={7}>
      <sphereGeometry args={[0.028, 8, 6]} />
      <meshBasicMaterial color={color} depthTest={false} transparent opacity={0.95} />
    </instancedMesh>
  );
}

/** Подпись ветки человеческим языком у её середины. */
function BranchLabel({ line }: { line: ElLine }) {
  const text = line.group === 'sockets' ? 'к розеткам' : line.group === 'power' ? 'к плите / бойлеру' : line.group === 'cornice' ? 'к карнизу' : line.group === 'ac' ? 'к кондиционеру' : line.id.startsWith('sw-') ? 'к выключателю' : 'к светильникам';
  const i = Math.floor(line.points.length / 2);
  const a = line.points[Math.max(0, i - 1)];
  const b = line.points[i];
  return (
    <Html position={[(a[0] + b[0]) / 2, (a[1] + b[1]) / 2 + 0.06, (a[2] + b[2]) / 2]} center zIndexRange={[2, 1]}>
      <div className={`el-branch ${line.group}`}>{text}</div>
    </Html>
  );
}
