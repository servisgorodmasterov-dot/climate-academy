import { useEffect, useMemo, useRef, type MutableRefObject, type ReactNode } from 'react';
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { Html, OrbitControls, RoundedBox } from '@react-three/drei';
import * as THREE from 'three';
import gsap from 'gsap';
import { NX, NZ, ROOM, UNIT_POS, WINDOW_POS, cellCenter, tempColor, type AcMode, type SimState } from '../../core/roomSim';
import { SplitUnit, type RunState } from '../../three/splitParts';
import { Hose, Pipe } from '../../three/primitives';
import type { Readout } from './useRoomSim';

export type HotspotId = 'indoor' | 'outdoor' | 'route' | 'cable' | 'drain' | 'window' | 'remote';
export type CamPreset = 'overview' | 'indoor' | 'outdoor' | 'route' | 'facade';

const WALL_T = 0.2;
const OUT_POS = new THREE.Vector3(UNIT_POS.x, 1.05, ROOM.z0 - WALL_T - 0.27);

export const CAMS: Record<CamPreset, { pos: [number, number, number]; target: [number, number, number]; label: string }> = {
  overview: { pos: [5.6, 4.6, 6.4], target: [0, 1.0, -0.6], label: 'Обзор' },
  indoor: { pos: [2.3, 2.1, -1.0], target: [UNIT_POS.x, UNIT_POS.y - 0.1, ROOM.z0], label: 'Внутренний блок' },
  outdoor: { pos: [3.0, 1.9, -5.1], target: [OUT_POS.x, OUT_POS.y, OUT_POS.z], label: 'Наружный блок' },
  route: { pos: [-0.2, 2.1, -4.4], target: [UNIT_POS.x - 0.4, 1.45, ROOM.z0 - 0.3], label: 'Трасса' },
  facade: { pos: [-2.5, 3.0, -9.5], target: [0, 1.4, -2.6], label: 'Фасад' },
};

interface Props {
  sim: MutableRefObject<SimState>;
  readout: Readout;
  on: boolean;
  mode: AcMode;
  sunny: boolean;
  showHeatmap: boolean;
  showLabels: boolean;
  selected: HotspotId | null;
  onSelect: (h: HotspotId | null) => void;
  cam: CamPreset;
  quality: 'high' | 'low';
  reduced: boolean;
}

export function HomeScene(p: Props) {
  return (
    <Canvas
      shadows={p.quality === 'high'}
      dpr={p.quality === 'high' ? [1, 2] : 1}
      camera={{ position: CAMS.overview.pos, fov: typeof window !== 'undefined' && window.innerWidth < 640 ? 60 : 42, near: 0.05, far: 80 }}
      gl={{ antialias: p.quality === 'high', powerPreference: 'high-performance' }}
      onPointerMissed={() => p.onSelect(null)}
    >
      <color attach="background" args={['#0b1730']} />
      <fog attach="fog" args={['#0b1730', 14, 32]} />
      <Lights mode={p.mode} sunny={p.sunny} quality={p.quality} />
      <CameraRig cam={p.cam} reduced={p.reduced} />
      <Room selected={p.selected} onSelect={p.onSelect} />
      <Furniture onSelect={p.onSelect} selected={p.selected} />
      <Units {...p} />
      {p.showHeatmap && <Heatmap sim={p.sim} />}
      {p.on && !p.reduced && <Airflow sim={p.sim} mode={p.mode} quality={p.quality} />}
      {p.on && p.reduced && <StaticFlow mode={p.mode} />}
      {p.showLabels && <Probes readout={p.readout} />}
    </Canvas>
  );
}

function Lights({ mode, sunny, quality }: { mode: AcMode; sunny: boolean; quality: 'high' | 'low' }) {
  const sun = sunny && mode === 'cool';
  return (
    <>
      <hemisphereLight args={['#cfe6ff', '#1a2440', 0.55]} />
      <ambientLight intensity={0.25} />
      <directionalLight
        position={[-3, 6, -9]}
        intensity={sun ? 2.4 : 0.7}
        color={sun ? '#ffe2b8' : '#c9dcff'}
        castShadow={quality === 'high'}
        shadow-mapSize={[1024, 1024]}
        shadow-camera-left={-6}
        shadow-camera-right={6}
        shadow-camera-top={6}
        shadow-camera-bottom={-6}
      />
      <pointLight position={[0, 2.5, 0.5]} intensity={6} distance={7} color="#fff4e6" />
    </>
  );
}

function CameraRig({ cam, reduced }: { cam: CamPreset; reduced: boolean }) {
  const { camera, controls } = useThree() as unknown as { camera: THREE.PerspectiveCamera; controls: { target: THREE.Vector3; update: () => void } | null };
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const c = CAMS[cam];
    if (!controls) return;
    const d = reduced ? 0 : 1.2;
    gsap.to(camera.position, { x: c.pos[0], y: c.pos[1], z: c.pos[2], duration: d, ease: 'power2.inOut' });
    gsap.to(controls.target, { x: c.target[0], y: c.target[1], z: c.target[2], duration: d, ease: 'power2.inOut', onUpdate: () => controls.update() });
  }, [cam]);
  return <OrbitControls makeDefault target={CAMS.overview.target} enableDamping minDistance={1} maxDistance={18} maxPolarAngle={Math.PI * 0.49} />;
}

/** Стена, которая становится полупрозрачной, когда закрывает обзор. */
function FadingWall({ children, normal }: { children: ReactNode; normal: [number, number, number] }) {
  const g = useRef<THREE.Group>(null);
  const n = useMemo(() => new THREE.Vector3(...normal), [normal.join()]);
  const tmp = useMemo(() => new THREE.Vector3(), []);
  useFrame(({ camera }) => {
    if (!g.current) return;
    g.current.getWorldPosition(tmp);
    const toCam = camera.position.clone().sub(tmp);
    // камера с наружной стороны стены → стену делаем прозрачной
    const behind = toCam.dot(n) < 0;
    g.current.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      const mat = m.material as THREE.MeshStandardMaterial;
      const target = behind ? 0.13 : 1;
      mat.transparent = true;
      mat.opacity += (target - mat.opacity) * 0.15;
      mat.depthWrite = mat.opacity > 0.9;
    });
  });
  return <group ref={g}>{children}</group>;
}

function WallMat({ color = '#dfe6ef' }: { color?: string }) {
  return <meshStandardMaterial color={color} roughness={0.9} />;
}

function Room({ selected, onSelect }: { selected: HotspotId | null; onSelect: (h: HotspotId) => void }) {
  const W = ROOM.x1 - ROOM.x0;
  const zb = ROOM.z0 - WALL_T / 2;
  const wx0 = WINDOW_POS.x - WINDOW_POS.w / 2;
  const wx1 = WINDOW_POS.x + WINDOW_POS.w / 2;
  const wy0 = 0.85;
  const wy1 = 2.25;
  return (
    <group>
      {/* пол */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[W, ROOM.z1 - ROOM.z0]} />
        <meshStandardMaterial color="#8a6d52" roughness={0.75} />
      </mesh>
      {/* ковёр */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[-0.6, 0.006, 0.9]} receiveShadow>
        <planeGeometry args={[2.6, 1.8]} />
        <meshStandardMaterial color="#3d4f6e" roughness={1} />
      </mesh>
      {/* межэтажная плита наружу (видна с фасада) */}
      <mesh position={[0, -0.1, ROOM.z0 - 0.4]}>
        <boxGeometry args={[W + 0.6, 0.2, 0.8]} />
        <meshStandardMaterial color="#5b6b82" roughness={0.9} />
      </mesh>

      {/* наружная (задняя) стена с проёмом окна */}
      <FadingWall normal={[0, 0, 1]}>
        <group position={[0, 0, zb]}>
          <mesh position={[(ROOM.x0 + wx0) / 2, ROOM.h / 2, 0]} castShadow receiveShadow>
            <boxGeometry args={[wx0 - ROOM.x0, ROOM.h, WALL_T]} />
            <WallMat />
          </mesh>
          <mesh position={[(wx1 + ROOM.x1) / 2, ROOM.h / 2, 0]} castShadow receiveShadow>
            <boxGeometry args={[ROOM.x1 - wx1, ROOM.h, WALL_T]} />
            <WallMat />
          </mesh>
          <mesh position={[WINDOW_POS.x, wy0 / 2, 0]} receiveShadow>
            <boxGeometry args={[WINDOW_POS.w, wy0, WALL_T]} />
            <WallMat />
          </mesh>
          <mesh position={[WINDOW_POS.x, (wy1 + ROOM.h) / 2, 0]}>
            <boxGeometry args={[WINDOW_POS.w, ROOM.h - wy1, WALL_T]} />
            <WallMat />
          </mesh>
          {/* фасадная отделка снаружи */}
          <mesh position={[0, ROOM.h / 2, -WALL_T / 2 - 0.001]} rotation={[0, Math.PI, 0]}>
            <planeGeometry args={[W, ROOM.h]} />
            <meshStandardMaterial color="#6f7f99" roughness={0.95} />
          </mesh>
        </group>
      </FadingWall>

      {/* окно */}
      <group
        position={[WINDOW_POS.x, (wy0 + wy1) / 2, zb]}
        onClick={(e: ThreeEvent<MouseEvent>) => (e.stopPropagation(), onSelect('window'))}
        onPointerOver={() => (document.body.style.cursor = 'pointer')}
        onPointerOut={() => (document.body.style.cursor = '')}
      >
        <mesh>
          <boxGeometry args={[WINDOW_POS.w, wy1 - wy0, 0.03]} />
          <meshStandardMaterial color="#9fd3ff" transparent opacity={0.25} emissive={selected === 'window' ? '#1f5f8f' : '#000'} metalness={0.2} roughness={0.05} />
        </mesh>
        {[[0, (wy1 - wy0) / 2 - 0.03, WINDOW_POS.w, 0.06], [0, -(wy1 - wy0) / 2 + 0.03, WINDOW_POS.w, 0.06]].map(([x, y, w, h], i) => (
          <mesh key={i} position={[x, y, 0.02]}>
            <boxGeometry args={[w, h, 0.07]} />
            <meshStandardMaterial color="#f4f6f8" />
          </mesh>
        ))}
        {[-WINDOW_POS.w / 2 + 0.03, 0, WINDOW_POS.w / 2 - 0.03].map((x) => (
          <mesh key={x} position={[x, 0, 0.02]}>
            <boxGeometry args={[0.06, wy1 - wy0, 0.07]} />
            <meshStandardMaterial color="#f4f6f8" />
          </mesh>
        ))}
        {/* подоконник */}
        <mesh position={[0, -(wy1 - wy0) / 2 - 0.02, 0.18]}>
          <boxGeometry args={[WINDOW_POS.w + 0.2, 0.04, 0.25]} />
          <meshStandardMaterial color="#f4f6f8" />
        </mesh>
      </group>

      {/* левая стена */}
      <FadingWall normal={[1, 0, 0]}>
        <mesh position={[ROOM.x0 - WALL_T / 2, ROOM.h / 2, 0]} receiveShadow>
          <boxGeometry args={[WALL_T, ROOM.h, ROOM.z1 - ROOM.z0 + 2 * WALL_T]} />
          <WallMat color="#d6dde8" />
        </mesh>
      </FadingWall>
    </group>
  );
}

function Furniture({ onSelect, selected }: { onSelect: (h: HotspotId) => void; selected: HotspotId | null }) {
  return (
    <group>
      {/* диван */}
      <group position={[-0.8, 0, 1.75]}>
        <RoundedBox args={[2.2, 0.42, 0.9]} radius={0.06} position={[0, 0.25, 0]} castShadow>
          <meshStandardMaterial color="#5d6f8e" roughness={0.9} />
        </RoundedBox>
        <RoundedBox args={[2.2, 0.5, 0.22]} radius={0.06} position={[0, 0.6, 0.36]} castShadow>
          <meshStandardMaterial color="#56678a" roughness={0.9} />
        </RoundedBox>
        {[-1.05, 1.05].map((x) => (
          <RoundedBox key={x} args={[0.18, 0.55, 0.9]} radius={0.05} position={[x, 0.32, 0]} castShadow>
            <meshStandardMaterial color="#4f6080" roughness={0.9} />
          </RoundedBox>
        ))}
        {/* люди — источники тепла */}
        {[-0.45, 0.4].map((x, i) => (
          <group key={x} position={[x, 0.5, 0.05]}>
            <mesh position={[0, 0.32, 0]} castShadow>
              <capsuleGeometry args={[0.17, 0.38, 6, 12]} />
              <meshStandardMaterial color={i ? '#e38b5a' : '#4aa0d8'} roughness={0.8} />
            </mesh>
            <mesh position={[0, 0.82, 0]} castShadow>
              <sphereGeometry args={[0.12, 16, 12]} />
              <meshStandardMaterial color="#e9c2a0" roughness={0.8} />
            </mesh>
          </group>
        ))}
      </group>
      {/* журнальный столик и пульт */}
      <group position={[-0.8, 0, 0.55]}>
        <RoundedBox args={[1.1, 0.06, 0.6]} radius={0.02} position={[0, 0.42, 0]} castShadow>
          <meshStandardMaterial color="#c9a57f" roughness={0.6} />
        </RoundedBox>
        {[[-0.48, -0.24], [0.48, -0.24], [-0.48, 0.24], [0.48, 0.24]].map(([x, z]) => (
          <mesh key={`${x}${z}`} position={[x, 0.2, z]}>
            <cylinderGeometry args={[0.02, 0.02, 0.4, 8]} />
            <meshStandardMaterial color="#2b3340" />
          </mesh>
        ))}
        <mesh
          position={[0.2, 0.465, 0.05]}
          rotation={[0, 0.4, 0]}
          onClick={(e: ThreeEvent<MouseEvent>) => (e.stopPropagation(), onSelect('remote'))}
          onPointerOver={() => (document.body.style.cursor = 'pointer')}
          onPointerOut={() => (document.body.style.cursor = '')}
        >
          <boxGeometry args={[0.06, 0.025, 0.18]} />
          <meshStandardMaterial color="#f2f4f7" emissive={selected === 'remote' ? '#1f5f8f' : '#000'} />
        </mesh>
      </group>
      {/* рабочий стол с ПК справа */}
      <group position={[2.35, 0, 0.6]} rotation={[0, -Math.PI / 2, 0]}>
        <RoundedBox args={[1.3, 0.05, 0.65]} radius={0.015} position={[0, 0.75, 0]} castShadow>
          <meshStandardMaterial color="#e8e3db" roughness={0.6} />
        </RoundedBox>
        {[-0.6, 0.6].map((x) => (
          <mesh key={x} position={[x, 0.37, 0]}>
            <boxGeometry args={[0.04, 0.74, 0.6]} />
            <meshStandardMaterial color="#2b3340" />
          </mesh>
        ))}
        <mesh position={[0, 1.02, -0.2]} castShadow>
          <boxGeometry args={[0.62, 0.38, 0.03]} />
          <meshStandardMaterial color="#111722" emissive="#1c3d6b" emissiveIntensity={0.6} />
        </mesh>
        <mesh position={[0.45, 0.25, 0]} castShadow>
          <boxGeometry args={[0.2, 0.45, 0.45]} />
          <meshStandardMaterial color="#1b222d" />
        </mesh>
      </group>
      {/* растение у окна */}
      <group position={[-2.55, 0, -2.05]}>
        <mesh position={[0, 0.18, 0]}>
          <cylinderGeometry args={[0.16, 0.12, 0.36, 16]} />
          <meshStandardMaterial color="#c9b7a2" />
        </mesh>
        <mesh position={[0, 0.7, 0]} castShadow>
          <icosahedronGeometry args={[0.36, 1]} />
          <meshStandardMaterial color="#3d7d5a" roughness={0.9} flatShading />
        </mesh>
      </group>
    </group>
  );
}

function Units({ on, mode, quality, selected, onSelect, readout }: Props) {
  const run = useRef<RunState>({ running: on, mode, speed: 1 });
  const explode = useRef(0);
  useEffect(() => {
    run.current = { running: on, mode, speed: 0.4 + readout.capacity * 0.8 };
  }, [on, mode, readout.capacity]);
  const props = { run, explode, cutaway: false, quality };
  const hs = (id: HotspotId) => ({
    onClick: (e: ThreeEvent<MouseEvent>) => (e.stopPropagation(), onSelect(id)),
    onPointerOver: (e: ThreeEvent<PointerEvent>) => (e.stopPropagation(), (document.body.style.cursor = 'pointer')),
    onPointerOut: () => (document.body.style.cursor = ''),
  });
  const zb = ROOM.z0 - WALL_T; // наружная плоскость фасада
  const sel = (id: HotspotId) => selected === id;
  return (
    <group>
      <group position={[UNIT_POS.x, UNIT_POS.y, ROOM.z0 + 0.12]} {...hs('indoor')}>
        <SplitUnit unit="indoor" props={props} />
        {sel('indoor') && <SelectionBox size={[0.98, 0.36, 0.3]} />}
      </group>
      <group position={OUT_POS} rotation={[0, Math.PI, 0]} {...hs('outdoor')}>
        <SplitUnit unit="outdoor" props={props} />
        {sel('outdoor') && <SelectionBox size={[0.92, 0.66, 0.42]} />}
      </group>
      {/* кронштейны */}
      {[-0.28, 0.28].map((dx) => (
        <group key={dx} position={[OUT_POS.x + dx, OUT_POS.y - 0.31, zb - 0.22]}>
          <mesh>
            <boxGeometry args={[0.04, 0.04, 0.48]} />
            <meshStandardMaterial color="#39414e" metalness={0.6} roughness={0.4} />
          </mesh>
          <mesh position={[0, -0.18, 0.12]} rotation={[0.85, 0, 0]}>
            <boxGeometry args={[0.035, 0.035, 0.46]} />
            <meshStandardMaterial color="#39414e" metalness={0.6} roughness={0.4} />
          </mesh>
        </group>
      ))}
      <RouteBundle selected={selected} hs={hs} />
    </group>
  );
}

type V3 = [number, number, number];
type Hs = (id: HotspotId) => Record<string, unknown>;

/**
 * Межблочная трасса как в реальном монтаже: две медные трубы в теплоизоляции,
 * межблочный кабель и гофрированный дренажный шланг. Через стену проходят пучком в гильзе,
 * на фасаде трубы и кабель уходят к наружному блоку, дренаж — отдельно вниз с постоянным уклоном.
 */
function RouteBundle({ selected, hs }: { selected: HotspotId | null; hs: Hs }) {
  const zIn = ROOM.z0 + 0.02; // за внутренним блоком
  const zf = ROOM.z0 - WALL_T - 0.06; // по фасаду
  const x0 = UNIT_POS.x - 0.36; // выводы внутреннего блока
  const y0 = UNIT_POS.y - 0.08;
  const valveX = OUT_POS.x - 0.43; // сервисные вентили (блок повёрнут на 180°)
  const zValve = OUT_POS.z - 0.09;
  const hl = '#7cc4ff';
  const sel = (id: HotspotId) => selected === id;

  // Трубы и кабель: внутрь стены, вниз по фасаду, к вентилям/клеммам.
  const line = (dx: number, endY: number, endX: number, endZ: number): V3[] => [
    [x0 + dx, y0, zIn],
    [x0 + dx, y0 - 0.02, zf],
    [x0 + dx, OUT_POS.y + 0.36, zf],
    [endX - 0.07, endY, zf],
    [endX - 0.07, endY, endZ],
    [endX - 0.02, endY, endZ],
  ];
  const gas = line(0, OUT_POS.y - 0.12, valveX, zValve);
  const liquid = line(-0.05, OUT_POS.y - 0.18, valveX, zValve);
  const cable = line(0.045, OUT_POS.y + 0.05, OUT_POS.x - 0.42, OUT_POS.z - 0.05);
  // Дренаж: ниже пучка, с уклоном наружу, затем вниз по фасаду, мимо наружного блока.
  const dx = -0.1;
  const drain: V3[] = [
    [x0 + dx, y0 - 0.04, zIn],
    [x0 + dx, y0 - 0.09, zf],
    [x0 - 0.2, y0 - 0.3, zf],
    [x0 - 0.22, 0.12, zf],
  ];
  const sleeveY = y0 - 0.03;
  const labelY = OUT_POS.y + 0.85;
  const anyRoute = sel('route') || sel('cable') || sel('drain');

  return (
    <group>
      {/* гильза в стене */}
      {[ROOM.z0 + 0.005, ROOM.z0 - WALL_T - 0.005].map((z) => (
        <mesh key={z} position={[x0 - 0.025, sleeveY, z]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.09, 0.09, 0.02, 24]} />
          <meshStandardMaterial color="#b9c2cd" roughness={0.6} />
        </mesh>
      ))}

      <group {...hs('route')}>
        {/* газовая (толстая) и жидкостная (тонкая) трубы в изоляции */}
        <Pipe points={gas} r={0.024} metal={0} color={sel('route') ? hl : '#e3e8ee'} />
        <Pipe points={liquid} r={0.017} metal={0} color={sel('route') ? hl : '#cfd6df'} />
        {/* медные концы у вентилей */}
        <Pipe points={gas.slice(-2)} r={0.009} color="#c8763f" />
        <Pipe points={liquid.slice(-2)} r={0.0065} color="#c8763f" />
      </group>
      <group {...hs('cable')}>
        <Pipe points={cable} r={sel('cable') ? 0.01 : 0.007} metal={0} color={sel('cable') ? hl : '#2f343c'} />
      </group>
      <group {...hs('drain')}>
        <Hose points={drain} r={sel('drain') ? 0.013 : 0.011} color={sel('drain') ? hl : '#d6dbe2'} />
      </group>

      {anyRoute && (
        <>
          <RouteLabel pos={[x0 + 0.02, labelY + 0.05, zf - 0.03]} text="газовая труба" sub="толстая, в изоляции" active={sel('route')} />
          <RouteLabel pos={[x0 - 0.05, labelY - 0.3, zf - 0.03]} text="жидкостная труба" sub="тонкая, в изоляции" active={sel('route')} />
          <RouteLabel pos={[x0 + 0.05, labelY - 0.12, zf - 0.03]} text="межблочный кабель" sub="питание и связь" active={sel('cable')} />
          <RouteLabel pos={[x0 - 0.24, 1.2, zf - 0.03]} text="дренажный шланг" sub="уклон вниз без провисов" active={sel('drain')} />
          <RouteLabel pos={[x0 - 0.025, sleeveY + 0.12, ROOM.z0 - WALL_T - 0.02]} text="гильза в стене" sub="пучок проходит вместе" active={false} />
        </>
      )}
    </group>
  );
}

function RouteLabel({ pos, text, sub, active }: { pos: V3; text: string; sub: string; active: boolean }) {
  return (
    <Html position={pos} zIndexRange={[10, 0]}>
      <div className="label3d" style={{ borderColor: active ? 'var(--sky)' : undefined, opacity: active ? 1 : 0.75 }}>
        {text}
        <small>{sub}</small>
      </div>
    </Html>
  );
}

function SelectionBox({ size }: { size: [number, number, number] }) {
  const ref = useRef<THREE.LineSegments>(null);
  useFrame(({ clock }) => {
    if (ref.current) (ref.current.material as THREE.LineBasicMaterial).opacity = 0.55 + Math.sin(clock.elapsedTime * 4) * 0.35;
  });
  const geo = useMemo(() => new THREE.EdgesGeometry(new THREE.BoxGeometry(...size)), [size.join()]);
  return (
    <lineSegments ref={ref} geometry={geo}>
      <lineBasicMaterial color="#5cc8ff" transparent />
    </lineSegments>
  );
}

/** Тепловая карта рабочей зоны: плитки, цвет по температуре. */
function Heatmap({ sim }: { sim: MutableRefObject<SimState> }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const cw = (ROOM.x1 - ROOM.x0) / NX;
  const cd = (ROOM.z1 - ROOM.z0) / NZ;
  const color = useMemo(() => new THREE.Color(), []);
  useEffect(() => {
    const m = new THREE.Matrix4();
    for (let k = 0; k < NZ; k++)
      for (let i = 0; i < NX; i++) {
        const { x, z } = cellCenter(i, k);
        m.makeTranslation(x, 0.03, z);
        ref.current!.setMatrixAt(k * NX + i, m);
      }
    ref.current!.instanceMatrix.needsUpdate = true;
  }, []);
  const acc = useRef(0);
  useFrame((_, dt) => {
    acc.current += dt;
    if (acc.current < 0.15 || !ref.current) return;
    acc.current = 0;
    const t = sim.current.t;
    for (let j = 0; j < t.length; j++) {
      const [r, g, b] = tempColor(t[j]);
      ref.current.setColorAt(j, color.setRGB(r, g, b));
    }
    if (ref.current.instanceColor) ref.current.instanceColor.needsUpdate = true;
  });
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, NX * NZ]} raycast={() => null}>
      <boxGeometry args={[cw * 0.94, 0.01, cd * 0.94]} />
      <meshBasicMaterial transparent opacity={0.62} depthWrite={false} />
    </instancedMesh>
  );
}

/** Частицы воздуха: выход внутреннего блока и выброс наружного. */
function Airflow({ sim, mode, quality }: { sim: MutableRefObject<SimState>; mode: AcMode; quality: 'high' | 'low' }) {
  const N = quality === 'high' ? 520 : 180;
  const M = quality === 'high' ? 160 : 60;
  const inRef = useRef<THREE.InstancedMesh>(null);
  const outRef = useRef<THREE.InstancedMesh>(null);
  const st = useMemo(() => {
    const mk = (n: number) => ({ p: new Float32Array(n * 3), v: new Float32Array(n * 3), age: new Float32Array(n).map(() => Math.random() * 4), life: new Float32Array(n).fill(4) });
    return { a: mk(N), b: mk(M) };
  }, [N, M]);
  const m4 = useMemo(() => new THREE.Matrix4(), []);
  const col = useMemo(() => new THREE.Color(), []);
  const q = useMemo(() => new THREE.Quaternion(), []);
  const sc = useMemo(() => new THREE.Vector3(), []);
  const pv = useMemo(() => new THREE.Vector3(), []);

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    const s = sim.current;
    const load = 0.35 + s.capacity * 0.65;
    const avgRoom = s.supply - (mode === 'cool' ? -12 : 20) * s.capacity;
    // --- внутренний блок ---
    const A = st.a;
    for (let i = 0; i < N; i++) {
      const j = i * 3;
      A.age[i] += dt;
      if (A.age[i] > A.life[i]) {
        A.age[i] = 0;
        A.life[i] = 2.6 + Math.random() * 2.2;
        A.p[j] = UNIT_POS.x + (Math.random() - 0.5) * 0.7;
        A.p[j + 1] = UNIT_POS.y - 0.14;
        A.p[j + 2] = ROOM.z0 + 0.24;
        const down = mode === 'cool' ? 0.25 : 1.1;
        const sp = 1.4 * load + Math.random() * 0.4;
        A.v[j] = (Math.random() - 0.5) * 0.5;
        A.v[j + 1] = -down * sp;
        A.v[j + 2] = sp * (mode === 'cool' ? 1 : 0.7);
      }
      const u = A.age[i] / A.life[i];
      // плавучесть: холодный воздух опускается, тёплый — поднимается
      const buoy = mode === 'cool' ? -0.55 : 0.9 * Math.min(1, u * 3);
      A.v[j + 1] += buoy * dt;
      A.v[j] *= 1 - dt * 0.35;
      A.v[j + 1] *= 1 - dt * 0.5;
      A.v[j + 2] *= 1 - dt * 0.45;
      A.p[j] += A.v[j] * dt;
      A.p[j + 1] += A.v[j + 1] * dt;
      A.p[j + 2] += A.v[j + 2] * dt;
      // стены/пол/потолок: растекание
      if (A.p[j + 1] < 0.08) (A.p[j + 1] = 0.08), (A.v[j + 1] = Math.abs(A.v[j + 1]) * 0.1), (A.v[j] *= 1.02);
      if (A.p[j + 1] > ROOM.h - 0.05) (A.p[j + 1] = ROOM.h - 0.05), (A.v[j + 1] = 0);
      if (A.p[j + 2] > ROOM.z1 - 0.05) (A.p[j + 2] = ROOM.z1 - 0.05), (A.v[j + 2] = -Math.abs(A.v[j + 2]) * 0.3);
      if (A.p[j] > ROOM.x1 - 0.05 || A.p[j] < ROOM.x0 + 0.05) A.v[j] *= -0.3;
      const T = s.supply + (avgRoom - s.supply) * Math.min(1, u * 1.3);
      const [r, g, b] = tempColor(T);
      col.setRGB(r, g, b);
      const size = 0.028 * (1 - u * 0.6);
      m4.compose(pv.set(A.p[j], A.p[j + 1], A.p[j + 2]), q, sc.set(size, size, size));
      inRef.current!.setMatrixAt(i, m4);
      inRef.current!.setColorAt(i, col);
    }
    inRef.current!.instanceMatrix.needsUpdate = true;
    if (inRef.current!.instanceColor) inRef.current!.instanceColor.needsUpdate = true;

    // --- наружный блок: выброс от фасада ---
    const B = st.b;
    const outT = mode === 'cool' ? 45 : -10;
    for (let i = 0; i < M; i++) {
      const j = i * 3;
      B.age[i] += dt;
      if (B.age[i] > B.life[i]) {
        B.age[i] = 0;
        B.life[i] = 1.5 + Math.random();
        const a = Math.random() * Math.PI * 2;
        const r = Math.sqrt(Math.random()) * 0.2;
        B.p[j] = OUT_POS.x + 0.13 + Math.cos(a) * r;
        B.p[j + 1] = OUT_POS.y + 0.01 + Math.sin(a) * r;
        B.p[j + 2] = OUT_POS.z - 0.18;
        B.v[j] = (Math.random() - 0.5) * 0.3;
        B.v[j + 1] = (Math.random() - 0.5) * 0.3;
        B.v[j + 2] = -(1.6 + Math.random()) * load;
      }
      const u = B.age[i] / B.life[i];
      B.v[j + 1] += (mode === 'cool' ? 0.6 : -0.4) * dt;
      B.p[j] += B.v[j] * dt;
      B.p[j + 1] += B.v[j + 1] * dt;
      B.p[j + 2] += B.v[j + 2] * dt;
      const [r, g, b] = tempColor(outT + ((mode === 'cool' ? 33 : -5) - outT) * u);
      col.setRGB(r, g, b);
      const size = 0.03 * (1 - u * 0.5);
      m4.compose(pv.set(B.p[j], B.p[j + 1], B.p[j + 2]), q, sc.set(size, size, size));
      outRef.current!.setMatrixAt(i, m4);
      outRef.current!.setColorAt(i, col);
    }
    outRef.current!.instanceMatrix.needsUpdate = true;
    if (outRef.current!.instanceColor) outRef.current!.instanceColor.needsUpdate = true;
  });

  return (
    <>
      <instancedMesh ref={inRef} args={[undefined, undefined, N]} raycast={() => null} frustumCulled={false}>
        <sphereGeometry args={[1, 6, 4]} />
        <meshBasicMaterial transparent opacity={0.75} depthWrite={false} />
      </instancedMesh>
      <instancedMesh ref={outRef} args={[undefined, undefined, M]} raycast={() => null} frustumCulled={false}>
        <sphereGeometry args={[1, 6, 4]} />
        <meshBasicMaterial transparent opacity={0.7} depthWrite={false} />
      </instancedMesh>
    </>
  );
}

/** Режим уменьшенной анимации: неподвижные линии тока вместо частиц. */
function StaticFlow({ mode }: { mode: AcMode }) {
  const lines = useMemo(() => {
    const res: THREE.Vector3[][] = [];
    for (let k = -2; k <= 2; k++) {
      const pts: THREE.Vector3[] = [];
      let p = new THREE.Vector3(UNIT_POS.x + k * 0.15, UNIT_POS.y - 0.14, ROOM.z0 + 0.24);
      let v = new THREE.Vector3(k * 0.08, mode === 'cool' ? -0.3 : -1.2, mode === 'cool' ? 1.6 : 1.1);
      for (let s = 0; s < 40; s++) {
        pts.push(p.clone());
        v.y += (mode === 'cool' ? -0.55 : 0.5) * 0.08;
        v.multiplyScalar(0.985);
        p = p.add(v.clone().multiplyScalar(0.08));
        if (p.y < 0.1) (p.y = 0.1), (v.y = 0);
      }
      res.push(pts);
    }
    return res;
  }, [mode]);
  const objs = useMemo(
    () => lines.map((pts) => new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: mode === 'cool' ? '#5cc8ff' : '#ff8a3d', transparent: true, opacity: 0.8 }))),
    [lines, mode],
  );
  return (
    <>
      {objs.map((o, i) => (
        <primitive key={i} object={o} />
      ))}
    </>
  );
}

function Probe({ pos, name, t }: { pos: [number, number, number]; name: string; t: number }) {
  const [r, g, b] = tempColor(t);
  return (
    <Html position={pos} zIndexRange={[10, 0]}>
      <div className="label3d" style={{ borderColor: `rgb(${r * 255},${g * 255},${b * 255})` }}>
        {t.toFixed(1)} °C<small>{name}</small>
      </div>
    </Html>
  );
}

function Probes({ readout }: { readout: Readout }) {
  return (
    <>
      <Probe pos={[-1.2, 1.15, -2.0]} name="у окна" t={readout.window} />
      <Probe pos={[0.2, 1.15, 0]} name="центр комнаты" t={readout.center} />
      <Probe pos={[-0.8, 1.55, 1.6]} name="у дивана" t={readout.sofa} />
      <Probe pos={[0.2, 2.55, 0]} name="под потолком" t={readout.ceiling} />
    </>
  );
}
