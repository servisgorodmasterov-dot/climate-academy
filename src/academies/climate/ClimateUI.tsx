import { useState } from 'react';
import type { AcademyViewProps } from '../../core/academy';
import { findProduct } from '../../catalog/sheetParser';
import { useApp } from '../../store';
import { coolingLoadKw, recommendModel, SUN_LABEL, SUN_LOAD, type ClimateParams } from './logic';

type Props = AcademyViewProps<ClimateParams>;

const PARTS = [
  { id: 'indoor', name: 'Внутренний блок', text: 'Внутри — испаритель (теплообменник) и вентилятор. В режиме охлаждения хладагент кипит в испарителе и забирает тепло воздуха комнаты. Здесь же образуется конденсат.' },
  { id: 'outdoor', name: 'Наружный блок', text: 'Компрессор сжимает газообразный хладагент, он нагревается; в конденсаторе отдаёт тепло уличному воздуху и становится жидкостью. Затем расширительный клапан снижает давление.' },
  { id: 'route', name: 'Трасса', text: 'Две медные трубки в теплоизоляции: тонкая — жидкость, толстая — газ. Вместе с ними идёт межблочный кабель. Длина и перепад высот — в пределах паспорта модели.' },
  { id: 'drain', name: 'Дренаж', text: 'Конденсат стекает по дренажному шлангу самотёком — нужен постоянный уклон. Если уклон сделать нельзя, ставят дренажную помпу.' },
  { id: 'power', name: 'Питание', text: 'Отдельная линия от щита с автоматическим выключателем. Сечение кабеля и номинал автомата — по паспорту кондиционера.' },
  { id: 'heat', name: 'Перенос тепла', text: 'Кондиционер не «производит холод», а переносит тепло из комнаты на улицу. В режиме обогрева четырёхходовой клапан разворачивает цикл: тепло берётся с улицы и отдаётся в комнату.' },
] as const;

export function ClimateLesson({ ctx }: Props) {
  const [part, setPart] = useState<(typeof PARTS)[number]['id']>('heat');
  const [heating, setHeating] = useState(false);
  const hl = (id: string) => (part === id ? 'hl' : '');
  const p = PARTS.find((x) => x.id === part)!;
  return (
    <div className="lesson">
      <div className="seg small">
        <button className={!heating ? 'on' : ''} onClick={() => setHeating(false)}>
          Охлаждение
        </button>
        <button className={heating ? 'on' : ''} onClick={() => setHeating(true)}>
          Обогрев
        </button>
      </div>
      <svg className={`ac-diagram ${heating ? 'heating' : 'cooling'}`} viewBox="0 0 660 340" role="img" aria-label="Схема работы сплит-системы">
        <defs>
          <marker id="arrow" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" fill="currentColor" />
          </marker>
        </defs>
        {/* стена */}
        <rect x="370" y="10" width="34" height="310" fill="#e2ddd4" />
        <text x="387" y="325" textAnchor="middle" className="cap">стена</text>
        <text x="180" y="24" textAnchor="middle" className="cap">КОМНАТА</text>
        <text x="520" y="24" textAnchor="middle" className="cap">УЛИЦА</text>
        {/* внутренний блок */}
        <g className={`part ${hl('indoor')}`} onClick={() => setPart('indoor')}>
          <rect x="120" y="50" width="220" height="70" rx="18" fill="#fff" stroke="#9aa7b4" />
          <text x="230" y="90" textAnchor="middle">{heating ? 'Конденсатор' : 'Испаритель'}</text>
        </g>
        {/* поток воздуха в комнате */}
        <g className="air" style={{ color: heating ? '#e65a2b' : '#1b8be0' }}>
          {[0, 1, 2].map((i) => (
            <path key={i} d={`M ${160 + i * 60} 130 q 10 40 -10 80`} stroke="currentColor" strokeWidth="3" fill="none" markerEnd="url(#arrow)" className="flow" style={{ animationDelay: `${i * 0.3}s` }} />
          ))}
          <text x="230" y="235" textAnchor="middle" className="cap" fill="currentColor">
            {heating ? 'тёплый воздух в комнату' : 'охлаждённый воздух'}
          </text>
        </g>
        {/* наружный блок */}
        <g className={`part ${hl('outdoor')}`} onClick={() => setPart('outdoor')}>
          <rect x="440" y="120" width="170" height="130" rx="8" fill="#eef1f4" stroke="#9aa7b4" />
          <circle cx="500" cy="185" r="40" fill="#dfe4ea" stroke="#9aa7b4" />
          <circle cx="500" cy="185" r="6" fill="#9aa7b4" />
          <rect x="548" y="196" width="58" height="44" rx="6" fill="#c7cfd8" />
          <text x="577" y="223" textAnchor="middle" className="tiny">компр.</text>
          <text x="525" y="268" textAnchor="middle" className="cap">{heating ? 'испаритель (берёт тепло с улицы)' : 'конденсатор (отдаёт тепло)'}</text>
        </g>
        <g className="air" style={{ color: heating ? '#1b8be0' : '#e65a2b' }}>
          {[0, 1].map((i) => (
            <path key={i} d={`M 614 ${160 + i * 50} l 22 0`} stroke="currentColor" strokeWidth="3" markerEnd="url(#arrow)" className="flow" />
          ))}
        </g>
        {/* трасса */}
        <g className={`part ${hl('route')}`} onClick={() => setPart('route')}>
          <path d="M 340 75 L 455 75 L 455 120" fill="none" stroke="#b87333" strokeWidth="9" strokeLinecap="round" />
          <path d="M 340 98 L 470 98 L 470 120" fill="none" stroke="#b87333" strokeWidth="5" strokeLinecap="round" />
          <path d="M 340 75 L 455 75 L 455 120" fill="none" stroke="#fff" strokeWidth="3" strokeDasharray="4 14" className="refrigerant gas" />
          <path d="M 340 98 L 470 98 L 470 120" fill="none" stroke="#fff" strokeWidth="2" strokeDasharray="3 12" className="refrigerant liquid" />
          <text x="410" y="66" textAnchor="middle" className="tiny">газ</text>
          <text x="420" y="112" textAnchor="middle" className="tiny">жидкость</text>
        </g>
        {/* дренаж */}
        <g className={`part ${hl('drain')}`} onClick={() => setPart('drain')}>
          <path d="M 330 120 L 330 140 L 470 300" fill="none" stroke="#5aa9e6" strokeWidth="4" strokeDasharray="2 6" />
          <text x="430" y="300" className="tiny">уклон ↘</text>
        </g>
        {/* питание */}
        <g className={`part ${hl('power')}`} onClick={() => setPart('power')}>
          <path d="M 60 300 L 60 100 L 120 100" fill="none" stroke="#f5b400" strokeWidth="4" />
          <rect x="35" y="285" width="50" height="34" rx="4" fill="#fff" stroke="#9aa7b4" />
          <text x="60" y="306" textAnchor="middle" className="tiny">щит</text>
        </g>
        {/* тепло */}
        <g className={`part ${hl('heat')}`} onClick={() => setPart('heat')}>
          <text x="230" y="290" textAnchor="middle" className="heat-label">
            {heating ? 'тепло: улица → комната' : 'тепло: комната → улица'}
          </text>
        </g>
      </svg>
      <div className="chips">
        {PARTS.map((x) => (
          <button key={x.id} className={part === x.id ? 'chip on' : 'chip'} onClick={() => setPart(x.id)}>
            {x.name}
          </button>
        ))}
      </div>
      <p className="explain">{p.text}</p>
      {ctx.proMode && (
        <div className="pro-note">
          <b>Для мастера.</b> Вакуумирование трассы перед пуском, проверка на герметичность, длины трассы и дозаправка — строго по инструкции производителя модели. Наружный блок — с доступом для обслуживания; дренаж — не в общую ливнёвку фасада без согласования УК.
        </div>
      )}
    </div>
  );
}

export function ClimateCalculator({ ctx, params, setParams, tier }: Props) {
  const set = (p: Partial<ClimateParams>) => setParams({ ...params, ...p });
  const load = coolingLoadKw(params);
  const rec = recommendModel(ctx.catalog, tier, load.total);
  const active = useApp((s) => s.activeSection);
  const current = useApp((s) => (active ? s.sections[active]?.selection['ac.split']?.productId : null));
  const cur = current ? findProduct(ctx.catalog, current) : null;
  return (
    <div className="calc">
      <div className="grid2">
        <label>
          Площадь, м²
          <input type="number" min={1} step={0.1} value={params.area} onChange={(e) => set({ area: +e.target.value })} />
        </label>
        <label>
          Высота потолка, м
          <input type="number" min={2.2} max={5} step={0.05} value={params.height} onChange={(e) => set({ height: +e.target.value })} />
        </label>
        <label>
          Людей обычно в комнате
          <input type="number" min={0} max={20} value={params.people} onChange={(e) => set({ people: +e.target.value })} />
        </label>
        <label>
          Тепло от техники, Вт
          <input type="number" min={0} step={50} value={params.appliancesW} onChange={(e) => set({ appliancesW: +e.target.value })} />
        </label>
      </div>
      <label>
        Солнце
        <select value={params.sun} onChange={(e) => set({ sun: e.target.value as ClimateParams['sun'] })}>
          {(Object.keys(SUN_LABEL) as ClimateParams['sun'][]).map((k) => (
            <option key={k} value={k}>
              {SUN_LABEL[k]} — {SUN_LOAD[k]} Вт/м³
            </option>
          ))}
        </select>
      </label>
      <div className="result">
        <div className="big">{load.total} кВт</div>
        <div className="muted">
          {params.area} м² × {params.height} м × {SUN_LOAD[params.sun]} Вт/м³ = {load.q1} кВт · люди {load.q2} кВт · техника {load.q3} кВт
        </div>
        {rec.product && (
          <div className="rec">
            Рекомендуем: <b>{rec.product.name}</b>
            <div className="muted">{rec.note}</div>
            {cur?.id !== rec.product.id && active && (
              <button className="btn" onClick={() => useApp.getState().setSlot(active, 'ac.split', rec.product!.id)}>
                Применить подбор
              </button>
            )}
            {cur?.id === rec.product.id && <div className="ok">✓ Выбрана рекомендуемая модель</div>}
          </div>
        )}
        <p className="muted small">Упрощённая оценка для выбора класса мощности. Окончательный подбор — мастер на объекте.</p>
      </div>
      <div className="grid2">
        <label>
          Длина трассы, м
          <input type="number" min={1} max={30} value={params.routeM} onChange={(e) => set({ routeM: Math.max(1, +e.target.value) })} />
        </label>
        <label className="check">
          <input type="checkbox" checked={params.chase} onChange={(e) => set({ chase: e.target.checked })} />
          Трасса в штробе (скрытая)
        </label>
      </div>
    </div>
  );
}
