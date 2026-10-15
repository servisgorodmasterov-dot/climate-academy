import { PLANNED } from '../../core/modules';

export function RoadmapModule() {
  return (
    <main className="page" style={{ maxWidth: 980 }}>
      <div>
        <div className="eyebrow">Что дальше</div>
        <h1 style={{ marginTop: 6 }}>План развития академии</h1>
        <p className="lead" style={{ color: 'var(--fg-2)', marginTop: 8, maxWidth: '68ch' }}>
          Первые четыре раздела работают полностью. Следующие модули добавляются в ту же архитектуру: каждый раздел — независимая папка, общие 3D-модели, расчёты и прогресс обучения уже готовы к повторному использованию.
        </p>
      </div>
      <div className="modgrid">
        {PLANNED.map((p, i) => (
          <div key={p.title} className="modcard planned" style={{ opacity: 1, cursor: 'default' }}>
            <span className="n">этап {i + 2}</span>
            <h3>{p.title}</h3>
            <p>{p.note}</p>
          </div>
        ))}
      </div>
      <section className="panel" style={{ maxHeight: 'none' }}>
        <h2>Важно о безопасности</h2>
        <p className="muted">
          Симуляции академии — учебные. Они объясняют назначение операций и последствия ошибок, но не являются инструкцией для самостоятельной работы. Работы с электричеством, на высоте, под давлением и с хладагентом выполняют подготовленные специалисты по нормам и инструкциям производителя. Параметры, зависящие от модели (длина трассы, перепад высот, моменты затяжки, дозаправка, свободные зоны вокруг блоков), берутся только из технической документации.
        </p>
      </section>
    </main>
  );
}
