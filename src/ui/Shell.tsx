import { useState, type ReactNode } from 'react';
import { MODULES } from '../core/modules';
import { HAS_WEBGL, useApp } from '../core/store';

export function useOverallProgress() {
  const progress = useApp((s) => s.progress);
  const counted = MODULES.filter((m) => m.counted);
  let score = 0;
  for (const m of counted) {
    const p = progress[m.id];
    if (p?.visited) score += 0.3;
    if (p?.quizDone) score += 0.7;
  }
  return score / counted.length;
}

function Ring({ value }: { value: number }) {
  const r = 13;
  const c = 2 * Math.PI * r;
  return (
    <svg width="32" height="32" viewBox="0 0 32 32" aria-hidden="true">
      <circle cx="16" cy="16" r={r} fill="none" stroke="var(--line)" strokeWidth="3" />
      <circle cx="16" cy="16" r={r} fill="none" stroke="var(--sky)" strokeWidth="3" strokeLinecap="round" strokeDasharray={`${c * value} ${c}`} transform="rotate(-90 16 16)" />
    </svg>
  );
}

function Logo() {
  return (
    <svg className="brand-mark" viewBox="0 0 32 32" aria-hidden="true">
      <rect x="1" y="1" width="30" height="30" rx="8" fill="var(--navy-800)" stroke="var(--line)" />
      <rect x="6" y="9" width="20" height="7" rx="2" fill="var(--fg)" />
      <path d="M8 20c2 2 4 2 6 0s4-2 6 0 4 2 4 0" stroke="var(--sky)" strokeWidth="1.8" fill="none" strokeLinecap="round" />
      <path d="M9 24.5c2 2 4 2 6 0" stroke="var(--heat)" strokeWidth="1.8" fill="none" strokeLinecap="round" />
    </svg>
  );
}

export function Shell({ children }: { children: ReactNode }) {
  const { route, go, progress } = useApp();
  const overall = useOverallProgress();
  const [open, setOpen] = useState(false);
  const reduced = useApp((s) => s.reducedMotion);
  return (
    <div className={'app' + (reduced ? ' rm' : '')}>
      <header className="topbar">
        <button className="brand" onClick={() => go('home')} aria-label="На главную">
          <Logo />
          <span className="brand-name">
            Академия кондиционирования
            <small>СПЛИТ-СИСТЕМЫ · 3D-ПРАКТИКУМ</small>
          </span>
        </button>
        <nav className="nav" aria-label="Разделы">
          {MODULES.map((m) => {
            const p = progress[m.id];
            return (
              <button key={m.id} aria-current={route === m.id ? 'page' : undefined} onClick={() => go(m.id)}>
                <span className="n">{m.num}</span>
                {m.short}
                {m.counted && <i className={'tick' + (p?.quizDone ? ' d' : p?.visited ? ' v' : '')} title={p?.quizDone ? 'Тест пройден' : p?.visited ? 'Просмотрено' : 'Не начато'} />}
              </button>
            );
          })}
        </nav>
        <div className="top-right">
          <div className="progress-ring" title="Прогресс обучения">
            <Ring value={overall} />
            <span>{Math.round(overall * 100)}%</span>
          </div>
          <button className="icon-btn" onClick={() => setOpen(true)} aria-label="Настройки">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0" strokeLinecap="round" />
              <circle cx="16" cy="6" r="2" />
              <circle cx="10" cy="12" r="2" />
              <circle cx="18" cy="18" r="2" />
            </svg>
          </button>
        </div>
      </header>
      {children}
      {open && <Settings onClose={() => setOpen(false)} />}
    </div>
  );
}

function Settings({ onClose }: { onClose: () => void }) {
  const s = useApp();
  return (
    <>
      <div className="drawer-bg" onClick={onClose} />
      <aside className="drawer" role="dialog" aria-label="Настройки">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2>Настройки</h2>
          <button className="btn small" onClick={onClose}>Закрыть</button>
        </div>
        <div className="field">
          <span className="lbl">Режим обучения</span>
          <div className="seg">
            <button aria-pressed={s.audience === 'buyer'} onClick={() => s.setAudience('buyer')}>Покупатель</button>
            <button aria-pressed={s.audience === 'installer'} onClick={() => s.setAudience('installer')}>Ученик-монтажник</button>
          </div>
          <p className="dim" style={{ fontSize: 13 }}>
            Покупателю — простые объяснения и правила эксплуатации. Монтажнику — давления, температуры, схемы и дополнительные вопросы в тестах.
          </p>
        </div>
        <div className="field">
          <span className="lbl">Качество графики</span>
          <div className="seg">
            <button aria-pressed={s.quality === 'high'} onClick={() => s.setQuality('high')}>Высокое</button>
            <button aria-pressed={s.quality === 'low'} onClick={() => s.setQuality('low')}>Для слабых устройств</button>
          </div>
        </div>
        <label className="check">
          <input id="set-rm" type="checkbox" checked={s.reducedMotion} onChange={(e) => s.setReducedMotion(e.target.checked)} />
          Уменьшенная анимация
        </label>
        <label className="check">
          <input id="set-2d" type="checkbox" checked={s.force2D} disabled={!HAS_WEBGL} onChange={(e) => s.setForce2D(e.target.checked)} />
          2D-схемы вместо 3D
        </label>
        {!HAS_WEBGL && <p className="note warn">Браузер не поддерживает WebGL — показываем 2D-схемы.</p>}
        <hr />
        <div className="field">
          <span className="lbl">Прогресс хранится только в этом браузере.</span>
          <button className="btn small" onClick={s.resetProgress}>Сбросить прогресс</button>
        </div>
      </aside>
    </>
  );
}
