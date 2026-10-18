import { useEffect, useMemo, useState } from 'react';
import { TIERS, type Product } from '../core/types';
import { academyById } from '../academies';
import { slotsOf } from '../core/academy';
import { findPrice, findProduct, findWork, productsForSlot } from '../catalog/sheetParser';
import { computeEstimate } from '../estimate/engine';
import { buildSection, contextFor } from '../estimate/useEstimate';
import { useApp } from '../store';
import { money, qty as fq, unitLabel } from './format';
import { PriceCompare } from './PriceCompare';
import { EstimateTable } from './EstimateTable';

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
      <div className="seg tiers" role="tablist" aria-label="Комплектация">
        {TIERS.map((t) => (
          <button key={t.id} className={s.tier === t.id ? 'on' : ''} onClick={() => app.setTier(s.id, t.id)}>
            {t.label}
          </button>
        ))}
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
            {slotsOf(def, catalog).map((sl) => {
              const list = productsForSlot(catalog, sl.slot);
              if (!list.length) return null;
              const cur = s.selection[sl.slot]?.productId ?? null;
              const specKeys = [...new Set(list.flatMap((p) => Object.keys(p.specs)))].slice(0, proMode ? 8 : 3);
              return (
                <section key={sl.slot}>
                  <h4>{sl.label}</h4>
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
                          {money(findPrice(catalog, p.id)?.sale)}
                          <span className="muted small" style={{ display: 'block', fontWeight: 500 }}>
                            за {unitLabel(p.unit)}
                          </span>
                        </span>
                      </button>
                    ))}
                    {sl.optional && (
                      <button role="radio" aria-checked={cur === null} className={cur === null ? 'opt sel' : 'opt'} onClick={() => app.setSlot(s.id, sl.slot, null)}>
                        <span className="radio" />
                        <span className="body muted">Не включать в комплектацию</span>
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
        <div>
          <div className="muted small">Раздел сметы · {TIERS.find((t) => t.id === s.tier)?.label}</div>
          <b>{money(est?.total)}</b>
        </div>
        {s.included ? (
          <button className="btn ghost" onClick={() => app.setIncluded(s.id, false)}>
            ✓ В смете — убрать
          </button>
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
  const list = productsForSlot(catalog!, product.slot).filter((p) => p.attrs.color);
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
            style={{ background: p.attrs.color }}
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
