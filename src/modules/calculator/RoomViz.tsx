import { useEffect, useMemo, useRef, type ReactNode } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Html, OrbitControls, RoundedBox } from '@react-three/drei';
import * as THREE from 'three';
import gsap from 'gsap';
import { ORIENT_LABEL, type ApplianceId, type LoadResult, type RoomInput } from '../../core/load';

/** Визуальная модель комнаты для калькулятора: обновляется вместе с параметрами. */
export function RoomViz({ r, res, quality, reduced }: { r: RoomInput; res: LoadResult; quality: 'high' | 'low'; reduced: boolean }) {
  return (
    <Canvas dpr={quality === 'high' ? [1, 2] : 1} camera={{ position: [6, 6, 8], fov: window.innerWidth < 640 ? 55 : 40 }} shadows={quality === 'high'}>
      <color attach="background" args={['#0b1730']} />
      <hemisphereLight args={['#cfe6ff', '#1a2440', 0.6]} />
      <Sun r={r} />
      <Fit r={r} reduced={reduced} />
      <Room r={r} res={res} reduced={reduced} />
    </Canvas>
  );
}

function Fit({ r, reduced }: { r: RoomInput; reduced: boolean }) {
  const { camera, controls } = useThree() as unknown as { camera: THREE.PerspectiveCamera; controls: { target: THREE.Vector3; update: () => void } | null };
  useEffect(() => {
    const s = Math.max(r.length, r.width, 3);
    const pos = new THREE.Vector3(s * 0.75, s * 0.85 + r.height * 0.4, s * 1.25);
    gsap.to(camera.position, { x: pos.x, y: pos.y, z: pos.z, duration: reduced ? 0 : 0.8, ease: 'power2.out', onUpdate: () => controls?.update() });
  }, [r.length, r.width, r.height]);
  return <OrbitControls makeDefault target={[0, 0.8, 0]} enableDamping maxPolarAngle={Math.PI * 0.48} minDistance={3} maxDistance={30} />;
}

const SUN_ELEV = 0.75;
function Sun({ r }: { r: RoomInput }) {
  // Солнце со стороны фасада (окна на стене z = −W/2, «улица» в −z).
  const strength = { N: 0.25, E: 0.85, S: 0.75, W: 1 }[r.orientation] * { none: 1, inner: 1, outer: 0.5, trees: 0.65 }[r.shading];
  return (
    <directionalLight
      position={[-2, 6 * SUN_ELEV + 2, -9]}
      intensity={0.6 + strength * 2.2}
      color={r.orientation === 'N' ? '#cfe0ff' : '#ffe0b0'}
      castShadow
      shadow-mapSize={[1024, 1024]}
      shadow-camera-left={-8}
      shadow-camera-right={8}
      shadow-camera-top={8}
      shadow-camera-bottom={-8}
    />
  );
}

/** Окна: суммарная площадь делится на количество, высота до 1,6 м. */
function windowsLayout(r: RoomInput) {
  const n = Math.max(1, r.windows);
  const each = r.glazing / n;
  let h = Math.min(1.6, r.height - 0.6, Math.sqrt(each * 1.2));
  let w = each / h;
  const maxW = (r.length - 0.3 * (n + 1)) / n;
  if (w > maxW) {
    w = Math.max(0.3, maxW);
    h = Math.min(r.height - 0.2, each / w);
  }
  const gap = (r.length - n * w) / (n + 1);
  const sill = Math.max(0.1, Math.min(0.85, r.height - 0.35 - h));
  return Array.from({ length: n }, (_, i) => ({ x: -r.length / 2 + gap * (i + 1) + w * (i + 0.5), w, h, y: sill + h / 2 }));
}

function Arrow({ from, dir, len, color = '#ff8a3d' }: { from: [number, number, number]; dir: [number, number, number]; len: number; color?: string }) {
  const obj = useMemo(() => new THREE.ArrowHelper(new THREE.Vector3(...dir).normalize(), new THREE.Vector3(...from), Math.max(0.15, len), color, Math.min(0.35, len * 0.35 + 0.08), 0.18), []);
  useEffect(() => {
    obj.position.set(...from);
    obj.setDirection(new THREE.Vector3(...dir).normalize());
    obj.setLength(Math.max(0.15, len), Math.min(0.35, len * 0.35 + 0.08), 0.18);
  }, [from.join(), dir.join(), len]);
  return <primitive object={obj} />;
}

function Pulse({ children, reduced }: { children: ReactNode; reduced: boolean }) {
  const g = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (g.current && !reduced) g.current.position.y = Math.sin(clock.elapsedTime * 2) * 0.03;
  });
  return <group ref={g}>{children}</group>;
}

const APPL_STYLE: Record<ApplianceId, { size: [number, number, number]; color: string; y: number }> = {
  tv: { size: [1.0, 0.6, 0.06], color: '#111722', y: 1.2 },
  pc: { size: [0.22, 0.45, 0.45], color: '#1b222d', y: 0.23 },
  laptop: { size: [0.35, 0.03, 0.25], color: '#9aa5b4', y: 0.76 },
  fridge: { size: [0.6, 1.8, 0.6], color: '#e6ebf0', y: 0.9 },
  cooking: { size: [0.6, 0.9, 0.6], color: '#cfd6de', y: 0.45 },
};

function Room({ r, res, reduced }: { r: RoomInput; res: LoadResult; reduced: boolean }) {
  const L = r.length;
  const W = r.width;
  const H = r.height;
  const wallT = r.insulation === 'good' ? 0.4 : r.insulation === 'medium' ? 0.3 : 0.2;
  const wins = windowsLayout(r);
  const item = (k: string) => res.items.find((i) => i.key === k)?.watts ?? 0;
  const scale = (w: number) => 0.2 + Math.min(1.6, w / 400);
  const zb = -W / 2;

  // раскладка людей и техники по комнате
  const people = Array.from({ length: r.people }, (_, i) => {
    const cols = Math.ceil(Math.sqrt(r.people));
    const row = Math.floor(i / cols);
    const col = i % cols;
    return [(-L / 2 + 0.8 + col * 0.7) * 0.9, (W / 2 - 0.8 - row * 0.7) * 0.9] as [number, number];
  });
  const appl: { id: ApplianceId; x: number; z: number }[] = [];
  let ax = L / 2 - 0.5;
  (Object.keys(r.appliances) as ApplianceId[]).forEach((id) => {
    for (let k = 0; k < r.appliances[id]; k++) {
      appl.push({ id, x: ax, z: W / 2 - 0.5 });
      ax -= 0.8;
    }
  });

  return (
    <group>
      {/* улица: тон земли по климату */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]} receiveShadow>
        <planeGeometry args={[60, 60]} />
        <meshStandardMaterial color={r.region === 'veryhot' ? '#2e2a2a' : r.region === 'hot' ? '#232a36' : '#1b2a3a'} />
      </mesh>
      {/* пол */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]} receiveShadow>
        <planeGeometry args={[L, W]} />
        <meshStandardMaterial color="#9b7b5c" roughness={0.8} />
      </mesh>
      <Html position={[0, 0.05, 0]} center zIndexRange={[5, 0]}>
        <div className="label3d" style={{ transform: 'none' }}>{(L * W).toFixed(1)} м² · {(L * W * H).toFixed(0)} м³</div>
      </Html>

      {/* наружная стена с окнами */}
      <group position={[0, 0, zb - wallT / 2]}>
        <WallWithWindows L={L} H={H} T={wallT} wins={wins} insulation={r.insulation} />
      </group>
      {/* внутренние стены — полупрозрачные */}
      {[-1, 1].map((s) => (
        <mesh key={s} position={[(s * L) / 2, H / 2, 0]}>
          <boxGeometry args={[0.12, H, W]} />
          <meshStandardMaterial color="#c9d3e0" transparent opacity={0.22} depthWrite={false} />
        </mesh>
      ))}
      {/* потолок/кровля */}
      {r.topFloor && (
        <group>
          <mesh position={[0, H + 0.12, 0]}>
            <boxGeometry args={[L + 0.4, 0.24, W + 0.4]} />
            <meshStandardMaterial color="#7a8698" transparent opacity={0.35} depthWrite={false} />
          </mesh>
          <Pulse reduced={reduced}>
            <Arrow from={[0, H + 1.4, 0]} dir={[0, -1, 0]} len={scale(item('roof'))} />
          </Pulse>
        </group>
      )}

      {/* затенение */}
      {wins.map((w, i) => (
        <group key={i} position={[w.x, w.y, zb]}>
          {r.shading === 'outer' && (
            <mesh position={[0, w.h / 2 + 0.05, -wallT - 0.35]} rotation={[-0.45, 0, 0]}>
              <boxGeometry args={[w.w + 0.2, 0.03, 0.8]} />
              <meshStandardMaterial color="#d36b2b" />
            </mesh>
          )}
          {r.shading === 'inner' &&
            Array.from({ length: Math.max(3, Math.round(w.h / 0.12)) }).map((_, k) => (
              <mesh key={k} position={[0, w.h / 2 - 0.06 - k * 0.12, 0.08]} rotation={[0.6, 0, 0]}>
                <boxGeometry args={[w.w, 0.005, 0.07]} />
                <meshStandardMaterial color="#e9edf2" />
              </mesh>
            ))}
          {/* солнечный приток через окно */}
          <Pulse reduced={reduced}>
            <Arrow from={[0, w.h / 2 - 0.1, 0.1]} dir={[0.1, -0.45, 1]} len={scale(item('solar') / wins.length) + 0.3} color="#ffc857" />
          </Pulse>
        </group>
      ))}
      {r.shading === 'trees' && (
        <group position={[0, 0, zb - 3]}>
          {[-L / 3, L / 4].map((x) => (
            <group key={x} position={[x, 0, 0]}>
              <mesh position={[0, 1, 0]}>
                <cylinderGeometry args={[0.1, 0.14, 2, 8]} />
                <meshStandardMaterial color="#5a4632" />
              </mesh>
              <mesh position={[0, 2.6, 0]} castShadow>
                <icosahedronGeometry args={[1.2, 1]} />
                <meshStandardMaterial color="#2f6b48" flatShading />
              </mesh>
            </group>
          ))}
        </group>
      )}

      {/* стена: теплопередача */}
      <Pulse reduced={reduced}>
        <Arrow from={[-L / 2 + 0.35, H * 0.8, zb + 0.05]} dir={[0, -0.15, 1]} len={scale(item('wall'))} />
      </Pulse>

      {/* люди */}
      {people.map(([x, z], i) => (
        <group key={i} position={[x, 0, z]}>
          <mesh position={[0, 0.75, 0]} castShadow>
            <capsuleGeometry args={[0.18, 0.9, 6, 12]} />
            <meshStandardMaterial color={i % 2 ? '#e38b5a' : '#4aa0d8'} />
          </mesh>
          <mesh position={[0, 1.45, 0]}>
            <sphereGeometry args={[0.13, 14, 10]} />
            <meshStandardMaterial color="#e9c2a0" />
          </mesh>
        </group>
      ))}
      {/* техника */}
      {appl.map((a, i) => {
        const s = APPL_STYLE[a.id];
        return (
          <RoundedBox key={i} args={s.size} radius={0.015} position={[a.x, s.y, a.z]} castShadow>
            <meshStandardMaterial color={s.color} emissive={a.id === 'cooking' ? '#ff5a1f' : a.id === 'tv' ? '#1c3d6b' : '#000'} emissiveIntensity={a.id === 'cooking' ? 0.5 : 0.6} />
          </RoundedBox>
        );
      })}

      {/* компас */}
      <Html position={[0, 0.1, zb - wallT - 1.8]} center zIndexRange={[5, 0]}>
        <div className="label3d" style={{ transform: 'none', color: 'var(--warn)' }}>окна → {ORIENT_LABEL[r.orientation]}</div>
      </Html>
    </group>
  );
}

function WallWithWindows({ L, H, T, wins, insulation }: { L: number; H: number; T: number; wins: { x: number; w: number; h: number; y: number }[]; insulation: RoomInput['insulation'] }) {
  const geo = useMemo(() => {
    const s = new THREE.Shape();
    s.moveTo(-L / 2, 0);
    s.lineTo(L / 2, 0);
    s.lineTo(L / 2, H);
    s.lineTo(-L / 2, H);
    s.lineTo(-L / 2, 0);
    for (const w of wins) {
      const p = new THREE.Path();
      p.moveTo(w.x - w.w / 2, w.y - w.h / 2);
      p.lineTo(w.x + w.w / 2, w.y - w.h / 2);
      p.lineTo(w.x + w.w / 2, w.y + w.h / 2);
      p.lineTo(w.x - w.w / 2, w.y + w.h / 2);
      p.lineTo(w.x - w.w / 2, w.y - w.h / 2);
      s.holes.push(p);
    }
    const g = new THREE.ExtrudeGeometry(s, { depth: T, bevelEnabled: false });
    g.translate(0, 0, -T / 2);
    return g;
  }, [L, H, T, wins.map((w) => `${w.x}${w.w}${w.h}${w.y}`).join()]);
  const insColor = insulation === 'good' ? '#ffb07a' : insulation === 'medium' ? '#d8c3a8' : '#a9a29a';
  return (
    <group>
      <mesh geometry={geo} castShadow receiveShadow>
        <meshStandardMaterial color="#dfe6ef" roughness={0.9} />
      </mesh>
      {/* слой утеплителя снаружи */}
      {insulation !== 'poor' && (
        <mesh geometry={geo} position={[0, 0, -T / 2 - 0.02]} scale={[1, 1, 0.12]}>
          <meshStandardMaterial color={insColor} roughness={1} />
        </mesh>
      )}
      {wins.map((w, i) => (
        <mesh key={i} position={[w.x, w.y, 0]}>
          <boxGeometry args={[w.w, w.h, 0.03]} />
          <meshStandardMaterial color="#9fd3ff" transparent opacity={0.3} />
        </mesh>
      ))}
    </group>
  );
}
