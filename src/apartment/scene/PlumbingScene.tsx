// Режим «Сантехника»: квартира прозрачная, видны стояк, узел ввода, коллектор, трубы холодной и горячей воды
// к каждому прибору и канализация к стояку. Наведение — материал и диаметр трубы; пошаговое объяснение.
import { Html, Line } from '@react-three/drei';
import { useMemo } from 'react';
import * as THREE from 'three';
import type { Layout } from '../../core/types';
import { buildPlumbingScheme, type PlGroup, type PlLine, type PlPoint } from '../plumbing';
import { useApp } from '../../store';
import { Flow } from './ElectricScene';

export const PL_COLORS: Record<PlGroup, string> = { cold: '#1e88e5', hot: '#e53935', sewer: '#8d6e63', riser: '#607d8b' };
const WIDTH: Record<PlGroup, number> = { cold: 3.2, hot: 3.2, sewer: 6, riser: 6 };

/** Шаги объяснения: что видно на каждом. */
const STEP_LINES: Record<number, (l: PlLine) => boolean> = {
  1: (l) => l.id.startsWith('riser'),
  2: (l) => l.id.startsWith('riser') || l.id.startsWith('in-'),
  3: (l) => l.id.startsWith('riser') || l.id.startsWith('in-') || l.id.startsWith('meter-'),
  4: (l) => l.group === 'cold' || l.id.startsWith('riser') || l.id.startsWith('in-') || l.id.startsWith('meter-'),
  5: (l) => l.group !== 'sewer' || l.id.startsWith('riser'),
  6: () => true,
};
const STEP_POINTS: Record<number, PlPoint['kind'][]> = { 1: ['riser'], 2: ['riser', 'meter'], 3: ['riser', 'meter', 'manifold'], 4: ['riser', 'meter', 'manifold', 'fixture'], 5: ['riser', 'meter', 'manifold', 'fixture'], 6: ['riser', 'meter', 'manifold', 'fixture'] };

const meterMat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.4, emissive: '#1e88e5', emissiveIntensity: 0.2 });
const manifoldMat = new THREE.MeshStandardMaterial({ color: '#d4a64a', roughness: 0.35, metalness: 0.5 });
const fixtureMat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.3, emissive: '#1e88e5', emissiveIntensity: 0.15 });

export function PlumbingScene({ layout, focusRoom }: { layout: Layout; focusRoom: string | null }) {
  const step = useApp((s) => s.electricStep);
  const hover = useApp((s) => s.hover);
  const scheme = useMemo(() => buildPlumbingScheme(layout), [layout]);
  const setHover = (id: string | null) => useApp.getState().set('hover', id);
  const dim = (roomId: string) => focusRoom != null && roomId !== focusRoom;
  const showLine = (l: PlLine) => step === 0 || (STEP_LINES[step]?.(l) ?? true);
  const showPoint = (p: PlPoint) => step === 0 || (STEP_POINTS[step] ?? []).includes(p.kind);

  return (
    <group>
      {scheme.lines.filter(showLine).map((l) => {
        const faded = dim(l.roomId);
        const on = hover === `pl:${l.id}`;
        return (
          <group key={l.id}>
            <Line points={l.points} color={PL_COLORS[l.group]} lineWidth={on ? WIDTH[l.group] + 2 : WIDTH[l.group]} transparent opacity={faded ? 0.12 : 0.92} depthTest={false} renderOrder={5} />
            {!faded && !l.id.startsWith('riser') && <Flow points={l.points} color={l.group === 'sewer' ? '#c9a593' : PL_COLORS[l.group]} />}
            <Line
              points={l.points}
              color="#000"
              lineWidth={16}
              transparent
              opacity={0}
              depthTest={false}
              onPointerOver={(e) => {
                e.stopPropagation();
                setHover(`pl:${l.id}`);
                document.body.style.cursor = 'help';
              }}
              onPointerOut={() => {
                setHover(null);
                document.body.style.cursor = '';
              }}
            />
            {on && (
              <Html position={l.points[Math.floor(l.points.length / 2)]} center zIndexRange={[3, 2]}>
                <div className="el-tip" style={{ borderColor: PL_COLORS[l.group] }}>
                  <b>{l.pipe}</b>
                  <span>{l.label}</span>
                </div>
              </Html>
            )}
          </group>
        );
      })}
      {scheme.points.filter(showPoint).map((p) => (
        <PlPointMesh key={p.id} p={p} faded={dim(p.roomId)} hovered={hover === `pl:${p.id}`} onHover={(h) => setHover(h ? `pl:${p.id}` : null)} />
      ))}
    </group>
  );
}

function PlPointMesh({ p, faded, hovered, onHover }: { p: PlPoint; faded: boolean; hovered: boolean; onHover: (h: boolean) => void }) {
  const ev = {
    onPointerOver: (e: any) => {
      e.stopPropagation();
      onHover(true);
      document.body.style.cursor = 'help';
    },
    onPointerOut: () => {
      onHover(false);
      document.body.style.cursor = '';
    },
  };
  return (
    <group position={p.position}>
      {p.kind === 'meter' && (
        <mesh material={meterMat} {...ev} renderOrder={6}>
          <boxGeometry args={[0.16, 0.16, 0.08]} />
        </mesh>
      )}
      {p.kind === 'manifold' && (
        <mesh material={manifoldMat} {...ev} rotation={[0, 0, Math.PI / 2]} renderOrder={6}>
          <cylinderGeometry args={[0.03, 0.03, 0.4, 12]} />
        </mesh>
      )}
      {p.kind === 'fixture' && (
        <mesh material={fixtureMat} {...ev} renderOrder={6}>
          <sphereGeometry args={[0.05, 12, 8]} />
        </mesh>
      )}
      {p.kind === 'riser' && (
        <mesh {...ev}>
          <boxGeometry args={[0.35, 0.35, 0.35]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
      )}
      {!faded && p.short && (
        <Html position={[0, p.kind === 'fixture' ? 0.12 : 0.18, 0]} center zIndexRange={[2, 1]}>
          <div className={`pl-label ${p.kind}`}>{p.short}</div>
        </Html>
      )}
      {hovered && (
        <Html position={[0, -0.14, 0]} center zIndexRange={[3, 2]}>
          <div className="el-tip" style={{ whiteSpace: 'normal', width: 260 }}>
            <b>{p.short}</b>
            <span>{p.label}</span>
          </div>
        </Html>
      )}
    </group>
  );
}
