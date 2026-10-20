import { useState } from 'react';
import { ROLE_LABELS } from '../core/types';
import { findProduct } from '../catalog/sheetParser';
import { nextActions, ORDER_STATUS_LABEL, type Order } from '../integrations/gorodmasterov/orders';
import { localPassport } from '../passport/passport';
import { useApp, useAppState } from '../store';
import { EstimateTable } from './EstimateTable';
import { dateTime, money } from './format';

/** После выполнения заказа оборудование и материалы попадают в цифровой паспорт. */
async function writeToPassport(o: Order) {
  const catalog = useApp.getState().catalog!;
  for (const l of o.lines) {
    if (l.group !== 'equipment' && l.group !== 'materials') continue;
    const p = findProduct(catalog, l.refId);
    const until = p?.warrantyMonths ? new Date(Date.now() + p.warrantyMonths * 30.44 * 864e5).toISOString().slice(0, 10) : undefined;
    await localPassport.add(
      {
        apartmentId: o.apartmentId,
        roomId: o.sectionRooms?.[l.section] ?? 'apartment',
        category: l.group === 'equipment' ? 'equipment' : 'material',
        zone: l.section,
        title: l.name,
        description: `Установлено по заказу ${o.number}. Количество: ${l.qty}. ${p?.service && p.service !== '—' ? `Обслуживание: ${p.service}` : ''}`.trim(),
        authorRole: 'master',
        orderId: o.id,
        productId: l.refId,
        warrantyUntil: until,
      },
      [],
    );
  }
}

export function OrdersPanel() {
  const { orders, apartmentId, role } = useAppState();
  const app = useApp.getState();
  const [open, setOpen] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const list = orders.filter((o) => o.apartmentId === apartmentId);
  return (
    <aside className="panel">
      <header className="panel-head">
        <div>
          <div className="eyebrow">Город мастеров · демо</div>
          <h2>Заказы</h2>
        </div>
        <button className="icon-btn" aria-label="Закрыть" onClick={() => app.set('panel', null)}>
          ✕
        </button>
      </header>
      <div className="panel-scroll">
        {msg && <div className="notice ok">{msg}</div>}
        <p className="muted small">Вы работаете как: {ROLE_LABELS[role]}. Принять и закрыть заказ может мастер или администратор — переключите роль вверху.</p>
        {list.length === 0 && <p className="empty muted">Заказов пока нет. Оформите заказ из сметы.</p>}
        {list.map((o) => (
          <article key={o.id} className="order">
            <div className="order-head" onClick={() => setOpen(open === o.id ? null : o.id)}>
              <div>
                <b>{o.number}</b>
                <div className="muted small">
                  {dateTime(o.createdAt)} · {o.sections.join(', ')}
                </div>
              </div>
              <div className="right">
                <span className={`status ${o.status}`}>{ORDER_STATUS_LABEL[o.status]}</span>
                <b>{money(o.total)}</b>
              </div>
            </div>
            {open === o.id && (
              <>
                <p className="muted small">
                  Цены зафиксированы {dateTime(o.pricesFrozenAt)} ({o.priceStatus === 'demo' ? 'демо-каталог' : o.catalogSource}) и не меняются при обновлении каталога.
                </p>
                <EstimateTable estimate={{ lines: o.lines, totals: o.totals, total: o.total, warnings: [], currency: o.currency, priceStatus: o.priceStatus }} />
                <ol className="history">
                  {o.history.map((h, i) => (
                    <li key={i}>
                      {dateTime(h.at)} — {ORDER_STATUS_LABEL[h.status]} ({ROLE_LABELS[h.by]})
                    </li>
                  ))}
                </ol>
              </>
            )}
            <div className="row">
              {nextActions(o, role).map((t) => (
                <button
                  key={t.to}
                  className={t.to === 'cancelled' ? 'btn ghost' : 'btn'}
                  onClick={async () => {
                    const next = app.advanceOrder(o.id, t.to);
                    if (next.status === 'done') {
                      await writeToPassport(next);
                      setMsg(`Заказ ${o.number} выполнен. Оборудование и материалы добавлены в цифровой паспорт — добавьте фото скрытых работ и акт.`);
                    } else setMsg(null);
                  }}
                >
                  {t.label}
                </button>
              ))}
              {o.status === 'done' && (
                <button className="btn ghost" onClick={() => app.set('panel', 'passport')}>
                  Открыть паспорт
                </button>
              )}
            </div>
          </article>
        ))}
      </div>
    </aside>
  );
}
