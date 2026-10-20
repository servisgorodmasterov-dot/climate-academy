// Параметрические 3D-модели объектов конфигуратора. Вид задаётся атрибутами товара из таблицы
// (колонка attrs): style, color, handle, hidden, finish. Новая модель двери = новая строка в таблице.
import { useMemo } from 'react';
import * as THREE from 'three';
import { plasterTexture, sized } from '../apartment/scene/textures';

const LEAF_T = 0.04;

function useMat(color: string, opts: { rough?: number; metal?: number; emissive?: boolean } = {}) {
  const m = useMemo(() => new THREE.MeshStandardMaterial({ color, roughness: opts.rough ?? 0.5, metalness: opts.metal ?? 0 }), [color, opts.rough, opts.metal]);
  useMemo(() => {
    m.emissive = new THREE.Color(opts.emissive ? '#2a6cff' : '#000000');
    m.emissiveIntensity = opts.emissive ? 0.28 : 0;
  }, [m, opts.emissive]);
  return m;
}

const glass = new THREE.MeshPhysicalMaterial({ color: '#dfe9ee', roughness: 0.35, transmission: 0.6, transparent: true, opacity: 0.55, thickness: 0.004 });

export interface DoorLook {
  style?: string; // flat | grooves | glass | panel | loft | steel
  color?: string;
  handle?: string;
  hidden?: string; // скрытая коробка — без наличников
}

/** Полотно двери. Петли — по оси x = 0, полотно уходит в +x. Низ — y = 0. */
export function DoorLeaf({ w, h, look, highlight = false, explode = 0 }: { w: number; h: number; look: DoorLook; highlight?: boolean; explode?: number }) {
  const color = look.color ?? '#efe9df';
  const style = look.style ?? 'flat';
  const leaf = useMat(color, { rough: style === 'loft' ? 0.4 : 0.55, emissive: highlight });
  const dark = useMat(new THREE.Color(color).multiplyScalar(0.72).getStyle(), { rough: 0.6 });
  const handle = useMat(look.handle ?? '#c4c7cb', { rough: 0.25, metal: 0.8 });
  const cx = w / 2;
  const faces = [1, -1];

  const body = (() => {
    if (style === 'glass' || style === 'loft') {
      const rail = style === 'loft' ? 0.05 : 0.11;
      const t = style === 'loft' ? 0.034 : LEAF_T;
      const bars: [number, number, number, number][] = [
        [rail / 2, h / 2, rail, h],
        [w - rail / 2, h / 2, rail, h],
        [cx, h - rail / 2, w, rail],
        [cx, rail * 1.6, w, rail * 3.2],
      ];
      if (style === 'glass') bars.push([cx, h * 0.38, w, 0.1]);
      if (style === 'loft') for (let i = 1; i < 4; i++) bars.push([cx, rail * 3.2 + ((h - rail * 4.2) * i) / 4, w, 0.022]);
      return (
        <>
          {bars.map(([x, y, bw, bh], i) => (
            <mesh key={i} position={[x, y, 0]} material={leaf} castShadow>
              <boxGeometry args={[bw, bh, t]} />
            </mesh>
          ))}
          <mesh position={[cx, style === 'glass' ? h * 0.69 : h / 2 + rail, 0]} material={glass}>
            <boxGeometry args={[w - rail * 2, style === 'glass' ? h * 0.55 : h - rail * 4.2, 0.008]} />
          </mesh>
          {style === 'glass' && (
            <mesh position={[cx, h * 0.22, 0]} material={leaf}>
              <boxGeometry args={[w - rail * 2, h * 0.24, t * 0.6]} />
            </mesh>
          )}
        </>
      );
    }
    return (
      <>
        <mesh position={[cx, h / 2, 0]} material={leaf} castShadow receiveShadow>
          <boxGeometry args={[w, h, style === 'steel' ? 0.07 : LEAF_T]} />
        </mesh>
        {style === 'grooves' &&
          faces.flatMap((f) =>
            [0.25, 0.4, 0.55, 0.7, 0.85].map((k) => (
              <mesh key={`${f}${k}`} position={[cx, h * k, (f * LEAF_T) / 2]} material={dark}>
                <boxGeometry args={[w - 0.12, 0.006, 0.003]} />
              </mesh>
            )),
          )}
        {(style === 'panel' || style === 'steel') &&
          faces.flatMap((f) =>
            (style === 'steel'
              ? [[0.5, 0.5, 0.7]]
              : [
                  [0.28, 0.25, 0.32],
                  [0.72, 0.25, 0.32],
                  [0.28, 0.68, 0.42],
                  [0.72, 0.68, 0.42],
                ]
            ).map(([kx, ky, kh], i) => (
              <mesh key={`${f}${i}`} position={[w * (style === 'steel' ? 0.5 : kx), h * ky, f * ((style === 'steel' ? 0.07 : LEAF_T) / 2 + 0.006)]} material={style === 'steel' ? dark : leaf} castShadow>
                <boxGeometry args={[style === 'steel' ? w * 0.72 : w * 0.34, h * kh, 0.012]} />
              </mesh>
            )),
          )}
      </>
    );
  })();

  return (
    <group>
      {body}
      {/* ручки с двух сторон */}
      {faces.map((f) => (
        <group key={f} position={[w - 0.07, 1.0, f * (0.03 + explode * 0.15)]}>
          <mesh material={handle} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.025, 0.025, 0.012, 20]} />
          </mesh>
          <mesh position={[-0.055, 0, f * 0.025]} material={handle}>
            <boxGeometry args={[0.12, 0.018, 0.018]} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

/** Коробка и наличники. Проём: ширина w, высота h, толщина стены t. Ось x = 0 — левый край проёма. */
export function DoorFrame({ w, h, t, look, explode = 0, highlight = false, casingW = 0.07 }: { w: number; h: number; t: number; look: DoorLook; explode?: number; highlight?: boolean; casingW?: number }) {
  const frame = useMat(look.color ?? '#efe9df', { rough: 0.5, emissive: highlight });
  const hidden = look.hidden === '1';
  const ft = 0.03; // толщина бруса коробки
  return (
    <group>
      {/* стойки и перемычка коробки */}
      <mesh position={[ft / 2 - explode * 0.12, h / 2, 0]} material={frame} castShadow>
        <boxGeometry args={[ft, h, t * 0.9]} />
      </mesh>
      <mesh position={[w - ft / 2 + explode * 0.12, h / 2, 0]} material={frame} castShadow>
        <boxGeometry args={[ft, h, t * 0.9]} />
      </mesh>
      <mesh position={[w / 2, h - ft / 2 + explode * 0.12, 0]} material={frame} castShadow>
        <boxGeometry args={[w, ft, t * 0.9]} />
      </mesh>
      {/* наличники с двух сторон */}
      {!hidden &&
        [1, -1].map((f) => (
          <group key={f} position={[0, 0, f * (t / 2 + 0.006 + explode * 0.35)]}>
            <mesh position={[-casingW / 2 + 0.01, (h + casingW) / 2, 0]} material={frame} castShadow>
              <boxGeometry args={[casingW, h + casingW, 0.012]} />
            </mesh>
            <mesh position={[w + casingW / 2 - 0.01, (h + casingW) / 2, 0]} material={frame} castShadow>
              <boxGeometry args={[casingW, h + casingW, 0.012]} />
            </mesh>
            <mesh position={[w / 2, h + casingW / 2 - 0.01, 0]} material={frame} castShadow>
              <boxGeometry args={[w + casingW * 2 - 0.02, casingW, 0.012]} />
            </mesh>
          </group>
        ))}
    </group>
  );
}

/** Петли (видны в уроке). */
export function DoorHinges({ h, hidden, explode = 0 }: { h: number; hidden: boolean; explode?: number }) {
  const m = useMat('#9aa0a6', { rough: 0.3, metal: 0.9 });
  return (
    <group>
      {[0.2, h - 0.25].map((y) => (
        <mesh key={y} position={[0.03 - explode * 0.06, y, 0.024 + explode * 0.1]} material={m}>
          <boxGeometry args={hidden ? [0.012, 0.1, 0.03] : [0.004, 0.1, 0.035]} />
        </mesh>
      ))}
    </group>
  );
}

// ---------- Отделка стен ----------

const finishCache = new Map<string, THREE.CanvasTexture>();

/** Процедурная фактура отделки: краска, обои, штукатурка, реечные панели. */
export function finishTexture(finish: string, color: string): THREE.Texture | null {
  if (finish === 'plaster') return plasterTexture();
  if (finish === 'tile') return wallTileTexture();
  if (finish !== 'wallpaper' && finish !== 'panel') return null;
  const key = `${finish}:${color}`;
  const hit = finishCache.get(key);
  if (hit) return hit;
  const S = 256;
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const g = cv.getContext('2d')!;
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, S, S);
  if (finish === 'wallpaper') {
    for (let x = 0; x < S; x += 16) {
      g.fillStyle = x % 32 ? 'rgba(0,0,0,0.035)' : 'rgba(255,255,255,0.4)';
      g.fillRect(x, 0, 8, S);
    }
    for (let y = 0; y < S; y += 2) {
      g.fillStyle = `rgba(0,0,0,${0.012 + ((y * 7) % 5) * 0.004})`;
      g.fillRect(0, y, S, 1);
    }
  } else {
    for (let x = 0; x < S; x += 32) {
      g.fillStyle = 'rgba(0,0,0,0.38)';
      g.fillRect(x, 0, 6, S);
      g.fillStyle = 'rgba(255,255,255,0.12)';
      g.fillRect(x + 8, 0, 3, S);
    }
  }
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.userData.size = finish === 'panel' ? [0.24, 1] : [0.53, 0.53];
  finishCache.set(key, t);
  return t;
}

/** Настенная плитка 60×30 см с разбежкой: белая основа (цвет даёт материал) и светлые швы. */
function wallTileTexture(): THREE.CanvasTexture {
  const hit = finishCache.get('tile');
  if (hit) return hit;
  const S = 256;
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const g = cv.getContext('2d')!;
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, S, S);
  // лёгкий блик и неоднородность глазури
  for (let n = 0; n < 400; n++) {
    g.fillStyle = `rgba(0,0,0,${Math.random() * 0.025})`;
    g.fillRect(Math.random() * S, Math.random() * S, 3, 3);
  }
  g.fillStyle = 'rgba(120,115,105,0.55)';
  const half = S / 2;
  g.fillRect(0, 0, S, 3); // горизонтальные швы: два ряда по 30 см
  g.fillRect(0, half - 1, S, 3);
  g.fillRect(0, 0, 3, half); // вертикальные швы со сдвигом на полплитки
  g.fillRect(half - 1, half, 3, half);
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.userData.size = [0.6, 0.6];
  finishCache.set('tile', t);
  return t;
}

export function finishMaterial(finish: string, color: string, w: number, h: number) {
  const tex = finishTexture(finish, color);
  return new THREE.MeshStandardMaterial({
    color,
    map: tex ? sized(tex, w, h) : null,
    roughness: finish === 'paint' ? 0.9 : finish === 'panel' ? 0.6 : finish === 'tile' ? 0.28 : 0.85,
  });
}
