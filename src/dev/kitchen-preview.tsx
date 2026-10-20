// Служебная страница для проверки 3D-кухни отдельно от квартиры: ?preview=kitchen
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { Furniture } from '../apartment/scene/Furniture';
import * as THREE from 'three';

/** Отдаёт сцену в window.__scene — для измерений в автотесте. */
function Expose() {
  const scene = useThree((s) => s.scene);
  (window as any).__scene = scene;
  (window as any).__THREE = THREE;
  return null;
}

export function KitchenPreview() {
  const q = new URLSearchParams(location.search);
  const look = { facade: q.get('facade') ?? '#f3f1ec', top: q.get('top') ?? '#d9d5cd', handle: q.get('handle') ?? '#1c1d1f', style: q.get('style') ?? '', upper: '1', tall: q.get('tall') ?? '0' };
  return (
    <Canvas shadows camera={{ position: [0.6, 1.9, 4.2], fov: 38 }} style={{ width: '100vw', height: '100vh', background: '#dfe6ee' }}>
      <hemisphereLight args={['#ffffff', '#b8c0cc', 0.9]} />
      <directionalLight position={[3, 5, 4]} intensity={1.6} castShadow />
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[12, 12]} />
        <meshStandardMaterial color="#cfc3b2" />
      </mesh>
      <mesh position={[0, 1.35, -0.33]} receiveShadow>
        <boxGeometry args={[4.5, 2.7, 0.04]} />
        <meshStandardMaterial color="#f3f1ec" />
      </mesh>
      <Furniture items={[{ type: 'kitchen_run', roomId: 'k', position: [0, 0, 0], rotationY: 0, length: 2.4, sink: 0.6, stove: -0.3 } as any]} hidden={() => false} looks={{ 0: look }} />
      <OrbitControls target={[0, 1, 0]} />
      <Expose />
    </Canvas>
  );
}
