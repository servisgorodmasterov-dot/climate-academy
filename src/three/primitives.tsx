import { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';

/** Набор тонких пластин (рёбер теплообменника) одним InstancedMesh. */
export function Fins({
  count,
  plate,
  axis = 'x',
  span,
  color = '#c9d3df',
  position = [0, 0, 0],
  rotation = [0, 0, 0],
}: {
  count: number;
  plate: [number, number, number];
  axis?: 'x' | 'z';
  span: number;
  color?: string;
  position?: [number, number, number];
  rotation?: [number, number, number];
}) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ color, metalness: 0.75, roughness: 0.35 }), [color]);
  const geo = useMemo(() => new THREE.BoxGeometry(...plate), [plate[0], plate[1], plate[2]]);
  useLayoutEffect(() => {
    const m = new THREE.Matrix4();
    for (let i = 0; i < count; i++) {
      const t = count === 1 ? 0 : i / (count - 1) - 0.5;
      if (axis === 'x') m.makeTranslation(t * span, 0, 0);
      else m.makeTranslation(0, 0, t * span);
      ref.current!.setMatrixAt(i, m);
    }
    ref.current!.instanceMatrix.needsUpdate = true;
  }, [count, span, axis]);
  return (
    <group position={position} rotation={rotation}>
      <instancedMesh ref={ref} args={[geo, mat, count]} />
    </group>
  );
}

/** Медная трубка между двумя точками. */
export function Tube({ from, to, r = 0.006, color = '#c8763f', metal = 0.85 }: { from: [number, number, number]; to: [number, number, number]; r?: number; color?: string; metal?: number }) {
  const { pos, quat, len } = useMemo(() => {
    const a = new THREE.Vector3(...from);
    const b = new THREE.Vector3(...to);
    const d = b.clone().sub(a);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize());
    return { pos: a.add(b).multiplyScalar(0.5), quat: q, len: d.length() };
  }, [from.join(), to.join()]);
  return (
    <mesh position={pos} quaternion={quat}>
      <cylinderGeometry args={[r, r, len, 12]} />
      <meshStandardMaterial color={color} metalness={metal} roughness={metal > 0.5 ? 0.3 : 0.75} />
    </mesh>
  );
}

/** Гофрированный шланг (дренаж): трубка по ломаной + кольца гофры. */
export function Hose({ points, r = 0.009, color = '#d9dee5', pitch = 0.035 }: { points: [number, number, number][]; r?: number; color?: string; pitch?: number }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const rings = useMemo(() => {
    const res: THREE.Matrix4[] = [];
    const up = new THREE.Vector3(0, 0, 1); // ось тора — Z
    for (let i = 1; i < points.length; i++) {
      const a = new THREE.Vector3(...points[i - 1]);
      const b = new THREE.Vector3(...points[i]);
      const d = b.clone().sub(a);
      const len = d.length();
      const q = new THREE.Quaternion().setFromUnitVectors(up, d.clone().normalize());
      for (let s = pitch / 2; s < len; s += pitch) {
        res.push(new THREE.Matrix4().compose(a.clone().addScaledVector(d, s / len), q, new THREE.Vector3(1, 1, 1)));
      }
    }
    return res;
  }, [points.flat().join(), pitch]);
  const geo = useMemo(() => new THREE.TorusGeometry(r * 0.95, r * 0.28, 6, 14), [r]);
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ color, roughness: 0.6 }), [color]);
  useLayoutEffect(() => {
    if (!ref.current) return;
    rings.forEach((m, i) => ref.current!.setMatrixAt(i, m));
    ref.current.count = rings.length;
    ref.current.instanceMatrix.needsUpdate = true;
  }, [rings]);
  return (
    <>
      <Pipe points={points} r={r * 0.85} color={color} metal={0} />
      <instancedMesh key={`${rings.length}-${color}`} ref={ref} args={[geo, mat, Math.max(1, rings.length)]} />
    </>
  );
}

/** Трубка по ломаной (точки соединяются отрезками). */
export function Pipe({ points, r = 0.006, color = '#c8763f', metal = 0.85 }: { points: [number, number, number][]; r?: number; color?: string; metal?: number }) {
  return (
    <>
      {points.slice(1).map((p, i) => (
        <Tube key={i} from={points[i]} to={p} r={r} color={color} metal={metal} />
      ))}
      {points.slice(1, -1).map((p, i) => (
        <mesh key={'j' + i} position={p}>
          <sphereGeometry args={[r, 12, 8]} />
          <meshStandardMaterial color={color} metalness={metal} roughness={metal > 0.5 ? 0.3 : 0.75} />
        </mesh>
      ))}
    </>
  );
}
