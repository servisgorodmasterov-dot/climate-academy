// Режим «Электрика»: квартира прозрачная, видны щит, кабели и точки. Схема строится из планировки
// и количества точек в карточке «Электрика» каждой комнаты. Наведение — подпись кабеля (марка, сечение, автомат).
import { Html, Line } from '@react-three/drei';
import { useMemo } from 'react';
import * as THREE from 'three';
import type { Layout } from '../../core/types';
import { buildElectricScheme, countsFromSections, type ElLine, type ElPoint } from '../electric';
import { useApp } from '../../store';

// цвета заметно разные: магистраль синяя, розетки оранжевые, свет жёлтый, силовые красные
const COLORS: Record<ElLine['group'], string> = { trunk: '#1e6fff', sockets: '#ff6a00', light: '#ffc400', power: '#e0102a' };
const WIDTH: Record<ElLine['group'], number> = { trunk: 5.5, sockets: 3, light: 2.4, power: 3.8 };

const socketMat = new THREE.MeshStandardMaterial({ color: '#fff7e0', roughness: 0.4, emissive: '#ff6a00', emissiveIntensity: 0.5 });
const switchMat = new THREE.MeshStandardMaterial({ color: '#fffbe8', roughness: 0.4, emissive: '#ffc400', emissiveIntensity: 0.5 });
const lightMat = new THREE.MeshBasicMaterial({ color: '#ffc400' });
const powerMat = new THREE.MeshStandardMaterial({ color: '#ffe3e0', roughness: 0.4, emissive: '#e53935', emissiveIntensity: 0.4 });
const panelMat = new THREE.MeshStandardMaterial({ color: '#1e6fff', roughness: 0.5, emissive: '#1e6fff', emissiveIntensity: 0.35 });

export function ElectricScene({ layout, focusRoom, onPickRoom }: { layout: Layout; focusRoom: string | null; onPickRoom: (roomId: string) => void }) {
  const sections = useApp((s) => s.sections);
  const apartmentId = useApp((s) => s.apartmentId);
  const products = useApp((s) => s.catalog?.products);
  const hover = useApp((s) => s.hover);
  const scheme = useMemo(() => buildElectricScheme(layout, countsFromSections(layout, sections as any, apartmentId, products)), [layout, sections, apartmentId, products]);
  const dim = (roomId: string) => focusRoom != null && roomId !== focusRoom && roomId !== '';
  const setHover = (id: string | null) => useApp.getState().set('hover', id);

  return (
    <group>
      {scheme.lines.map((l) => {
        const faded = dim(l.roomId);
        const on = hover === `el:${l.id}`;
        return (
          <group key={l.id}>
            <Line points={l.points} color={COLORS[l.group]} lineWidth={on ? WIDTH[l.group] + 2 : WIDTH[l.group]} transparent opacity={faded ? 0.12 : on ? 1 : 0.9} depthTest={false} renderOrder={5} />
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
                  <b>{l.cable}</b>
                  <span>{l.label}</span>
                </div>
              </Html>
            )}
          </group>
        );
      })}
      {scheme.points.map((p) => (
        <ElPointMesh key={p.id} p={p} faded={dim(p.roomId)} hovered={hover === `el:${p.id}`} onHover={(h) => setHover(h ? `el:${p.id}` : null)} onClick={() => p.roomId && onPickRoom(p.roomId)} />
      ))}
      {/* подписи кабеля у магистралей комнат */}
      {scheme.lines
        .filter((l) => l.group === 'trunk' && !dim(l.roomId))
        .map((l) => (
          <Html key={`lbl-${l.id}`} position={[l.points[3][0], l.points[3][1] + 0.12, l.points[3][2]]} center zIndexRange={[2, 1]}>
            <div className="el-label">{l.cable}</div>
          </Html>
        ))}
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
  const mat = p.kind === 'switch' ? switchMat : p.kind === 'power' ? powerMat : socketMat;
  return (
    <group position={p.position} rotation={[0, rot, 0]}>
      <mesh material={mat} {...common} renderOrder={6}>
        <boxGeometry args={[p.kind === 'power' ? 0.12 : 0.09, p.kind === 'power' ? 0.12 : 0.09, 0.03]} />
      </mesh>
      {tip}
    </group>
  );
}
