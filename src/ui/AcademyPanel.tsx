import { useEffect, useMemo, useState } from 'react';
import { TIERS, type Product } from '../core/types';
import { academyById } from '../academies';
import { slotsOf, type Selection } from '../core/academy';
import { findPrice, findProduct, findWork, productsForSlot } from '../catalog/sheetParser';
import { computeEstimate } from '../estimate/engine';
import { buildSection, contextFor, useTotalEstimate } from '../estimate/useEstimate';
import { useApp } from '../store';
import { money, qty as fq, unitLabel } from './format';
import { PriceCompare } from './PriceCompare';
import { EstimateTable } from './EstimateTable';
import { selectionFor } from '../objects/logic';

type Tab = 'card' | 'lesson' | 'variants' | 'calc';

export function AcademyPanel() {
  const { catalog, layout, activeSection, sections, proMode, role, selectedElement, overrides } = useApp();
  const s = activeSection ? sections[activeSection] : null;
  const def = s ? academyById(s.academy) : undefined;
  const academyTab = useApp((st) => st.academyTab);
  const [tab, setTab] = useState<Tab>(academyTab);
  const [compare, setCompare] = useState<{ product: Product; need: number } | null>(null);
  useEffect(() => setTab(academyTab), [activeSection, academyTab]);

  const ctx = useMemo(() => (s && catalog && layout ? contextFor(s, catalog, layout, proMode, role, selectedElement) : null), [s, catalog, layout, proMode, role, selectedElement]);
  const section = useMemo(() => (s && catalog && layout ? buildSection(s, catalog, layout) : null), [s, catalog, layout]);
  const est = useMemo(() => (section && catalog ? computeEstimate(catalog, [section], overrides) : null), [section, catalog, overrides]);
  const all = useTotalEstimate();
  /** Сколько стоил бы этот раздел с другой комплектацией — для цен на кнопках наборов и вариантов */
  const totalWith = useMemo(() => {
    const cache = new Map<string, number>();
    return (sel: Selection, tier = s?.tier ?? 'comfort') => {
      if (!s || !def || !ctx || !catalog) return 0;
      const key = tier + JSON.stringify(sel);
      if (!cache.has(key)) cache.set(key, computeEstimate(catalog, [def.buildSection(ctx, tier, s.params, sel)], overrides).total);
      return cache.get(key)!;
    };
  }, [s, def, ctx, catalog, overrides]);

  if (!s || !def || !ctx || !catalog) return null;
  const app = useApp.getState();
  const primarySlot = def.primarySlot(ctx.element);
  const primaryId = s.selection[primarySlot]?.productId;
  const primary = primaryId ? findProduct(catalog, primaryId) : undefined;
  const needOf = (pid: string) => section?.items.find((i) => i.productId === pid)?.needQty ?? 1;

  return (
    <aside className="panel academy" style={{ ['--acc' as string]: def.color }}>
      <header className="panel-head">
        <div>
          <div className="eyebrow">Академия · {def.title}</div>
          <h2>{ctx.element?.label ?? (ctx.room ? `${def.title}: ${ctx.room.name}` : def.title)}</h2>
        </div>
        <button className="icon-btn" aria-label="Закрыть" onClick={() => app.set('panel', null)}>
          ✕
        </button>
      </header>
      <div className="tiers-wrap">
        <span className="muted small">Готовый набор — материалы и работы под ключ:</span>
        <div className="seg tiers" role="tablist" aria-label="Комплектация">
          {TIERS.map((t) => {
            const kit = selectionFor(catalog, s.academy, t.id);
            return (
              <button key={t.id} className={s.tier === t.id && sameSel(s.selection, kit) ? 'on' : ''} onClick={() => app.setTier(s.id, t.id)}>
                {t.label}
                <small>{money(totalWith(kit, t.id))}</small>
              </button>
            );
          })}
          {!sameSel(s.selection, selectionFor(catalog, s.academy, s.tier)) && (
            <button className="on custom" title={`Изменён вручную на основе набора «${TIERS.find((t) => t.id === s.tier)?.label}»`}>
              Свой выбор
              <small>{money(est?.total)}</small>
            </button>
          )}
        </div>
      </div>
      <nav className="tabs">
        {(
          [
            ['card', 'Карточка'],
            ['lesson', 'Как устроено'],
            ['variants', 'Варианты'],
            ['calc', 'Расчёт'],
          ] as [Tab, string][]
        ).map(([id, label]) => (
          <button key={id} className={tab === id ? 'on' : ''} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </nav>
      <div className="panel-scroll">
        {tab === 'card' && primary && <ProductCard product={primary} sectionId={s.id} workId={s.selection[primarySlot]?.workId ?? null} need={needOf(primary.id)} onCompare={() => setCompare({ product: primary, need: needOf(primary.id) })} onVariants={() => setTab('variants')} />}
        {tab === 'card' && !primary && <p className="muted">Позиция исключена из комплектации. Выберите вариант во вкладке «Варианты».</p>}
        {tab === 'lesson' && <def.Lesson ctx={ctx} params={s.params} setParams={(p) => app.setParams(s.id, p)} selection={s.selection} tier={s.tier} />}
        {tab === 'variants' && (
          <div className="variants">
            <p className="muted small">Цена справа — насколько изменится итог за {ctx.element ? 'этот объект' : 'это помещение'} (материал + работа). Под ней — цена за единицу.</p>
            {slotsOf(def, catalog).map((sl, si, allSlots) => {
              const list = productsForSlot(catalog, sl.slot);
              if (!list.length) return null;
              const cur = s.selection[sl.slot]?.productId ?? null;
              const specKeys = [...new Set(list.flatMap((p) => Object.keys(p.specs)))].slice(0, proMode ? 8 : 3);
              return (
                <section key={sl.slot}>
                  <h4>
                    {allSlots.length > 2 ? `Шаг ${si + 1}. ` : ''}
                    {sl.label}
                  </h4>
                  <div className="opts" role="radiogroup" aria-label={sl.label}>
                    {list.map((p) => (
                      <button key={p.id} role="radio" aria-checked={cur === p.id} className={cur === p.id ? 'opt sel' : 'opt'} onClick={() => app.setSlot(s.id, sl.slot, p.id)}>
                        <span className="radio" />
                        <span className="body">
                          <span className="name">
                            {p.attrs.color && <i className="swatch" style={{ background: p.attrs.color }} />}
                            {p.name}
                          </span>
                          <span className="specs" style={{ display: 'block' }}>
                            {specKeys
                              .filter((k) => p.specs[k])
                              .map((k) => `${k}: ${p.specs[k]}`)
                              .join(' · ')}
                          </span>
                        </span>
                        <span className="price">
                          {cur === p.id ? (
                            <span className="sel-tag">выбрано</span>
                          ) : (
                            <Delta d={totalWith({ ...s.selection, [sl.slot]: { productId: p.id, workId: s.selection[sl.slot]?.workId ?? null } }) - (est?.total ?? 0)} />
                          )}
                          <span className="muted small" style={{ display: 'block', fontWeight: 500 }}>
                            {money(findPrice(catalog, p.id)?.sale)} за {unitLabel(p.unit)}
                          </span>
                        </span>
                      </button>
                    ))}
                    {sl.optional && (
                      <button role="radio" aria-checked={cur === null} className={cur === null ? 'opt sel' : 'opt'} onClick={() => app.setSlot(s.id, sl.slot, null)}>
                        <span className="radio" />
                        <span className="body muted">Не нужно — пропустить этот шаг</span>
                        <span className="price">{cur === null ? <span className="sel-tag">выбрано</span> : <Delta d={totalWith({ ...s.selection, [sl.slot]: { productId: null, workId: null } }) - (est?.total ?? 0)} />}</span>
                      </button>
                    )}
                  </div>
                </section>
              );
            })}
          </div>
        )}
        {tab === 'calc' && (
          <>
            <def.Calculator ctx={ctx} params={s.params} setParams={(p) => app.setParams(s.id, p)} selection={s.selection} tier={s.tier} />
            {est && <EstimateTable estimate={est} compact showPurchase={role === 'admin'} />}
          </>
        )}
      </div>
      <footer className="panel-foot">
        <div className="foot-sum">
          <div className="muted small">
            {ctx.element?.label ?? def.title} · материалы {money((est?.totals.materials ?? 0) + (est?.totals.equipment ?? 0) + (est?.totals.consumables ?? 0))} + работа {money(est?.totals.works)}
            {est?.totals.delivery ? ` + доставка ${money(est.totals.delivery)}` : ''}
          </div>
          <b>{money(est?.total)}</b>
          {s.included && all && (
            <button className="link small" onClick={() => app.set('panel', 'estimate')}>
              Всего в смете {money(all.estimate.total)} · открыть
            </button>
          )}
        </div>
        {s.included ? (
          <div className="foot-actions">
            <button className="btn ghost" onClick={() => app.set('panel', 'estimate')}>
              ✓ В смете
            </button>
            <button className="link danger" onClick={() => app.setIncluded(s.id, false)}>
              убрать
            </button>
          </div>
        ) : (
          <button className="btn" onClick={() => app.setIncluded(s.id, true)}>
            Добавить в смету
          </button>
        )}
      </footer>
      {compare && <PriceCompare product={compare.product} need={compare.need} onClose={() => setCompare(null)} />}
    </aside>
  );
}

/** Быстрая смена дизайна: цвета и модели той же позиции — одним нажатием, сразу видно в 3D. */
function Swatches({ product, sectionId }: { product: Product; sectionId: string }) {
  const { catalog } = useApp();
  const swatch = (p: Product) => p.attrs.color ?? p.attrs.facade ?? p.attrs.fabric ?? p.attrs.top;
  const list = productsForSlot(catalog!, product.slot).filter((p) => swatch(p));
  if (list.length < 2) return null;
  return (
    <>
      <h4>Дизайн</h4>
      <div className="swatches" role="radiogroup" aria-label="Цвет и модель">
        {list.map((p) => (
          <button
            key={p.id}
            role="radio"
            aria-checked={p.id === product.id}
            className={p.id === product.id ? 'on' : ''}
            style={{ background: swatch(p) }}
            title={`${p.name} — ${money(findPrice(catalog!, p.id)?.sale)}`}
            onClick={() => useApp.getState().setSlot(sectionId, product.slot, p.id)}
          />
        ))}
      </div>
      <p className="muted small">{product.attrs.model ? `${product.attrs.model} · ` : ''}нажмите на цвет — изменение сразу видно в квартире</p>
    </>
  );
}

function ProductCard({ product, sectionId, workId, need, onCompare, onVariants }: { product: Product; sectionId: string; workId: string | null; need: number; onCompare: () => void; onVariants: () => void }) {
  const { catalog, role, proMode, sections, overrides } = useApp();
  const s = sections[sectionId];
  const price = findPrice(catalog!, product.id);
  const work = findWork(catalog!, workId);
  const ov = overrides[product.id];
  const variants = productsForSlot(catalog!, product.slot).length;
  const others = Object.entries(s.selection)
    .filter(([slot, c]) => slot !== product.slot && c.productId)
    .map(([, c]) => findProduct(catalog!, c.productId!))
    .filter((p): p is Product => !!p);
  const specs = Object.entries(product.specs);
  return (
    <article className="card">
      <div className="card-top">
        {product.attrs.color && <div className="card-swatch" style={{ background: product.attrs.color }} />}
        <div>
          <h3>{product.name}</h3>
          <p>{product.purpose}</p>
        </div>
      </div>
      <div className="prices">
        <div>
          <span className="muted small">Товар</span>
          <b>
            {money(ov ? ov.unitPrice : price?.sale)} / {unitLabel(product.unit)}
          </b>
          {ov && <span className="tag">{ov.source}: {ov.seller}</span>}
          {role === 'admin' && price?.purchase != null && <span className="muted small">закуп {money(price.purchase)}</span>}
        </div>
        <div>
          <span className="muted small">Установка</span>
          <b>{work ? `${money(work.price)} / ${unitLabel(work.unit)}` : '—'}</b>
          {work && <span className="muted small">{work.name}</span>}
        </div>
      </div>
      {price?.source === 'DEMO' && <div className="badge demo">Демо-цена из тестового каталога · обновлено {price.updatedAt}</div>}
      <Swatches product={product} sectionId={sectionId} />
      <h4>Характеристики</h4>
      <table className="spec">
        <tbody>
          {(proMode ? specs : specs.slice(0, 4)).map(([k, v]) => (
            <tr key={k}>
              <th>{k}</th>
              <td>{v}</td>
            </tr>
          ))}
          {proMode && (
            <tr>
              <th>Артикул</th>
              <td>{product.sku}</td>
            </tr>
          )}
        </tbody>
      </table>
      <h4>Принцип работы</h4>
      <p>{product.principle}</p>
      <h4>Варианты</h4>
      <p>
        {variants} в каталоге ·{' '}
        <button className="link" onClick={onVariants}>
          сравнить
        </button>
      </p>
      {others.length > 0 && (
        <>
          <h4>Дополнительные компоненты</h4>
          <ul className="components">
            {others.map((p) => (
              <li key={p.id}>
                {p.name} <span className="muted">— {money(findPrice(catalog!, p.id)?.sale)}/{unitLabel(p.unit)}</span>
              </li>
            ))}
          </ul>
        </>
      )}
      <div className="grid2 facts2">
        <div>
          <h4>Гарантия</h4>
          <p>{product.warrantyMonths ? `${product.warrantyMonths} мес.` : 'По условиям производителя'}</p>
        </div>
        <div>
          <h4>Обслуживание</h4>
          <p>{product.service || '—'}</p>
        </div>
      </div>
      <div className="card-actions">
        {s.included ? (
          <button className="btn ghost" onClick={() => useApp.getState().setIncluded(sectionId, false)}>
            ✓ В смете
          </button>
        ) : (
          <button className="btn" onClick={() => useApp.getState().setIncluded(sectionId, true)}>
            Добавить в смету
          </button>
        )}
        <button className="btn ghost" onClick={onCompare}>
          Найти дешевле
        </button>
        <button
          className="btn ghost"
          onClick={() => {
            const st = useApp.getState();
            st.setIncluded(sectionId, true);
            st.set('panel', 'estimate');
          }}
        >
          Заказать услугу
        </button>
      </div>
      <p className="muted small">
        Потребность по расчёту: {fq(need)} {unitLabel(product.unit)}
      </p>
    </article>
  );
}

/** Одинаковый ли выбор товаров (работы не сравниваем — они следуют за товаром). */
function sameSel(a: Selection, b: Selection) {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of keys) if ((a[k]?.productId ?? null) !== (b[k]?.productId ?? null)) return false;
  return true;
}

/** «+3 900 ₸» / «−2 100 ₸» — на сколько изменится итог. */
function Delta({ d }: { d: number }) {
  if (Math.abs(d) < 1) return <span className="delta">той же цены</span>;
  return <span className={d > 0 ? 'delta up' : 'delta down'}>{d > 0 ? '+' : '−'}{money(Math.abs(d))}</span>;
}
