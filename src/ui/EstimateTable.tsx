import { GROUP_LABELS, type Estimate, type EstimateGroup } from '../core/types';
import { money, qty, unitLabel } from './format';

const GROUPS: EstimateGroup[] = ['materials', 'equipment', 'consumables', 'works', 'delivery'];

export function EstimateTable({ estimate, compact }: { estimate: Estimate; compact?: boolean; showPurchase?: boolean }) {
  return (
    <div className="estimate">
      {GROUPS.map((g) => {
        const lines = estimate.lines.filter((l) => l.group === g);
        if (!lines.length) return null;
        return (
          <section key={g}>
            <div className="group-head">
              <h4>{GROUP_LABELS[g]}</h4>
              <span>{money(estimate.totals[g])}</span>
            </div>
            <ul>
              {lines.map((l) => (
                <li key={l.key} className={l.warning ? 'warnline' : ''}>
                  <div className="line-name">
                    {l.name}
                    {!compact && l.section && <span className="muted small"> · {l.section}</span>}
                    {l.note && <div className="muted small">{l.note}</div>}
                    {l.warning && <div className="warn small">{l.warning}</div>}
                  </div>
                  <div className="line-num">
                    <span className="muted small">
                      {qty(l.qty)} {unitLabel(l.unit)} × {money(l.unitPrice)}
                    </span>
                    <b>{money(l.total)}</b>
                    {!compact && <span className="muted tiny-text">{l.priceSource}</span>}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
      <div className="grand">
        <span>Итого</span>
        <b>{money(estimate.total, estimate.currency)}</b>
      </div>
      {estimate.priceStatus === 'demo' && <p className="badge demo">Расчёт по демо-каталогу: числа тестовые и не являются рыночными ценами.</p>}
    </div>
  );
}
