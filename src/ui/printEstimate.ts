// Экспорт сметы в PDF без внешних библиотек: печатная версия открывается в диалоге печати браузера,
// где пользователь выбирает «Сохранить как PDF». Работает на телефоне и на GitHub Pages.
import { GROUP_LABELS, type Estimate, type EstimateGroup } from '../core/types';
import { money, qty, unitLabel } from './format';

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

export interface PrintMeta {
  apartment: string;
  address: string;
  sections: string[];
  source: string;
  demo: boolean;
}

export function estimateHtml(est: Estimate, meta: PrintMeta): string {
  const groups: EstimateGroup[] = ['materials', 'equipment', 'consumables', 'works', 'delivery'];
  const bulk = est.bulk;
  const rows = groups
    .map((g) => {
      const lines = est.lines.filter((l) => l.group === g);
      if (!lines.length) return '';
      return `<tr class="g"><td colspan="${bulk ? 6 : 5}">${GROUP_LABELS[g]}</td><td class="r">${money(est.totals[g])}</td></tr>` +
        lines
          .map(
            (l) =>
              `<tr><td>${esc(l.name)}${l.note ? `<div class="m">${esc(l.note)}</div>` : ''}${l.warning ? `<div class="w">${esc(l.warning)}</div>` : ''}</td><td class="m">${esc(l.section)}</td><td class="r">${qty(l.qty)}</td><td>${unitLabel(l.unit)}</td><td class="r">${money(l.unitPrice)}</td>${bulk ? `<td class="r">${l.bulkTotal != null && l.bulkTotal < (l.total ?? 0) ? money(l.bulkTotal) : '—'}</td>` : ''}<td class="r"><b>${money(l.total)}</b></td></tr>`,
          )
          .join('');
    })
    .join('');
  const date = new Date().toLocaleDateString('ru-RU');
  return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><title>Смета — ${esc(meta.apartment)}</title>
<style>
body{font:12px/1.4 -apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#111;margin:24px}
h1{font-size:20px;margin:0 0 4px}h2{font-size:13px;font-weight:500;color:#555;margin:0 0 14px}
table{width:100%;border-collapse:collapse}th,td{padding:6px 8px;border-bottom:1px solid #e3e6ea;vertical-align:top;text-align:left}
th{font-size:11px;text-transform:uppercase;color:#666;letter-spacing:.04em}
tr.g td{background:#f3f5f8;font-weight:700}.r{text-align:right;white-space:nowrap}.m{color:#777;font-size:11px}.w{color:#b35c00;font-size:11px}
.total{display:flex;justify-content:flex-end;gap:24px;margin-top:14px;font-size:16px}.total b{font-size:20px}
.demo{margin-top:14px;padding:8px 10px;background:#fff6e0;border:1px solid #f1d58a;border-radius:6px;font-size:11px}
.foot{margin-top:18px;color:#777;font-size:11px}
@media print{body{margin:10mm}button{display:none}}
</style></head><body>
<h1>Смета на ремонт и комплектацию</h1>
<h2>${esc(meta.address)} · ${esc(meta.apartment)} · ${date}</h2>
<p class="m">Разделы: ${meta.sections.map(esc).join(', ')}</p>
<table><thead><tr><th>Позиция</th><th>Раздел</th><th class="r">Кол-во</th><th>Ед.</th><th class="r">Цена</th>${bulk ? `<th class="r">Вместе (${bulk.participants})</th>` : ''}<th class="r">Сумма</th></tr></thead><tbody>${rows}</tbody></table>
<div class="total"><span>Итого${bulk ? ' (розница)' : ''}:</span><b>${money(est.total, est.currency)}</b></div>
${bulk ? `<div class="total"><span>Итого при коллективной закупке (${bulk.participants} участников):</span><b>${money(bulk.total, est.currency)}</b></div><p class="m" style="text-align:right">Экономия ${money(bulk.savingsTotal)}: товары ${money(bulk.savings.materials + bulk.savings.equipment + bulk.savings.consumables)}, доставка ${money(bulk.savings.delivery)}, монтаж ${money(bulk.savings.works)}</p>` : ''}
${meta.demo ? '<div class="demo">Расчёт по демонстрационному каталогу: числа тестовые и не являются рыночными ценами.</div>' : ''}
<p class="foot">Источник цен: ${esc(meta.source)}. Предварительный расчёт; количество уточняется по обмеру. 3D Home Academy · «Город мастеров».</p>
<script>setTimeout(function(){window.print()},300)</script>
</body></html>`;
}

/** Открывает печатную версию. Если окно заблокировано — печатает через скрытый iframe. */
export function printEstimate(est: Estimate, meta: PrintMeta) {
  const html = estimateHtml(est, meta);
  const w = window.open('', '_blank');
  if (w) {
    w.document.open();
    w.document.write(html);
    w.document.close();
    return;
  }
  const f = document.createElement('iframe');
  f.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
  document.body.appendChild(f);
  f.contentDocument!.open();
  f.contentDocument!.write(html);
  f.contentDocument!.close();
  setTimeout(() => f.remove(), 60000);
}
