import { useEffect, useMemo, useRef, type MutableRefObject, type ReactNode } from 'react';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import { RoundedBox } from '@react-three/drei';
import * as THREE from 'three';
import { Fins, Pipe, Tube } from './primitives';

/**
 * Детализированная модель бытовой настенной сплит-системы.
 * Размеры в метрах, типичные для класса 09–12. Начало координат — центр блока, лицевая сторона +Z.
 * Каждая деталь — отдельная группа: собранное положение + вектор «разлёта» для режима разборки.
 */

export type PartId =
  | 'in-chassis' | 'in-front' | 'in-filters' | 'in-evap' | 'in-fan' | 'in-pan' | 'in-louvers' | 'in-pcb' | 'in-sensors'
  | 'out-casing' | 'out-cond' | 'out-fan' | 'out-comp' | 'out-4way' | 'out-eev' | 'out-pcb' | 'out-valves' | 'out-base';

export interface RunState {
  running: boolean;
  mode: 'cool' | 'heat';
  speed: number; // множитель скорости анимаций (0 — без вращения)
}

export interface PartRenderProps {
  run: MutableRefObject<RunState>;
  explode: MutableRefObject<number>;
  cutaway: boolean;
  quality: 'high' | 'low';
}

export interface PartDef {
  id: PartId;
  unit: 'indoor' | 'outdoor';
  name: string;
  pos: [number, number, number];
  explode: [number, number, number];
  Comp: (p: PartRenderProps) => ReactNode;
}

const WHITE = '#eef2f6';
const GREY = '#9aa5b4';
const DARK = '#2b3340';
const COPPER = '#c8763f';
const BRASS = '#c9a23e';
const PCB = '#1f6b47';

function Mat({ color, metal = 0.1, rough = 0.5 }: { color: string; metal?: number; rough?: number }) {
  return <meshStandardMaterial color={color} metalness={metal} roughness={rough} />;
}

/* ===================== ВНУТРЕННИЙ БЛОК ===================== */

function InChassis() {
  return (
    <group>
      <mesh position={[0, 0, -0.085]}>
        <boxGeometry args={[0.88, 0.27, 0.03]} />
        <Mat color="#d7dde5" rough={0.7} />
      </mesh>
      {[-0.44, 0.44].map((x) => (
        <mesh key={x} position={[x, 0, -0.01]}>
          <boxGeometry args={[0.02, 0.27, 0.18]} />
          <Mat color="#dfe4ea" rough={0.6} />
        </mesh>
      ))}
      {/* монтажная пластина */}
      <mesh position={[0, 0.02, -0.105]}>
        <boxGeometry args={[0.6, 0.2, 0.006]} />
        <Mat color={GREY} metal={0.6} rough={0.4} />
      </mesh>
      {/* выводы труб сзади слева */}
      <Tube from={[-0.36, -0.08, -0.08]} to={[-0.36, -0.08, -0.2]} r={0.0045} color={COPPER} />
      <Tube from={[-0.32, -0.08, -0.08]} to={[-0.32, -0.08, -0.2]} r={0.007} color={COPPER} />
    </group>
  );
}

function InFront() {
  return (
    <group>
      <RoundedBox args={[0.9, 0.24, 0.03]} radius={0.012} smoothness={3} position={[0, 0.02, 0]}>
        <Mat color={WHITE} rough={0.25} />
      </RoundedBox>
      {/* окно дисплея */}
      <mesh position={[0.3, -0.04, 0.016]}>
        <planeGeometry args={[0.07, 0.022]} />
        <meshStandardMaterial color="#0d1a2e" emissive="#5cc8ff" emissiveIntensity={0.6} />
      </mesh>
    </group>
  );
}

function InFilters({ explode }: PartRenderProps) {
  const l = useRef<THREE.Group>(null);
  const r = useRef<THREE.Group>(null);
  useFrame(() => {
    const e = explode.current;
    if (l.current) l.current.position.x = -0.205 - e * 0.08;
    if (r.current) r.current.position.x = 0.205 + e * 0.08;
  });
  const filter = (
    <group rotation={[-0.25, 0, 0]}>
      <mesh>
        <boxGeometry args={[0.39, 0.006, 0.17]} />
        <meshStandardMaterial color="#e9eef3" transparent opacity={0.35} />
      </mesh>
      {[-0.19, 0.19].map((x) => (
        <mesh key={x} position={[x, 0, 0]}>
          <boxGeometry args={[0.012, 0.01, 0.17]} />
          <Mat color="#cfd6de" />
        </mesh>
      ))}
      {[-0.08, 0, 0.08].map((z) => (
        <mesh key={z} position={[0, 0, z]}>
          <boxGeometry args={[0.39, 0.008, 0.008]} />
          <Mat color="#cfd6de" />
        </mesh>
      ))}
    </group>
  );
  return (
    <group>
      <group ref={l}>{filter}</group>
      <group ref={r}>{filter}</group>
    </group>
  );
}

function InEvap({ quality }: PartRenderProps) {
  const n = quality === 'high' ? 70 : 28;
  return (
    <group>
      {/* передняя секция */}
      <group position={[0, -0.01, 0.045]} rotation={[0.22, 0, 0]}>
        <Fins count={n} plate={[0.0015, 0.17, 0.03]} span={0.74} />
        {[-0.06, -0.02, 0.02, 0.06].map((y) => (
          <Tube key={y} from={[-0.38, y, 0]} to={[0.38, y, 0]} r={0.0045} color={COPPER} />
        ))}
      </group>
      {/* верхняя задняя секция */}
      <group position={[0, 0.085, -0.02]} rotation={[-0.95, 0, 0]}>
        <Fins count={n} plate={[0.0015, 0.12, 0.03]} span={0.74} />
        {[-0.03, 0.02].map((y) => (
          <Tube key={y} from={[-0.38, y, 0]} to={[0.38, y, 0]} r={0.0045} color={COPPER} />
        ))}
      </group>
      {/* калачи и коллектор слева */}
      <Pipe points={[[-0.39, -0.07, 0.03], [-0.41, -0.07, 0.03], [-0.41, 0.1, -0.03], [-0.39, 0.1, -0.03]]} r={0.004} color={COPPER} />
    </group>
  );
}

function InFan({ run, quality }: PartRenderProps) {
  const rotor = useRef<THREE.Group>(null);
  useFrame((_, dt) => {
    const r = run.current;
    if (rotor.current && r.running) rotor.current.rotation.x -= dt * 14 * r.speed;
  });
  const blades = quality === 'high' ? 28 : 14;
  return (
    <group>
      <group ref={rotor}>
        {Array.from({ length: blades }).map((_, i) => {
          const a = (i / blades) * Math.PI * 2;
          return (
            <mesh key={i} position={[0, Math.cos(a) * 0.042, Math.sin(a) * 0.042]} rotation={[a + 0.5, 0, 0]}>
              <boxGeometry args={[0.66, 0.016, 0.0025]} />
              <Mat color="#4a5568" rough={0.6} />
            </mesh>
          );
        })}
        {[-0.33, -0.22, -0.11, 0, 0.11, 0.22, 0.33].map((x) => (
          <mesh key={x} position={[x, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.047, 0.047, 0.004, 24]} />
            <Mat color="#3b4452" />
          </mesh>
        ))}
      </group>
      {/* электродвигатель вентилятора */}
      <mesh position={[0.385, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.03, 0.03, 0.05, 20]} />
        <Mat color={DARK} metal={0.5} />
      </mesh>
    </group>
  );
}

function InPan() {
  return (
    <group>
      <mesh>
        <boxGeometry args={[0.78, 0.008, 0.07]} />
        <Mat color="#c3ccd7" />
      </mesh>
      <mesh position={[0, 0.012, 0.035]}>
        <boxGeometry args={[0.78, 0.024, 0.006]} />
        <Mat color="#c3ccd7" />
      </mesh>
      <mesh position={[0, 0.012, -0.035]}>
        <boxGeometry args={[0.78, 0.024, 0.006]} />
        <Mat color="#c3ccd7" />
      </mesh>
      {/* штуцер дренажа и шланг */}
      <Pipe points={[[-0.38, -0.004, 0], [-0.4, -0.03, 0], [-0.4, -0.06, -0.08]]} r={0.008} color="#9db0c4" />
    </group>
  );
}

function InLouvers({ run }: PartRenderProps) {
  const flap = useRef<THREE.Group>(null);
  useFrame((_, dt) => {
    const target = !run.current.running ? 1.35 : run.current.mode === 'heat' ? 0.95 : 0.35;
    if (flap.current) flap.current.rotation.x += (target - flap.current.rotation.x) * Math.min(1, dt * 3);
  });
  return (
    <group>
      <group ref={flap} rotation={[1.35, 0, 0]}>
        <mesh position={[0, 0, 0.03]}>
          <boxGeometry args={[0.72, 0.004, 0.06]} />
          <Mat color={WHITE} rough={0.3} />
        </mesh>
      </group>
      {Array.from({ length: 9 }).map((_, i) => (
        <mesh key={i} position={[-0.32 + i * 0.08, 0.015, -0.01]}>
          <boxGeometry args={[0.003, 0.03, 0.04]} />
          <Mat color="#d5dbe2" />
        </mesh>
      ))}
    </group>
  );
}

function InPcb() {
  return (
    <group>
      <mesh>
        <boxGeometry args={[0.012, 0.16, 0.12]} />
        <Mat color={PCB} rough={0.6} />
      </mesh>
      {[
        [0.012, 0.04, 0.02, 0.03, 0.03],
        [0.01, -0.03, -0.02, 0.025, 0.04],
        [0.014, 0.0, 0.04, 0.02, 0.02],
      ].map(([x, y, z, h, d], i) => (
        <mesh key={i} position={[x, y, z]}>
          <boxGeometry args={[0.012, h, d]} />
          <Mat color={i === 2 ? '#7a4a1e' : '#141a22'} />
        </mesh>
      ))}
    </group>
  );
}

function InSensors() {
  return (
    <group>
      {/* датчик воздуха на входе */}
      <mesh position={[0, 0.1, 0.02]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.006, 0.006, 0.03, 10]} />
        <Mat color="#11151b" />
      </mesh>
      <Tube from={[0.015, 0.1, 0.02]} to={[0.08, 0.06, 0.02]} r={0.0015} color="#e7e7e7" />
      {/* датчик теплообменника на трубке */}
      <mesh position={[-0.05, -0.02, 0.03]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.007, 0.007, 0.025, 10]} />
        <Mat color={BRASS} metal={0.8} rough={0.3} />
      </mesh>
      <Tube from={[-0.05, -0.02, 0.03]} to={[0.08, 0.04, 0.02]} r={0.0015} color="#e7e7e7" />
    </group>
  );
}

/* ===================== НАРУЖНЫЙ БЛОК ===================== */

function OutCasing() {
  const panel = useMemo(() => {
    const s = new THREE.Shape();
    s.moveTo(-0.4, -0.26);
    s.lineTo(0.4, -0.26);
    s.lineTo(0.4, 0.27);
    s.lineTo(-0.4, 0.27);
    s.lineTo(-0.4, -0.26);
    const h = new THREE.Path();
    h.absarc(-0.13, 0.01, 0.215, 0, Math.PI * 2, true);
    s.holes.push(h);
    return new THREE.ExtrudeGeometry(s, { depth: 0.012, bevelEnabled: false, curveSegments: 40 });
  }, []);
  return (
    <group>
      <mesh geometry={panel} position={[0, 0, 0.142]}>
        <Mat color={WHITE} rough={0.45} />
      </mesh>
      {/* защитная решётка */}
      {[0.07, 0.12, 0.17, 0.215].map((r) => (
        <mesh key={r} position={[-0.13, 0.01, 0.16]}>
          <torusGeometry args={[r, 0.0025, 6, 48]} />
          <Mat color="#2a3140" />
        </mesh>
      ))}
      {[0, Math.PI / 2].map((a) => (
        <mesh key={a} position={[-0.13, 0.01, 0.16]} rotation={[0, 0, a]}>
          <boxGeometry args={[0.43, 0.005, 0.004]} />
          <Mat color="#2a3140" />
        </mesh>
      ))}
      <mesh position={[0, 0.278, 0]}>
        <boxGeometry args={[0.82, 0.012, 0.31]} />
        <Mat color={WHITE} rough={0.45} />
      </mesh>
      <mesh position={[0.405, 0, 0]}>
        <boxGeometry args={[0.012, 0.55, 0.3]} />
        <Mat color="#e4e9ef" rough={0.45} />
      </mesh>
    </group>
  );
}

function OutCond({ quality }: PartRenderProps) {
  const n = quality === 'high' ? 70 : 26;
  return (
    <group>
      {/* задняя сторона */}
      <group position={[-0.13, 0, -0.125]}>
        <Fins count={n} plate={[0.0015, 0.5, 0.025]} span={0.52} />
        {[-0.2, -0.12, -0.04, 0.04, 0.12, 0.2].map((y) => (
          <Tube key={y} from={[-0.26, y, 0]} to={[0.26, y, 0]} r={0.005} color={COPPER} />
        ))}
      </group>
      {/* боковая сторона */}
      <group position={[-0.385, 0, 0]}>
        <Fins count={Math.round(n / 2)} plate={[0.025, 0.5, 0.0015]} axis="z" span={0.24} />
        {[-0.2, -0.12, -0.04, 0.04, 0.12, 0.2].map((y) => (
          <Tube key={y} from={[0, y, -0.12]} to={[0, y, 0.12]} r={0.005} color={COPPER} />
        ))}
      </group>
    </group>
  );
}

function OutFan({ run }: PartRenderProps) {
  const rotor = useRef<THREE.Group>(null);
  useFrame((_, dt) => {
    const r = run.current;
    if (rotor.current && r.running) rotor.current.rotation.z -= dt * 9 * r.speed;
  });
  return (
    <group>
      <group ref={rotor}>
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.04, 0.04, 0.05, 20]} />
          <Mat color="#1d232c" />
        </mesh>
        {[0, 1, 2].map((i) => (
          <group key={i} rotation={[0, 0, (i * Math.PI * 2) / 3]}>
            <mesh position={[0.11, 0, 0]} rotation={[0.45, 0, 0]}>
              <boxGeometry args={[0.16, 0.11, 0.004]} />
              <Mat color="#222a35" rough={0.55} />
            </mesh>
          </group>
        ))}
      </group>
      {/* двигатель и кронштейн */}
      <mesh position={[0, 0, -0.06]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.05, 0.05, 0.07, 20]} />
        <Mat color={DARK} metal={0.5} />
      </mesh>
      <mesh position={[0, 0, -0.1]}>
        <boxGeometry args={[0.03, 0.5, 0.01]} />
        <Mat color={GREY} metal={0.6} />
      </mesh>
    </group>
  );
}

function OutComp({ run, cutaway }: PartRenderProps) {
  const roller = useRef<THREE.Group>(null);
  const vane = useRef<THREE.Mesh>(null);
  const motor = useRef<THREE.Mesh>(null);
  const ang = useRef(0);
  useFrame((_, dt) => {
    const r = run.current;
    if (!r.running) return;
    ang.current += dt * 4 * r.speed;
    const a = ang.current;
    const e = 0.012; // эксцентриситет
    if (roller.current) roller.current.position.set(Math.cos(a) * e, -0.07, Math.sin(a) * e);
    if (motor.current) motor.current.rotation.y = a;
    // лопасть прижата к ролику (направлена по оси +Z)
    const rc = 0.035;
    const zContact = Math.sin(a) * e + Math.sqrt(Math.max(0, rc * rc - (Math.cos(a) * e) ** 2));
    if (vane.current) vane.current.position.set(0, -0.07, zContact + 0.012);
  });
  const shellMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: '#3a4250', metalness: 0.55, roughness: 0.35, transparent: true, opacity: 1 }),
    [],
  );
  useEffect(() => {
    shellMat.opacity = cutaway ? 0.18 : 1;
    shellMat.depthWrite = !cutaway;
  }, [cutaway, shellMat]);
  return (
    <group>
      <mesh material={shellMat} userData={{ keepMaterial: true }}>
        <cylinderGeometry args={[0.07, 0.07, 0.2, 32]} />
      </mesh>
      <mesh position={[0, 0.1, 0]} material={shellMat} userData={{ keepMaterial: true }}>
        <sphereGeometry args={[0.07, 32, 12, 0, Math.PI * 2, 0, Math.PI / 2]} />
      </mesh>
      {/* отделитель жидкости (аккумулятор) */}
      <mesh position={[-0.11, 0.02, 0]}>
        <cylinderGeometry args={[0.032, 0.032, 0.16, 20]} />
        <Mat color="#384050" metal={0.5} rough={0.4} />
      </mesh>
      <Pipe points={[[-0.11, 0.1, 0], [-0.11, 0.12, 0], [-0.06, 0.12, 0], [-0.05, -0.05, 0.0]]} r={0.006} color={COPPER} />
      <Pipe points={[[0, 0.17, 0], [0, 0.23, 0], [0, 0.23, 0.0]]} r={0.005} color={COPPER} />
      {/* клеммная коробка */}
      <mesh position={[0, 0.05, 0.072]}>
        <boxGeometry args={[0.04, 0.03, 0.01]} />
        <Mat color="#151a21" />
      </mesh>
      {cutaway && (
        <group>
          {/* ротор электродвигателя */}
          <mesh ref={motor} position={[0, 0.03, 0]}>
            <cylinderGeometry args={[0.04, 0.04, 0.09, 6]} />
            <meshStandardMaterial color="#b0743a" metalness={0.7} roughness={0.35} />
          </mesh>
          {/* цилиндр насосной части */}
          <mesh position={[0, -0.07, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[0.05, 0.006, 8, 32]} />
            <meshStandardMaterial color="#9aa5b4" metalness={0.7} roughness={0.3} />
          </mesh>
          <group ref={roller} position={[0.012, -0.07, 0]}>
            <mesh>
              <cylinderGeometry args={[0.035, 0.035, 0.03, 32]} />
              <meshStandardMaterial color="#5cc8ff" metalness={0.4} roughness={0.3} emissive="#123a5a" />
            </mesh>
          </group>
          <mesh ref={vane} position={[0, -0.07, 0.05]}>
            <boxGeometry args={[0.006, 0.03, 0.024]} />
            <meshStandardMaterial color="#ff8a3d" emissive="#5a2a08" />
          </mesh>
        </group>
      )}
    </group>
  );
}

function Out4Way() {
  return (
    <group>
      <mesh rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.016, 0.016, 0.08, 16]} />
        <Mat color={BRASS} metal={0.85} rough={0.3} />
      </mesh>
      <mesh position={[0, 0.03, 0]}>
        <boxGeometry args={[0.03, 0.03, 0.03]} />
        <Mat color="#151a21" />
      </mesh>
      <Tube from={[0, -0.016, 0]} to={[0, -0.06, 0]} r={0.005} color={COPPER} />
      {[-0.025, 0, 0.025].map((x) => (
        <Tube key={x} from={[x, 0.0, -0.016]} to={[x, 0.0, -0.06]} r={0.005} color={COPPER} />
      ))}
    </group>
  );
}

function OutEev() {
  return (
    <group>
      <mesh>
        <cylinderGeometry args={[0.012, 0.012, 0.05, 14]} />
        <Mat color={BRASS} metal={0.85} rough={0.3} />
      </mesh>
      <mesh position={[0, 0.045, 0]}>
        <cylinderGeometry args={[0.02, 0.02, 0.035, 16]} />
        <Mat color="#151a21" />
      </mesh>
      <Tube from={[0, -0.025, 0]} to={[0, -0.07, 0]} r={0.004} color={COPPER} />
      <Tube from={[0, -0.01, 0.012]} to={[0, -0.01, 0.05]} r={0.004} color={COPPER} />
    </group>
  );
}

function OutPcb() {
  return (
    <group>
      <mesh>
        <boxGeometry args={[0.22, 0.012, 0.22]} />
        <Mat color={PCB} rough={0.6} />
      </mesh>
      {/* радиатор силовых модулей */}
      {Array.from({ length: 8 }).map((_, i) => (
        <mesh key={i} position={[-0.05 + i * 0.012, -0.03, 0.03]}>
          <boxGeometry args={[0.003, 0.05, 0.1]} />
          <Mat color="#aab4c0" metal={0.8} rough={0.3} />
        </mesh>
      ))}
      {[
        [0.06, 0.03, -0.05, 0.04],
        [-0.06, 0.025, -0.06, 0.03],
        [0.05, 0.02, 0.06, 0.03],
      ].map(([x, h, z, r], i) => (
        <mesh key={i} position={[x, h / 2 + 0.006, z]}>
          <cylinderGeometry args={[r / 2, r / 2, h, 14]} />
          <Mat color={i === 0 ? '#1d2c55' : '#111'} />
        </mesh>
      ))}
    </group>
  );
}

function OutValves() {
  return (
    <group>
      {[0, -0.06].map((y, i) => (
        <group key={y} position={[0, y, 0]}>
          <mesh>
            <boxGeometry args={[0.035, 0.035, 0.035]} />
            <Mat color={BRASS} metal={0.85} rough={0.3} />
          </mesh>
          <mesh position={[0.03, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[i ? 0.008 : 0.011, i ? 0.008 : 0.011, 0.03, 14]} />
            <Mat color={BRASS} metal={0.85} rough={0.3} />
          </mesh>
          <mesh position={[0, 0, 0.028]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.012, 0.012, 0.02, 6]} />
            <Mat color="#d9b24a" metal={0.85} rough={0.3} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function OutBase() {
  return (
    <group>
      <mesh position={[0, -0.27, 0]}>
        <boxGeometry args={[0.82, 0.02, 0.31]} />
        <Mat color="#cdd4dc" rough={0.6} />
      </mesh>
      {[-0.28, 0.28].map((x) => (
        <mesh key={x} position={[x, -0.29, 0]}>
          <boxGeometry args={[0.06, 0.02, 0.34]} />
          <Mat color="#cdd4dc" rough={0.6} />
        </mesh>
      ))}
      {/* перегородка между вентиляторным и компрессорным отсеками */}
      <mesh position={[0.13, 0, 0]}>
        <boxGeometry args={[0.006, 0.52, 0.28]} />
        <Mat color={GREY} metal={0.5} rough={0.5} />
      </mesh>
    </group>
  );
}

/* ===================== РЕЕСТР ДЕТАЛЕЙ ===================== */

export const PARTS: PartDef[] = [
  { id: 'in-chassis', unit: 'indoor', name: 'Корпус и монтажная пластина', pos: [0, 0, 0], explode: [0, 0, -0.32], Comp: InChassis },
  { id: 'in-front', unit: 'indoor', name: 'Лицевая панель', pos: [0, 0, 0.1], explode: [0, 0.08, 0.6], Comp: InFront },
  { id: 'in-filters', unit: 'indoor', name: 'Воздушные фильтры', pos: [0, 0.125, 0.03], explode: [0, 0.42, 0.18], Comp: InFilters },
  { id: 'in-evap', unit: 'indoor', name: 'Испаритель', pos: [0, 0.0, 0.0], explode: [0, 0.22, 0.3], Comp: InEvap },
  { id: 'in-fan', unit: 'indoor', name: 'Тангенциальный вентилятор', pos: [0, -0.055, -0.03], explode: [0, -0.26, 0.14], Comp: InFan },
  { id: 'in-pan', unit: 'indoor', name: 'Дренажный поддон', pos: [0, -0.1, 0.06], explode: [0, -0.2, 0.42], Comp: InPan },
  { id: 'in-louvers', unit: 'indoor', name: 'Жалюзи', pos: [0, -0.12, 0.08], explode: [0, -0.34, 0.5], Comp: InLouvers },
  { id: 'in-pcb', unit: 'indoor', name: 'Плата управления', pos: [0.4, 0.0, 0.0], explode: [0.42, 0.05, 0.2], Comp: InPcb },
  { id: 'in-sensors', unit: 'indoor', name: 'Датчики температуры', pos: [-0.25, 0.02, 0.03], explode: [-0.4, 0.18, 0.4], Comp: InSensors },

  { id: 'out-base', unit: 'outdoor', name: 'Основание и перегородка', pos: [0, 0, 0], explode: [0, -0.12, 0], Comp: OutBase },
  { id: 'out-casing', unit: 'outdoor', name: 'Корпус и защитная решётка', pos: [0, 0, 0], explode: [0, 0.2, 0.65], Comp: OutCasing },
  { id: 'out-cond', unit: 'outdoor', name: 'Конденсатор (теплообменник)', pos: [0, 0, 0], explode: [-0.12, 0, -0.5], Comp: OutCond },
  { id: 'out-fan', unit: 'outdoor', name: 'Осевой вентилятор', pos: [-0.13, 0.01, 0.07], explode: [-0.08, 0, 0.38], Comp: OutFan },
  { id: 'out-comp', unit: 'outdoor', name: 'Компрессор', pos: [0.27, -0.14, -0.02], explode: [0.3, -0.08, 0.25], Comp: OutComp },
  { id: 'out-4way', unit: 'outdoor', name: 'Четырёхходовой клапан', pos: [0.24, 0.11, -0.03], explode: [0.4, 0.22, 0.28], Comp: Out4Way },
  { id: 'out-eev', unit: 'outdoor', name: 'Электронный расширительный вентиль', pos: [0.2, 0.06, 0.08], explode: [0.15, 0.3, 0.5], Comp: OutEev },
  { id: 'out-pcb', unit: 'outdoor', name: 'Плата инвертора', pos: [0.27, 0.235, 0], explode: [0.25, 0.5, -0.05], Comp: OutPcb },
  { id: 'out-valves', unit: 'outdoor', name: 'Запорные (сервисные) вентили', pos: [0.43, -0.12, 0.09], explode: [0.42, -0.1, 0.15], Comp: OutValves },
];

/* ===================== СБОРКА ===================== */

function PartGroup({
  def,
  props,
  selected,
  ghost,
  hovered,
  onSelect,
  onHover,
}: {
  def: PartDef;
  props: PartRenderProps;
  selected: boolean;
  ghost: boolean;
  hovered: boolean;
  onSelect?: (id: PartId) => void;
  onHover?: (id: PartId | null) => void;
}) {
  const g = useRef<THREE.Group>(null);
  useFrame(() => {
    const e = props.explode.current;
    g.current?.position.set(def.pos[0] + def.explode[0] * e, def.pos[1] + def.explode[1] * e, def.pos[2] + def.explode[2] * e);
  });
  // Подсветка выбранной детали и «призрачный» режим остальных.
  useEffect(() => {
    g.current?.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh || m.userData.keepMaterial) return;
      const mats = Array.isArray(m.material) ? m.material : [m.material];
      for (const mat of mats as THREE.MeshStandardMaterial[]) {
        if (!mat.userData.base) mat.userData.base = { opacity: mat.opacity, transparent: mat.transparent };
        mat.transparent = ghost || mat.userData.base.transparent;
        mat.opacity = ghost ? 0.12 : mat.userData.base.opacity;
        mat.depthWrite = !ghost;
        if (mat.emissive) {
          if (!mat.userData.baseEmissive) mat.userData.baseEmissive = mat.emissive.clone();
          mat.emissive.copy(selected ? new THREE.Color('#0f3a5c') : hovered ? new THREE.Color('#0b2a44') : mat.userData.baseEmissive);
        }
        mat.needsUpdate = true;
      }
    });
  }, [selected, ghost, hovered]);
  const Comp = def.Comp;
  return (
    <group
      ref={g}
      onClick={
        onSelect
          ? (e: ThreeEvent<MouseEvent>) => {
              e.stopPropagation();
              onSelect(def.id);
            }
          : undefined
      }
      onPointerOver={
        onHover
          ? (e: ThreeEvent<PointerEvent>) => {
              e.stopPropagation();
              onHover(def.id);
              document.body.style.cursor = 'pointer';
            }
          : undefined
      }
      onPointerOut={
        onHover
          ? () => {
              onHover(null);
              document.body.style.cursor = '';
            }
          : undefined
      }
    >
      <Comp {...props} />
    </group>
  );
}

export function SplitUnit({
  unit,
  props,
  selected = null,
  hovered = null,
  isolate = false,
  onSelect,
  onHover,
}: {
  unit: 'indoor' | 'outdoor';
  props: PartRenderProps;
  selected?: PartId | null;
  hovered?: PartId | null;
  isolate?: boolean;
  onSelect?: (id: PartId) => void;
  onHover?: (id: PartId | null) => void;
}) {
  return (
    <group>
      {PARTS.filter((p) => p.unit === unit).map((p) => (
        <PartGroup
          key={p.id}
          def={p}
          props={{ ...props, cutaway: props.cutaway && selected === p.id }}
          selected={selected === p.id}
          hovered={hovered === p.id}
          ghost={(isolate && !!selected && selected !== p.id) || (props.cutaway && selected === 'out-comp' && p.id === 'out-casing')}
          onSelect={onSelect}
          onHover={onHover}
        />
      ))}
    </group>
  );
}
