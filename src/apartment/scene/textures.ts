// Процедурные текстуры (генерируются в браузере — без внешних файлов и лицензий).
// Временная замена фотограмметрическим PBR-текстурам — см. docs/ASSETS.md.
import * as THREE from 'three';

const cache = new Map<string, THREE.CanvasTexture>();

function rng(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

function shade(hex: string, k: number) {
  const c = new THREE.Color(hex);
  const hsl = { h: 0, s: 0, l: 0 };
  c.getHSL(hsl);
  c.setHSL(hsl.h, Math.min(1, hsl.s * (0.9 + k * 0.2)), Math.max(0, Math.min(1, hsl.l * (1 + k))));
  return `#${c.getHexString()}`;
}

function finish(canvas: HTMLCanvasElement, key: string) {
  const t = new THREE.CanvasTexture(canvas);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  cache.set(key, t);
  return t;
}

/** Ламинат: 6 досок шириной ~0.19 м, длиной 1.2 м, смещённые стыки, древесный рисунок. Текстура = 1.2 × 1.14 м. */
export function laminateTexture(color: string): THREE.CanvasTexture {
  const key = `lam:${color}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const W = 1024;
  const H = 972;
  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  const g = cv.getContext('2d')!;
  const rand = rng(color.split('').reduce((a, c) => a + c.charCodeAt(0), 0));
  const rows = 6;
  const rh = H / rows;
  for (let r = 0; r < rows; r++) {
    const offset = (r * 0.37 * W) % W;
    for (let k = -1; k < 2; k++) {
      const x0 = offset + k * W;
      const base = shade(color, (rand() - 0.5) * 0.18);
      g.fillStyle = base;
      g.fillRect(x0, r * rh, W, rh);
      // волокна
      for (let i = 0; i < 70; i++) {
        const y = r * rh + rand() * rh;
        g.strokeStyle = shade(color, (rand() - 0.6) * 0.35);
        g.globalAlpha = 0.18 + rand() * 0.25;
        g.lineWidth = 0.6 + rand() * 1.6;
        g.beginPath();
        g.moveTo(x0, y);
        for (let x = 0; x <= W; x += 64) g.lineTo(x0 + x, y + Math.sin(x / (90 + rand() * 60) + i) * (1 + rand() * 2.5));
        g.stroke();
      }
      // сучки
      for (let i = 0; i < 2; i++) {
        if (rand() > 0.55) continue;
        const cx = x0 + rand() * W;
        const cy = r * rh + rh * (0.25 + rand() * 0.5);
        g.globalAlpha = 0.25;
        g.fillStyle = shade(color, -0.35);
        g.beginPath();
        g.ellipse(cx, cy, 6 + rand() * 8, 3 + rand() * 3, 0, 0, Math.PI * 2);
        g.fill();
      }
      g.globalAlpha = 1;
      // торцевой стык
      g.fillStyle = 'rgba(30,18,8,0.55)';
      g.fillRect(x0, r * rh, 2, rh);
    }
    // продольная фаска
    g.fillStyle = 'rgba(30,18,8,0.5)';
    g.fillRect(0, r * rh, W, 2);
    g.fillStyle = 'rgba(255,255,255,0.08)';
    g.fillRect(0, r * rh + 2, W, 1);
  }
  const t = finish(cv, key);
  t.userData.size = [1.2, 1.14];
  return t;
}

/** Керамогранит 600×600 со швом 2 мм. Текстура = 1.2 × 1.2 м (2×2 плитки). */
export function tileTexture(color: string): THREE.CanvasTexture {
  const key = `tile:${color}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const S = 1024;
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const g = cv.getContext('2d')!;
  const rand = rng(7);
  const half = S / 2;
  for (let i = 0; i < 2; i++)
    for (let j = 0; j < 2; j++) {
      g.fillStyle = shade(color, (rand() - 0.5) * 0.05);
      g.fillRect(i * half, j * half, half, half);
      for (let n = 0; n < 900; n++) {
        g.fillStyle = `rgba(${rand() > 0.5 ? '255,255,255' : '0,0,0'},${rand() * 0.05})`;
        g.fillRect(i * half + rand() * half, j * half + rand() * half, 2 + rand() * 6, 2 + rand() * 6);
      }
    }
  g.fillStyle = '#b9b6ae';
  for (let k = 0; k <= 2; k++) {
    g.fillRect(k * half - 2, 0, 4, S);
    g.fillRect(0, k * half - 2, S, 4);
  }
  const t = finish(cv, key);
  t.userData.size = [1.2, 1.2];
  return t;
}

/** Лёгкая фактура штукатурки для стен. */
export function plasterTexture(): THREE.CanvasTexture {
  const key = 'plaster';
  const hit = cache.get(key);
  if (hit) return hit;
  const S = 512;
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const g = cv.getContext('2d')!;
  g.fillStyle = '#f2eee7';
  g.fillRect(0, 0, S, S);
  const rand = rng(3);
  for (let i = 0; i < 5000; i++) {
    g.fillStyle = `rgba(${rand() > 0.5 ? '255,255,255' : '120,110,95'},${rand() * 0.05})`;
    g.fillRect(rand() * S, rand() * S, 1 + rand() * 3, 1 + rand() * 3);
  }
  const t = finish(cv, key);
  t.userData.size = [1.5, 1.5];
  return t;
}

/** Ткань: мелкое плетение. */
export function fabricTexture(color: string): THREE.CanvasTexture {
  const key = `fab:${color}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const S = 256;
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const g = cv.getContext('2d')!;
  g.fillStyle = color;
  g.fillRect(0, 0, S, S);
  for (let y = 0; y < S; y += 3) {
    g.fillStyle = 'rgba(255,255,255,0.05)';
    g.fillRect(0, y, S, 1);
  }
  for (let x = 0; x < S; x += 3) {
    g.fillStyle = 'rgba(0,0,0,0.06)';
    g.fillRect(x, 0, 1, S);
  }
  const t = finish(cv, key);
  t.userData.size = [0.3, 0.3];
  return t;
}

/** Клон текстуры с повтором под размер поверхности (метры). */
export function sized(tex: THREE.Texture, w: number, h: number) {
  const t = tex.clone();
  const [sw, sh] = (tex.userData.size as [number, number]) ?? [1, 1];
  t.repeat.set(w / sw, h / sh);
  t.needsUpdate = true;
  return t;
}
