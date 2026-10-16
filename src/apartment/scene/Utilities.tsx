import { Line } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import type { UtilityRun, UtilitySystem } from '../../core/types';
import { SYSTEM_META } from '../../store';

/**
 * Условное отображение инженерных систем (режим «Рентген»).
 * Пунктир — условная схема, сплошная — проектные данные, сплошная с точками — подтверждено исполнительной съёмкой.
 */
export function Utilities({ runs, systems }: { runs: UtilityRun[]; systems: UtilitySystem[] }) {
  return (
    <group>
      {runs
        .filter((r) => systems.includes(r.system))
        .map((r) => (
          <Run key={r.id} run={r} />
        ))}
    </group>
  );
}

function Run({ run }: { run: UtilityRun }) {
  const color = SYSTEM_META[run.system].color;
  const ref = useRef<any>(null);
  useFrame((_, dt) => {
    if (run.wireless && ref.current?.material) ref.current.material.dashOffset -= dt * 0.6;
  });
  const dashed = run.wireless || run.confidence === 'conditional';
  const width = run.wireless ? 1.6 : run.system === 'sewer' || run.system === 'ventilation' ? 5 : 3.2;
  return (
    <group>
      <Line
        ref={ref}
        points={run.points}
        color={color}
        lineWidth={width}
        dashed={dashed}
        dashSize={run.wireless ? 0.08 : 0.18}
        gapSize={run.wireless ? 0.08 : 0.07}
        transparent
        opacity={0.95}
        depthTest={false}
        renderOrder={5}
      />
      {!run.wireless &&
        [run.points[0], run.points[run.points.length - 1]].map((p, i) => (
          <mesh key={i} position={p} renderOrder={6}>
            <sphereGeometry args={[run.confidence === 'confirmed' ? 0.05 : 0.03, 12, 8]} />
            <meshBasicMaterial color={color} depthTest={false} transparent />
          </mesh>
        ))}
    </group>
  );
}
