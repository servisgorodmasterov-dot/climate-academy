// Реестр академий. Чтобы добавить направление (окна, сантехника, вентиляция...),
// создайте папку academies/<id> с logic.ts и UI, добавьте товары/работы/комплектации в таблицу и зарегистрируйте здесь.
import type { AcademyDefinition } from '../core/academy';
import { objectAcademy } from '../objects/academy';
import { buildFlooringSection, defaultFlooringParams, type FlooringParams } from './flooring/logic';
import { FlooringCalculator, FlooringLesson } from './flooring/FlooringUI';
import { buildClimateSection, defaultClimateParams, type ClimateParams } from './climate/logic';
import { ClimateCalculator, ClimateLesson } from './climate/ClimateUI';
import { buildSmartHomeSection, defaultSmartHomeParams, type SmartHomeParams } from './smarthome/logic';
import { SmartHomeCalculator, SmartHomeLesson } from './smarthome/SmartHomeUI';

const flooring: AcademyDefinition<FlooringParams> = {
  id: 'flooring',
  title: 'Напольные покрытия',
  description: 'Слои пола, выбор ламината, подложки и плинтуса, расчёт материалов и работ',
  color: '#b0814f',
  elementKinds: ['floor'],
  scope: 'room',
  slots: [
    { slot: 'floor.laminate', label: 'Ламинат' },
    { slot: 'floor.underlay', label: 'Подложка', optional: true },
    { slot: 'floor.skirting', label: 'Плинтус', optional: true },
  ],
  primarySlot: () => 'floor.laminate',
  defaultParams: () => defaultFlooringParams(),
  buildSection: (ctx, tier, p, sel) => buildFlooringSection(ctx.catalog, ctx.layout, ctx.room!, tier, p, sel),
  Lesson: FlooringLesson,
  Calculator: FlooringCalculator,
};

const climate: AcademyDefinition<ClimateParams> = {
  id: 'climate',
  title: 'Кондиционирование',
  description: 'Как устроена сплит-система, расчёт мощности, подбор модели и стоимость монтажа',
  color: '#00a3c4',
  elementKinds: ['ac_indoor', 'ac_outdoor'],
  scope: 'room',
  slots: [
    { slot: 'ac.split', label: 'Сплит-система' },
    { slot: 'ac.route', label: 'Трасса' },
    { slot: 'ac.cable', label: 'Межблочный кабель' },
    { slot: 'ac.bracket', label: 'Кронштейны', optional: true },
  ],
  primarySlot: () => 'ac.split',
  defaultParams: (ctx) => defaultClimateParams(ctx.room, ctx.layout.ceilingHeight),
  buildSection: (ctx, tier, p, sel) => buildClimateSection(ctx.catalog, ctx.room!, tier, p, sel),
  Lesson: ClimateLesson,
  Calculator: ClimateCalculator,
};

const smarthome: AcademyDefinition<SmartHomeParams> = {
  id: 'smarthome',
  title: 'Умный дом',
  description: 'Выключатели, датчики и хаб: питание, нейтраль, протоколы Zigbee, Thread, Wi-Fi, KNX и Matter',
  color: '#7b4dff',
  elementKinds: ['smart_switch', 'motion_sensor', 'leak_sensor', 'smart_hub'],
  scope: 'apartment',
  slots: [
    { slot: 'sh.hub', label: 'Хаб', optional: true },
    { slot: 'sh.switch', label: 'Выключатели' },
    { slot: 'sh.motion', label: 'Датчики движения', optional: true },
    { slot: 'sh.leak', label: 'Датчики протечки', optional: true },
    { slot: 'sh.box', label: 'Подрозетники', optional: true },
  ],
  primarySlot: (el) =>
    el?.kind === 'motion_sensor' ? 'sh.motion' : el?.kind === 'leak_sensor' ? 'sh.leak' : el?.kind === 'smart_hub' ? 'sh.hub' : 'sh.switch',
  defaultParams: (ctx) => defaultSmartHomeParams(ctx.layout),
  buildSection: (ctx, tier, p, sel) => buildSmartHomeSection(ctx.catalog, tier, p, sel),
  Lesson: SmartHomeLesson,
  Calculator: SmartHomeCalculator,
};

export const ACADEMIES: AcademyDefinition[] = [flooring, climate, smarthome];
/** Академии направлений + универсальный конфигуратор для любых типов объектов из таблицы (id вида obj:door.interior). */
export const academyById = (id: string): AcademyDefinition | undefined => ACADEMIES.find((a) => a.id === id) ?? objectAcademy(id);
export const academyForKind = (kind: string) => ACADEMIES.find((a) => a.elementKinds.includes(kind as never));
