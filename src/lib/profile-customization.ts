// Curated personalization options for a profile — a fixed palette and a
// fixed font list, not a free color-wheel/font-upload. Keeps every custom
// profile still legible and on-brand instead of accidentally unreadable
// (white-on-white, a novelty font at body size), and — for fonts — means
// zero new files: all five are already self-hosted for the rest of the
// site (see src/fonts.css), so picking one never costs a new webfont load.

export type AccentColor = { id: string; hex: string; label: string };

export const ACCENT_COLORS: AccentColor[] = [
  { id: "mint", hex: "#6EE7B7", label: "Мята" },
  { id: "cyan", hex: "#67E8F9", label: "Циан" },
  { id: "violet", hex: "#A78BFA", label: "Фиолетовый" },
  { id: "pink", hex: "#F472B6", label: "Розовый" },
  { id: "amber", hex: "#FCD34D", label: "Янтарь" },
  { id: "orange", hex: "#FDBA74", label: "Оранжевый" },
  { id: "red", hex: "#FB7185", label: "Красный" },
  { id: "blue", hex: "#60A5FA", label: "Синий" },
];

export type DisplayFont = { id: string; family: string; label: string };

export const DISPLAY_FONTS: DisplayFont[] = [
  { id: "space-grotesk", family: "'Space Grotesk', sans-serif", label: "Space Grotesk" },
  { id: "dm-sans", family: "'DM Sans', sans-serif", label: "DM Sans" },
  { id: "archivo-black", family: "'Archivo Black', sans-serif", label: "Archivo Black" },
  { id: "michroma", family: "'Michroma', sans-serif", label: "Michroma" },
  { id: "jetbrains-mono", family: "'JetBrains Mono', monospace", label: "JetBrains Mono" },
];

export function accentHex(id: string | null | undefined): string {
  return ACCENT_COLORS.find((c) => c.id === id)?.hex ?? ACCENT_COLORS[0].hex;
}

export function fontFamily(id: string | null | undefined): string {
  return DISPLAY_FONTS.find((f) => f.id === id)?.family ?? DISPLAY_FONTS[0].family;
}

function pluralRu(n: number, forms: [string, string, string]): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return forms[0];
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return forms[1];
  return forms[2];
}

/** "Стаж на проекте" — Steam-style tenure line ("N лет с нами"), derived
 * straight from profiles.created_at rather than a new column. */
export function tenureLabel(createdAt: string): string {
  const start = new Date(createdAt);
  const now = new Date();
  let months = (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth());
  if (now.getDate() < start.getDate()) months -= 1;
  months = Math.max(0, months);
  const years = Math.floor(months / 12);
  if (years >= 1) return `${years} ${pluralRu(years, ["год", "года", "лет"])} с нами`;
  if (months >= 1) return `${months} ${pluralRu(months, ["месяц", "месяца", "месяцев"])} с нами`;
  return "Новичок на проекте";
}
