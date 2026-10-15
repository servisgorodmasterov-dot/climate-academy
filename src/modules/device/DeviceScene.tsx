import { useEffect, useMemo, useRef, type MutableRefObject } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Html, OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import gsap from 'gsap';
import { PARTS, SplitUnit, type PartId, type RunState } from '../../three/splitParts';
import { tempColor } from '../../core/roomSim';

interface Props {
  unit: 'indoor' | 'outdoor';
  explode: MutableRefObject<number>;
  exploded: boolean;
  run: MutableRefObject<RunState>;
  mode: 'cool' | 'heat';
  selected: PartId | null;
  hovered: PartId | null;
  isolate: boolean;
  onSelect: (id: PartId | null) => void;
  onHover: (id: PartId | null) => void;
  quality: 'high' | 'low';
  reduced: boolean;
  showLabels: boolean;
}

export function DeviceScene(p: Props) {
  return (
    <Canvas
      dpr={p.quality === 'high' ? [1, 2] : 1}
      camera={{ position: [0.9, 0.55, 1.5], fov: window.innerWidth < 640 ? 58 : 40, near: 0.01, far: 30 }}
      gl={{ antialias: true }}
      onPointerMissed={() => p.onSelect(null)}
    >
      <color attach="background" args={['#0b1730']} />
      <hemisphereLight args={['#dceaff', '#14203a', 0.8]} />
      <directionalLight position={[2, 3, 2]} intensity={2.2} />
      <directionalLight position={[-2, 1, -1.5]} intensity={0.7} color="#9fd3ff" />
      <Grid />
      <group position={[0, p.unit === 'indoor' ? 0.15 : 0.32, 0]}>
        <SplitUnit
          unit={p.unit}
          props={{ run: p.run, explode: p.explode, cutaway: p.selected === 'out-comp', quality: p.quality }}
          selected={p.selected}
          hovered={p.hovered}
          isolate={p.isolate}
          onSelect={p.onSelect}
          onHover={p.onHover}
        />
        {p.showLabels && <Labels unit={p.unit} explode={p.explode} selected={p.selected} onSelect={p.onSelect} />}
        {(p.selected === 'in-evap' || p.selected === 'out-cond') && !p.reduced && (
          <HeatFlow part={p.selected} explode={p.explode} mode={p.mode} quality={p.quality} />
        )}
      </group>
      <Focus selected={p.selected} unit={p.unit} explode={p.explode} exploded={p.exploded} reduced={p.reduced} />
    </Canvas>
  );
}

function Grid() {
  return (
    <group position={[0, -0.25, 0]}>
      <gridHelper args={[6, 30, '#24406f', '#16294a']} />
    </group>
  );
}

function partWorld(id: PartId, e: number, unit: 'indoor' | 'outdoor') {
  const d = PARTS.find((x) => x.id === id)!;
  return new THREE.Vector3(d.pos[0] + d.explode[0] * e, d.pos[1] + d.explode[1] * e + (unit === 'indoor' ? 0.15 : 0.32), d.pos[2] + d.explode[2] * e);
}

/** Камера мягко наводится на выбранную деталь. */
function Focus({ selected, unit, explode, exploded, reduced }: { selected: PartId | null; unit: 'indoor' | 'outdoor'; explode: MutableRefObject<number>; exploded: boolean; reduced: boolean }) {
  const { camera, controls } = useThree() as unknown as { camera: THREE.PerspectiveCamera; controls: { target: THREE.Vector3; update: () => void } | null };
  useEffect(() => {
    if (!controls) return;
    const d = reduced ? 0 : 0.9;
    const target = selected ? partWorld(selected, exploded ? 1 : 0, unit) : new THREE.Vector3(0, unit === 'indoor' ? 0.15 : 0.32, 0);
    gsap.to(controls.target, { x: target.x, y: target.y, z: target.z, duration: d, ease: 'power2.inOut', onUpdate: () => controls.update() });
    const dist = selected ? 0.9 : exploded ? 2.5 : 1.6;
    const dir = camera.position.clone().sub(controls.target).normalize();
    const pos = target.clone().add(dir.multiplyScalar(dist));
    gsap.to(camera.position, { x: pos.x, y: pos.y, z: pos.z, duration: d, ease: 'power2.inOut' });
  }, [selected, unit, exploded]);
  return <OrbitControls makeDefault enableDamping minDistance={0.3} maxDistance={5} />;
}

function Labels({ unit, explode, selected, onSelect }: { unit: 'indoor' | 'outdoor'; explode: MutableRefObject<number>; selected: PartId | null; onSelect: (id: PartId) => void }) {
  const parts = PARTS.filter((p) => p.unit === unit);
  return (
    <>
      {parts.map((p) => (
        <LabelAt key={p.id} id={p.id} name={p.name} explode={explode} active={selected === p.id} onSelect={onSelect} />
      ))}
    </>
  );
}

function LabelAt({ id, name, explode, active, onSelect }: { id: PartId; name: string; explode: MutableRefObject<number>; active: boolean; onSelect: (id: PartId) => void }) {
  const g = useRef<THREE.Group>(null);
  const div = useRef<HTMLDivElement>(null);
  const d = PARTS.find((x) => x.id === id)!;
  useFrame(() => {
    const e = explode.current;
    g.current?.position.set(d.pos[0] + d.explode[0] * e, d.pos[1] + d.explode[1] * e + 0.06, d.pos[2] + d.explode[2] * e);
    if (div.current) div.current.style.opacity = String(active ? 1 : Math.max(0, (e - 0.6) / 0.4));
  });
  return (
    <group ref={g}>
      <Html zIndexRange={[10, 0]}>
        <div
          ref={div}
          className={'label3d' + (active ? ' big' : '')}
          style={{ pointerEvents: 'auto', cursor: 'pointer', borderColor: active ? 'var(--sky)' : undefined }}
          onClick={() => onSelect(id)}
        >
          {name}
        </div>
      </Html>
    </group>
  );
}

/** Демонстрация теплообмена: воздух проходит через рёбра и меняет температуру. */
function HeatFlow({ part, explode, mode, quality }: { part: PartId; explode: MutableRefObject<number>; mode: 'cool' | 'heat'; quality: 'high' | 'low' }) {
  const N = quality === 'high' ? 260 : 110;
  const ref = useRef<THREE.InstancedMesh>(null);
  const g = useRef<THREE.Group>(null);
  const d = PARTS.find((x) => x.id === part)!;
  const st = useMemo(() => ({ u: Float32Array.from({ length: N }, () => Math.random()), x: Float32Array.from({ length: N }, () => Math.random() - 0.5), y: Float32Array.from({ length: N }, () => Math.random() - 0.5) }), [N]);
  const m4 = useMemo(() => new THREE.Matrix4(), []);
  const c = useMemo(() => new THREE.Color(), []);
  const indoor = part === 'in-evap';
  // Температуры воздуха до и после теплообменника.
  const [tIn, tOut] = indoor ? (mode === 'cool' ? [26, 13] : [20, 42]) : mode === 'cool' ? [33, 44] : [7, 2];
  useFrame((_, dt) => {
    const e = explode.current;
    g.current?.position.set(d.pos[0] + d.explode[0] * e, d.pos[1] + d.explode[1] * e, d.pos[2] + d.explode[2] * e);
    for (let i = 0; i < N; i++) {
      st.u[i] += dt * 0.45;
      if (st.u[i] > 1) (st.u[i] = 0), (st.x[i] = Math.random() - 0.5), (st.y[i] = Math.random() - 0.5);
      const u = st.u[i];
      let x: number, y: number, z: number;
      if (indoor) {
        // сверху-сзади через решётку и рёбра → вниз-вперёд к жалюзи
        x = st.x[i] * 0.72;
        y = 0.35 - u * 0.55 + st.y[i] * 0.04;
        z = -0.05 + u * 0.28 + st.y[i] * 0.05;
      } else {
        // сзади через конденсатор → вперёд через вентилятор
        x = -0.13 + st.x[i] * 0.5;
        y = st.y[i] * 0.45;
        z = -0.4 + u * 0.95;
      }
      const cross = indoor ? 0.45 : 0.3; // доля пути до рёбер
      const tt = u < cross ? tIn : u < cross + 0.15 ? tIn + (tOut - tIn) * ((u - cross) / 0.15) : tOut;
      const [r, gg, b] = tempColor(tt);
      c.setRGB(r, gg, b);
      m4.makeScale(0.008, 0.008, 0.008).setPosition(x, y, z);
      ref.current!.setMatrixAt(i, m4);
      ref.current!.setColorAt(i, c);
    }
    ref.current!.instanceMatrix.needsUpdate = true;
    if (ref.current!.instanceColor) ref.current!.instanceColor.needsUpdate = true;
  });
  return (
    <group ref={g}>
      <instancedMesh ref={ref} args={[undefined, undefined, N]} raycast={() => null} frustumCulled={false}>
        <sphereGeometry args={[1, 6, 4]} />
        <meshBasicMaterial transparent opacity={0.85} depthWrite={false} />
      </instancedMesh>
      <Html position={indoor ? [0.46, 0.34, -0.05] : [-0.13, 0.3, -0.42]} zIndexRange={[10, 0]}>
        <div className="label3d">воздух {tIn} °C</div>
      </Html>
      <Html position={indoor ? [0.46, -0.22, 0.25] : [-0.13, 0.3, 0.52]} zIndexRange={[10, 0]}>
        <div className="label3d">{tOut} °C</div>
      </Html>
    </group>
  );
}
