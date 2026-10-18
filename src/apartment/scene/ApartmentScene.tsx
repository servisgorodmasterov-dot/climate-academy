import { CameraControls, Environment, Html, Lightformer } from '@react-three/drei';
import { Canvas, useThree } from '@react-three/fiber';
import { Suspense, useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { GEOMETRY_KINDS, type Layout, type LayoutElement, type Room } from '../../core/types';
import { roomArea } from '../layout';
import { selectableObjects } from '../objects';
import { Structure, type ObjectLooks } from './Structure';
import { Furniture } from './Furniture';
import { Element } from './Elements';
import { Utilities } from './Utilities';
import { useApp } from '../../store';

export interface SceneProps {
  layout: Layout;
  floorColors: Record<string, string>;
  looks: ObjectLooks;
  onElement: (el: LayoutElement) => void;
  onFloor: (room: Room) => void;
}

const isMobile = typeof window !== 'undefined' && (window.matchMedia?.('(pointer: coarse)').matches || window.innerWidth < 760);

export function ApartmentScene(props: SceneProps) {
  return (
    <Canvas
      shadows
      dpr={[1, isMobile ? 1.5 : 2]}
      camera={{ position: [0, 12, 11], fov: 40, near: 0.05, far: 200 }}
      gl={{ antialias: true, alpha: true, preserveDrawingBuffer: true }}
      onCreated={({ gl }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.toneMappingExposure = 1.05;
        gl.shadowMap.type = THREE.PCFSoftShadowMap;
      }}
    >
      <Suspense fallback={null}>
        <SceneContent {...props} />
      </Suspense>
    </Canvas>
  );
}

function SceneContent({ layout, floorColors, looks, onElement, onFloor }: SceneProps) {
  const { mode, focusRoom, ceilingHidden, wallsTransparent, xraySystems, selectedElement, categoryFilter, catalog, closedDoors } = useApp();
  const objects = useMemo(() => selectableObjects(layout, catalog), [layout, catalog]);
  const [W, D] = layout.size;
  const xray = mode === 'xray';

  return (
    <>
      <hemisphereLight args={['#ffffff', '#c9c2b6', 0.75]} />
      <directionalLight
        position={[6, 12, 5]}
        intensity={1.9}
        castShadow
        shadow-mapSize={isMobile ? [1024, 1024] : [2048, 2048]}
        shadow-camera-left={-8}
        shadow-camera-right={8}
        shadow-camera-top={8}
        shadow-camera-bottom={-8}
        shadow-bias={-0.0004}
        shadow-normalBias={0.02}
        shadow-radius={4}
        color="#fff6ea"
      />
      <Environment resolution={256} frames={1}>
        <Lightformer form="rect" intensity={2.2} position={[0, 6, -6]} scale={[14, 4, 1]} color="#eaf3ff" />
        <Lightformer form="rect" intensity={1.4} position={[-8, 4, 2]} rotation-y={Math.PI / 2} scale={[10, 4, 1]} color="#fff4e6" />
        <Lightformer form="rect" intensity={1.0} position={[8, 4, 2]} rotation-y={-Math.PI / 2} scale={[10, 4, 1]} />
        <Lightformer form="circle" intensity={3} position={[0, 10, 0]} rotation-x={Math.PI / 2} scale={4} />
      </Environment>

      <CameraRig layout={layout} />

      {/* Земля и плита перекрытия */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.32, 0]} receiveShadow>
        <circleGeometry args={[40, 64]} />
        <meshStandardMaterial color="#e3e9ef" roughness={1} />
      </mesh>
      <mesh position={[0, -0.16, 0]} receiveShadow castShadow>
        <boxGeometry args={[W + 0.3, 0.3, D + 0.3]} />
        <meshStandardMaterial color="#cfd2d4" roughness={0.9} />
      </mesh>

      <group position={[-W / 2, 0, -D / 2]}>
        <Structure
          layout={layout}
          catalog={catalog}
          wallsTransparent={wallsTransparent}
          ceilingHidden={ceilingHidden}
          floorColors={floorColors}
          looks={looks}
          closedDoors={closedDoors}
          focusRoom={focusRoom}
          selectedElement={selectedElement}
          xray={xray}
          onFloorClick={onFloor}
          onElement={onElement}
        />
        {!xray && <Furniture items={layout.furniture} />}
        {layout.elements
          .filter((e) => e.kind !== 'floor' && !GEOMETRY_KINDS.includes(e.kind))
          .map((e) => (
            <Element key={e.id} el={e} selected={selectedElement === e.id} onSelect={onElement} xray={xray} />
          ))}
        {xray && <Utilities runs={layout.utilities} systems={xraySystems} />}
        {objects
          .filter((o) => (focusRoom ? o.roomId === focusRoom : categoryFilter !== 'all') && (categoryFilter === 'all' || o.category === categoryFilter))
          .map((o) => (
            <Html key={o.id} position={o.anchor} center zIndexRange={[30, 10]}>
              <button
                className={selectedElement === o.id ? 'pin on' : 'pin'}
                onClick={() => onElement(o.element)}
                title={o.label}
              >
                <span className="pin-ico">{o.icon}</span>
                {o.short}
              </button>
            </Html>
          ))}
        {!focusRoom &&
          layout.rooms.map((r) => (
            <Html key={r.id} position={[(r.rect[0] + r.rect[2]) / 2, layout.ceilingHeight + 0.35, (r.rect[1] + r.rect[3]) / 2]} center zIndexRange={[20, 0]}>
              <button className="room-tag" onClick={() => useApp.getState().set('focusRoom', r.id)}>
                {r.name} <span>{roomArea(r)} м²</span>
              </button>
            </Html>
          ))}
      </group>
    </>
  );
}

/** Управление камерой: 360°, масштаб, плавный переход между общим видом и комнатой. */
function CameraRig({ layout }: { layout: Layout }) {
  const ref = useRef<CameraControls>(null);
  const focusRoom = useApp((s) => s.focusRoom);
  const selected = useApp((s) => s.selectedElement);
  const { size } = useThree();
  const [W, D] = layout.size;
  const portrait = size.height > size.width;

  const rooms = useMemo(() => Object.fromEntries(layout.rooms.map((r) => [r.id, r])), [layout]);

  useEffect(() => {
    const cc = ref.current;
    if (!cc) return;
    if (!focusRoom) {
      const k = portrait ? 1.6 : 1;
      cc.setLookAt(portrait ? 0 : 1.2, 13 * k, 7.2 * k, 0, 0, 0.4, true);
      return;
    }
    const r = rooms[focusRoom];
    if (!r) return;
    const cx = (r.rect[0] + r.rect[2]) / 2 - W / 2;
    const cz = (r.rect[1] + r.rect[3]) / 2 - D / 2;
    const span = Math.max(r.rect[2] - r.rect[0], r.rect[3] - r.rect[1]) * (portrait ? 1.9 : 1.2) + 1.8;
    cc.setLookAt(cx + (portrait ? 0 : span * 0.2), span * 1.35, cz + span * 0.55, cx, 0.3, cz, true);
  }, [focusRoom, rooms, W, D, portrait]);

  useEffect(() => {
    const cc = ref.current;
    if (!cc || !selected) return;
    const el = layout.elements.find((e) => e.id === selected);
    if (!el || el.kind === 'floor') return;
    if (el.kind === 'room_walls') return; // стены — остаёмся на виде комнаты
    const room = rooms[el.roomId];
    const p = new THREE.Vector3(el.position[0] - W / 2, el.position[1], el.position[2] - D / 2);
    const rot = el.rotationY ?? 0;
    const sign = el.kind === 'ac_outdoor' ? -1 : 1;
    const face = new THREE.Vector3(Math.sin(rot) * sign, 0, Math.cos(rot) * sign);
    if (GEOMETRY_KINDS.includes(el.kind) && room) {
      // дверь/окно: камера внутри своей комнаты, на расстоянии до противоположной стены, чуть сбоку и выше
      const [x0, z0, x1, z1] = room.rect;
      const depth = Math.abs(face.x) > 0.5 ? x1 - x0 : z1 - z0;
      const dist = Math.min(portrait ? 4.6 : 5, Math.max(1.6, depth - 0.4));
      const side = new THREE.Vector3(face.z, 0, -face.x);
      const to = p.clone().add(face.clone().multiplyScalar(dist)).add(side.multiplyScalar(0.5)).setY(1.55);
      // не выходить за пределы комнаты
      to.x = Math.min(Math.max(to.x, x0 - W / 2 + 0.35), x1 - W / 2 - 0.35);
      to.z = Math.min(Math.max(to.z, z0 - D / 2 + 0.35), z1 - D / 2 - 0.35);
      cc.setLookAt(to.x, to.y, to.z, p.x, Math.min(p.y, 1.3), p.z, true);
      return;
    }
    const dist = portrait ? 4.6 : 3.4;
    const to = p.clone().add(face.multiplyScalar(dist)).add(new THREE.Vector3(0.6, el.kind === 'leak_sensor' ? 2.2 : 1.4, 0));
    cc.setLookAt(to.x, to.y, to.z, p.x, p.y, p.z, true);
  }, [selected, layout, W, D, portrait, rooms]);

  return <CameraControls ref={ref} makeDefault minDistance={1.2} maxDistance={32} maxPolarAngle={Math.PI * 0.47} smoothTime={0.45} draggingSmoothTime={0.12} />;
}
