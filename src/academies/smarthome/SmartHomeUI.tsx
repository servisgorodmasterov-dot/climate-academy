import { useState } from 'react';
import type { AcademyViewProps } from '../../core/academy';
import { PROTOCOLS, type SmartHomeParams } from './logic';

type Props = AcademyViewProps<SmartHomeParams>;

/** Схема подключения освещения через умный выключатель или реле. Электрически корректная однолинейная логика. */
function WiringDiagram({ neutral, device, on }: { neutral: boolean; device: 'switch' | 'relay'; on: boolean }) {
  const live = '#d63a2f';
  const nColor = '#1f6fd6';
  const pe = '#2f9e44';
  const off = '#b8c0c8';
  const lColor = on ? live : off;
  return (
    <svg viewBox="0 0 660 300" className="wiring" role="img" aria-label="Схема подключения умного выключателя">
      {/* щит */}
      <rect x="10" y="40" width="110" height="220" rx="8" fill="#fff" stroke="#9aa7b4" />
      <text x="65" y="32" textAnchor="middle" className="cap">Щит</text>
      <rect x="22" y="60" width="86" height="34" rx="4" fill="#eef1f4" stroke="#9aa7b4" />
      <text x="65" y="82" textAnchor="middle" className="tiny">автомат</text>
      <text x="65" y="130" textAnchor="middle" className="tiny" fill={nColor}>шина N</text>
      <text x="65" y="200" textAnchor="middle" className="tiny" fill={pe}>шина PE</text>
      {/* распределительная коробка */}
      <circle cx="260" cy="150" r="46" fill="#fff" stroke="#9aa7b4" strokeDasharray="5 4" />
      <text x="300" y="112" className="tiny">распред. коробка</text>
      {/* L: автомат → коробка → выключатель */}
      <path d="M 108 77 L 230 77 L 248 135" stroke={live} strokeWidth="3" fill="none" />
      <path d="M 248 135 L 248 230 L 335 230" stroke={live} strokeWidth="3" fill="none" />
      <text x="128" y="68" className="tiny" fill={live}>L (фаза)</text>
      {/* N */}
      <path d="M 120 125 L 262 125 L 272 150 L 520 150 L 520 175" stroke={nColor} strokeWidth="3" fill="none" />
      {neutral && <path d="M 272 150 L 272 256 L 333 256" stroke={nColor} strokeWidth="3" fill="none" />}
      <text x="128" y="145" className="tiny" fill={nColor}>N (нейтраль)</text>
      {/* PE */}
      <path d="M 120 195 L 210 195 L 210 270 L 600 270 L 600 200 L 560 200" stroke={pe} strokeWidth="3" fill="none" />
      <text x="470" y="292" className="tiny" fill={pe}>PE (защитный)</text>
      {/* подрозетник с устройством */}
      <rect x="318" y="195" width="132" height="80" rx="10" fill="#f5f7fa" stroke="#8592a0" />
      <text x="384" y="188" textAnchor="middle" className="tiny">
        подрозетник 60 мм
      </text>
      <rect x="333" y="208" width="102" height="56" rx="6" fill={device === 'switch' ? '#ffffff' : '#e9f1ff'} stroke="#5d6b7a" />
      <text x="384" y="232" textAnchor="middle" className="tiny">{device === 'switch' ? 'умный' : 'реле'}</text>
      <text x="384" y="252" textAnchor="middle" className="tiny">{device === 'switch' ? 'выключатель' : 'в коробке'}</text>
      {/* L' к лампе */}
      <path d="M 435 225 L 470 225 L 470 110 L 520 110 L 520 125" stroke={lColor} strokeWidth="3" fill="none" className={on ? 'current' : ''} />
      <text x="478" y="100" className="tiny" fill={lColor}>L′ (на лампу)</text>
      {/* лампа */}
      <g>
        <circle cx="520" cy="150" r="24" fill={on ? '#ffe28a' : '#f1f3f5'} stroke="#8592a0" />
        {on && <circle cx="520" cy="150" r="38" fill="#ffd54a" opacity="0.25" />}
        <path d="M 508 150 q 6 -12 12 0 q 6 12 12 0" stroke="#8592a0" fill="none" strokeWidth="2" />
        <text x="560" y="140" className="tiny">светильник</text>
      </g>
      {!neutral && (
        <g>
          <text x="130" y="292" className="warn-text">
            нет N в подрозетнике
          </text>
        </g>
      )}
    </svg>
  );
}

function NetworkDiagram({ protocol }: { protocol: (typeof PROTOCOLS)[number]['id'] }) {
  const hubLabel = protocol === 'wifi' ? 'Wi-Fi роутер' : protocol === 'knx' ? 'Блок питания шины' : protocol === 'thread' || protocol === 'matter' ? 'Border Router / контроллер' : 'Хаб (координатор)';
  const routers = [
    [170, 80],
    [470, 80],
    [470, 220],
  ];
  const ends = [
    [100, 215],
    [320, 262],
    [552, 165],
  ];
  const mesh = protocol === 'zigbee' || protocol === 'thread' || protocol === 'matter';
  if (protocol === 'knx')
    return (
      <svg viewBox="0 0 640 300" className="net" role="img" aria-label="Шина KNX">
        <path d="M 40 150 L 600 150" stroke="#2f9e44" strokeWidth="6" />
        <text x="320" y="135" textAnchor="middle" className="tiny">
          шина KNX TP: зелёный кабель, ~29 В DC
        </text>
        {[70, 195, 320, 445, 570].map((x, i) => (
          <g key={x}>
            <path d={`M ${x} 150 L ${x} ${i % 2 ? 210 : 90}`} stroke="#2f9e44" strokeWidth="3" />
            <rect x={x - 52} y={i % 2 ? 210 : 50} width="104" height="40" rx="8" fill="#fff" stroke="#8592a0" />
            <text x={x} y={i % 2 ? 235 : 75} textAnchor="middle" className="tiny">
              {['питание', 'выключатель', 'актуатор', 'датчик', 'IP-шлюз'][i]}
            </text>
          </g>
        ))}
        <circle r="6" fill="#2f9e44" className="packet-bus" />
      </svg>
    );
  return (
    <svg viewBox="0 0 640 300" className="net" role="img" aria-label="Топология беспроводной сети">
      {/* связи */}
      {mesh
        ? [
            [320, 150, ...routers[0]],
            [320, 150, ...routers[1]],
            [routers[1][0], routers[1][1], ...routers[2]],
            [routers[0][0], routers[0][1], ...ends[0]],
            [routers[2][0], routers[2][1], ...ends[1]],
            [routers[1][0], routers[1][1], ...ends[2]],
            [routers[2][0], routers[2][1], ...ends[2]],
          ].map(([a, b, c, d], i) => <path key={i} d={`M ${a} ${b} L ${c} ${d}`} stroke="#8e44ff" strokeWidth="2" strokeDasharray="5 6" className="radio" />)
        : [...routers, ...ends].map(([c, d], i) => <path key={i} d={`M 320 150 L ${c} ${d}`} stroke="#8e44ff" strokeWidth="2" strokeDasharray="5 6" className="radio" />)}
      <g>
        <rect x="185" y="125" width="270" height="50" rx="12" fill="#0066fa" />
        <text x="320" y="155" textAnchor="middle" className="tiny" fill="#fff">
          {hubLabel}
        </text>
      </g>
      {routers.map(([x, y], i) => (
        <g key={`r${i}`}>
          <rect x={x - 76} y={y - 24} width="152" height="48" rx="8" fill="#fff" stroke="#8592a0" />
          <text x={x} y={y - 4} textAnchor="middle" className="tiny">
            выключатель
          </text>
          <text x={x} y={y + 16} textAnchor="middle" className="tiny muted-fill">
            {mesh ? 'роутер · от сети' : 'от сети'}
          </text>
        </g>
      ))}
      {ends.map(([x, y], i) => (
        <g key={`e${i}`}>
          <rect x={x - 82} y={y - 24} width="164" height="48" rx="24" fill="#fff" stroke="#8592a0" />
          <text x={x} y={y - 4} textAnchor="middle" className="tiny">
            {i === 0 ? 'датчик движения' : 'датчик протечки'}
          </text>
          <text x={x} y={y + 16} textAnchor="middle" className="tiny muted-fill">
            {mesh ? 'конечное · батарейка' : 'батарейка'}
          </text>
        </g>
      ))}
      {protocol === 'matter' && (
        <text x="320" y="292" textAnchor="middle" className="tiny">
          Matter — общий язык устройств; здесь он работает поверх Thread (mesh)
        </text>
      )}
    </svg>
  );
}

const PREP = [
  'Нейтраль (N) в каждом подрозетнике выключателя — без неё большинство умных выключателей работают нестабильно, LED-лампы могут мерцать',
  'Глубокие подрозетники 60 мм там, где будут реле или умные выключатели',
  'Место под хаб: розетка рядом и, лучше, кабель Ethernet к роутеру',
  'Датчики протечки — под мойкой, у стиральной машины, у коллектора; для защиты — краны с электроприводом на вводе',
  'Покрытие Wi-Fi во всей квартире; слаботочный щит для роутера',
  'Для KNX — кабель шины закладывается на этапе черновой электрики',
];

export function SmartHomeLesson({ ctx, params, setParams }: Props) {
  const [tab, setTab] = useState<'wiring' | 'net' | 'prep'>('wiring');
  const [device, setDevice] = useState<'switch' | 'relay'>('switch');
  const [on, setOn] = useState(true);
  const [protocol, setProtocol] = useState<(typeof PROTOCOLS)[number]['id']>('zigbee');
  const neutral = params.neutral === 'yes';
  const P = PROTOCOLS.find((p) => p.id === protocol)!;
  return (
    <div className="lesson">
      <div className="seg small">
        <button className={tab === 'wiring' ? 'on' : ''} onClick={() => setTab('wiring')}>
          Подключение
        </button>
        <button className={tab === 'net' ? 'on' : ''} onClick={() => setTab('net')}>
          Передача сигнала
        </button>
        <button className={tab === 'prep' ? 'on' : ''} onClick={() => setTab('prep')}>
          Подготовка квартиры
        </button>
      </div>
      {tab === 'wiring' && (
        <>
          <WiringDiagram neutral={neutral || device === 'relay'} device={device} on={on} />
          <div className="chips">
            <button className={device === 'switch' ? 'chip on' : 'chip'} onClick={() => setDevice('switch')}>
              Умный выключатель
            </button>
            <button className={device === 'relay' ? 'chip on' : 'chip'} onClick={() => setDevice('relay')}>
              Реле за обычным выключателем
            </button>
            <button className="chip" onClick={() => setOn(!on)}>
              {on ? '💡 Выключить свет' : '💡 Включить свет'}
            </button>
            {device === 'switch' && (
              <button className="chip" onClick={() => setParams({ ...params, neutral: neutral ? 'no' : 'yes' })}>
                {neutral ? 'Убрать нейтраль' : 'Подвести нейтраль'}
              </button>
            )}
          </div>
          <p className="explain">
            Выключатель всегда разрывает <b>фазу (L)</b>, а не нейтраль. Электронике умного выключателя нужно питание: с <b>нейтралью (N)</b> она питается напрямую и может работать ретранслятором сети.
            {!neutral && device === 'switch' && ' Без нейтрали устройство подпитывается небольшим током через лампу — со светодиодными лампами возможно мерцание, часто нужен конденсатор-компенсатор, а ретранслятором такое устройство не работает.'}
            {device === 'relay' && ' Реле ставят в глубокий подрозетник за обычным выключателем: к нему подходят L, N, провод от клавиши, а выход L′ идёт на светильник.'}
          </p>
          {ctx.proMode && (
            <div className="pro-note">
              <b>Для мастера.</b> Все работы — при отключённом автомате с проверкой отсутствия напряжения. Соединения в коробках — клеммами; PE не разрывается. Нагрузка реле — не выше номинала устройства; для двигателей и LED-драйверов учитывайте пусковые токи.
            </div>
          )}
        </>
      )}
      {tab === 'net' && (
        <>
          <div className="chips">
            {PROTOCOLS.map((p) => (
              <button key={p.id} className={protocol === p.id ? 'chip on' : 'chip'} onClick={() => setProtocol(p.id)}>
                {p.name}
              </button>
            ))}
          </div>
          <NetworkDiagram protocol={protocol} />
          <table className="spec">
            <tbody>
              <tr><th>Среда</th><td>{P.medium}</td></tr>
              <tr><th>Топология</th><td>{P.topology}</td></tr>
              <tr><th>Центр</th><td>{P.hub}</td></tr>
              <tr><th>Питание</th><td>{P.power}</td></tr>
              <tr><th>Плюсы</th><td>{P.pros}</td></tr>
              <tr><th>Минусы</th><td>{P.cons}</td></tr>
            </tbody>
          </table>
        </>
      )}
      {tab === 'prep' && (
        <ul className="checklist">
          {PREP.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function SmartHomeCalculator({ params, setParams }: Props) {
  const set = (p: Partial<SmartHomeParams>) => setParams({ ...params, ...p });
  return (
    <div className="calc">
      <p className="muted small">Количество точек взято из планировки квартиры — можно изменить.</p>
      <div className="grid2">
        <label>
          Умных выключателей
          <input type="number" min={0} max={50} value={params.switches} onChange={(e) => set({ switches: Math.max(0, +e.target.value) })} />
        </label>
        <label>
          Датчиков движения
          <input type="number" min={0} max={50} value={params.motion} onChange={(e) => set({ motion: Math.max(0, +e.target.value) })} />
        </label>
        <label>
          Датчиков протечки
          <input type="number" min={0} max={50} value={params.leak} onChange={(e) => set({ leak: Math.max(0, +e.target.value) })} />
        </label>
      </div>
      <label>
        Нейтраль в подрозетниках выключателей
        <select value={params.neutral} onChange={(e) => set({ neutral: e.target.value as SmartHomeParams['neutral'] })}>
          <option value="yes">Есть</option>
          <option value="no">Нет</option>
          <option value="unknown">Не знаю (уточнить у застройщика)</option>
        </select>
      </label>
      {params.neutral === 'unknown' && <p className="warn small">В смету включён подвод нейтрали — уберите его, если застройщик подтвердит наличие N.</p>}
      <label>
        Подрозетники
        <select value={params.deepBoxes} onChange={(e) => set({ deepBoxes: e.target.value as SmartHomeParams['deepBoxes'] })}>
          <option value="need">Нужно заменить на глубокие 60 мм</option>
          <option value="have">Уже глубокие</option>
        </select>
      </label>
    </div>
  );
}
