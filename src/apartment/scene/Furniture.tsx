// Процедурная мебель — временные модели. Их нужно заменить GLB-моделями (список и требования — docs/ASSETS.md).
import { RoundedBox, useGLTF } from '@react-three/drei';
import { Component, Suspense, useMemo, type ReactNode } from 'react';
import * as THREE from 'three';
import type { FurnitureItem } from '../../core/types';
import { fabricTexture, sized } from './textures';
import { TAP_THRESHOLD_PX } from '../objects';
import { useApp } from '../../store';

const setHover = (id: string | null) => useApp.getState().set('hover', id);

/** Атрибуты внешнего вида из выбранного товара (facade, top, fabric, handle, style, mirror, tall). */
export type Look = Record<string, string>;
const hitMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });
const selMat = new THREE.MeshBasicMaterial({ color: '#0066fa', transparent: true, opacity: 0.05, depthWrite: false });
const selEdge = new THREE.LineBasicMaterial({ color: '#0066fa' });
const hoverEdge = new THREE.LineBasicMaterial({ color: '#7fb0ff', transparent: true, opacity: 0.9 });
function useColorMat(color: string | undefined, fallback: THREE.MeshStandardMaterial, rough = 0.5) {
  return useMemo(() => (color ? new THREE.MeshStandardMaterial({ color, roughness: rough }) : fallback), [color, fallback, rough]);
}

const M = {
  wood: new THREE.MeshStandardMaterial({ color: '#9a7350', roughness: 0.6 }),
  woodLight: new THREE.MeshStandardMaterial({ color: '#cdb08a', roughness: 0.6 }),
  white: new THREE.MeshStandardMaterial({ color: '#f6f4f0', roughness: 0.35 }),
  whiteMatte: new THREE.MeshStandardMaterial({ color: '#eceae5', roughness: 0.8 }),
  graphite: new THREE.MeshStandardMaterial({ color: '#33373d', roughness: 0.5 }),
  black: new THREE.MeshStandardMaterial({ color: '#16181b', roughness: 0.25, metalness: 0.2 }),
  steel: new THREE.MeshStandardMaterial({ color: '#d3d7dc', roughness: 0.3, metalness: 0.35 }),
  stone: new THREE.MeshStandardMaterial({ color: '#d9d5cd', roughness: 0.3 }),
  ceramic: new THREE.MeshPhysicalMaterial({ color: '#ffffff', roughness: 0.12, clearcoat: 0.8 }),
  leaf: new THREE.MeshStandardMaterial({ color: '#4f7d4a', roughness: 0.8 }),
  pot: new THREE.MeshStandardMaterial({ color: '#c8b8a2', roughness: 0.9 }),
  lampShade: new THREE.MeshStandardMaterial({ color: '#fff3dc', roughness: 0.9, emissive: '#ffdca0', emissiveIntensity: 0.35 }),
  screen: new THREE.MeshStandardMaterial({ color: '#0d0f12', roughness: 0.15, metalness: 0.3 }),
};

function useFabric(color: string, w = 1, h = 1) {
  return useMemo(() => new THREE.MeshStandardMaterial({ map: sized(fabricTexture(color), w, h), roughness: 1 }), [color, w, h]);
}

const RB = ({ args, position, material, radius = 0.03, cast = true }: { args: [number, number, number]; position: [number, number, number]; material: THREE.Material; radius?: number; cast?: boolean }) => (
  <RoundedBox args={args} position={position} radius={Math.min(radius, Math.min(...args) / 2.1)} smoothness={3} castShadow={cast} receiveShadow material={material} />
);
const B = ({ args, position, material, cast = true }: { args: [number, number, number]; position: [number, number, number]; material: THREE.Material; cast?: boolean }) => (
  <mesh position={position} castShadow={cast} receiveShadow material={material}>
    <boxGeometry args={args} />
  </mesh>
);

function Sofa({ look = {} }: { look?: Look }) {
  const base = look.fabric ?? '#7d8794';
  const fab = useFabric(base, 2, 1);
  const cush = useFabric(useMemo(() => `#${new THREE.Color(base).multiplyScalar(1.08).getHexString()}`, [base]), 1, 1);
  return (
    <group>
      <RB args={[2.2, 0.42, 0.95]} position={[0, 0.25, 0]} material={fab} radius={0.06} />
      <RB args={[2.2, 0.45, 0.2]} position={[0, 0.62, 0.38]} material={fab} radius={0.08} />
      <RB args={[0.2, 0.3, 0.95]} position={[-1.0, 0.55, 0]} material={fab} radius={0.08} />
      <RB args={[0.2, 0.3, 0.95]} position={[1.0, 0.55, 0]} material={fab} radius={0.08} />
      {[-0.45, 0.45].map((x) => (
        <RB key={x} args={[0.88, 0.14, 0.7]} position={[x, 0.52, -0.06]} material={cush} radius={0.06} />
      ))}
      {[-0.55, 0.55].map((x) => (
        <RB key={`b${x}`} args={[0.42, 0.38, 0.12]} position={[x, 0.75, 0.24]} material={cush} radius={0.06} />
      ))}
      {[-1, 1].flatMap((x) => [-1, 1].map((z) => <B key={`${x}${z}`} args={[0.04, 0.05, 0.04]} position={[x * 1.02, 0.02, z * 0.4]} material={M.wood} />))}
    </group>
  );
}

function Armchair() {
  const fab = useFabric('#c7b39a', 1, 1);
  return (
    <group>
      <RB args={[0.8, 0.4, 0.8]} position={[0, 0.25, 0]} material={fab} radius={0.06} />
      <RB args={[0.8, 0.45, 0.16]} position={[0, 0.62, 0.32]} material={fab} radius={0.07} />
      <RB args={[0.14, 0.25, 0.8]} position={[-0.33, 0.55, 0]} material={fab} radius={0.06} />
      <RB args={[0.14, 0.25, 0.8]} position={[0.33, 0.55, 0]} material={fab} radius={0.06} />
    </group>
  );
}

function CoffeeTable() {
  return (
    <group>
      <RB args={[1.0, 0.04, 0.6]} position={[0, 0.42, 0]} material={M.woodLight} radius={0.015} />
      <B args={[0.9, 0.02, 0.5]} position={[0, 0.15, 0]} material={M.woodLight} />
      {[-1, 1].flatMap((x) => [-1, 1].map((z) => <B key={`${x}${z}`} args={[0.03, 0.4, 0.03]} position={[x * 0.46, 0.2, z * 0.26]} material={M.graphite} />))}
    </group>
  );
}

function TvStand() {
  return (
    <group>
      <RB args={[1.8, 0.45, 0.42]} position={[0, 0.3, 0]} material={M.white} radius={0.015} />
      <B args={[1.78, 0.06, 0.4]} position={[0, 0.05, 0]} material={M.graphite} />
      <RB args={[1.45, 0.83, 0.045]} position={[0, 1.3, 0.15]} material={M.black} radius={0.01} />
      <B args={[1.41, 0.79, 0.005]} position={[0, 1.3, 0.125]} material={M.screen} />
    </group>
  );
}

function Rug({ size = [2, 1.5] }: { size?: [number, number] }) {
  const fab = useFabric('#d9d2c6', size[0], size[1]);
  return <B args={[size[0], 0.012, size[1]]} position={[0, 0.006, 0]} material={fab} cast={false} />;
}

function Plant() {
  return (
    <group>
      <mesh position={[0, 0.2, 0]} material={M.pot} castShadow>
        <cylinderGeometry args={[0.17, 0.13, 0.4, 24]} />
      </mesh>
      {Array.from({ length: 9 }).map((_, i) => (
        <mesh key={i} position={[Math.cos(i * 2.4) * 0.12, 0.55 + (i % 3) * 0.17, Math.sin(i * 2.4) * 0.12]} rotation={[Math.cos(i) * 0.6, i, Math.sin(i) * 0.6]} material={M.leaf} castShadow>
          <sphereGeometry args={[0.16, 10, 8]} />
        </mesh>
      ))}
    </group>
  );
}

function FloorLamp() {
  return (
    <group>
      <mesh position={[0, 0.015, 0]} material={M.graphite}>
        <cylinderGeometry args={[0.16, 0.16, 0.03, 24]} />
      </mesh>
      <mesh position={[0, 0.8, 0]} material={M.graphite}>
        <cylinderGeometry args={[0.012, 0.012, 1.6, 8]} />
      </mesh>
      <mesh position={[0, 1.6, 0]} material={M.lampShade}>
        <cylinderGeometry args={[0.15, 0.22, 0.3, 24, 1, true]} />
      </mesh>
      <pointLight position={[0, 1.55, 0]} intensity={0.6} distance={3} color="#ffd9a0" />
    </group>
  );
}

function Bed({ look = {} }: { look?: Look }) {
  const linen = useFabric('#eef0f2', 2, 2);
  const blanket = useFabric('#9fb2c4', 2, 1.4);
  const pillow = useFabric('#ffffff', 1, 1);
  const soft = look.style === 'soft';
  const head = useFabric(look.fabric ?? '#8d94a0', 1, 1);
  const frame = useColorMat(soft ? look.fabric : look.fabric, M.wood, soft ? 0.9 : 0.6);
  return (
    <group>
      <RB args={[1.7, 0.3, 2.15]} position={[0, 0.17, 0]} material={soft ? head : frame} radius={soft ? 0.06 : 0.02} />
      <RB args={soft ? [1.8, 1.1, 0.14] : [1.7, 0.95, 0.08]} position={[0, soft ? 0.6 : 0.55, -1.08]} material={soft ? head : frame} radius={soft ? 0.06 : 0.02} />
      <RB args={[1.6, 0.22, 2.0]} position={[0, 0.42, 0.02]} material={linen} radius={0.06} />
      <RB args={[1.64, 0.06, 1.35]} position={[0, 0.54, 0.35]} material={blanket} radius={0.03} />
      {[-0.4, 0.4].map((x) => (
        <RB key={x} args={[0.62, 0.14, 0.38]} position={[x, 0.6, -0.78]} material={pillow} radius={0.06} />
      ))}
    </group>
  );
}

function Nightstand() {
  return (
    <group>
      <RB args={[0.45, 0.48, 0.4]} position={[0, 0.26, 0]} material={M.white} radius={0.01} />
      <B args={[0.47, 0.02, 0.42]} position={[0, 0.51, 0]} material={M.woodLight} />
      <mesh position={[0, 0.66, 0]} material={M.lampShade} castShadow>
        <cylinderGeometry args={[0.08, 0.11, 0.18, 20]} />
      </mesh>
    </group>
  );
}

const mirrorMat = new THREE.MeshStandardMaterial({ color: '#dfe8ee', metalness: 0.6, roughness: 0.05 });
function Wardrobe({ length = 2, look = {} }: { length?: number; look?: Look }) {
  const slide = look.style === 'slide';
  const doors = slide ? 2 : Math.max(2, Math.round(length / 0.5));
  const facade = useColorMat(look.facade, M.white, 0.4);
  const body = useColorMat(look.facade ? `#${new THREE.Color(look.facade).multiplyScalar(0.92).getHexString()}` : undefined, M.whiteMatte, 0.8);
  return (
    <group>
      <B args={[length, 2.4, 0.6]} position={[0, 1.2, 0]} material={body} />
      {Array.from({ length: doors }).map((_, i) => {
        const w = length / doors;
        const mirror = look.mirror === '1' && i === doors - 1;
        return (
          <group key={i}>
            <B args={[w - (slide ? 0.02 : 0.006), 2.36, 0.02]} position={[-length / 2 + w / 2 + i * w, 1.2, slide ? 0.305 + (i % 2) * 0.025 : 0.305]} material={mirror ? mirrorMat : facade} cast={false} />
            {!slide && <B args={[0.012, 0.3, 0.02]} position={[-length / 2 + i * w + (i % 2 ? 0.04 : w - 0.04), 1.15, 0.325]} material={M.steel} cast={false} />}
            {slide && <B args={[0.02, 2.36, 0.012]} position={[-length / 2 + i * w + (i % 2 ? 0.02 : w - 0.02), 1.2, 0.32 + (i % 2) * 0.025]} material={M.steel} cast={false} />}
          </group>
        );
      })}
    </group>
  );
}

function Fridge() {
  return (
    <group>
      <RB args={[0.6, 2.0, 0.65]} position={[0, 1.0, 0]} material={M.steel} radius={0.02} />
      <B args={[0.58, 0.004, 0.02]} position={[0, 1.25, 0.33]} material={M.graphite} cast={false} />
      <B args={[0.02, 0.4, 0.03]} position={[0.24, 1.5, 0.34]} material={M.graphite} />
      <B args={[0.02, 0.4, 0.03]} position={[0.24, 0.95, 0.34]} material={M.graphite} />
    </group>
  );
}

/**
 * Кухня из настоящих 3D-модулей (Furniture Kit by Kenney, CC0): нижние шкафы, ящики, мойка, плита,
 * навесные шкафы, вытяжка, холодильник. Модули у Kenney в масштабе 0.43 м за секцию — умножаем на K,
 * чтобы секция стала 60 см, а столешница — 90 см. Цвета материалов перекрашиваются под выбранный товар:
 * wood/woodDark → фасад, metal → ручки, столешница рисуется своя (цвет из каталога).
 */
const KIT_BASE = './models/kitchen/';
const KIT_K = 0.6 / 0.43; // секция 60 см
const KIT_MODULES = ['kitchenCabinet', 'kitchenCabinetDrawer', 'kitchenSink', 'kitchenStove', 'kitchenCabinetUpper', 'kitchenCabinetUpperDouble', 'hoodModern', 'kitchenFridge'] as const;
type KitModule = (typeof KIT_MODULES)[number];

function useKitModule(name: KitModule, look: Look) {
  const { scene } = useGLTF(`${KIT_BASE}${name}.glb`, true);
  return useMemo(() => {
    const o = scene.clone(true);
    const facade = look.facade ? new THREE.Color(look.facade) : null;
    const dark = facade ? facade.clone().multiplyScalar(0.82) : null;
    const handle = look.handle ? new THREE.Color(look.handle) : null;
    const rough = look.style === 'panel' ? 0.65 : 0.4;
    o.traverse((c) => {
      const m = c as THREE.Mesh;
      if (!m.isMesh) return;
      m.castShadow = true;
      m.receiveShadow = true;
      const src = m.material as THREE.MeshStandardMaterial;
      const mat = src.clone();
      const n = src.name;
      if (n === 'wood' && facade) mat.color.copy(facade), (mat.roughness = rough);
      else if (n === 'woodDark') {
        if (dark) mat.color.copy(dark);
        mat.roughness = rough;
      } else if (n === 'metal') {
        if (handle) mat.color.copy(handle);
        mat.metalness = 0.6;
        mat.roughness = 0.35;
      } else if (n === 'metalLight' || n === 'metalMedium' || n === 'metalDark') {
        mat.metalness = 0.5;
        mat.roughness = 0.3;
      } else if (n === 'glass') {
        mat.transparent = true;
        mat.opacity = 0.5;
        mat.roughness = 0.1;
      }
      m.material = mat;
    });
    // в локальных координатах модуля: X от 0 до 0.43 (вправо), Z от -глубины до ~0 (перед — у Z≈0)
    o.scale.setScalar(KIT_K);
    return o;
  }, [scene, look.facade, look.handle, look.style]);
}

/** Один модуль, поставленный левым краем в x, передом к +Z. */
function KitPiece({ name, x, y = 0, look, mirror }: { name: KitModule; x: number; y?: number; look: Look; mirror?: boolean }) {
  const obj = useKitModule(name, look);
  const inst = useMemo(() => obj.clone(true), [obj]);
  // модуль нарисован передом к -Z... у Kenney фасад смотрит в +Z (bbox по Z: -0.48..0), поэтому разворот не нужен; сдвигаем так, чтобы задняя стенка была у Z = -0.3
  return <primitive object={inst} position={[x + (mirror ? 0.6 : 0), y, 0.3]} rotation={[0, mirror ? Math.PI : 0, 0]} scale={mirror ? [-1, 1, 1] : [1, 1, 1]} />;
}

function KitchenRunGlb({ length = 2.3, sink = 0.6, stove = -0.3, look = {} }: { length?: number; sink?: number; stove?: number; look?: Look }) {
  const n = Math.max(2, Math.round(length / 0.6));
  const w = length / n; // реальная ширина секции под длину ряда
  const top = useColorMat(look.top, M.stone, look.top && look.top < '#888888' ? 0.2 : 0.3);
  const upper = look.upper !== undefined ? look.upper === '1' : true;
  const tall = look.tall === '1';
  const sinkIdx = Math.min(n - 1, Math.max(0, Math.round((sink + length / 2) / w - 0.5)));
  let stoveIdx = Math.min(n - 1, Math.max(0, Math.round((stove + length / 2) / w - 0.5)));
  if (stoveIdx === sinkIdx) stoveIdx = stoveIdx === 0 ? 1 : stoveIdx - 1;
  const kind = (i: number): KitModule => (i === sinkIdx ? 'kitchenSink' : i === stoveIdx ? 'kitchenStove' : i % 2 ? 'kitchenCabinetDrawer' : 'kitchenCabinet');
  const sx = w / 0.6; // растяжение секции до нужной ширины
  return (
    <group>
      {/* цоколь */}
      <B args={[length, 0.1, 0.55]} position={[0, 0.05, -0.02]} material={M.graphite} />
      {/* нижний ряд */}
      {Array.from({ length: n }).map((_, i) => (
        <group key={i} position={[-length / 2 + i * w, 0, 0]} scale={[sx, 1, 1]}>
          <KitPiece name={kind(i)} x={0} look={look} />
        </group>
      ))}
      {/* столешница из каталога (цвет выбранного товара) */}
      <B args={[length + 0.02, 0.04, 0.62]} position={[0, 0.9, 0.01]} material={top} />
      {/* фартук */}
      <B args={[length, 0.6, 0.02]} position={[0, 1.2, -0.3]} material={top} cast={false} />
      {/* навесные шкафы: над плитой — вытяжка, остальные секции — шкафы */}
      {upper &&
        Array.from({ length: n }).map((_, i) => (
          <group key={`u${i}`} position={[-length / 2 + i * w, tall ? 1.5 : 1.5, 0]} scale={[sx, tall ? 1.3 : 1, 1]}>
            {i === stoveIdx ? <KitPiece name="hoodModern" x={0} y={0.1} look={look} /> : <KitPiece name="kitchenCabinetUpper" x={0} look={look} />}
          </group>
        ))}
    </group>
  );
}

/** Пока модули грузятся или если файл недоступен — старая упрощённая кухня. */
function KitchenRun(props: { length?: number; sink?: number; stove?: number; look?: Look }) {
  return (
    <ModelBoundary fallback={<KitchenRunSimple {...props} />}>
      <Suspense fallback={<KitchenRunSimple {...props} />}>
        <KitchenRunGlb {...props} />
      </Suspense>
    </ModelBoundary>
  );
}

function KitchenRunSimple({ length = 2.3, sink = 0.6, stove = -0.3, look = {} }: { length?: number; sink?: number; stove?: number; look?: Look }) {
  const n = Math.max(2, Math.round(length / 0.6));
  const facade = useColorMat(look.facade, M.whiteMatte, look.style === 'panel' ? 0.6 : 0.35);
  const body = useColorMat(look.facade ? `#${new THREE.Color(look.facade).multiplyScalar(0.9).getHexString()}` : undefined, M.white, 0.5);
  const top = useColorMat(look.top, M.stone, look.top && look.top < '#888888' ? 0.2 : 0.3);
  const handle = useColorMat(look.handle, M.steel, 0.3);
  const upper = look.upper !== undefined ? look.upper === '1' : true;
  const upperH = look.tall === '1' ? 0.92 : 0.7;
  return (
    <group>
      <B args={[length, 0.1, 0.55]} position={[0, 0.05, -0.02]} material={M.graphite} />
      <B args={[length, 0.76, 0.58]} position={[0, 0.48, 0]} material={body} />
      {Array.from({ length: n }).map((_, i) => (
        <group key={i}>
          <B args={[length / n - 0.008, 0.72, 0.02]} position={[-length / 2 + (i + 0.5) * (length / n), 0.48, 0.3]} material={facade} cast={false} />
          {look.style === 'panel' && <B args={[length / n - 0.09, 0.6, 0.008]} position={[-length / 2 + (i + 0.5) * (length / n), 0.48, 0.315]} material={facade} cast={false} />}
          {look.handle && <B args={[0.16, 0.012, 0.03]} position={[-length / 2 + (i + 0.5) * (length / n), 0.78, 0.325]} material={handle} cast={false} />}
        </group>
      ))}
      <B args={[length + 0.02, 0.04, 0.62]} position={[0, 0.88, 0.01]} material={top} />
      {/* мойка */}
      <B args={[0.5, 0.012, 0.42]} position={[sink, 0.905, 0.02]} material={M.steel} />
      <mesh position={[sink, 1.0, -0.2]} material={M.steel}>
        <cylinderGeometry args={[0.015, 0.015, 0.22, 10]} />
      </mesh>
      {/* варочная панель */}
      <B args={[0.58, 0.01, 0.5]} position={[stove, 0.905, 0.02]} material={M.black} />
      {/* фартук и верхние шкафы */}
      <B args={[length, 0.6, 0.02]} position={[0, 1.2, -0.3]} material={top} cast={false} />
      {upper && <B args={[length, upperH, 0.33]} position={[0, 1.5 + upperH / 2, -0.14]} material={facade} />}
      {/* вытяжка */}
      <B args={[0.6, 0.12, 0.45]} position={[stove, 1.45, -0.08]} material={M.steel} />
    </group>
  );
}

function DiningTable() {
  const chairFab = useFabric('#b9a58b', 1, 1);
  return (
    <group>
      <RB args={[1.2, 0.04, 0.8]} position={[0, 0.75, 0]} material={M.woodLight} radius={0.015} />
      {[-1, 1].flatMap((x) => [-1, 1].map((z) => <B key={`${x}${z}`} args={[0.04, 0.73, 0.04]} position={[x * 0.54, 0.365, z * 0.34]} material={M.wood} />))}
      {[
        [-0.3, -0.62, 0],
        [0.3, -0.62, 0],
        [-0.3, 0.62, Math.PI],
        [0.3, 0.62, Math.PI],
      ].map(([x, z, r], i) => (
        <group key={i} position={[x, 0, z]} rotation={[0, r, 0]}>
          <RB args={[0.42, 0.05, 0.42]} position={[0, 0.46, 0]} material={chairFab} radius={0.02} />
          <RB args={[0.42, 0.4, 0.04]} position={[0, 0.7, -0.19]} material={chairFab} radius={0.02} />
          {[-1, 1].flatMap((a) => [-1, 1].map((b) => <B key={`${a}${b}`} args={[0.025, 0.45, 0.025]} position={[a * 0.18, 0.22, b * 0.18]} material={M.wood} />))}
        </group>
      ))}
    </group>
  );
}

function Bathtub() {
  return (
    <group>
      <RB args={[1.7, 0.56, 0.75]} position={[0, 0.28, 0]} material={M.ceramic} radius={0.05} />
      <RB args={[1.55, 0.05, 0.6]} position={[0, 0.535, 0]} material={new THREE.MeshStandardMaterial({ color: '#dde6ea', roughness: 0.1 })} radius={0.02} cast={false} />
      <mesh position={[-0.7, 0.75, 0.3]} material={M.steel}>
        <cylinderGeometry args={[0.015, 0.015, 0.4, 10]} />
      </mesh>
    </group>
  );
}

function Toilet() {
  // напольный унитаз-компакт: чаша со скруглённой передней частью, крышка и сиденье, бачок с кнопкой
  const bowl = useMemo(() => {
    const shape = new THREE.Shape();
    shape.moveTo(-0.18, -0.1);
    shape.lineTo(0.18, -0.1);
    shape.absarc(0, 0.12, 0.19, -Math.PI / 2 + 0.3, Math.PI / 2 - 0.3, false);
    shape.lineTo(-0.18, -0.1);
    return new THREE.ExtrudeGeometry(shape, { depth: 0.38, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.02, bevelSegments: 4, curveSegments: 24 });
  }, []);
  const seat = useMemo(() => {
    const shape = new THREE.Shape();
    shape.absellipse(0, 0.08, 0.195, 0.24, 0, Math.PI * 2, false, 0);
    const hole = new THREE.Path();
    hole.absellipse(0, 0.1, 0.11, 0.15, 0, Math.PI * 2, true, 0);
    shape.holes.push(hole);
    return new THREE.ExtrudeGeometry(shape, { depth: 0.025, bevelEnabled: true, bevelThickness: 0.008, bevelSize: 0.008, bevelSegments: 3, curveSegments: 32 });
  }, []);
  return (
    <group>
      {/* чаша: экструзия вдоль Y */}
      <mesh geometry={bowl} material={M.ceramic} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0.06]} castShadow receiveShadow />
      {/* ободок и сиденье */}
      <mesh geometry={seat} material={M.ceramic} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.405, 0.06]} castShadow />
      <mesh geometry={seat} material={new THREE.MeshStandardMaterial({ color: '#f7f7f5', roughness: 0.3 })} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.435, 0.06]} castShadow />
      {/* крышка — приоткрыта к бачку */}
      <group position={[0, 0.46, -0.17]} rotation={[-1.35, 0, 0]}>
        <RB args={[0.4, 0.5, 0.025]} position={[0, 0.25, 0]} material={M.ceramic} radius={0.04} />
      </group>
      {/* бачок */}
      <RB args={[0.4, 0.4, 0.17]} position={[0, 0.62, -0.26]} material={M.ceramic} radius={0.03} />
      <RB args={[0.42, 0.03, 0.19]} position={[0, 0.835, -0.26]} material={M.ceramic} radius={0.01} />
      <mesh position={[0, 0.855, -0.26]} material={M.steel}>
        <cylinderGeometry args={[0.028, 0.028, 0.012, 24]} />
      </mesh>
      <mesh position={[0, 0.862, -0.26]} material={M.steel}>
        <boxGeometry args={[0.004, 0.006, 0.05]} />
      </mesh>
    </group>
  );
}

function Vanity() {
  return (
    <group>
      <RB args={[0.7, 0.5, 0.45]} position={[0, 0.55, 0]} material={M.woodLight} radius={0.01} />
      <RB args={[0.72, 0.12, 0.47]} position={[0, 0.86, 0]} material={M.ceramic} radius={0.03} />
      <B args={[0.6, 0.8, 0.02]} position={[0, 1.6, -0.22]} material={new THREE.MeshStandardMaterial({ color: '#dfeaef', metalness: 0.25, roughness: 0.08 })} />
    </group>
  );
}

function Washer() {
  // стиральная машина с фронтальной загрузкой: корпус, панель, люк с кольцом и стеклом, лоток, ножки
  const glass = useMemo(() => new THREE.MeshPhysicalMaterial({ color: '#8fa6b4', transmission: 0.55, transparent: true, opacity: 0.7, roughness: 0.08, metalness: 0.1, clearcoat: 1 }), []);
  const drum = useMemo(() => new THREE.MeshStandardMaterial({ color: '#b8bec4', metalness: 0.8, roughness: 0.35 }), []);
  return (
    <group>
      <RB args={[0.6, 0.85, 0.58]} position={[0, 0.455, 0]} material={M.white} radius={0.02} />
      {/* ножки и цоколь */}
      <B args={[0.56, 0.05, 0.5]} position={[0, 0.025, -0.02]} material={M.graphite} />
      {/* верхняя крышка */}
      <RB args={[0.61, 0.02, 0.59]} position={[0, 0.885, 0]} material={M.white} radius={0.005} />
      {/* панель управления */}
      <B args={[0.56, 0.1, 0.012]} position={[0, 0.82, 0.295]} material={new THREE.MeshStandardMaterial({ color: '#e9ebee', roughness: 0.4 })} />
      <mesh position={[0.17, 0.82, 0.305]} rotation={[Math.PI / 2, 0, 0]} material={M.graphite}>
        <cylinderGeometry args={[0.03, 0.03, 0.012, 24]} />
      </mesh>
      <B args={[0.12, 0.03, 0.004]} position={[-0.05, 0.82, 0.302]} material={new THREE.MeshStandardMaterial({ color: '#223', emissive: '#4ad1ff', emissiveIntensity: 0.6 })} />
      {/* лоток для порошка */}
      <B args={[0.14, 0.04, 0.01]} position={[-0.19, 0.82, 0.302]} material={M.steel} />
      {/* люк: кольцо, стекло, барабан внутри */}
      <mesh position={[0, 0.42, 0.295]} rotation={[Math.PI / 2, 0, 0]} material={M.graphite}>
        <torusGeometry args={[0.19, 0.03, 12, 48]} />
      </mesh>
      <mesh position={[0, 0.42, 0.3]} rotation={[Math.PI / 2, 0, 0]} material={glass}>
        <sphereGeometry args={[0.165, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2.6]} />
      </mesh>
      <mesh position={[0, 0.42, 0.2]} rotation={[Math.PI / 2, 0, 0]} material={drum}>
        <cylinderGeometry args={[0.16, 0.16, 0.2, 32, 1, true]} />
      </mesh>
      <mesh position={[0, 0.42, 0.1]} rotation={[Math.PI / 2, 0, 0]} material={drum}>
        <circleGeometry args={[0.16, 32]} />
      </mesh>
      {/* ручка люка */}
      <B args={[0.03, 0.08, 0.02]} position={[0.2, 0.46, 0.325]} material={M.graphite} />
    </group>
  );
}

function Bench() {
  const fab = useFabric('#8f7a63', 1, 1);
  return (
    <group>
      <RB args={[0.9, 0.42, 0.38]} position={[0, 0.21, 0]} material={M.wood} radius={0.01} />
      <RB args={[0.9, 0.06, 0.38]} position={[0, 0.45, 0]} material={fab} radius={0.02} />
    </group>
  );
}

const REGISTRY: Record<string, (f: FurnitureItem, look: Look) => ReactNode> = {
  sofa: (_, look) => <Sofa look={look} />,
  armchair: () => <Armchair />,
  coffee_table: () => <CoffeeTable />,
  tv_stand: () => <TvStand />,
  rug: (f) => <Rug size={f.size} />,
  plant: () => <Plant />,
  floor_lamp: () => <FloorLamp />,
  bed: (_, look) => <Bed look={look} />,
  nightstand: () => <Nightstand />,
  wardrobe: (f, look) => <Wardrobe length={f.length} look={look} />,
  hall_wardrobe: (f, look) => <Wardrobe length={f.length} look={look} />,
  fridge: () => <Fridge />,
  kitchen_run: (f, look) => <KitchenRun length={f.length} sink={f.sink} stove={f.stove} look={look} />,
  dining_table: () => <DiningTable />,
  bathtub: () => <Bathtub />,
  toilet: () => <Toilet />,
  vanity: () => <Vanity />,
  washer: () => <Washer />,
  bench: () => <Bench />,
};

export const FURNITURE_TYPES = Object.keys(REGISTRY);

/** Габарит для зоны касания и подсветки по типу предмета. */
const HIT: Record<string, (f: FurnitureItem) => [number, number, number]> = {
  kitchen_run: (f) => [f.length ?? 2.3, 2.3, 0.7],
  bed: () => [1.8, 1.1, 2.2],
  wardrobe: (f) => [f.length ?? 2, 2.4, 0.65],
  hall_wardrobe: (f) => [f.length ?? 1.6, 2.4, 0.65],
  sofa: () => [2.3, 0.9, 1.0],
  dining_table: () => [1.4, 0.8, 1.6],
};

export interface FurnitureProps {
  items: FurnitureItem[];
  hidden?: (roomId: string) => boolean;
  /** индекс предмета → атрибуты вида */
  looks?: Record<number, Look>;
  /** индекс предмета → можно выбирать */
  selectable?: Record<number, boolean>;
  selected?: number | null;
  onPick?: (index: number) => void;
  /** индекс предмета → id элемента (для подсказки) */
  ids?: Record<number, string>;
}

/**
 * Настоящая 3D-модель из SketchUp, Базиса, Blender и т.п. в формате GLB.
 * Ссылка задаётся у товара в таблице: attrs → glb=https://…/kuhnya.glb
 * Модель автоматически вписывается в габарит предмета (длина × высота × глубина) и ставится на пол.
 */
function GlbModel({ url, size }: { url: string; size: [number, number, number] }) {
  const { scene } = useGLTF(url, true);
  const obj = useMemo(() => {
    const o = scene.clone(true);
    o.traverse((c) => {
      const m = c as THREE.Mesh;
      if (m.isMesh) {
        m.castShadow = true;
        m.receiveShadow = true;
      }
    });
    // вписываем в габарит: масштаб по наибольшему отношению, центр по X/Z, низ на полу
    const box = new THREE.Box3().setFromObject(o);
    const dim = box.getSize(new THREE.Vector3());
    const k = Math.min(size[0] / (dim.x || 1), size[1] / (dim.y || 1), size[2] / (dim.z || 1));
    o.scale.setScalar(k);
    const b2 = new THREE.Box3().setFromObject(o);
    const c = b2.getCenter(new THREE.Vector3());
    o.position.set(-c.x, -b2.min.y, -c.z);
    return o;
  }, [scene, size]);
  return <primitive object={obj} />;
}

/** Если модель не загрузилась (нет файла, нет доступа) — показываем обычную процедурную мебель. */
class ModelBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(e: unknown) {
    console.warn('3D-модель не загрузилась, показана упрощённая:', e);
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

/** Габарит модели по типу предмета, м: длина × высота × глубина. */
const MODEL_SIZE: Record<string, (f: FurnitureItem) => [number, number, number]> = {
  kitchen_run: (f) => [f.length ?? 2.3, 2.25, 0.62],
  bed: () => [1.75, 1.1, 2.15],
  wardrobe: (f) => [f.length ?? 2, 2.4, 0.6],
  hall_wardrobe: (f) => [f.length ?? 1.6, 2.4, 0.6],
  sofa: () => [2.2, 0.9, 0.95],
  dining_table: () => [1.4, 0.95, 1.6],
};

function FurnitureBody({ f, look }: { f: FurnitureItem; look: Look }) {
  const procedural = REGISTRY[f.type]?.(f, look) ?? null;
  const url = look.glb;
  if (!url || !/^https?:\/\/|^\.?\//.test(url)) return <>{procedural}</>;
  const size = (MODEL_SIZE[f.type] ?? (() => [1, 1, 1] as [number, number, number]))(f);
  return (
    <ModelBoundary key={url} fallback={procedural}>
      <Suspense fallback={procedural}>
        <GlbModel url={url} size={size} />
      </Suspense>
    </ModelBoundary>
  );
}

export function Furniture({ items, hidden, looks = {}, selectable = {}, selected = null, onPick, ids = {} }: FurnitureProps) {
  const hover = useApp((s) => s.hover);
  return (
    <group>
      {items.map((f, i) => {
        if (hidden?.(f.roomId)) return null;
        const hit = selectable[i] && onPick ? HIT[f.type]?.(f) : undefined;
        const HOVER_ID = ids[i] ?? null;
        return (
          <group key={i} position={f.position} rotation={[0, f.rotationY, 0]}>
            <FurnitureBody f={f} look={looks[i] ?? {}} />
            {hit && (
              <group position={[0, hit[1] / 2, 0]}>
                <mesh
                  material={hitMat}
                  onClick={(e) => {
                    if (e.delta > TAP_THRESHOLD_PX) return;
                    e.stopPropagation();
                    onPick!(i);
                  }}
                  onPointerOver={(e) => {
                    e.stopPropagation();
                    document.body.style.cursor = 'pointer';
                    setHover(HOVER_ID);
                  }}
                  onPointerOut={() => {
                    document.body.style.cursor = '';
                    setHover(null);
                  }}
                >
                  <boxGeometry args={hit} />
                </mesh>
                {selected !== i && hover != null && hover === HOVER_ID && (
                  <lineSegments material={hoverEdge}>
                    <edgesGeometry args={[new THREE.BoxGeometry(hit[0] * 1.03, hit[1] * 1.03, hit[2] * 1.03)]} />
                  </lineSegments>
                )}
                {selected === i && (
                  <>
                    <mesh material={selMat}>
                      <boxGeometry args={[hit[0] * 1.03, hit[1] * 1.03, hit[2] * 1.03]} />
                    </mesh>
                    <lineSegments material={selEdge}>
                      <edgesGeometry args={[new THREE.BoxGeometry(hit[0] * 1.03, hit[1] * 1.03, hit[2] * 1.03)]} />
                    </lineSegments>
                  </>
                )}
              </group>
            )}
          </group>
        );
      })}
    </group>
  );
}
