import type { Layout, Tier } from '../../core/types';
import type { Selection } from '../../core/academy';
import type { EstimateSection, SelectionItem } from '../../estimate/engine';

export interface SmartHomeParams {
  switches: number;
  motion: number;
  leak: number;
  neutral: 'yes' | 'no' | 'unknown';
  deepBoxes: 'have' | 'need';
}

export function defaultSmartHomeParams(layout: Layout): SmartHomeParams {
  const count = (k: string) => layout.elements.filter((e) => e.kind === k).length;
  return { switches: count('smart_switch'), motion: count('motion_sensor'), leak: count('leak_sensor'), neutral: 'unknown', deepBoxes: 'need' };
}

export function buildSmartHomeSection(catalog: { works: { id: string; slot: string }[] }, tier: Tier, p: SmartHomeParams, sel: Selection): EstimateSection {
  const items: SelectionItem[] = [];
  const push = (slot: string, qty: number) => {
    const s = sel[slot];
    if (s?.productId && qty > 0) items.push({ slot, productId: s.productId, workId: s.workId, needQty: qty, workQty: qty, basis: { pcs: qty } });
  };
  push('sh.hub', sel['sh.hub'] ? 1 : 0);
  push('sh.switch', p.switches);
  push('sh.motion', p.motion);
  push('sh.leak', p.leak);
  if (p.deepBoxes === 'need') push('sh.box', p.switches);
  // Нет нейтрали в подрозетнике — нужен подвод кабеля (расход по листу «Расходники») и работа.
  // «Не знаю» считаем как отсутствие, чтобы смета не была занижена; это отмечено в интерфейсе.
  const neutralMissing = p.neutral !== 'yes' && p.switches > 0;
  if (neutralMissing) {
    const w = catalog.works.find((x) => x.slot === 'sh.cable');
    items.push({ slot: 'sh.cable', productId: null, workId: w?.id ?? null, needQty: 0, workQty: p.switches, basis: { pcs: p.switches } });
  }
  // Расход кабеля на подвод нейтрали привязан к позиции выключателя
  const sw = items.find((i) => i.slot === 'sh.switch');
  if (sw) sw.basis = { pcs: p.switches };
  return {
    id: 'smarthome:apartment',
    academy: 'smarthome',
    label: 'Умный дом — вся квартира',
    tier,
    items,
    params: { neutral_missing: neutralMissing ? '1' : '0' },
  };
}

/** Сравнение протоколов. Факты — по открытым спецификациям стандартов. */
export const PROTOCOLS = [
  {
    id: 'wifi', name: 'Wi-Fi', medium: 'Радио 2.4 ГГц (большинство устройств умного дома)', topology: 'Звезда: каждое устройство подключается к роутеру',
    hub: 'Не нужен — нужен стабильный роутер', power: 'Сеть; батарейные устройства разряжаются быстрее', pros: 'Просто начать, без хаба', cons: 'Нагружает домашнюю сеть; много устройств — нужен хороший роутер; часто зависит от облака производителя',
  },
  {
    id: 'zigbee', name: 'Zigbee 3.0', medium: 'Радио 2.4 ГГц, IEEE 802.15.4', topology: 'Mesh: устройства с питанием от сети ретранслируют сигнал',
    hub: 'Нужен координатор (хаб)', power: 'Датчики годами работают от батарейки', pros: 'Низкое энергопотребление, зрелая экосистема, локальная работа', cons: 'Устройства разных брендов совместимы не всегда; нужен хаб',
  },
  {
    id: 'thread', name: 'Thread', medium: 'Радио 2.4 ГГц, IEEE 802.15.4, IPv6', topology: 'Mesh: роутеры (питание от сети) и спящие конечные устройства',
    hub: 'Нужен пограничный маршрутизатор (Border Router)', power: 'Батарейные датчики — экономичны', pros: 'IP-сеть без единой точки отказа; основа для Matter', cons: 'Молодая экосистема',
  },
  {
    id: 'matter', name: 'Matter', medium: 'Не радио, а прикладной стандарт поверх Thread, Wi-Fi и Ethernet', topology: 'Зависит от транспорта',
    hub: 'Контроллер; для Thread-устройств — Border Router', power: 'Зависит от транспорта', pros: 'Совместимость между экосистемами, локальное управление, несколько контроллеров одновременно (multi-admin)', cons: 'Поддерживаемые типы устройств расширяются постепенно',
  },
  {
    id: 'knx', name: 'KNX', medium: 'Проводная шина (витая пара, ~29 В DC SELV); есть варианты по IP и радио', topology: 'Децентрализованная шина: устройства общаются напрямую',
    hub: 'Центр не обязателен; программирование ETS-проектом', power: 'Электроника питается от шины', pros: 'Надёжность, долговечность, международный стандарт (ISO/IEC 14543-3)', cons: 'Закладывается на этапе черновых работ (отдельный кабель шины), дороже, нужен сертифицированный интегратор',
  },
] as const;
