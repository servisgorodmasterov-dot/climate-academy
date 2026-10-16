// Процедурная мебель — временные модели. Их нужно заменить GLB-моделями (список и требования — docs/ASSETS.md).
import { RoundedBox } from '@react-three/drei';
import { useMemo, type ReactNode } from 'react';
import * as THREE from 'three';
import type { FurnitureItem } from '../../core/types';
import { fabricTexture, sized } from './textures';

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

function Sofa() {
  const fab = useFabric('#7d8794', 2, 1);
  const cush = useFabric('#8a95a3', 1, 1);
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

function Bed() {
  const linen = useFabric('#eef0f2', 2, 2);
  const blanket = useFabric('#9fb2c4', 2, 1.4);
  const pillow = useFabric('#ffffff', 1, 1);
  return (
    <group>
      <RB args={[1.7, 0.3, 2.15]} position={[0, 0.17, 0]} material={M.wood} radius={0.02} />
      <RB args={[1.7, 0.95, 0.08]} position={[0, 0.55, -1.08]} material={M.wood} radius={0.02} />
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

function Wardrobe({ length = 2 }: { length?: number }) {
  const doors = Math.max(2, Math.round(length / 0.5));
  return (
    <group>
      <B args={[length, 2.4, 0.6]} position={[0, 1.2, 0]} material={M.whiteMatte} />
      {Array.from({ length: doors }).map((_, i) => {
        const w = length / doors;
        return (
          <group key={i}>
            <B args={[w - 0.006, 2.36, 0.02]} position={[-length / 2 + w / 2 + i * w, 1.2, 0.305]} material={M.white} cast={false} />
            <B args={[0.012, 0.3, 0.02]} position={[-length / 2 + i * w + (i % 2 ? 0.04 : w - 0.04), 1.15, 0.325]} material={M.steel} cast={false} />
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

function KitchenRun({ length = 2.3, sink = 0.6, stove = -0.3 }: { length?: number; sink?: number; stove?: number }) {
  const n = Math.max(2, Math.round(length / 0.6));
  return (
    <group>
      <B args={[length, 0.1, 0.55]} position={[0, 0.05, -0.02]} material={M.graphite} />
      <B args={[length, 0.76, 0.58]} position={[0, 0.48, 0]} material={M.white} />
      {Array.from({ length: n }).map((_, i) => (
        <B key={i} args={[length / n - 0.008, 0.72, 0.02]} position={[-length / 2 + (i + 0.5) * (length / n), 0.48, 0.3]} material={M.whiteMatte} cast={false} />
      ))}
      <B args={[length + 0.02, 0.04, 0.62]} position={[0, 0.88, 0.01]} material={M.stone} />
      {/* мойка */}
      <B args={[0.5, 0.012, 0.42]} position={[sink, 0.905, 0.02]} material={M.steel} />
      <mesh position={[sink, 1.0, -0.2]} material={M.steel}>
        <cylinderGeometry args={[0.015, 0.015, 0.22, 10]} />
      </mesh>
      {/* варочная панель */}
      <B args={[0.58, 0.01, 0.5]} position={[stove, 0.905, 0.02]} material={M.black} />
      {/* фартук и верхние шкафы */}
      <B args={[length, 0.6, 0.02]} position={[0, 1.2, -0.3]} material={M.stone} cast={false} />
      <B args={[length, 0.7, 0.33]} position={[0, 1.85, -0.14]} material={M.white} />
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
  return (
    <group>
      <RB args={[0.38, 0.4, 0.55]} position={[0, 0.2, 0.05]} material={M.ceramic} radius={0.12} />
      <RB args={[0.4, 0.38, 0.17]} position={[0, 0.6, -0.2]} material={M.ceramic} radius={0.04} />
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
  return (
    <group>
      <RB args={[0.6, 0.85, 0.55]} position={[0, 0.425, 0]} material={M.white} radius={0.02} />
      <mesh position={[0, 0.45, 0.28]} rotation={[Math.PI / 2, 0, 0]} material={M.graphite}>
        <torusGeometry args={[0.17, 0.025, 10, 32]} />
      </mesh>
      <mesh position={[0, 0.45, 0.27]} rotation={[Math.PI / 2, 0, 0]} material={new THREE.MeshPhysicalMaterial({ color: '#9fb5c0', transmission: 0.6, transparent: true, opacity: 0.6, roughness: 0.1 })}>
        <cylinderGeometry args={[0.16, 0.16, 0.02, 32]} />
      </mesh>
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

const REGISTRY: Record<string, (f: FurnitureItem) => ReactNode> = {
  sofa: () => <Sofa />,
  armchair: () => <Armchair />,
  coffee_table: () => <CoffeeTable />,
  tv_stand: () => <TvStand />,
  rug: (f) => <Rug size={f.size} />,
  plant: () => <Plant />,
  floor_lamp: () => <FloorLamp />,
  bed: () => <Bed />,
  nightstand: () => <Nightstand />,
  wardrobe: (f) => <Wardrobe length={f.length} />,
  hall_wardrobe: (f) => <Wardrobe length={f.length} />,
  fridge: () => <Fridge />,
  kitchen_run: (f) => <KitchenRun length={f.length} sink={f.sink} stove={f.stove} />,
  dining_table: () => <DiningTable />,
  bathtub: () => <Bathtub />,
  toilet: () => <Toilet />,
  vanity: () => <Vanity />,
  washer: () => <Washer />,
  bench: () => <Bench />,
};

export const FURNITURE_TYPES = Object.keys(REGISTRY);

export function Furniture({ items, hidden }: { items: FurnitureItem[]; hidden?: (roomId: string) => boolean }) {
  return (
    <group>
      {items.map((f, i) =>
        hidden?.(f.roomId) ? null : (
          <group key={i} position={f.position} rotation={[0, f.rotationY, 0]}>
            {REGISTRY[f.type]?.(f) ?? null}
          </group>
        ),
      )}
    </group>
  );
}
