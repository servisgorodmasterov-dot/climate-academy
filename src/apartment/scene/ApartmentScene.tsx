import { CameraControls, Environment, Html, Lightformer, SoftShadows } from '@react-three/drei';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { EffectComposer, Bloom, SMAA, Vignette } from '@react-three/postprocessing';
import { N8AO } from '@react-three/postprocessing';
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
import { lookOf } from '../../objects/logic';

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
      gl={{ antialias: !isMobile, alpha: false, preserveDrawingBuffer: true, powerPreference: 'high-performance' }}
      onCreated={({ gl }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.toneMappingExposure = 1.18;
        gl.shadowMap.type = THREE.PCFSoftShadowMap;
      }}
    >
      <color attach="background" args={['#dfe6ee']} />
      <fog attach="fog" args={['#dfe6ee', 26, 60]} />
      <Suspense fallback={null}>
        <SceneContent {...props} />
      </Suspense>
    </Canvas>
  );
}

function SceneContent({ layout, floorColors, looks, onElement, onFloor }: SceneProps) {
  const { mode, focusRoom, ceilingHidden, wallsTransparent, xraySystems, selectedElement, categoryFilter, catalog, closedDoors } = useApp();
  const objects = useMemo(() => selectableObjects(layout, catalog), [layout, catalog]);
  const furnLooks = useMemo(() => {
    const out = { looks: {} as Record<number, Record<string, string>>, selectable: {} as Record<number, boolean>, selected: null as number | null, ids: {} as Record<number, string> };
    for (const e of layout.elements) {
      if (e.kind !== 'furniture' || e.furniture == null) continue;
      if (e.academy) out.selectable[e.furniture] = true;
      out.ids[e.furniture] = e.id;
      if (catalog && e.academy) out.looks[e.furniture] = lookOf(catalog, e, looks[e.id]);
      if (selectedElement === e.id) out.selected = e.furniture;
    }
    return out;
  }, [layout, catalog, looks, selectedElement]);
  const [W, D] = layout.size;
  const xray = mode === 'xray';

  return (
    <>
      {/* Освещение: небо + солнце под углом, чтобы свет проходил через окна и ложился на пол */}
      {!isMobile && <SoftShadows size={18} samples={12} focus={0.6} />}
      <hemisphereLight args={['#eaf2ff', '#9a8c7a', 0.75]} />
      <directionalLight
        position={[9, 10, -7]}
        intensity={2.8}
        castShadow
        shadow-mapSize={isMobile ? [1024, 1024] : [4096, 4096]}
        shadow-camera-left={-9}
        shadow-camera-right={9}
        shadow-camera-top={9}
        shadow-camera-bottom={-9}
        shadow-camera-near={1}
        shadow-camera-far={40}
        shadow-bias={-0.00025}
        shadow-normalBias={0.015}
        color="#fff3e0"
      />
      {/* заполняющий свет с противоположной стороны — без теней */}
      <directionalLight position={[-8, 6, 9]} intensity={0.55} color="#dfe9ff" />
      <Environment resolution={isMobile ? 128 : 256} frames={1} environmentIntensity={0.9}>
        <Lightformer form="rect" intensity={3} position={[0, 7, -9]} scale={[18, 5, 1]} color="#e8f1ff" />
        <Lightformer form="rect" intensity={1.6} position={[-9, 4, 0]} rotation-y={Math.PI / 2} scale={[12, 4, 1]} color="#fff2e2" />
        <Lightformer form="rect" intensity={1.2} position={[9, 4, 0]} rotation-y={-Math.PI / 2} scale={[12, 4, 1]} color="#e9f0fa" />
        <Lightformer form="circle" intensity={2.4} position={[0, 10, 0]} rotation-x={Math.PI / 2} scale={5} color="#ffffff" />
        <Lightformer form="rect" intensity={0.8} position={[0, -2, 0]} rotation-x={-Math.PI / 2} scale={[20, 20, 1]} color="#b7ab9c" />
      </Environment>
      {!isMobile && !xray && (
        <EffectComposer multisampling={0} enableNormalPass={false}>
          <N8AO aoRadius={0.5} intensity={1.6} distanceFalloff={0.8} quality="medium" halfRes />
          <Bloom luminanceThreshold={1.05} intensity={0.25} mipmapBlur />
          <Vignette eskil={false} offset={0.25} darkness={0.35} />
          <SMAA />
        </EffectComposer>
      )}

      <CameraRig layout={layout} />

      {/* Земля и плита перекрытия */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.32, 0]} receiveShadow>
        <circleGeometry args={[60, 64]} />
        <meshStandardMaterial color="#d6dde5" roughness={1} />
      </mesh>
      <mesh position={[0, -0.16, 0]} receiveShadow castShadow>
        <boxGeometry args={[W + 0.3, 0.3, D + 0.3]} />
        <meshStandardMaterial color="#c9ccd0" roughness={0.85} />
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
        {!xray && <Furniture items={layout.furniture} looks={furnLooks.looks} selectable={furnLooks.selectable} selected={furnLooks.selected} ids={furnLooks.ids} onPick={(i) => { const el = layout.elements.find((e) => e.furniture === i); if (el) onElement(el); }} />}
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
  const walk = useApp((s) => s.walk);
  const { size } = useThree();
  const [W, D] = layout.size;
  const portrait = size.height > size.width;

  const rooms = useMemo(() => Object.fromEntries(layout.rooms.map((r) => [r.id, r])), [layout]);

  // Прогулка: камера на высоте глаз в выбранной комнате (или в прихожей), управление клавишами и кнопками
  useEffect(() => {
    const cc = ref.current;
    if (!cc) return;
    if (!walk) return;
    const r = rooms[focusRoom ?? ''] ?? layout.rooms.find((x) => x.type === 'hall') ?? layout.rooms[0];
    const cx = (r.rect[0] + r.rect[2]) / 2 - W / 2;
    const cz = (r.rect[1] + r.rect[3]) / 2 - D / 2;
    cc.setLookAt(cx, 1.6, cz + 0.01, cx, 1.5, cz - 1.5, true);
    const onKey = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      const step = 0.35;
      if (k === 'w' || k === 'arrowup' || k === 'ц') cc.forward(step, true);
      else if (k === 's' || k === 'arrowdown' || k === 'ы') cc.forward(-step, true);
      else if (k === 'a' || k === 'arrowleft' || k === 'ф') cc.rotate(0.12, 0, true);
      else if (k === 'd' || k === 'arrowright' || k === 'в') cc.rotate(-0.12, 0, true);
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    (window as any).__walk = { forward: (d: number) => cc.forward(d, true), turn: (a: number) => cc.rotate(a, 0, true) };
    return () => {
      window.removeEventListener('keydown', onKey);
      delete (window as any).__walk;
    };
  }, [walk, focusRoom, rooms, layout, W, D]);

  // не выходить из квартиры во время прогулки
  useFrame(() => {
    const cc = ref.current;
    if (!cc || !walk) return;
    const p = cc.camera.position;
    const nx = Math.min(Math.max(p.x, -W / 2 + 0.3), W / 2 - 0.3);
    const nz = Math.min(Math.max(p.z, -D / 2 + 0.3), D / 2 - 0.3);
    if (nx !== p.x || nz !== p.z || Math.abs(p.y - 1.6) > 0.05) cc.moveTo(cc.camera.position.x + (nx - p.x), 1.5, cc.camera.position.z + (nz - p.z), false);
  });

  useEffect(() => {
    const cc = ref.current;
    if (!cc || walk) return;
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
  }, [focusRoom, rooms, W, D, portrait, walk]);

  useEffect(() => {
    const cc = ref.current;
    if (!cc || !selected || walk) return;
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
      // мебель смотрим сверху-сбоку (через шкафы и стены не видно), двери и окна — с высоты глаз
      const furniture = el.kind === 'furniture';
      const to = p.clone().add(face.clone().multiplyScalar(furniture ? dist * 0.85 : dist)).add(side.multiplyScalar(furniture ? 0.9 : 0.5)).setY(furniture ? 2.9 : 1.75);
      // не выходить за пределы комнаты
      to.x = Math.min(Math.max(to.x, x0 - W / 2 + 0.35), x1 - W / 2 - 0.35);
      to.z = Math.min(Math.max(to.z, z0 - D / 2 + 0.35), z1 - D / 2 - 0.35);
      cc.setLookAt(to.x, to.y, to.z, p.x, Math.min(p.y, furniture ? 0.7 : 1.3), p.z, true);
      return;
    }
    const dist = portrait ? 4.6 : 3.4;
    const to = p.clone().add(face.multiplyScalar(dist)).add(new THREE.Vector3(0.6, el.kind === 'leak_sensor' ? 2.2 : 1.4, 0));
    cc.setLookAt(to.x, to.y, to.z, p.x, p.y, p.z, true);
  }, [selected, layout, W, D, portrait, rooms, walk]);

  return <CameraControls ref={ref} makeDefault minDistance={walk ? 0.05 : 1.2} maxDistance={walk ? 0.2 : 32} minPolarAngle={walk ? Math.PI * 0.3 : 0} maxPolarAngle={walk ? Math.PI * 0.62 : Math.PI * 0.47} smoothTime={walk ? 0.25 : 0.45} draggingSmoothTime={0.12} azimuthRotateSpeed={walk ? -0.5 : 1} polarRotateSpeed={walk ? -0.5 : 1} />;
}
