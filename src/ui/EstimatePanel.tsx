import { useState } from 'react';
import { GROUP_LABELS, TIERS, type Estimate, type EstimateGroup } from '../core/types';
import { academyById } from '../academies';
import { useTotalEstimate } from '../estimate/useEstimate';
import { demoGateway, freezeOrder } from '../integrations/gorodmasterov/orders';
import { useApp, useAppState } from '../store';
import { EstimateTable } from './EstimateTable';
import { CAN_DOWNLOAD, downloadText, money } from './format';
import { printEstimate } from './printEstimate';
import { findApartment } from '../apartment/layout';

export function EstimatePanel() {
  const [participants, setParticipants] = useState(1);
  const data = useTotalEstimate(participants);
  const { catalog, layout, apartmentId, overrides } = useAppState();
  const app = useApp.getState();
  const [ordering, setOrdering] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [comment, setComment] = useState('');
  const [result, setResult] = useState<string | null>(null);
  if (!data || !catalog || !layout) return null;
  const { included, estimate, sections } = data;

  const exportCsv = () => {
    const rows = [['Группа', 'Позиция', 'Раздел', 'Кол-во', 'Ед.', 'Цена', 'Сумма', 'Источник цены', 'Дата цены']];
    for (const l of estimate.lines) rows.push([GROUP_LABELS[l.group as EstimateGroup], l.name, l.section, String(l.qty), l.unit, String(l.unitPrice ?? ''), String(l.total ?? ''), l.priceSource, l.priceUpdatedAt]);
    rows.push(['', 'ИТОГО', '', '', '', '', String(estimate.total), estimate.priceStatus === 'demo' ? 'ДЕМО-КАТАЛОГ' : catalog.sourceName, '']);
    downloadText(`smeta-kv-${apartmentId}.csv`, '﻿' + rows.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(';')).join('\n'), 'text/csv');
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const order = freezeOrder(apartmentId, estimate, sections, catalog.sourceName, { name: name.trim(), phone: phone.trim() }, comment.trim());
    const r = await demoGateway.submit(order);
    app.addOrder(order);
    setResult(`Заказ ${order.number} создан. ${r.message}`);
    setOrdering(false);
  };

  return (
    <aside className="panel">
      <header className="panel-head">
        <div>
          <div className="eyebrow">Квартира {apartmentId.replace('apt-', '№')}</div>
          <h2>Смета</h2>
        </div>
        <button className="icon-btn" aria-label="Закрыть" onClick={() => app.set('panel', null)}>
          ✕
        </button>
      </header>
      <div className="panel-scroll">
        {result && <div className="notice ok">{result}</div>}
        {included.length === 0 ? (
          <div className="empty">
            <p>Смета пока пуста.</p>
            <p className="muted">Нажмите на пол, кондиционер или выключатель в 3D-квартире, выберите комплектацию и нажмите «Добавить в смету».</p>
          </div>
        ) : (
          <>
            <ul className="sections">
              {included.map((s) => {
                const def = academyById(s.academy);
                const room = layout.rooms.find((r) => r.id === s.roomId);
                return (
                  <li key={s.id}>
                    <i style={{ background: def?.color }} />
                    <button className="link" onClick={() => app.openSection(s.id, s.academy, s.roomId, () => s.params)}>
                      {def?.title}
                      {room ? ` — ${room.name}` : ''}
                    </button>
                    <span className="muted small">{TIERS.find((t) => t.id === s.tier)?.label}</span>
                    <button className="icon-btn sm" aria-label="Убрать из сметы" onClick={() => app.setIncluded(s.id, false)}>
                      ✕
                    </button>
                  </li>
                );
              })}
            </ul>
            {Object.keys(overrides).length > 0 && <p className="muted small">Цены {Object.keys(overrides).length} поз. взяты из поиска «Найти дешевле».</p>}
            <BulkBlock estimate={estimate} participants={participants} setParticipants={setParticipants} hasRules={catalog.bulk.length > 0} />
            <EstimateTable estimate={estimate} />
            {estimate.warnings.length > 0 && (
              <div className="notice warn">
                {estimate.warnings.map((w) => (
                  <div key={w}>{w}</div>
                ))}
              </div>
            )}
            {ordering ? (
              <form className="order-form" onSubmit={submit}>
                <h4>Заказ услуги — «Город мастеров»</h4>
                <p className="muted small">Демонстрационный процесс: без оплаты, данные никуда не отправляются. Цены в заказе фиксируются на момент оформления.</p>
                <label>
                  Имя
                  <input required value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
                </label>
                <label>
                  Телефон
                  <input required type="tel" pattern={'[0-9+ \\(\\)\\-]{7,}'} value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="tel" />
                </label>
                <label>
                  Комментарий
                  <textarea value={comment} onChange={(e) => setComment(e.target.value)} />
                </label>
                <div className="row">
                  <button type="button" className="btn ghost" onClick={() => setOrdering(false)}>
                    Отмена
                  </button>
                  <button className="btn" type="submit">
                    Оформить на {money(estimate.total)}
                  </button>
                </div>
              </form>
            ) : (
              <div className="row">
                <button
                  className="btn ghost"
                  onClick={() => {
                    const apt = findApartment(apartmentId);
                    printEstimate(estimate, {
                      apartment: `кв. ${apt?.apartment.number ?? apartmentId}`,
                      address: apt ? `${apt.complex.name}, ${apt.buildingName}, ${apt.entranceName}, этаж ${apt.floor}` : '',
                      sections: included.map((s) => `${academyById(s.academy)?.title ?? s.academy}${s.roomId ? ` — ${layout.rooms.find((r) => r.id === s.roomId)?.name ?? ''}` : ''}`),
                      source: estimate.priceStatus === 'demo' ? 'демо-каталог' : catalog.sourceName,
                      demo: estimate.priceStatus === 'demo',
                    });
                  }}
                >
                  Скачать PDF
                </button>
                {CAN_DOWNLOAD && (
                  <button className="btn ghost" onClick={exportCsv}>
                    CSV
                  </button>
                )}
                <button className="btn" onClick={() => (setOrdering(true), setResult(null))} disabled={estimate.total <= 0}>
                  Заказать услугу
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </aside>
  );
}

/** Коллективная закупка жильцов одного ЖК: ползунок участников и сравнение с розницей. */
function BulkBlock({ estimate, participants, setParticipants, hasRules }: { estimate: Estimate; participants: number; setParticipants: (n: number) => void; hasRules: boolean }) {
  if (!hasRules) return null;
  const b = estimate.bulk;
  return (
    <section className="bulk">
      <div className="bulk-head">
        <h4>Коллективная закупка</h4>
        <span className="badge demo">условия — пример</span>
      </div>
      <label className="bulk-slider">
        <span>
          Участников в ЖК: <b>{participants}</b>
        </span>
        <input type="range" min={1} max={40} step={1} value={participants} onChange={(e) => setParticipants(+e.target.value)} />
      </label>
      {participants === 1 ? (
        <p className="muted small">Сдвиньте ползунок: цены, доставка и монтаж пересчитаются по порогам из листа «Опт» — у каждой позиции свои условия.</p>
      ) : b ? (
        <div className="bulk-grid">
          <div>
            <span className="muted small">Розница</span>
            <b>{money(estimate.total)}</b>
          </div>
          <div>
            <span className="muted small">Вместе ({participants})</span>
            <b className="ok">{money(b.total)}</b>
          </div>
          <div>
            <span className="muted small">Экономия</span>
            <b className="ok">{money(b.savingsTotal)}</b>
            <span className="muted small">
              товары {money(b.savings.materials + b.savings.equipment + b.savings.consumables)} · доставка {money(b.savings.delivery)} · монтаж {money(b.savings.works)}
            </span>
          </div>
        </div>
      ) : null}
      {b && b.linesWithOffer === 0 && participants > 1 && <p className="muted small">Для выбранных позиций пороги ещё не достигнуты — попробуйте больше участников.</p>}
    </section>
  );
}
