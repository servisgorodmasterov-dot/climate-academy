// Управление камерой «как в играх» (стратегии, The Sims, карты):
// • левая кнопка — схватить пол и тянуть: точка под курсором едет вместе с мышью (1:1, без «уплывания»);
// • правая или средняя кнопка — вращать вокруг точки, на которую наведён курсор;
// • Shift/Ctrl/Alt + левая — тоже вращение (для тачпада и одной кнопки);
// • колесо — приблизить к курсору; WASD/стрелки — ехать, Q/E — поворот, R/F — наклон, Shift — быстрее;
// • камера не уезжает далеко от квартиры.
import { useEffect, type RefObject } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type CameraControlsImpl from 'camera-controls';
import { useApp } from '../../store';

/** Клавиши по физическому положению (e.code) — работают и в русской раскладке. */
const PAN_KEYS: Record<string, [number, number]> = {
  KeyW: [0, 1],
  ArrowUp: [0, 1],
  KeyS: [0, -1],
  ArrowDown: [0, -1],
  KeyA: [-1, 0],
  ArrowLeft: [-1, 0],
  KeyD: [1, 0],
  ArrowRight: [1, 0],
};
const ROT_KEYS: Record<string, number> = { KeyQ: 1, KeyE: -1 };
const TILT_KEYS: Record<string, number> = { KeyR: -1, KeyF: 1 };
const ZOOM_KEYS: Record<string, number> = { Equal: 1, NumpadAdd: 1, Minus: -1, NumpadSubtract: -1, KeyZ: 1, KeyX: -1 };

const isTyping = (t: EventTarget | null) => {
  const el = t as HTMLElement | null;
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'SELECT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
};

export function useGameControls(ref: RefObject<CameraControlsImpl | null>, opts: { walk: boolean; W: number; D: number; onReset: () => void }) {
  const { gl, camera } = useThree();
  const { walk, W, D, onReset } = opts;
  const margin = 1.5;
  const clampX = (x: number) => Math.min(Math.max(x, -W / 2 - margin), W / 2 + margin);
  const clampZ = (z: number) => Math.min(Math.max(z, -D / 2 - margin), D / 2 + margin);

  // ---------- мышь ----------
  useEffect(() => {
    const cc = ref.current;
    if (!cc || walk) return;
    const el = gl.domElement;
    const parent = el.parentElement ?? el;
    const ray = new THREE.Raycaster();
    const ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const ndc = new THREE.Vector2();
    const startCam = (camera as THREE.PerspectiveCamera).clone();
    const t0 = new THREE.Vector3();
    const p0 = new THREE.Vector3();
    const p1 = new THREE.Vector3();
    let drag: { id: number; mode: 'pan' | 'orbit'; x: number; y: number } | null = null;

    const groundAt = (e: PointerEvent | MouseEvent, cam: THREE.Camera, out: THREE.Vector3) => {
      const r = el.getBoundingClientRect();
      ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ndc, cam);
      // луч почти параллелен полу (смотрим в горизонт) — точку не берём, иначе квартира «улетит»
      if (ray.ray.direction.y > -0.06) return null;
      const hit = ray.ray.intersectPlane(ground, out);
      if (!hit || hit.distanceTo(cam.position) > 45) return null;
      return hit;
    };

    const anchor = (e: PointerEvent) => {
      camera.updateMatrixWorld();
      startCam.copy(camera as THREE.PerspectiveCamera);
      startCam.updateMatrixWorld();
      cc.getTarget(t0, false);
      return groundAt(e, startCam, p0);
    };

    const onDown = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return; // пальцы — стандартные жесты (один — двигать, два — масштаб и поворот)
      if (e.button !== 0 && e.button !== 1 && e.button !== 2) return;
      // Shift/Ctrl/Alt или зажатый пробел временно меняют роли кнопок местами
      const swap = e.shiftKey || e.ctrlKey || e.altKey || e.metaKey || !!keys.current?.has('Space');
      const orbitMode = (useApp.getState().dragMode === 'orbit') !== swap;
      // средняя кнопка — всегда вращение
      const wantPan = e.button === 1 ? false : (e.button === 0) !== orbitMode;
      if (wantPan) {
        if (!anchor(e)) return;
        drag = { id: e.pointerId, mode: 'pan', x: e.clientX, y: e.clientY };
        el.style.cursor = 'grabbing';
        return;
      }
      // вращать вокруг того, на что смотрит курсор (если это квартира)
      camera.updateMatrixWorld();
      const hit = groundAt(e, camera, p1);
      if (hit && Math.abs(hit.x) < W / 2 + 0.5 && Math.abs(hit.z) < D / 2 + 0.5) cc.setOrbitPoint(hit.x, 0, hit.z);
      drag = { id: e.pointerId, mode: 'orbit', x: e.clientX, y: e.clientY };
      el.style.cursor = 'move';
    };

    const onMove = (e: PointerEvent) => {
      if (!drag || e.pointerId !== drag.id) return;
      if (drag.mode === 'orbit') {
        // поворот и наклон: градусы на пиксель — как в играх, без ускорения
        const dx = e.clientX - drag.x;
        const dy = e.clientY - drag.y;
        drag.x = e.clientX;
        drag.y = e.clientY;
        if (dx || dy) cc.rotate(-dx * 0.005, -dy * 0.004, false);
        return;
      }
      // считаем от положения камеры в момент нажатия — движение точное и не зависит от частоты кадров
      if (!groundAt(e, startCam, p1)) return;
      const nx = clampX(t0.x + p0.x - p1.x);
      const nz = clampZ(t0.z + p0.z - p1.z);
      cc.moveTo(nx, t0.y, nz, false);
    };

    const onUp = () => {
      drag = null;
      el.style.cursor = '';
    };
    // колесо во время перетаскивания меняет масштаб — перезахватываем точку
    const onWheel = () => {
      if (drag) drag = null;
    };

    parent.addEventListener('pointerdown', onDown, true); // раньше, чем CameraControls
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    el.addEventListener('wheel', onWheel, { passive: true });
    return () => {
      parent.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      el.removeEventListener('wheel', onWheel);
      el.style.cursor = '';
    };
  }, [ref, gl, camera, walk, W, D]);

  // ---------- клавиатура: плавное движение, пока клавиша зажата ----------
  useEffect(() => {
    if (walk) return;
    const down = new Set<string>();
    const kd = (e: KeyboardEvent) => {
      if (isTyping(e.target) || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.code === 'Home' || e.code === 'KeyH') {
        onReset();
        e.preventDefault();
        return;
      }
      if (e.code === 'Space') {
        down.add(e.code);
        e.preventDefault();
        return;
      }
      if (e.code in PAN_KEYS || e.code in ROT_KEYS || e.code in TILT_KEYS || e.code in ZOOM_KEYS || e.code.startsWith('Shift')) {
        down.add(e.code);
        if (!e.code.startsWith('Shift')) e.preventDefault();
      }
    };
    const ku = (e: KeyboardEvent) => down.delete(e.code);
    const clear = () => down.clear();
    window.addEventListener('keydown', kd);
    window.addEventListener('keyup', ku);
    window.addEventListener('blur', clear);
    keys.current = down;
    return () => {
      window.removeEventListener('keydown', kd);
      window.removeEventListener('keyup', ku);
      window.removeEventListener('blur', clear);
      keys.current = null;
    };
  }, [walk, onReset]);

  const tmp = new THREE.Vector3();
  useFrame((_, dt) => {
    const cc = ref.current;
    const down = keys.current;
    if (!cc || !down || walk) return;
    const v = vel.current;
    const step = Math.min(dt, 0.05);
    const fast = down.has('ShiftLeft') || down.has('ShiftRight') ? 2.5 : 1;
    let px = 0,
      pz = 0,
      rot = 0,
      tilt = 0,
      zoom = 0;
    down.forEach((c) => {
      const p = PAN_KEYS[c];
      if (p) {
        px += p[0];
        pz += p[1];
      }
      rot += ROT_KEYS[c] ?? 0;
      tilt += TILT_KEYS[c] ?? 0;
      zoom += ZOOM_KEYS[c] ?? 0;
    });
    // плавный разгон и торможение
    const k = Math.min(1, step * 9);
    v.px += (px - v.px) * k;
    v.pz += (pz - v.pz) * k;
    v.rot += (rot - v.rot) * k;
    v.tilt += (tilt - v.tilt) * k;
    v.zoom += (zoom - v.zoom) * k;
    const idle = [v.px, v.pz, v.rot, v.tilt, v.zoom].every((x) => Math.abs(x) < 0.002);
    if (idle) return;
    const dist = cc.distance;
    if (Math.abs(v.px) > 0.002 || Math.abs(v.pz) > 0.002) {
      // направление «вперёд» — куда смотрит камера, по полу
      const az = cc.azimuthAngle;
      const speed = Math.max(2, dist * 0.6) * fast * step;
      const fx = -Math.sin(az),
        fz = -Math.cos(az);
      const rx = Math.cos(az),
        rz = -Math.sin(az);
      cc.getTarget(tmp, false);
      cc.moveTo(clampX(tmp.x + (fx * v.pz + rx * v.px) * speed), tmp.y, clampZ(tmp.z + (fz * v.pz + rz * v.px) * speed), false);
    }
    if (Math.abs(v.rot) > 0.002) cc.rotate(v.rot * 1.8 * fast * step, 0, false);
    if (Math.abs(v.tilt) > 0.002) cc.rotate(0, v.tilt * 0.9 * fast * step, false);
    if (Math.abs(v.zoom) > 0.002) cc.dolly(v.zoom * Math.max(3, dist * 1.4) * fast * step, false);
  });
}

// общие на модуль (одна сцена на странице)
const keys: { current: Set<string> | null } = { current: null };
const vel = { current: { px: 0, pz: 0, rot: 0, tilt: 0, zoom: 0 } };
