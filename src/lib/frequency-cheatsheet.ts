/** Quick reference — "что живёт на этих частотах". Shown as a `?` help modal
 *  inside the frequency trainer. Adapted from eqtrainer.app's cheatsheet. */

export type CheatRow = {
  hz: number;
  label: string;      // short frequency label, e.g. "100 Гц"
  positive: string;   // useful character
  negative: string;   // problem character
};

export const CHEATSHEET: CheatRow[] = [
  { hz: 60,    label: "60 Гц",   positive: "Вес суб-баса",         negative: "Гул, рокот" },
  { hz: 100,   label: "100 Гц",  positive: "«Удар» кика",           negative: "Бум, картон" },
  { hz: 200,   label: "200 Гц",  positive: "«Тело» вокала",         negative: "Мутность" },
  { hz: 400,   label: "400 Гц",  positive: "Плотность гитар",       negative: "«Коробка»" },
  { hz: 500,   label: "500 Гц",  positive: "Плотность середины",    negative: "«Носовость»" },
  { hz: 1000,  label: "1 кГц",   positive: "Разборчивость",         negative: "«Телефон»" },
  { hz: 2000,  label: "2 кГц",   positive: "Атака малого, слов",    negative: "Резкость" },
  { hz: 3000,  label: "3 кГц",   positive: "Присутствие вокала",    negative: "Кричит, режет" },
  { hz: 5000,  label: "5 кГц",   positive: "Хрусткость, «S», «T»",  negative: "Свист, шипение" },
  { hz: 8000,  label: "8 кГц",   positive: "Дыхание, тарелки",      negative: "Ess-соки" },
  { hz: 10000, label: "10 кГц",  positive: "Сизл хайхета",          negative: "Стекло" },
  { hz: 15000, label: "15 кГц",  positive: "«Воздух», глянец",      negative: "Хрупкость" },
];

export const ANCHORS: { hz: number; sound: string }[] = [
  { hz: 60,    sound: "Мужской голос низа, гул трансформатора" },
  { hz: 150,   sound: "Гул салона самолёта" },
  { hz: 440,   sound: "Нота Ля (эталон настройки)" },
  { hz: 1000,  sound: "Гудок в трубке" },
  { hz: 2500,  sound: "Плач младенца — самая чувствительная зона уха" },
  { hz: 5000,  sound: "Стрёкот сверчков, «S» в шёпоте" },
  { hz: 8000,  sound: "Шипение тарелки, дождь по стеклу" },
];
