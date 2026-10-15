/**
 * Реестр учебных модулей.
 * Новый раздел (монтаж, диагностика, VR, тепловые насосы, каталог ClimateCool.kz…)
 * добавляется сюда записью + компонентом в src/modules/<id>/ и регистрацией в App.tsx.
 * Модули не импортируют друг друга: общий код — только в src/core, src/three, src/ui.
 */
export type ModuleId = 'home' | 'device' | 'cycle' | 'calculator' | 'roadmap';

export interface ModuleMeta {
  id: ModuleId;
  num: string;
  title: string;
  short: string;
  /** Учитывается в прогрессе обучения (есть тест). */
  counted: boolean;
}

export const MODULES: ModuleMeta[] = [
  { id: 'home', num: '01', title: 'Квартира с кондиционером', short: 'Квартира', counted: true },
  { id: 'device', num: '02', title: 'Устройство сплит-системы', short: 'Устройство', counted: true },
  { id: 'cycle', num: '03', title: 'Холодильный цикл', short: 'Цикл', counted: true },
  { id: 'calculator', num: '04', title: 'Подбор мощности', short: 'Мощность', counted: true },
  { id: 'roadmap', num: '··', title: 'Что дальше', short: 'Дальше', counted: false },
];

/** Разделы следующих итераций — в навигации показаны как «в разработке», без заглушек-экранов. */
export const PLANNED = [
  { title: 'Виртуальный монтаж', note: '6 этапов: место, наружный блок, трасса, проход через стену, подключение, проверка и запуск' },
  { title: 'Найди ошибку', note: 'интерактивный разбор типичных ошибок монтажа и их последствий' },
  { title: 'Обслуживание и диагностика', note: 'симптомы, вероятные причины, что делает пользователь, а что — специалист' },
  { title: 'Расширения', note: 'VR, другие типы кондиционеров, вентиляция и рекуперация, тепловые насосы, личный кабинет, каталог ClimateCool.kz, калькулятор стоимости и заявки' },
];
