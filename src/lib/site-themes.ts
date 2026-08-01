// Global site themes — each maps to a set of CSS custom properties that override
// the defaults in src/styles.css. Applied by adding class `theme-<id>` to <html>.
export type SiteThemeId =
  | "night"
  | "day"
  | "ableton"
  | "pro-tools"
  | "noir-gold"
  | "cyberpunk";

export type SiteTheme = {
  id: SiteThemeId;
  label: string;
  hint: string;
  isLight?: boolean;
  swatch: string; // primary accent for the picker dot
};

export const SITE_THEMES: SiteTheme[] = [
  { id: "night", label: "Ночь", hint: "Тёмная FL — по умолчанию", swatch: "oklch(0.78 0.19 145)" },
  { id: "day", label: "День", hint: "Светлая FL — для дневной работы", isLight: true, swatch: "oklch(0.62 0.19 145)" },
  { id: "ableton", label: "Ableton", hint: "Тёплый серый + оранжевый", swatch: "oklch(0.75 0.16 55)" },
  { id: "pro-tools", label: "Pro Tools", hint: "Глубокий синий + янтарь", swatch: "oklch(0.72 0.14 240)" },
  { id: "noir-gold", label: "Noir & Gold", hint: "Чёрный + золото", swatch: "oklch(0.78 0.14 85)" },
  { id: "cyberpunk", label: "Cyberpunk", hint: "Фуксия + циан", swatch: "oklch(0.72 0.28 340)" },
];
