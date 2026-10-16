import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { Layout, Room } from '../../core/types';
import { edgeSegments, wallPieces, type Box } from '../geometry';
import { laminateTexture, plasterTexture, sized, tileTexture } from './textures';
import { TAP_THRESHOLD_PX } from '../objects';

interface Props {
  layout: Layout;
  wallsTransparent: boolean;
  ceilingHidden: boolean;
  floorColors: Record<string, string>; // roomId → цвет выбранного покрытия
  focusRoom: string | null;
  onFloorClick: (room: Room) => void;
  xray: boolean;
}

function BoxMesh({ b, material, cast = true }: { b: Box; material: THREE.Material; cast?: boolean }) {
  return (
    <mesh position={b.center} castShadow={cast} receiveShadow material={material}>
      <boxGeometry args={b.size} />
    </mesh>
  );
}

export function Structure({ layout, wallsTransparent, ceilingHidden, floorColors, focusRoom, onFloorClick, xray }: Props) {
  const H = layout.ceilingHeight;
  const [W, D] = layout.size;
  const transparent = wallsTransparent || xray;

  const wallMat = useMemo(() => {
    const m = new THREE.MeshStandardMaterial({ color: '#f4f0ea', roughness: 0.92, map: sized(plasterTexture(), 3, 3) });
    return m;
  }, []);
  const extMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#e7dfd2', roughness: 0.95 }), []);
  useMemo(() => {
    for (const m of [wallMat, extMat]) {
      m.transparent = transparent;
      m.opacity = transparent ? (xray ? 0.2 : 0.25) : 1;
      m.depthWrite = !transparent;
      m.needsUpdate = true;
    }
  }, [transparent, xray, wallMat, extMat]);

  const glassMat = useMemo(() => new THREE.MeshPhysicalMaterial({ color: '#cfe8f5', roughness: 0.05, metalness: 0, transmission: 0.9, transparent: true, opacity: 0.35, ior: 1.5, thickness: 0.01 }), []);
  const frameMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#fafafa', roughness: 0.4 }), []);
  const doorMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#d8cbb8', roughness: 0.55 }), []);
  const entranceMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#6b6f76', roughness: 0.5, metalness: 0.3 }), []);
  const skirtMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#f7f5f1', roughness: 0.5 }), []);
  const ceilMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 1, side: THREE.DoubleSide }), []);

  const pieces = useMemo(() => layout.walls.map((w) => ({ w, p: wallPieces(w, H) })), [layout, H]);

  // «Кукольный домик»: наружные стены со стороны камеры автоматически срезаются до ~1 м,
  // чтобы было видно комнаты. Внутренние стены остаются полной высоты.
  const wallRefs = useRef<Record<string, THREE.Group | null>>({});
  const planes = useMemo(() => {
    // наружная нормаль и положение плоскости стены в мировых координатах (квартира центрирована в 0,0)
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
      // стена срезается, только если камера снаружи от её плоскости
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
        const w = x1 - x0;
        const d = z1 - z0;
        return (
          <FloorMesh
            key={r.id}
            room={r}
            w={w}
            d={d}
            color={floorColors[r.id]}
            dim={xray || (focusRoom != null && focusRoom !== r.id)}
            highlight={focusRoom === r.id}
            onClick={() => onFloorClick(r)}
          />
        );
      })}

      {/* Стены */}
      {pieces.map(({ w, p }) => (
        <group key={w.id} ref={(g) => (wallRefs.current[w.id] = g)}>
          {p.solids.map((b, i) => (
            <BoxMesh key={i} b={b} material={w.exterior ? extMat : wallMat} cast={!transparent} />
          ))}
          {p.windows.map(({ box }, i) => {
            const horizontal = w.a[1] === w.b[1];
            const [sx, sy, sz] = box.size;
            const frameT = 0.06;
            return (
              <group key={`w${i}`} position={box.center}>
                <mesh material={glassMat}>
                  <boxGeometry args={horizontal ? [sx - 0.1, sy - 0.1, 0.02] : [0.02, sy - 0.1, sz - 0.1]} />
                </mesh>
                {/* рама */}
                {[
                  [0, sy / 2 - frameT / 2],
                  [0, -sy / 2 + frameT / 2],
                ].map(([, y], k) => (
                  <mesh key={k} position={[0, y, 0]} material={frameMat} castShadow>
                    <boxGeometry args={horizontal ? [sx, frameT, 0.08] : [0.08, frameT, sz]} />
                  </mesh>
                ))}
                {[-1, 0, 1].map((k) => (
                  <mesh key={`v${k}`} position={horizontal ? [(k * (sx - frameT)) / 2, 0, 0] : [0, 0, (k * (sz - frameT)) / 2]} material={frameMat} castShadow>
                    <boxGeometry args={horizontal ? [frameT, sy, 0.08] : [0.08, sy, frameT]} />
                  </mesh>
                ))}
                {/* подоконник */}
                <mesh position={horizontal ? [0, -sy / 2 - 0.02, 0.12] : [-0.12, -sy / 2 - 0.02, 0]} material={frameMat} castShadow receiveShadow>
                  <boxGeometry args={horizontal ? [sx + 0.1, 0.03, 0.3] : [0.3, 0.03, sz + 0.1]} />
                </mesh>
              </group>
            );
          })}
          {p.doors.map(({ box, opening }, i) => {
            const horizontal = w.a[1] === w.b[1];
            const [sx, sy, sz] = box.size;
            const width = horizontal ? sx : sz;
            if (opening.kind === 'entrance')
              return (
                <mesh key={`d${i}`} position={box.center} material={entranceMat} castShadow>
                  <boxGeometry args={horizontal ? [sx - 0.04, sy - 0.02, 0.07] : [0.07, sy - 0.02, sz - 0.04]} />
                </mesh>
              );
            if (width > 1.05) return null; // широкий проём-арка без полотна
            // межкомнатная дверь приоткрыта
            const hingeX = horizontal ? box.center[0] - sx / 2 : box.center[0];
            const hingeZ = horizontal ? box.center[2] : box.center[2] - sz / 2;
            return (
              <group key={`d${i}`}>
                {/* наличник */}
                <mesh position={[box.center[0], sy + 0.04, box.center[2]]} material={frameMat}>
                  <boxGeometry args={horizontal ? [sx + 0.14, 0.08, w.thickness + 0.02] : [w.thickness + 0.02, 0.08, sz + 0.14]} />
                </mesh>
                <group position={[hingeX, sy / 2, hingeZ]} rotation={[0, horizontal ? -1.2 : 1.2 + Math.PI / 2 - Math.PI / 2, 0]}>
                  <mesh position={horizontal ? [width / 2 - 0.02, 0, 0] : [0, 0, width / 2 - 0.02]} material={doorMat} castShadow>
                    <boxGeometry args={horizontal ? [width - 0.04, sy - 0.02, 0.04] : [0.04, sy - 0.02, width - 0.04]} />
                  </mesh>
                </group>
              </group>
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
            const off = (onBoundary ? 0.15 : 0.06) + 0.008;
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

function FloorMesh({ room, w, d, color, dim, highlight, onClick }: { room: Room; w: number; d: number; color?: string; dim: boolean; highlight: boolean; onClick: () => void }) {
  const mat = useMemo(() => {
    const base =
      room.floorFinish === 'tile'
        ? sized(tileTexture('#e9e6e1'), w, d)
        : room.floorFinish === 'porcelain'
          ? sized(tileTexture('#cfc8bd'), w, d)
          : sized(laminateTexture(color ?? '#b08a5e'), w, d);
    return new THREE.MeshStandardMaterial({ map: base, roughness: room.floorFinish === 'tile' ? 0.35 : 0.55, metalness: 0 });
  }, [room.floorFinish, color, w, d]);
  useMemo(() => {
    mat.emissive = new THREE.Color(highlight ? '#2a6cff' : '#000000');
    mat.emissiveIntensity = highlight ? 0.05 : 0;
    mat.color = new THREE.Color(dim ? '#9a9a9a' : '#ffffff');
  }, [mat, highlight, dim]);
  const [x0, , , ] = room.rect;
  return (
    <mesh
      position={[x0 + w / 2, 0.001, room.rect[1] + d / 2]}
      rotation={[-Math.PI / 2, 0, 0]}
      material={mat}
      receiveShadow
      onClick={(e) => {
        if (e.delta > TAP_THRESHOLD_PX) return; // это было вращение камеры, а не касание
        e.stopPropagation();
        onClick();
      }}
    >
      <planeGeometry args={[w, d]} />
    </mesh>
  );
}
