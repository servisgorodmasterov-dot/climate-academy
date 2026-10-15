import type { PartId } from '../../three/splitParts';

/** 2D-схема блоков: упрощённые разрезы с кликабельными узлами (для режима без 3D). */
const IN: { id: PartId; d: string; label: [number, number] }[] = [
  { id: 'in-chassis', d: 'M20 40 h360 v130 h-360 z', label: [24, 36] },
  { id: 'in-filters', d: 'M60 52 h280 v10 h-280 z', label: [200, 50] },
  { id: 'in-evap', d: 'M70 70 l130 -6 l130 6 l-20 50 h-220 z', label: [200, 98] },
  { id: 'in-fan', d: 'M90 125 h220 a14 14 0 0 1 0 28 h-220 a14 14 0 0 1 0 -28 z', label: [200, 143] },
  { id: 'in-pan', d: 'M70 120 h40 v6 h-40 z M290 120 h40 v6 h-40 z', label: [300, 118] },
  { id: 'in-louvers', d: 'M110 168 l180 0 l-10 14 h-160 z', label: [200, 194] },
  { id: 'in-pcb', d: 'M346 60 h22 v80 h-22 z', label: [357, 154] },
  { id: 'in-sensors', d: 'M40 70 h12 v12 h-12 z M150 100 h10 v10 h-10 z', label: [46, 66] },
];
const OUT: { id: PartId; d: string; label: [number, number] }[] = [
  { id: 'out-base', d: 'M20 300 h360 v10 h-360 z M250 120 h4 v180 h-4 z', label: [200, 322] },
  { id: 'out-cond', d: 'M24 110 h10 v190 h-10 z M24 110 h220 v10 h-220 z', label: [120, 106] },
  { id: 'out-fan', d: 'M140 210 m-70 0 a70 70 0 1 0 140 0 a70 70 0 1 0 -140 0', label: [140, 214] },
  { id: 'out-comp', d: 'M290 210 h50 v84 h-50 z', label: [315, 254] },
  { id: 'out-4way', d: 'M286 180 h40 v12 h-40 z', label: [306, 176] },
  { id: 'out-eev', d: 'M340 175 h10 v26 h-10 z', label: [348, 170] },
  { id: 'out-pcb', d: 'M262 124 h110 v24 h-110 z', label: [317, 140] },
  { id: 'out-valves', d: 'M372 250 h16 v12 h-16 z M372 268 h16 v12 h-16 z', label: [380, 292] },
];

export function Device2D({ unit, selected, onSelect, names }: { unit: 'indoor' | 'outdoor'; selected: PartId | null; onSelect: (id: PartId) => void; names: Record<string, string> }) {
  const list = unit === 'indoor' ? IN : OUT;
  return (
    <div className="svgwrap" style={{ height: '100%', display: 'grid', alignItems: 'center' }}>
      <svg viewBox={unit === 'indoor' ? '0 0 400 220' : '0 90 400 240'} role="img" aria-label="Схема блока">
        {list.map((p) => (
          <path
            key={p.id}
            d={p.d}
            fill={selected === p.id ? 'color-mix(in srgb, var(--sky) 45%, transparent)' : 'var(--navy-800)'}
            stroke={selected === p.id ? 'var(--sky)' : 'var(--fg-3)'}
            strokeWidth="1.5"
            style={{ cursor: 'pointer' }}
            onClick={() => onSelect(p.id)}
          >
            <title>{names[p.id]}</title>
          </path>
        ))}
        {selected && list.find((p) => p.id === selected) && (
          <text x={list.find((p) => p.id === selected)!.label[0]} y={list.find((p) => p.id === selected)!.label[1]} fill="var(--fg)" fontSize="11" textAnchor="middle" fontFamily="var(--f-mono)">
            {names[selected]}
          </text>
        )}
      </svg>
    </div>
  );
}
