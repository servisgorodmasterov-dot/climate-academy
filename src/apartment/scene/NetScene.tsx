// Общая 3D-сцена для схем отопления и умного дома: линии, узлы с подписями, наведение, пошаговый показ.
import { Html, Line } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { Layout } from '../../core/types';
import { buildHeatingScheme, buildSmartScheme, defaultSections, type NetLine, type NetPoint, type NetScheme } from '../nets';
import { useApp } from '../../store';
import { Flow } from './ElectricScene';

export const NET_COLORS: Record<string, string> = {
  riser: '#ff7043',
  supply: '#e53935',
  return: '#1e88e5',
  bypass: '#ffb300',
  radiator: '#78909c',
  zigbee: '#8e44ff',
  cornice: '#00897b',
  power: '#ff6a00',
};
const WIDTH: Record<string, number> = { riser: 6, supply: 3.5, return: 3.5, bypass: 2.5, radiator: 3, zigbee: 1.8, cornice: 5, power: 2.4 };

const POINT_COLOR: Record<string, string> = {
  radiator: '#78909c',
  valve: '#e53935',
  mayevsky: '#ffb300',
  hub: '#8e44ff',
  leak: '#1e88e5',
  motion: '#8e44ff',
  switch: '#8e44ff',
  cornice: '#00897b',
  thermo: '#e53935',
};

/** Число секций радиаторов — из расчёта (карточка радиатора), иначе по площади. */
function useSectionsOf(layout: Layout) {
  const sections = useApp((s) => s.sections);
  const apartmentId = useApp((s) => s.apartmentId);
  return useMemo(
    () => (el: { id: string }, room: { rect: [number, number, number, number] } | undefined) => {
      const sec = Object.values(sections).find((s) => s.apartmentId === apartmentId && s.params?.elementId === el.id);
      const user = (sec?.params as { layers?: Record<string, number> } | undefined)?.layers?.['heat.radiator'];
      return user ?? defaultSections(el as never, room as never);
    },
    [sections, apartmentId, layout],
  );
}

export function NetScene({ layout, kind, focusRoom }: { layout: Layout; kind: 'heating' | 'smart'; focusRoom: string | null }) {
  const step = useApp((s) => s.electricStep);
  const hover = useApp((s) => s.hover);
  const sectionsOf = useSectionsOf(layout);
  const scheme: NetScheme = useMemo(() => (kind === 'heating' ? buildHeatingScheme(layout, sectionsOf) : buildSmartScheme(layout)), [layout, kind, sectionsOf]);
  const setHover = (id: string | null) => useApp.getState().set('hover', id);
  const dim = (roomId: string) => focusRoom != null && roomId !== focusRoom;
  const show = (x: { step: number }) => step === 0 || x.step <= step;

  return (
    <group>
      {scheme.lines.filter(show).map((l) => (
        <NetLineView key={l.id} l={l} faded={dim(l.roomId)} on={hover === `net:${l.id}`} onHover={(h) => setHover(h ? `net:${l.id}` : null)} />
      ))}
      {scheme.points.filter(show).map((p) => (
        <NetPointView key={p.id} p={p} faded={dim(p.roomId)} on={hover === `net:p:${p.id}`} onHover={(h) => setHover(h ? `net:p:${p.id}` : null)} />
      ))}
    </group>
  );
}

function NetLineView({ l, faded, on, onHover }: { l: NetLine; faded: boolean; on: boolean; onHover: (h: boolean) => void }) {
  const color = NET_COLORS[l.group] ?? '#888';
  const ref = useRef<any>(null);
  // радиосвязь: бегущий пунктир от хаба к устройству
  useFrame((_, dt) => {
    if (l.wireless && ref.current?.material) ref.current.material.dashOffset -= dt * 0.15;
  });
  return (
    <group>
      <Line
        ref={ref}
        points={l.points}
        color={color}
        lineWidth={on ? (WIDTH[l.group] ?? 3) + 2 : WIDTH[l.group] ?? 3}
        dashed={!!l.wireless}
        dashSize={0.1}
        gapSize={0.08}
        transparent
        opacity={faded ? 0.12 : l.wireless ? 0.75 : 0.92}
        depthTest={false}
        renderOrder={5}
      />
      {!faded && !l.wireless && (l.group === 'supply' || l.group === 'return' || l.group === 'power') && <Flow points={l.points} color={color} />}
      <Line
        points={l.points}
        color="#000"
        lineWidth={16}
        transparent
        opacity={0}
        depthTest={false}
        onPointerOver={(e) => {
          e.stopPropagation();
          onHover(true);
          document.body.style.cursor = 'help';
        }}
        onPointerOut={() => {
          onHover(false);
          document.body.style.cursor = '';
        }}
      />
      {on && (
        <Html position={l.points[Math.floor(l.points.length / 2)]} center zIndexRange={[3, 2]}>
          <div className="el-tip" style={{ borderColor: color, whiteSpace: 'normal', width: 280 }}>
            <b>{l.title}</b>
            <span>{l.label}</span>
          </div>
        </Html>
      )}
    </group>
  );
}

function NetPointView({ p, faded, on, onHover }: { p: NetPoint; faded: boolean; on: boolean; onHover: (h: boolean) => void }) {
  const color = POINT_COLOR[p.kind] ?? '#555';
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: color, emissiveIntensity: 0.45, roughness: 0.4 }), [color]);
  const size = p.kind === 'hub' ? 0.12 : p.kind === 'radiator' ? 0.04 : 0.055;
  return (
    <group position={p.position}>
      <mesh
        material={mat}
        renderOrder={6}
        onPointerOver={(e) => {
          e.stopPropagation();
          onHover(true);
          document.body.style.cursor = 'help';
        }}
        onPointerOut={() => {
          onHover(false);
          document.body.style.cursor = '';
        }}
      >
        {p.kind === 'hub' ? <boxGeometry args={[size, size, size * 0.4]} /> : <sphereGeometry args={[size, 14, 10]} />}
      </mesh>
      {!faded && (p.kind === 'hub' || p.kind === 'radiator' || p.kind === 'cornice' || p.kind === 'valve' && p.short.includes('протеч') || p.kind === 'leak' || p.kind === 'motion') && (
        <Html position={[0, 0.13, 0]} center zIndexRange={[2, 1]}>
          <div className="net-label" style={{ borderColor: color, color }}>{p.short}</div>
        </Html>
      )}
      {on && (
        <Html position={[0, -0.16, 0]} center zIndexRange={[3, 2]}>
          <div className="el-tip" style={{ borderColor: color, whiteSpace: 'normal', width: 280 }}>
            <b>{p.short}</b>
            <span>{p.label}</span>
          </div>
        </Html>
      )}
    </group>
  );
}

/** Подсказки для легенды: шаги объяснения. */
export const NET_STEPS: Record<'heating' | 'smart', { t: string; d: string }[]> = {
  heating: [
    { t: 'Вся схема', d: 'Нажмите «Объяснить по шагам», чтобы увидеть, как тепло приходит в радиаторы.' },
    { t: '1. Стояки', d: 'У окон проходят общедомовые трубы отопления — стояки. По ним горячая вода из котельной идёт через все квартиры. Менять их самому нельзя, только с разрешения УК.' },
    { t: '2. Радиатор: подача и обратка', d: 'От стояка в радиатор идут две трубы: сверху — горячая (подача, красная), снизу — остывшая обратно в стояк (обратка, синяя). Число секций — из вашего расчёта.' },
    { t: '3. Краны и байпас', d: 'На подаче и обратке — краны: радиатор можно снять, не сливая весь стояк. Между ними перемычка — байпас: без неё соседи снизу остались бы без тепла. Кран Маевского сверху — стравить воздух.' },
    { t: '4. Полотенцесушитель', d: 'В санузле полотенцесушитель подключён к стояку горячей воды, а не к отоплению — поэтому тёплый круглый год, и летом тоже.' },
  ],
  smart: [
    { t: 'Вся схема', d: 'Нажмите «Объяснить по шагам», чтобы увидеть, что умеет квартира и как устройства связаны.' },
    { t: '1. Хаб', d: 'Хаб — мозг умного дома. С устройствами он говорит по радио (Zigbee, фиолетовый пунктир) — провода к датчикам не нужны. Сценарии работают даже без интернета.' },
    { t: '2. Защита от протечек', d: 'Датчики протечки лежат на полу у ванны и мойки. Вода попала — хаб за 5 секунд закрывает краны с электроприводом на вводе воды и присылает уведомление на телефон.' },
    { t: '3. Свет', d: 'Умные выключатели работают и рукой, и с телефона. Датчик движения в прихожей включает свет сам, когда вы входите, и выключает через минуту.' },
    { t: '4. Умные карнизы', d: 'На каждом окне — карниз с мотором: шторы открываются на рассвете и закрываются вечером. Мотору нужно питание 220 В — оранжевый кабель от распредкоробки. Его закладывают ДО натяжного потолка.' },
    { t: '5. Тепло по расписанию', d: 'Умные термоголовки на радиаторах держат температуру в каждой комнате: ночью 19 °C, днём 22 °C, когда все ушли — 17 °C. Экономия до 20 %.' },
  ],
};

