import { useState } from 'react';
import { GROUP_LABELS, TIERS, type EstimateGroup } from '../core/types';
import { academyById } from '../academies';
import { useTotalEstimate } from '../estimate/useEstimate';
import { demoGateway, freezeOrder } from '../integrations/gorodmasterov/orders';
import { useApp } from '../store';
import { EstimateTable } from './EstimateTable';
import { downloadText, money } from './format';

export function EstimatePanel() {
  const data = useTotalEstimate();
  const { catalog, layout, apartmentId, overrides } = useApp();
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
                <button className="btn ghost" onClick={exportCsv}>
                  Скачать CSV
                </button>
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
