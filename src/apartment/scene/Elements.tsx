import { RoundedBox } from '@react-three/drei';
import * as THREE from 'three';
import type { LayoutElement } from '../../core/types';
import { TAP_THRESHOLD_PX } from '../objects';
import { useApp } from '../../store';

const setHover = (id: string | null) => useApp.getState().set('hover', id);

const white = new THREE.MeshStandardMaterial({ color: '#fbfbfb', roughness: 0.3 });
const grey = new THREE.MeshStandardMaterial({ color: '#c9cdd2', roughness: 0.5, metalness: 0.2 });
const dark = new THREE.MeshStandardMaterial({ color: '#2a2e33', roughness: 0.5 });
const hit = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });

function Model({ kind }: { kind: LayoutElement['kind'] }) {
  switch (kind) {
    case 'ac_indoor':
      return (
        <group>
          <RoundedBox args={[0.82, 0.28, 0.2]} radius={0.05} smoothness={4} material={white} castShadow />
          <mesh position={[0, -0.1, 0.085]} material={dark}>
            <boxGeometry args={[0.7, 0.025, 0.04]} />
          </mesh>
          <mesh position={[0.32, 0.06, 0.101]}>
            <circleGeometry args={[0.008, 12]} />
            <meshBasicMaterial color="#43d17a" />
          </mesh>
        </group>
      );
    case 'ac_outdoor':
      return (
        <group>
          <RoundedBox args={[0.78, 0.55, 0.28]} radius={0.02} smoothness={2} material={grey} castShadow />
          <mesh position={[-0.1, 0, -0.142]} rotation={[0, Math.PI, 0]} material={dark}>
            <circleGeometry args={[0.2, 32]} />
          </mesh>
          <mesh position={[-0.1, 0, -0.145]} material={grey}>
            <torusGeometry args={[0.2, 0.012, 8, 32]} />
          </mesh>
          {/* кронштейны */}
          {[-0.3, 0.3].map((x) => (
            <mesh key={x} position={[x, -0.3, 0.05]} material={dark}>
              <boxGeometry args={[0.04, 0.04, 0.45]} />
            </mesh>
          ))}
        </group>
      );
    case 'smart_switch':
      return (
        <group>
          <RoundedBox args={[0.086, 0.086, 0.012]} radius={0.006} smoothness={2} material={white} />
          <mesh position={[0, 0, 0.008]} material={new THREE.MeshStandardMaterial({ color: '#eef1f4', roughness: 0.2 })}>
            <boxGeometry args={[0.07, 0.07, 0.004]} />
          </mesh>
          <mesh position={[0, -0.025, 0.011]}>
            <circleGeometry args={[0.003, 10]} />
            <meshBasicMaterial color="#4aa3ff" />
          </mesh>
        </group>
      );
    case 'motion_sensor':
      return (
        <mesh material={white} rotation={[Math.PI / 2, 0, 0]}>
          <sphereGeometry args={[0.035, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2]} />
        </mesh>
      );
    case 'leak_sensor':
      return (
        <mesh position={[0, 0.01, 0]} material={white} castShadow>
          <cylinderGeometry args={[0.035, 0.035, 0.02, 24]} />
        </mesh>
      );
    case 'smart_hub':
      return (
        <group>
          <mesh position={[0, -0.06, 0.05]} material={white}>
            <boxGeometry args={[0.18, 0.02, 0.12]} />
          </mesh>
          <RoundedBox args={[0.1, 0.1, 0.03]} position={[0, 0, 0.06]} radius={0.012} smoothness={3} material={white} />
          <mesh position={[0, 0, 0.076]}>
            <ringGeometry args={[0.025, 0.03, 32]} />
            <meshBasicMaterial color="#5ec8ff" />
          </mesh>
        </group>
      );
    case 'electric_panel':
      return (
        <group>
          <RoundedBox args={[0.32, 0.42, 0.09]} radius={0.01} smoothness={2} material={white} castShadow />
          <mesh position={[0, 0, 0.046]} material={new THREE.MeshStandardMaterial({ color: '#e8ebee', roughness: 0.4 })}>
            <boxGeometry args={[0.28, 0.38, 0.004]} />
          </mesh>
        </group>
      );
    case 'radiator':
      return (
        <group>
          {Array.from({ length: 10 }).map((_, i) => (
            <RoundedBox key={i} args={[0.075, 0.55, 0.08]} position={[-0.36 + i * 0.08, 0, 0]} radius={0.015} smoothness={2} material={white} castShadow />
          ))}
        </group>
      );
    case 'riser':
      return (
        <mesh material={new THREE.MeshStandardMaterial({ color: '#f1f1ef', roughness: 0.6 })} castShadow>
          <boxGeometry args={[0.3, 2.7, 0.3]} />
        </mesh>
      );
    default:
      return null;
  }
}

const HIT_SIZE: Partial<Record<LayoutElement['kind'], [number, number, number]>> = {
  smart_switch: [0.3, 0.3, 0.2],
  motion_sensor: [0.3, 0.3, 0.3],
  leak_sensor: [0.35, 0.2, 0.35],
  smart_hub: [0.35, 0.35, 0.3],
  ac_indoor: [1.0, 0.45, 0.4],
  ac_outdoor: [0.9, 0.7, 0.45],
};

/** 3D-объект. Выбор — только коротким касанием без сдвига (сдвиг = вращение камеры). Подсветка — только у выбранного. */
export function Element({ el, selected, onSelect, xray }: { el: LayoutElement; selected: boolean; onSelect: (el: LayoutElement) => void; xray: boolean }) {
  const interactive = !!el.academy;
  if (el.kind === 'riser' && xray) return null; // в рентгене вместо короба показываем трубы
  const size = HIT_SIZE[el.kind] ?? [0.3, 0.3, 0.3];
  const HOVER_ID = el.id;
  return (
    <group position={el.position} rotation={[0, el.rotationY ?? 0, 0]}>
      <Model kind={el.kind} />
      {interactive && (
        <mesh
          material={hit}
          onClick={(e) => {
            if (e.delta > TAP_THRESHOLD_PX) return;
            e.stopPropagation();
            onSelect(el);
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
          <boxGeometry args={size} />
        </mesh>
      )}
      {selected && (
        <mesh>
          <boxGeometry args={size.map((v) => v * 0.85) as [number, number, number]} />
          <meshBasicMaterial color="#0066fa" transparent opacity={0.14} depthWrite={false} />
        </mesh>
      )}
    </group>
  );
}
