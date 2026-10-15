import { useEffect, useState } from 'react';
import { MODULES, PLANNED } from '../../core/modules';
import { use3D, useApp } from '../../core/store';
import { cssTemp, type AcMode } from '../../core/roomSim';
import { Quiz } from '../quiz/Quiz';
import { CAMS, HomeScene, type CamPreset, type HotspotId } from './HomeScene';
import { Home2D } from './Home2D';
import { SCENARIOS, useRoomSim } from './useRoomSim';

const HOTSPOTS: Record<HotspotId, { title: string; basic: string; pro: string; link?: 'device' | 'cycle' | 'calculator' }> = {
  indoor: {
    title: 'Внутренний блок',
    basic: 'Забирает воздух комнаты сверху, прогоняет через холодный (или горячий) теплообменник и выдаёт обратно через жалюзи. Внутри нет компрессора, поэтому он тихий.',
    pro: 'Испаритель при охлаждении / конденсатор при обогреве, тангенциальный вентилятор, поддон с дренажом, плата и датчики воздуха и трубки. Место установки выбирают так, чтобы струя не била прямо в людей и не упиралась в препятствия.',
    link: 'device',
  },
  outdoor: {
    title: 'Наружный блок',
    basic: 'Здесь стоит компрессор. Летом блок выбрасывает на улицу тепло, забранное из комнаты, — поэтому из него дует горячий воздух. Зимой в режиме обогрева он, наоборот, забирает тепло у уличного воздуха.',
    pro: 'Компрессор, конденсатор, осевой вентилятор, четырёхходовой клапан, ЭРВ, плата инвертора. Нужны свободные зоны для забора и выброса воздуха и безопасный доступ для обслуживания — размеры по инструкции производителя.',
    link: 'device',
  },
  route: {
    title: 'Межблочная трасса: трубы',
    basic: 'Две медные трубы в теплоизоляции соединяют блоки. По ним хладагент переносит тепло. Вместе с ними через стену идут межблочный кабель и дренажный шланг — пучком в гильзе.',
    pro: 'Тонкая — жидкостная линия, толстая — газовая. При охлаждении обе трубы холодные: после ЭРВ в наружном блоке по жидкостной линии идёт холодная парожидкостная смесь, поэтому изолируются обе, по всей длине, со стыками изоляции. Допустимые длина, перепад высот и диаметры — из документации модели.',
    link: 'cycle',
  },
  cable: {
    title: 'Межблочный кабель',
    basic: 'Соединяет блоки электрически: по нему идёт питание и сигнал связи между платами. Без кабеля блоки «не видят» друг друга.',
    pro: 'Марка, сечение и число жил, схема подключения к клеммам и место подачи питания (на внутренний или наружный блок) — строго по инструкции производителя. Кабель прокладывают без натяжения, с защитой от УФ и механических повреждений на фасаде. Электромонтаж выполняет специалист.',
  },
  drain: {
    title: 'Дренажный шланг',
    basic: 'При охлаждении на холодном теплообменнике конденсируется влага из воздуха комнаты. Она стекает в поддон и уходит по гофрированному шлангу. В пучке трассы шланг идёт снизу, а на фасаде отделяется и уходит вниз.',
    pro: 'Шланг прокладывают с постоянным уклоном, без провисов, подъёмов и петель — иначе вода застаивается и течёт из блока. Выход дренажа не должен капать на прохожих и соседей; где самотёк невозможен, ставят дренажную помпу.',
  },
  window: {
    title: 'Окно на солнечной стороне',
    basic: 'Солнце, проходящее через стекло, — часто самый большой источник тепла в комнате. Поэтому зона у окна летом теплее остальной комнаты.',
    pro: 'Через 1 м² незатенённого стекла на запад в пиковый час может поступать ~300 Вт. Наружное затенение снижает приток сильнее внутренних штор. Это учитывается при подборе мощности.',
    link: 'calculator',
  },
  remote: {
    title: 'Пульт и уставка',
    basic: 'Вы задаёте желаемую температуру. Датчик во внутреннем блоке сравнивает её с температурой воздуха, и система сама подбирает мощность.',
    pro: 'Инверторная система плавно меняет частоту компрессора: на старте — максимум, у уставки — минимальная устойчивая производительность. Датчик в блоке видит воздух под потолком, а не у дивана — поэтому ощущения и цифры на пульте могут расходиться.',
  },
};

export function HomeModule() {
  const audience = useApp((s) => s.audience);
  const quality = useApp((s) => s.quality);
  const reduced = useApp((s) => s.reducedMotion);
  const markVisited = useApp((s) => s.markVisited);
  const go = useApp((s) => s.go);
  const progress = useApp((s) => s.progress);
  const can3D = use3D();
  useEffect(() => markVisited('home'), []);

  const [on, setOn] = useState(true);
  const [mode, setMode] = useState<AcMode>('cool');
  const [setpoint, setSetpoint] = useState(SCENARIOS.cool.setpoint);
  const [outdoor, setOutdoor] = useState(SCENARIOS.cool.outdoor);
  const [sunny, setSunny] = useState(true);
  const [heatmap, setHeatmap] = useState(true);
  const [labels, setLabels] = useState(true);
  const [cam, setCam] = useState<CamPreset>('overview');
  const [selected, setSelected] = useState<HotspotId | null>(null);
  const [run, setRun] = useState(0);

  const { sim, readout } = useRoomSim({ on, mode, setpoint, outdoor, sunny }, `${mode}-${run}`, SCENARIOS[mode].start);

  // Трубы, кабель и дренаж мелкие — при выборе подводим камеру к трассе.
  const select = (h: HotspotId | null) => {
    setSelected(h);
    if (h === 'route' || h === 'cable' || h === 'drain') setCam('route');
  };

  const switchMode = (m: AcMode) => {
    setMode(m);
    setSetpoint(SCENARIOS[m].setpoint);
    setOutdoor(SCENARIOS[m].outdoor);
  };

  const cool = mode === 'cool';
  const coolKW = 2.6 * readout.capacity * (on ? 1 : 0);
  const cop = cool ? 3.2 : outdoor < 0 ? 2.6 : 3.4;
  const elKW = coolKW / cop;
  const reached = Math.abs(readout.avg - setpoint) < 0.8;
  const h = selected ? HOTSPOTS[selected] : null;

  return (
    <main className="page">
      <div className="page-head">
        <div>
          <div className="eyebrow">01 · Квартира с кондиционером</div>
          <h1 style={{ marginTop: 6 }}>Кондиционер в квартире: как он работает</h1>
          <p className="lead">
            Включите систему и посмотрите, как меняется температура в разных зонах. Вращайте сцену мышью или пальцем, нажимайте на блоки, трассу, окно и пульт.
          </p>
        </div>
        <div style={{ display: 'grid', gap: 8, justifyItems: 'end' }}>
          <button className="btn primary" onClick={() => go('calculator')}>Рассчитать мощность кондиционера →</button>
          <div className="seg" role="group" aria-label="Камера">
            {(Object.keys(CAMS) as CamPreset[]).map((c) => (
              <button key={c} aria-pressed={cam === c} onClick={() => setCam(c)} disabled={!can3D}>
                {CAMS[c].label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="stage">
        <div className="viewport">
          {can3D ? (
            <HomeScene sim={sim} readout={readout} on={on} mode={mode} sunny={sunny} showHeatmap={heatmap} showLabels={labels} selected={selected} onSelect={select} cam={cam} quality={quality} reduced={reduced} />
          ) : (
            <Home2D sim={sim} readout={readout} on={on} mode={mode} selected={selected} onSelect={select} />
          )}
          <div className="vp-overlay">
            <div className="vp-tl">
              <button className="power" aria-pressed={on} onClick={() => setOn(!on)}>
                <span className="dot" /> {on ? 'Включён' : 'Выключен'}
              </button>
              <div className="seg cool">
                <button className="c" aria-pressed={cool} onClick={() => switchMode('cool')}>❄ Охлаждение</button>
                <button className="h" aria-pressed={!cool} onClick={() => switchMode('heat')}>☀ Обогрев</button>
              </div>
            </div>
            <div className="vp-bl" style={{ justifyContent: 'space-between', alignItems: 'end', pointerEvents: 'none' }}>
              <span className="hint">модельное время {Math.floor(readout.minutes)} мин · 1 с = 1 мин</span>
              <TempLegend />
            </div>
          </div>
        </div>

        <aside className="panel">
          <div className="section">
            <div className="eyebrow">Состояние системы</div>
            <div className="readout">
              <div><b style={{ color: cssTemp(readout.avg) }}>{readout.avg.toFixed(1)}°</b><span>средняя в комнате</span></div>
              <div><b style={{ color: cssTemp(readout.supply) }}>{on ? readout.supply.toFixed(1) + '°' : '—'}</b><span>воздух из блока</span></div>
              <div><b>{on ? Math.round(readout.capacity * 100) + '%' : '0%'}</b><span>загрузка компрессора</span></div>
            </div>
            {audience === 'installer' && on && (
              <div className="readout">
                <div><b>{coolKW.toFixed(2)}</b><span>кВт {cool ? 'холода' : 'тепла'} (модель)</span></div>
                <div><b>{elKW.toFixed(2)}</b><span>кВт из сети, COP≈{cop}</span></div>
                <div><b>{(cool ? coolKW + elKW : coolKW - elKW).toFixed(2)}</b><span>кВт {cool ? 'отдано улице' : 'взято с улицы'}</span></div>
              </div>
            )}
            <p className="note">
              {!on
                ? 'Система выключена: комната постепенно приходит к температуре, которую задают улица, солнце, люди и техника.'
                : cool
                  ? reached
                    ? 'Уставка достигнута. Инвертор снизил обороты компрессора и только компенсирует теплопритоки — так тише и экономнее.'
                    : 'Испаритель забирает тепло у воздуха комнаты, хладагент переносит его к наружному блоку, и тот отдаёт тепло улице. Поэтому из наружного блока дует горячий воздух.'
                  : reached
                    ? 'Уставка достигнута. Обратите внимание: под потолком заметно теплее — тёплый воздух поднимается, поэтому при обогреве поток направляют вниз.'
                    : 'Четырёхходовой клапан развернул поток: наружный блок забирает тепло даже у холодного уличного воздуха, внутренний отдаёт его в комнату.'}
            </p>
          </div>
          <hr />
          <div className="section">
            <div className="field">
              <div className="lbl">
                Заданная температура <output>{setpoint} °C</output>
              </div>
              <input id="home-sp" type="range" min={cool ? 18 : 16} max={cool ? 28 : 28} value={setpoint} onChange={(e) => setSetpoint(+e.target.value)} />
            </div>
            <div className="field">
              <div className="lbl">
                На улице <output>{outdoor > 0 ? '+' : ''}{outdoor} °C</output>
              </div>
              <input id="home-out" type="range" min={cool ? 22 : -20} max={cool ? 43 : 15} value={outdoor} onChange={(e) => setOutdoor(+e.target.value)} />
            </div>
            {cool && (
              <label className="check">
                <input id="home-sun" type="checkbox" checked={sunny} onChange={(e) => setSunny(e.target.checked)} /> Солнце светит в окно
              </label>
            )}
            <label className="check">
              <input id="home-hm" type="checkbox" checked={heatmap} onChange={(e) => setHeatmap(e.target.checked)} /> Тепловая карта у пола
            </label>
            <label className="check">
              <input id="home-lbl" type="checkbox" checked={labels} onChange={(e) => setLabels(e.target.checked)} /> Датчики температуры в зонах
            </label>
            <div>
              <button className="btn small" onClick={() => setRun((r) => r + 1)}>Начать сначала</button>
            </div>
          </div>
          <hr />
          {h ? (
            <div className="section" aria-live="polite">
              <div className="eyebrow">Вы выбрали</div>
              <h2>{h.title}</h2>
              <p>{h.basic}</p>
              {audience === 'installer' && <p className="note heat">{h.pro}</p>}
              {h.link && (
                <div>
                  <button className="btn small sky" onClick={() => go(h.link!)}>
                    Подробнее: {MODULES.find((m) => m.id === h.link)!.title}
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="section">
              <div className="eyebrow">Нажмите на элемент</div>
              <div className="chips">
                {(Object.keys(HOTSPOTS) as HotspotId[]).map((id) => (
                  <button key={id} className="chip" onClick={() => select(id)}>
                    {HOTSPOTS[id].title}
                  </button>
                ))}
              </div>
            </div>
          )}
          <p className="dim" style={{ fontSize: 12 }}>Учебная модель: показывает качественную картину, а не результат аэродинамического расчёта.</p>
        </aside>
      </div>

      <section style={{ display: 'grid', gap: 10 }}>
        <div className="eyebrow">Программа обучения</div>
        <div className="modgrid">
          {MODULES.filter((m) => m.counted && m.id !== 'home').map((m) => {
            const p = progress[m.id];
            return (
              <button key={m.id} className="modcard" onClick={() => go(m.id)}>
                <span className="n">{m.num} {p?.quizDone ? '· зачтено' : p?.visited ? '· начато' : ''}</span>
                <h3>{m.title}</h3>
                <p>{DESCR[m.id]}</p>
              </button>
            );
          })}
          {PLANNED.slice(0, 3).map((p) => (
            <div key={p.title} className="modcard planned">
              <span className="n">в разработке</span>
              <h3>{p.title}</h3>
              <p>{p.note}</p>
            </div>
          ))}
        </div>
      </section>

      <Quiz module="home" />
    </main>
  );
}

const DESCR: Record<string, string> = {
  device: 'Разберите внутренний и наружный блоки на детали, изучите каждую и соберите обратно.',
  cycle: 'Пошаговая анимация: сжатие, конденсация, дросселирование, испарение. Охлаждение и обогрев.',
  calculator: 'Меняйте комнату, окна, людей и климат — и смотрите, из чего складывается нагрузка.',
};

function TempLegend() {
  const stops = [12, 18, 23, 27, 33, 45];
  return (
    <div className="hint" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <span>холоднее</span>
      <span style={{ width: 90, height: 8, borderRadius: 4, background: `linear-gradient(90deg, ${stops.map((t) => cssTemp(t)).join(',')})` }} />
      <span>теплее</span>
    </div>
  );
}
