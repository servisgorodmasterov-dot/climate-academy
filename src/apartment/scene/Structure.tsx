import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { Catalog, Layout, LayoutElement, Room } from '../../core/types';
import type { Selection } from '../../core/academy';
import { edgeSegments, wallPieces, type Box } from '../geometry';
import { laminateRoughness, laminateTexture, plasterTexture, sized, tileTexture } from './textures';
import { TAP_THRESHOLD_PX } from '../objects';
import { ARCH_WIDTH, roomWallRects } from '../../objects/geometry';
import { lookOf } from '../../objects/logic';
import { DoorFrame, DoorLeaf, finishMaterial } from '../../objects/models';

/** Что выбрано для объекта конфигуратора (по id элемента) — для отрисовки. */
export type ObjectLooks = Record<string, Selection | undefined>;

interface Props {
  layout: Layout;
  catalog: Catalog | null;
  wallsTransparent: boolean;
  ceilingHidden: boolean;
  floorColors: Record<string, string>; // roomId → цвет выбранного покрытия
  looks: ObjectLooks;
  closedDoors: Record<string, boolean>;
  focusRoom: string | null;
  selectedElement: string | null;
  onFloorClick: (room: Room) => void;
  onElement: (el: LayoutElement) => void;
  xray: boolean;
}

function BoxMesh({ b, material, cast = true }: { b: Box; material: THREE.Material; cast?: boolean }) {
  return (
    <mesh position={b.center} castShadow={cast} receiveShadow material={material}>
      <boxGeometry args={b.size} />
    </mesh>
  );
}

const hitMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });
const selMat = new THREE.MeshBasicMaterial({ color: '#0066fa', transparent: true, opacity: 0.05, depthWrite: false });
const selEdge = new THREE.LineBasicMaterial({ color: '#0066fa' });

/** Невидимая зона касания + подсветка выбранного объекта. */
function Hit({ size, selected, onPick }: { size: [number, number, number]; selected: boolean; onPick?: () => void }) {
  if (!onPick) return null;
  return (
    <>
      <mesh
        material={hitMat}
        onClick={(e) => {
          if (e.delta > TAP_THRESHOLD_PX) return;
          e.stopPropagation();
          onPick();
        }}
        onPointerOver={() => (document.body.style.cursor = 'pointer')}
        onPointerOut={() => (document.body.style.cursor = '')}
      >
        <boxGeometry args={size} />
      </mesh>
      {selected && (
        <>
          <mesh material={selMat}>
            <boxGeometry args={[size[0] * 1.02, size[1] * 1.02, size[2] * 1.02]} />
          </mesh>
          <lineSegments material={selEdge}>
            <edgesGeometry args={[new THREE.BoxGeometry(size[0] * 1.02, size[1] * 1.02, size[2] * 1.02)]} />
          </lineSegments>
        </>
      )}
    </>
  );
}

export function Structure({ layout, catalog, wallsTransparent, ceilingHidden, floorColors, looks, closedDoors, focusRoom, selectedElement, onFloorClick, onElement, xray }: Props) {
  const H = layout.ceilingHeight;
  const [W, D] = layout.size;
  const transparent = wallsTransparent || xray;

  const wallMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#f1ede6', roughness: 0.95, map: sized(plasterTexture(), 3, 3) }), []);
  const extMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#ddd4c6', roughness: 0.97, map: sized(plasterTexture(), 2, 2) }), []);
  useMemo(() => {
    for (const m of [wallMat, extMat]) {
      m.transparent = transparent;
      m.opacity = transparent ? (xray ? 0.2 : 0.25) : 1;
      m.depthWrite = !transparent;
      m.needsUpdate = true;
    }
  }, [transparent, xray, wallMat, extMat]);

  const glassMat = useMemo(() => new THREE.MeshPhysicalMaterial({ color: '#dff0fa', roughness: 0.03, metalness: 0, transmission: 0.92, transparent: true, opacity: 0.45, ior: 1.5, thickness: 0.02, envMapIntensity: 1.4, clearcoat: 1 }), []);
  const skirtMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#f7f5f1', roughness: 0.5 }), []);
  const ceilMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 1, side: THREE.DoubleSide }), []);

  const pieces = useMemo(() => layout.walls.map((w) => ({ w, p: wallPieces(w, H) })), [layout, H]);

  // объекты конфигуратора, привязанные к проёмам: (wallId, index) → элемент
  const byOpening = useMemo(() => {
    const m = new Map<string, LayoutElement>();
    for (const e of layout.elements) if (e.opening) m.set(`${e.opening.wallId}:${e.opening.index}`, e);
    return m;
  }, [layout]);
  const wallEl = useMemo(() => Object.fromEntries(layout.elements.filter((e) => e.kind === 'room_walls').map((e) => [e.roomId, e])), [layout]);

  // «Кукольный домик»: наружные стены со стороны камеры автоматически срезаются до ~1 м.
  const wallRefs = useRef<Record<string, THREE.Group | null>>({});
  const planes = useMemo(() => {
    const out: Record<string, { n: [number, number]; d: number }> = {};
    for (const w of layout.walls) {
      if (!w.exterior) continue;
      if (w.a[1] === w.b[1]) {
        const z = w.a[1] - D / 2;
        out[w.id] = { n: [0, z < 0 ? -1 : 1], d: Math.abs(z) };
      } else {
        const x = w.a[0] - W / 2;
        out[w.id] = { n: [x < 0 ? -1 : 1, 0], d: Math.abs(x) };
      }
    }
    return out;
  }, [layout, W, D]);
  useFrame(({ camera }) => {
    for (const [id, { n, d }] of Object.entries(planes)) {
      const g = wallRefs.current[id];
      if (!g) continue;
      const outside = n[0] * camera.position.x + n[1] * camera.position.z > d + 0.2;
      const target = outside ? 0.36 : 1;
      g.scale.y += (target - g.scale.y) * 0.15;
    }
  });

  return (
    <group>
      {/* Полы */}
      {layout.rooms.map((r) => {
        const [x0, z0, x1, z1] = r.rect;
        return (
          <FloorMesh
            key={r.id}
            room={r}
            w={x1 - x0}
            d={z1 - z0}
            color={floorColors[r.id]}
            dim={xray || (focusRoom != null && focusRoom !== r.id)}
            highlight={focusRoom === r.id}
            onClick={() => onFloorClick(r)}
          />
        );
      })}

      {/* Отделка стен помещений (накладывается на внутренние грани) */}
      {!xray &&
        catalog &&
        layout.rooms.map((r) => {
          const el = wallEl[r.id];
          if (!el?.typeId) return null;
          const look = lookOf(catalog, el, looks[el.id]);
          return <WallFinish key={r.id} layout={layout} room={r} finish={look.finish ?? 'paint'} color={look.color ?? '#f3f1ec'} selected={selectedElement === el.id} onPick={() => onElement(el)} transparent={transparent} />;
        })}

      {/* Стены */}
      {pieces.map(({ w, p }) => (
        <group key={w.id} ref={(g) => (wallRefs.current[w.id] = g)}>
          {p.solids.map((b, i) => (
            <BoxMesh key={i} b={b} material={w.exterior ? extMat : wallMat} cast={!transparent} />
          ))}
          {p.windows.map(({ box, opening }) => {
            const idx = w.openings.indexOf(opening);
            const el = byOpening.get(`${w.id}:${idx}`);
            const look = el && catalog ? lookOf(catalog, el, looks[el.id]) : {};
            return (
              <WindowUnit
                key={`w${idx}`}
                box={box}
                horizontal={w.a[1] === w.b[1]}
                color={look.color ?? '#fafafa'}
                glassMat={glassMat}
                selected={!!el && selectedElement === el.id}
                onPick={el?.academy ? () => onElement(el) : undefined}
              />
            );
          })}
          {p.doors.map(({ box, opening }) => {
            const idx = w.openings.indexOf(opening);
            const el = byOpening.get(`${w.id}:${idx}`);
            const horizontal = w.a[1] === w.b[1];
            const [sx, , sz] = box.size;
            const width = horizontal ? sx : sz;
            if (opening.kind === 'door' && width > ARCH_WIDTH) return null; // арка без полотна
            const look = el && catalog ? lookOf(catalog, el, looks[el.id]) : {};
            const closed = !!el && (!!closedDoors[el.id] || opening.kind === 'entrance');
            return (
              <DoorUnit
                key={`d${idx}`}
                box={box}
                horizontal={horizontal}
                thickness={w.thickness}
                entrance={opening.kind === 'entrance'}
                look={look}
                closed={closed}
                selected={!!el && selectedElement === el.id}
                onPick={el?.academy ? () => onElement(el) : undefined}
              />
            );
          })}
        </group>
      ))}

      {/* Плинтус */}
      {!xray &&
        layout.rooms.map((r) =>
          edgeSegments(r.rect, layout.walls).map((s, i) => {
            const horiz = s.a[1] === s.b[1];
            const fixed = horiz ? s.a[1] : s.a[0];
            const onBoundary = fixed === 0 || fixed === (horiz ? D : W);
            const off = (onBoundary ? 0.15 : 0.06) + 0.012;
            const len = horiz ? s.b[0] - s.a[0] : s.b[1] - s.a[1];
            const cx = (s.a[0] + s.b[0]) / 2 + s.normal[0] * off;
            const cz = (s.a[1] + s.b[1]) / 2 + s.normal[1] * off;
            return (
              <mesh key={`${r.id}${i}`} position={[cx, 0.035, cz]} material={skirtMat}>
                <boxGeometry args={horiz ? [len, 0.07, 0.016] : [0.016, 0.07, len]} />
              </mesh>
            );
          }),
        )}

      {/* Потолок */}
      {!ceilingHidden &&
        layout.rooms.map((r) => {
          const [x0, z0, x1, z1] = r.rect;
          return (
            <mesh key={r.id} position={[(x0 + x1) / 2, H, (z0 + z1) / 2]} rotation={[Math.PI / 2, 0, 0]} material={ceilMat} receiveShadow>
              <planeGeometry args={[x1 - x0, z1 - z0]} />
            </mesh>
          );
        })}
    </group>
  );
}

/** Дверной блок в проёме: коробка + наличники + полотно, цвет и модель — из выбранного товара. */
function DoorUnit({ box, horizontal, thickness, entrance, look, closed, selected, onPick }: { box: Box; horizontal: boolean; thickness: number; entrance: boolean; look: Record<string, string>; closed: boolean; selected: boolean; onPick?: () => void }) {
  const [sx, sy, sz] = box.size;
  const width = horizontal ? sx : sz;
  const leafRef = useRef<THREE.Group>(null);
  useFrame(() => {
    const g = leafRef.current;
    if (!g) return;
    const target = closed ? 0 : -1.15;
    g.rotation.y += (target - g.rotation.y) * 0.08;
  });
  // локальная система: x вдоль стены от левого края проёма, z поперёк стены
  const origin: [number, number, number] = horizontal ? [box.center[0] - sx / 2, 0, box.center[2]] : [box.center[0], 0, box.center[2] + sz / 2];
  const rot = horizontal ? 0 : Math.PI / 2;
  const style = entrance ? look.style ?? 'steel' : look.style;
  return (
    <group position={origin} rotation={[0, rot, 0]}>
      <DoorFrame w={width} h={sy} t={thickness} look={{ ...look, hidden: entrance ? '1' : look.hidden }} casingW={entrance ? 0.05 : 0.07} />
      <group ref={leafRef} position={[0.03, 0.01, 0]}>
        <DoorLeaf w={width - 0.06} h={sy - 0.04} look={{ ...look, style }} />
      </group>
      <group position={[width / 2, sy / 2, 0]}>
        <Hit size={[width + 0.1, sy, 0.5]} selected={selected} onPick={onPick} />
      </group>
    </group>
  );
}

/** Окно: стеклопакет, рама нужного цвета, подоконник. */
function WindowUnit({ box, horizontal, color, glassMat, selected, onPick }: { box: Box; horizontal: boolean; color: string; glassMat: THREE.Material; selected: boolean; onPick?: () => void }) {
  const [sx, sy, sz] = box.size;
  const frameT = 0.06;
  const frameMat = useMemo(() => new THREE.MeshStandardMaterial({ color, roughness: 0.4 }), [color]);
  const sillMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#fafafa', roughness: 0.4 }), []);
  return (
    <group position={box.center}>
      <mesh material={glassMat}>
        <boxGeometry args={horizontal ? [sx - 0.1, sy - 0.1, 0.02] : [0.02, sy - 0.1, sz - 0.1]} />
      </mesh>
      {[sy / 2 - frameT / 2, -sy / 2 + frameT / 2].map((y, k) => (
        <mesh key={k} position={[0, y, 0]} material={frameMat} castShadow>
          <boxGeometry args={horizontal ? [sx, frameT, 0.08] : [0.08, frameT, sz]} />
        </mesh>
      ))}
      {[-1, 0, 1].map((k) => (
        <mesh key={`v${k}`} position={horizontal ? [(k * (sx - frameT)) / 2, 0, 0] : [0, 0, (k * (sz - frameT)) / 2]} material={frameMat} castShadow>
          <boxGeometry args={horizontal ? [frameT, sy, 0.08] : [0.08, sy, frameT]} />
        </mesh>
      ))}
      <mesh position={horizontal ? [0, -sy / 2 - 0.02, 0.12] : [-0.12, -sy / 2 - 0.02, 0]} material={sillMat} castShadow receiveShadow>
        <boxGeometry args={horizontal ? [sx + 0.1, 0.03, 0.3] : [0.3, 0.03, sz + 0.1]} />
      </mesh>
      <Hit size={horizontal ? [sx, sy, 0.4] : [0.4, sy, sz]} selected={selected} onPick={onPick} />
    </group>
  );
}

/** Отделка стен одного помещения — тонкие плоскости на внутренних гранях стен (проёмы вырезаны). */
function WallFinish({ layout, room, finish, color, selected, onPick, transparent }: { layout: Layout; room: Room; finish: string; color: string; selected: boolean; onPick: () => void; transparent: boolean }) {
  const rects = useMemo(() => roomWallRects(layout, room), [layout, room]);
  const mat = useMemo(() => finishMaterial(finish, color, 1, 1), [finish, color]);
  useMemo(() => {
    mat.transparent = transparent;
    mat.opacity = transparent ? 0.25 : 1;
    mat.depthWrite = !transparent;
    mat.emissive = new THREE.Color(selected ? '#ffffff' : '#000000');
    mat.emissiveIntensity = selected ? 0.08 : 0;
    mat.needsUpdate = true;
  }, [mat, transparent, selected]);
  // большинство материалов — цвет без карты; карту повторяем по размеру каждой плоскости
  return (
    <group>
      {rects.map((r, i) => {
        const len = r.s1 - r.s0;
        const h = r.y1 - r.y0;
        const mid = (r.s0 + r.s1) / 2;
        const y = (r.y0 + r.y1) / 2;
        const pos: [number, number, number] = r.horizontal ? [mid, y, r.fixed + r.normal[1] * r.offset] : [r.fixed + r.normal[0] * r.offset, y, mid];
        const rotY = r.horizontal ? (r.normal[1] > 0 ? 0 : Math.PI) : r.normal[0] > 0 ? Math.PI / 2 : -Math.PI / 2;
        const m = mat.map ? (mat.clone() as THREE.MeshStandardMaterial) : mat;
        if (m !== mat && m.map) {
          m.map = m.map.clone();
          const [sw, sh] = (m.map.userData.size as [number, number]) ?? [1, 1];
          m.map.repeat.set(len / sw, h / sh);
          m.map.needsUpdate = true;
        }
        return (
          <mesh
            key={i}
            position={pos}
            rotation={[0, rotY, 0]}
            material={m}
            receiveShadow
            onClick={(e) => {
              if (e.delta > TAP_THRESHOLD_PX) return;
              e.stopPropagation();
              onPick();
            }}
            onPointerOver={() => (document.body.style.cursor = 'pointer')}
            onPointerOut={() => (document.body.style.cursor = '')}
          >
            <planeGeometry args={[len, h]} />
          </mesh>
        );
      })}
    </group>
  );
}

function FloorMesh({ room, w, d, color, dim, highlight, onClick }: { room: Room; w: number; d: number; color?: string; dim: boolean; highlight: boolean; onClick: () => void }) {
  const mat = useMemo(() => {
    const base =
      room.floorFinish === 'tile'
        ? sized(tileTexture('#e9e6e1'), w, d)
        : room.floorFinish === 'porcelain'
          ? sized(tileTexture('#cfc8bd'), w, d)
          : sized(laminateTexture(color ?? '#b08a5e'), w, d);
    const lam = room.floorFinish !== 'tile' && room.floorFinish !== 'porcelain';
    return new THREE.MeshPhysicalMaterial({
      map: base,
      roughnessMap: lam ? sized(laminateRoughness(), w, d) : null,
      roughness: lam ? 0.75 : 0.28,
      metalness: 0,
      clearcoat: lam ? 0.08 : 0.35,
      clearcoatRoughness: 0.4,
      envMapIntensity: 0.9,
    });
  }, [room.floorFinish, color, w, d]);
  useMemo(() => {
    mat.emissive = new THREE.Color(highlight ? '#2a6cff' : '#000000');
    mat.emissiveIntensity = highlight ? 0.05 : 0;
    mat.color = new THREE.Color(dim ? '#9a9a9a' : '#ffffff');
  }, [mat, highlight, dim]);
  const [x0] = room.rect;
  return (
    <mesh
      position={[x0 + w / 2, 0.001, room.rect[1] + d / 2]}
      rotation={[-Math.PI / 2, 0, 0]}
      material={mat}
      receiveShadow
      onClick={(e) => {
        if (e.delta > TAP_THRESHOLD_PX) return;
        e.stopPropagation();
        onClick();
      }}
    >
      <planeGeometry args={[w, d]} />
    </mesh>
  );
}
