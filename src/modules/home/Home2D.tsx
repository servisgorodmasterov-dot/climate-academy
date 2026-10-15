import { NX, NZ, cellCenter, cssTemp, ROOM, type AcMode, type SimState } from '../../core/roomSim';
import type { Readout } from './useRoomSim';
import type { HotspotId } from './HomeScene';
import type { MutableRefObject } from 'react';

/**
 * 2D-альтернатива сцены: слева — разрез комнаты (стена с блоками, поток воздуха),
 * справа — план с тепловой картой. Для слабых устройств и браузеров без WebGL.
 */
export function Home2D({ sim, readout, on, mode, selected, onSelect }: { sim: MutableRefObject<SimState>; readout: Readout; on: boolean; mode: AcMode; selected: HotspotId | null; onSelect: (h: HotspotId) => void }) {
  const cool = mode === 'cool';
  const flowColor = cool ? 'var(--sky)' : 'var(--heat)';
  const hl = (id: HotspotId) => (selected === id ? 'var(--sky)' : 'var(--fg-3)');
  const cells = sim.current.t;
  const sx = 300 / (ROOM.x1 - ROOM.x0);
  const sz = 250 / (ROOM.z1 - ROOM.z0);
  return (
    <div className="svgwrap" style={{ height: '100%', display: 'grid', alignItems: 'center' }}>
      <svg viewBox="-50 0 950 420" role="img" aria-label="Разрез комнаты и тепловая карта">
        {/* ---- разрез ---- */}
        <text x="20" y="28" fill="var(--fg-3)" fontSize="12" fontFamily="var(--f-mono)">РАЗРЕЗ</text>
        <rect x="80" y="60" width="380" height="300" fill="var(--navy-850)" stroke="var(--line)" />
        <rect x="60" y="60" width="20" height="300" fill="var(--fg-3)" opacity="0.5" />
        <text x="22" y="380" fill="var(--fg-3)" fontSize="11">улица</text>
        <text x="380" y="380" fill="var(--fg-3)" fontSize="11">комната</text>
        {/* внутренний блок */}
        <g onClick={() => onSelect('indoor')} style={{ cursor: 'pointer' }}>
          <rect x="82" y="80" width="36" height="70" rx="6" fill="var(--fg)" stroke={hl('indoor')} strokeWidth="2" />
          <text x="124" y="96" fill="var(--fg-2)" fontSize="11">внутр. блок</text>
        </g>
        {/* наружный блок */}
        <g onClick={() => onSelect('outdoor')} style={{ cursor: 'pointer' }}>
          <rect x="4" y="190" width="54" height="80" rx="4" fill="var(--fg-2)" stroke={hl('outdoor')} strokeWidth="2" />
          <circle cx="22" cy="230" r="14" fill="var(--navy-900)" />
        </g>
        <path d="M 82 140 L 70 140 L 70 200 L 58 200" stroke={hl('route')} strokeWidth="5" fill="none" onClick={() => onSelect('route')} style={{ cursor: 'pointer' }} />
        <path d="M 82 136 L 74 136 L 74 214 L 58 214" stroke={selected === 'cable' ? 'var(--sky)' : '#5b6372'} strokeWidth="2" fill="none" onClick={() => onSelect('cable')} style={{ cursor: 'pointer' }} />
        <path d="M 82 146 L 66 146 L 66 340" stroke={hl('drain')} strokeWidth="2" strokeDasharray="4 3" fill="none" onClick={() => onSelect('drain')} style={{ cursor: 'pointer' }} />
        {/* поток */}
        {on &&
          [0, 1, 2].map((i) => (
            <path
              key={i}
              className="flow"
              d={cool ? `M 120 ${140 + i * 8} C 220 ${150 + i * 10}, 300 ${200 + i * 30}, 440 ${300 - i * 10}` : `M 120 ${140 + i * 8} C 160 ${260 + i * 10}, 240 ${330}, 440 ${300 - i * 50}`}
              stroke={flowColor}
              strokeWidth="2.5"
              fill="none"
              opacity={0.85 - i * 0.2}
            />
          ))}
        {on && (
          <path className="flow" d={cool ? 'M 4 230 C -20 220, -30 210, -40 200' : 'M 4 230 C -20 240, -30 250, -40 260'} stroke={cool ? 'var(--heat)' : 'var(--sky)'} strokeWidth="2.5" fill="none" />
        )}
        <text x="300" y="80" fill={cssTemp(readout.ceiling)} fontSize="13" fontFamily="var(--f-mono)">под потолком {readout.ceiling.toFixed(1)} °C</text>
        <text x="300" y="250" fill={cssTemp(readout.center)} fontSize="13" fontFamily="var(--f-mono)">рабочая зона {readout.center.toFixed(1)} °C</text>

        {/* ---- план ---- */}
        <text x="540" y="28" fill="var(--fg-3)" fontSize="12" fontFamily="var(--f-mono)">ПЛАН · ТЕПЛОВАЯ КАРТА</text>
        <g transform="translate(560 70)">
          {Array.from({ length: NX * NZ }).map((_, idx) => {
            const i = idx % NX;
            const k = Math.floor(idx / NX);
            const c = cellCenter(i, k);
            return <rect key={idx} x={(c.x - ROOM.x0) * sx - sx * 0.25} y={(c.z - ROOM.z0) * sz - sz * 0.25} width={sx * 0.5 - 1} height={sz * 0.5 - 1} fill={cssTemp(cells[idx])} />;
          })}
          <rect x="0" y="0" width="300" height="250" fill="none" stroke="var(--line)" />
          <rect x={(-1.2 - 0.9 - ROOM.x0) * sx} y="-4" width={1.8 * sx} height="8" fill="var(--sky-2)" onClick={() => onSelect('window')} style={{ cursor: 'pointer' }} />
          <rect x={(1.6 - 0.45 - ROOM.x0) * sx} y="2" width={0.9 * sx} height="8" fill="var(--fg)" />
          <text x="0" y="270" fill="var(--fg-3)" fontSize="11">наружная стена — сверху</text>
        </g>
      </svg>
    </div>
  );
}
