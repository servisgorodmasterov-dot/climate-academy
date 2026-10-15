import { useEffect, useRef, useState } from 'react';

/**
 * Поперечный разрез ротационного компрессора.
 * Эксцентриковый ролик обкатывает цилиндр; лопасть (пластина) прижата к ролику и
 * отделяет полость всасывания от полости сжатия. Объём полости сжатия уменьшается → давление растёт,
 * в конце хода открывается нагнетательный клапан.
 */
export function CompressorAnim({ paused }: { paused: boolean }) {
  const [a, setA] = useState(0.6);
  const raf = useRef(0);
  useEffect(() => {
    if (paused) return;
    let last = performance.now();
    const loop = (t: number) => {
      const dt = (t - last) / 1000;
      last = t;
      setA((x) => (x + dt * 1.6) % (Math.PI * 2));
      raf.current = requestAnimationFrame(loop);
    };
    raf.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf.current);
  }, [paused]);

  const R = 80; // цилиндр
  const e = 16; // эксцентриситет
  const r = R - e; // ролик касается цилиндра
  const cx = 110;
  const cy = 110;
  // угол a — положение точки касания; 0 — у лопасти (сверху), ролик обкатывает по часовой
  const contact = (ang: number) => ({ x: cx + Math.sin(ang) * R, y: cy - Math.cos(ang) * R });
  const rc = { x: cx + Math.sin(a) * e, y: cy - Math.cos(a) * e };
  // лопасть сверху: нижний край на поверхности ролика
  const vaneY = rc.y - Math.sqrt(Math.max(0, r * r - (cx - rc.x) ** 2));
  const p = contact(a);
  // полость сжатия: от лопасти (верх, справа от неё) по часовой до точки касания
  const arc = (from: number, to: number, ccw: boolean) => {
    const s = contact(from);
    const t = contact(to);
    const large = ((ccw ? from - to : to - from) + Math.PI * 4) % (Math.PI * 2) > Math.PI ? 1 : 0;
    return `M ${s.x} ${s.y} A ${R} ${R} 0 ${large} ${ccw ? 0 : 1} ${t.x} ${t.y}`;
  };
  const frac = a / (Math.PI * 2); // доля оборота
  const compRatio = 1 - frac; // относительный объём полости сжатия
  const pressure = Math.min(1, 0.25 + (1 - compRatio) * 0.9);
  const discharging = frac > 0.82;
  const hot = `rgb(${Math.round(120 + 135 * pressure)}, ${Math.round(140 - 60 * pressure)}, ${Math.round(220 - 170 * pressure)})`;

  return (
    <svg viewBox="-10 -4 240 244" width="100%" style={{ maxWidth: 300, display: 'block', margin: '0 auto' }} role="img" aria-label="Разрез ротационного компрессора">
      <defs>
        <clipPath id="cyl">
          <circle cx={cx} cy={cy} r={R} />
        </clipPath>
      </defs>
      {/* за роликом (от лопасти до касания) — всасывание, перед роликом — сжатие */}
      <g clipPath="url(#cyl)">
        <path d={`${arc(0.0001, a, false)} L ${rc.x} ${rc.y} L ${cx} ${vaneY} Z`} fill="#3b9be0" opacity="0.55" />
        <path d={`${arc(a, Math.PI * 2 - 0.0001, false)} L ${cx} ${vaneY} L ${rc.x} ${rc.y} Z`} fill={hot} opacity="0.75" />
      </g>
      <circle cx={cx} cy={cy} r={R} fill="none" stroke="var(--fg-2)" strokeWidth="5" />
      <circle cx={rc.x} cy={rc.y} r={r} fill="var(--navy-800)" stroke="var(--sky)" strokeWidth="3" />
      <circle cx={cx} cy={cy} r="12" fill="var(--fg-3)" />
      <circle cx={cx + Math.sin(a) * e * 0.6} cy={cy - Math.cos(a) * e * 0.6} r="4" fill="var(--navy-950)" />
      {/* лопасть */}
      <rect x={cx - 5} y={vaneY - 48} width="10" height="48" fill="var(--heat)" />
      {/* каналы */}
      <rect x={cx + 20} y={cy - R - 22} width="14" height="26" fill="#3b9be0" />
      <rect x={cx - 34} y={cy - R - 22} width="14" height="26" fill={discharging ? 'var(--heat)' : 'var(--fg-3)'} />
      <text x={cx + 40} y="12" fill="var(--fg-2)" fontSize="10" textAnchor="start">всасывание</text>
      <text x={cx - 40} y="12" fill="var(--fg-2)" fontSize="10" textAnchor="end">нагнетание</text>
      <circle cx={p.x} cy={p.y} r="3" fill="var(--fg)" />
      <text x={cx} y="216" fill="var(--fg)" fontSize="11" textAnchor="middle" fontFamily="var(--f-mono)">
        {discharging ? 'клапан открыт: горячий газ уходит' : `сжатие: давление растёт ${Math.round(pressure * 100)}%`}
      </text>
      <text x={cx} y="232" fill="var(--fg-3)" fontSize="9.5" textAnchor="middle">синий — всасывание · красный — сжатие</text>
    </svg>
  );
}
