import { useEffect, useMemo, useState } from 'react';
import type { Product } from '../core/types';
import { compareOffer, createPriceAdapter, currentPrice, queryFor, toOverride, type ComparedOffer } from '../integrations/naidu/PriceComparisonAdapter';
import { useApp } from '../store';
import { date, money, qty as fq, unitLabel } from './format';
import { findSupplier } from '../catalog/sheetParser';

const adapter = createPriceAdapter();

export function PriceCompare({ product, need, onClose }: { product: Product; need: number; onClose: () => void }) {
  const catalog = useApp((s) => s.catalog)!;
  const override = useApp((s) => s.overrides[product.id]);
  const [offers, setOffers] = useState<ComparedOffer[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    adapter
      .search(queryFor(product, need))
      .then((list) => setOffers(list.map((o) => compareOffer(product, need, o)).sort((a, b) => Number(a.compatibility === 'incompatible') - Number(b.compatibility === 'incompatible') || (a.total ?? Infinity) - (b.total ?? Infinity))))
      .catch((e) => setError((e as Error).message));
  }, [product, need]);

  const base = useMemo(() => {
    const price = currentPrice(catalog, product.id);
    const buy = Math.ceil(need / product.packSize - 1e-9) * product.packSize;
    const delivery = findSupplier(catalog, product.supplierId)?.deliveryPrice ?? 0;
    return { price, buy: +buy.toFixed(2), total: price != null ? Math.round(price * buy) + delivery : null, delivery };
  }, [catalog, product, need]);

  return (
    <div className="modal" role="dialog" aria-modal="true" aria-label="Найти дешевле">
      <div className="modal-body">
        <header>
          <div>
            <h3>Найти дешевле</h3>
            <p className="muted small">
              {product.name} · артикул {product.sku} · нужно {fq(need)} {unitLabel(product.unit)}
            </p>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Закрыть">
            ✕
          </button>
        </header>
        <div className="badge demo">{adapter.isDemo ? 'Демо-адаптер Naidu.kz: тестовые предложения, не реальные цены' : adapter.label}</div>
        <div className="offers">
          <div className="offer base">
            <div className="offer-head">
              <b>Текущая цена каталога</b>
              <span>{money(base.total)}</span>
            </div>
            <div className="muted small">
              {money(base.price)} / {unitLabel(product.unit)} × {fq(base.buy)} + доставка {money(base.delivery)}
            </div>
          </div>
          {error && <p className="warn">{error}</p>}
          {!offers && !error && <p className="muted">Ищем предложения…</p>}
          {offers?.length === 0 && <p className="muted">Предложений не найдено.</p>}
          {offers?.map((o) => {
            const ov = toOverride(o, product.id);
            const saving = base.total != null && o.total != null ? base.total - o.total : null;
            const applied = override?.offerId === o.offerId;
            return (
              <div key={o.offerId} className={`offer ${o.compatibility}`}>
                <div className="offer-head">
                  <b>{o.seller}</b>
                  <span>{money(o.total)}</span>
                </div>
                <div className="small">{o.name}</div>
                <div className="muted small">
                  Артикул {o.sku} · {o.unitPriceInProductUnit != null ? `${money(o.unitPriceInProductUnit)} / ${unitLabel(product.unit)}` : `цена ${money(o.price)} за ${o.unit}`}
                  {o.buyQty != null && ` × ${fq(o.buyQty)}`} · доставка {money(o.deliveryPrice)}
                  {o.deliveryDays != null && `, ${o.deliveryDays} дн.`} · {o.inStock ? 'в наличии' : 'нет в наличии'} · обновлено {date(o.updatedAt)}
                </div>
                <div className={`compat ${o.compatibility}`}>
                  {o.compatibility === 'same' ? '✓ Тот же товар' : o.compatibility === 'equivalent' ? 'Аналог с теми же характеристиками' : '✕ Несовместимый аналог — не подставляется'}
                </div>
                {o.reasons.length > 0 && (
                  <ul className="reasons">
                    {o.reasons.map((r) => (
                      <li key={r}>{r}</li>
                    ))}
                  </ul>
                )}
                <div className="offer-actions">
                  {saving != null && saving > 0 && ov && <span className="saving">Экономия {money(saving)}</span>}
                  {ov &&
                    (applied ? (
                      <button className="btn ghost" onClick={() => useApp.getState().clearOverride(product.id)}>
                        Вернуть цену каталога
                      </button>
                    ) : (
                      <button className="btn" disabled={!o.inStock} onClick={() => useApp.getState().setOverride(ov)}>
                        Использовать в смете
                      </button>
                    ))}
                </div>
              </div>
            );
          })}
        </div>
        <p className="muted small">Сравнивается итоговая стоимость: товар с учётом кратности упаковки + доставка. Несовместимые аналоги показываются, но не подставляются в смету.</p>
      </div>
    </div>
  );
}
