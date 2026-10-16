import { OrbitControls } from '@react-three/drei';
import { Canvas, useFrame } from '@react-three/fiber';
import { useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import type { AcademyViewProps } from '../../core/academy';
import { findProduct } from '../../catalog/sheetParser';
import { laminateTexture, sized } from '../../apartment/scene/textures';
import { DEFAULT_WASTE, FLOOR_LAYERS, flooringGeometry, type FlooringParams } from './logic';

type Props = AcademyViewProps<FlooringParams>;

function LayerStack({ explode, active, onPick, color, screed }: { explode: number; active: string | null; onPick: (id: string) => void; color: string; screed: boolean }) {
  const layers = FLOOR_LAYERS.filter((l) => l.id !== 'skirting' && (screed || l.id !== 'screed'));
  const group = useRef<THREE.Group>(null);
  const cur = useRef(0);
  const lamMat = useMemo(() => new THREE.MeshStandardMaterial({ map: sized(laminateTexture(color), 1.4, 0.9), roughness: 0.5 }), [color]);
  useFrame(() => {
    cur.current += (explode - cur.current) * 0.12;
    if (!group.current) return;
    let y = 0;
    group.current.children.forEach((child, i) => {
      const l = layers[i];
      if (!l) return;
      const h = l.thickness;
      child.position.y = y + h / 2 + i * cur.current * 0.12;
      y += h;
    });
  });
  const skirtY = layers.reduce((s, l) => s + l.thickness, 0) + layers.length * explode * 0.12;
  return (
    <group position={[0, -0.25, 0]}>
      <group ref={group}>
        {layers.map((l) => {
          const isActive = active === l.id;
          const mat = l.id === 'laminate' ? lamMat : undefined;
          return (
            <mesh key={l.id} onClick={(e) => (e.stopPropagation(), onPick(l.id))} castShadow receiveShadow material={mat}>
              <boxGeometry args={[1.4, l.thickness, 0.9]} />
              {!mat && <meshStandardMaterial color={l.color} roughness={l.id === 'film' ? 0.2 : 0.9} transparent={l.id === 'film'} opacity={l.id === 'film' ? 0.7 : 1} emissive={isActive ? '#2a6cff' : '#000'} emissiveIntensity={isActive ? 0.35 : 0} />}
            </mesh>
          );
        })}
      </group>
      {/* стена и плинтус с компенсационным зазором */}
      <mesh position={[0, 0.4, -0.5]} receiveShadow>
        <boxGeometry args={[1.4, 1.1, 0.1]} />
        <meshStandardMaterial color="#efe9e0" transparent opacity={0.85} />
      </mesh>
      <mesh position={[0, skirtY + 0.04 + explode * 0.12, -0.44]} onClick={(e) => (e.stopPropagation(), onPick('skirting'))} castShadow>
        <boxGeometry args={[1.4, 0.08, 0.018]} />
        <meshStandardMaterial color="#f7f4ee" emissive={active === 'skirting' ? '#2a6cff' : '#000'} emissiveIntensity={active === 'skirting' ? 0.35 : 0} />
      </mesh>
    </group>
  );
}

export function FlooringLesson({ ctx, params, selection }: Props) {
  const [explode, setExplode] = useState(0.7);
  const [active, setActive] = useState<string | null>('laminate');
  const lam = selection['floor.laminate']?.productId ? findProduct(ctx.catalog, selection['floor.laminate'].productId!) : undefined;
  const color = lam?.attrs.color ?? '#b08a5e';
  const layer = FLOOR_LAYERS.find((l) => l.id === active);
  return (
    <div className="lesson">
      <div className="viewer3d">
        <Canvas shadows camera={{ position: [1.3, 0.9, 1.5], fov: 38 }} dpr={[1, 2]}>
          <color attach="background" args={['#f3f6fa']} />
          <hemisphereLight args={['#fff', '#cbd3dc', 0.8]} />
          <directionalLight position={[2, 3, 2]} intensity={1.6} castShadow />
          <LayerStack explode={explode} active={active} onPick={setActive} color={color} screed={params.needScreed} />
          <OrbitControls enablePan={false} minDistance={1.2} maxDistance={4} target={[0, 0, 0]} />
        </Canvas>
        <label className="slider">
          Собрать
          <input type="range" min={0} max={1} step={0.01} value={explode} onChange={(e) => setExplode(+e.target.value)} />
          Разобрать
        </label>
      </div>
      <ol className="layers">
        {FLOOR_LAYERS.filter((l) => params.needScreed || l.id !== 'screed').map((l) => (
          <li key={l.id} className={active === l.id ? 'on' : ''}>
            <button onClick={() => setActive(l.id)}>
              <i style={{ background: l.id === 'laminate' ? color : l.color }} />
              {l.name}
            </button>
          </li>
        ))}
      </ol>
      {layer && <p className="explain">{layer.text}</p>}
      {ctx.proMode && (
        <div className="pro-note">
          <b>Для мастера.</b> Перепад основания — не более 2 мм на 2 м (проверка рейкой), влажность стяжки — по требованиям производителя ламината. Компенсационный зазор 8–10 мм по периметру и у труб; при длине помещения более ~8–10 м — разрыв покрытия с порогом (по паспорту ламината).
        </div>
      )}
    </div>
  );
}

export function FlooringCalculator({ ctx, params, setParams }: Props) {
  if (!ctx.room) return null;
  const g = flooringGeometry(ctx.layout, ctx.room, params);
  const set = (p: Partial<FlooringParams>) => setParams({ ...params, ...p });
  return (
    <div className="calc">
      <div className="facts">
        <div>
          <b>{g.area}</b> м² площадь
        </div>
        <div>
          <b>{g.perimeter}</b> м периметр
        </div>
        <div>
          <b>{g.skirting}</b> м плинтуса (минус проёмы {g.doors} м)
        </div>
      </div>
      <label>
        Уточнённая площадь (замер), м²
        <input type="number" min={0} step={0.1} placeholder={String(g.area)} value={params.areaOverride ?? ''} onChange={(e) => set({ areaOverride: e.target.value ? +e.target.value : null })} />
      </label>
      <label>
        Способ укладки
        <select value={params.method} onChange={(e) => set({ method: e.target.value as FlooringParams['method'], wastePct: DEFAULT_WASTE[e.target.value as FlooringParams['method']] })}>
          <option value="straight">Прямая (запас 5–7 %)</option>
          <option value="diagonal">Диагональная (запас 10–15 %)</option>
        </select>
      </label>
      <label>
        Запас на подрезку, %
        <input type="number" min={0} max={30} value={params.wastePct} onChange={(e) => set({ wastePct: Math.max(0, +e.target.value) })} />
      </label>
      <label>
        Основание
        <select value={params.base} onChange={(e) => set({ base: e.target.value as FlooringParams['base'] })}>
          <option value="concrete">Бетон / стяжка (нужна пароизоляция)</option>
          <option value="wood">Деревянное основание (фанера)</option>
        </select>
      </label>
      <label className="check">
        <input type="checkbox" checked={params.needScreed} onChange={(e) => set({ needScreed: e.target.checked })} />
        Нужна выравнивающая стяжка (перепад больше 2 мм на 2 м)
      </label>
      {params.needScreed && (
        <label>
          Средняя толщина слоя, мм
          <input type="number" min={3} max={50} value={params.screedMm} onChange={(e) => set({ screedMm: Math.min(50, Math.max(3, +e.target.value)) })} />
        </label>
      )}
    </div>
  );
}
