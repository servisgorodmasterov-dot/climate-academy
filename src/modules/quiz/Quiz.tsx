import { useMemo, useState } from 'react';
import type { ModuleId } from '../../core/modules';
import { useApp } from '../../core/store';
import { QUESTIONS, type Question } from './questions';

export function Quiz({ module }: { module: ModuleId }) {
  const audience = useApp((s) => s.audience);
  const best = useApp((s) => s.progress[module]?.quizBest ?? 0);
  const saveQuiz = useApp((s) => s.saveQuiz);
  const qs: Question[] = useMemo(
    () => (QUESTIONS[module] ?? []).filter((q) => audience === 'installer' || !q.pro),
    [module, audience],
  );
  const [started, setStarted] = useState(false);
  const [idx, setIdx] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [correct, setCorrect] = useState(0);
  const [finished, setFinished] = useState(false);

  if (!qs.length) return null;
  const q = qs[idx];

  const restart = () => {
    setStarted(true);
    setIdx(0);
    setPicked(null);
    setCorrect(0);
    setFinished(false);
  };

  if (!started) {
    return (
      <section className="quiz" aria-label="Проверка знаний">
        <div className="quiz-head">
          <div>
            <div className="eyebrow">Проверка знаний</div>
            <h2 style={{ marginTop: 6 }}>Тест по разделу · {qs.length} вопросов</h2>
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            {best > 0 && <span className={'tag' + (best >= 0.7 ? ' user' : '')}>Лучший результат {Math.round(best * 100)}%</span>}
            <button className="btn sky" onClick={restart}>{best > 0 ? 'Пройти ещё раз' : 'Начать тест'}</button>
          </div>
        </div>
        <p className="dim" style={{ fontSize: 13 }}>Зачёт — от 70 % правильных ответов. Результат сохраняется в браузере.</p>
      </section>
    );
  }

  if (finished) {
    const score = correct / qs.length;
    return (
      <section className="quiz">
        <div className="eyebrow">Результат</div>
        <h2>{correct} из {qs.length} · {Math.round(score * 100)}%</h2>
        <div className="bar"><i style={{ width: `${score * 100}%`, background: score >= 0.7 ? 'var(--ok)' : 'var(--warn)' }} /></div>
        <p className="muted">{score >= 0.7 ? 'Раздел зачтён. Можно переходить к следующему.' : 'Пока не зачтено. Вернитесь к модели выше и попробуйте ещё раз.'}</p>
        <div><button className="btn" onClick={restart}>Пройти заново</button></div>
      </section>
    );
  }

  const answer = (i: number) => {
    if (picked !== null) return;
    setPicked(i);
    if (i === q.answer) setCorrect((c) => c + 1);
  };
  const next = () => {
    if (idx + 1 >= qs.length) {
      const final = correct / qs.length;
      saveQuiz(module, final);
      setFinished(true);
    } else {
      setIdx(idx + 1);
      setPicked(null);
    }
  };

  return (
    <section className="quiz" aria-live="polite">
      <div className="quiz-head">
        <span className="eyebrow">Вопрос {idx + 1} / {qs.length}</span>
        {q.pro && <span className="tag pro">монтажнику</span>}
      </div>
      <div className="bar"><i style={{ width: `${(idx / qs.length) * 100}%` }} /></div>
      <p className="quiz-q">{q.q}</p>
      <div className="quiz-opts">
        {q.options.map((o, i) => (
          <button
            key={i}
            className={'quiz-opt' + (picked !== null && i === q.answer ? ' right' : '') + (picked === i && i !== q.answer ? ' wrong' : '')}
            disabled={picked !== null}
            onClick={() => answer(i)}
          >
            {o}
          </button>
        ))}
      </div>
      {picked !== null && (
        <>
          <p className="quiz-expl"><b style={{ color: picked === q.answer ? 'var(--ok)' : 'var(--bad)' }}>{picked === q.answer ? 'Верно. ' : 'Неверно. '}</b>{q.why}</p>
          <div><button className="btn sky" onClick={next}>{idx + 1 >= qs.length ? 'Завершить' : 'Дальше'}</button></div>
        </>
      )}
    </section>
  );
}
