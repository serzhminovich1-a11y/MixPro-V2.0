/** League / status system derived from XP. */
export type League = {
  key: string;
  name: string;
  min: number;
  max: number;
  color: string;      // tailwind text color class
  bg: string;         // tailwind bg class
  border: string;     // tailwind border class
  icon: string;       // emoji glyph (native)
  aura: string;       // CSS box-shadow for the badge glow
};

export const LEAGUES: League[] = [
  { key: "novice",   name: "Новичок",       min: 0,      max: 499,    color: "text-zinc-300",   bg: "bg-zinc-500/15",   border: "border-zinc-500/40",   icon: "🎧", aura: "0 0 12px hsl(240 5% 60% / 0.35)" },
  { key: "bronze",   name: "Бронза",        min: 500,    max: 1499,   color: "text-orange-300", bg: "bg-orange-500/15", border: "border-orange-500/40", icon: "🥉", aura: "0 0 12px hsl(24 90% 55% / 0.45)" },
  { key: "silver",   name: "Серебро",       min: 1500,   max: 3999,   color: "text-slate-200",  bg: "bg-slate-400/15",  border: "border-slate-400/50",  icon: "🥈", aura: "0 0 14px hsl(210 15% 80% / 0.45)" },
  { key: "gold",     name: "Золото",        min: 4000,   max: 9999,   color: "text-amber-300",  bg: "bg-amber-500/15",  border: "border-amber-500/50",  icon: "🥇", aura: "0 0 16px hsl(45 95% 55% / 0.55)" },
  { key: "platinum", name: "Платина",       min: 10000,  max: 24999,  color: "text-cyan-300",   bg: "bg-cyan-500/10",   border: "border-cyan-400/50",   icon: "💎", aura: "0 0 18px hsl(190 90% 60% / 0.55)" },
  { key: "diamond",  name: "Даймонд",       min: 25000,  max: 59999,  color: "text-sky-300",    bg: "bg-sky-500/10",    border: "border-sky-400/60",    icon: "🔷", aura: "0 0 22px hsl(210 100% 65% / 0.65)" },
  { key: "master",   name: "Мастер",        min: 60000,  max: 149999, color: "text-fuchsia-300", bg: "bg-fuchsia-500/10", border: "border-fuchsia-400/60", icon: "🎚️", aura: "0 0 26px hsl(300 90% 65% / 0.65)" },
  { key: "legend",   name: "Легенда",       min: 150000, max: Infinity, color: "text-yellow-300", bg: "bg-yellow-500/15", border: "border-yellow-400/60", icon: "👑", aura: "0 0 30px hsl(48 100% 60% / 0.85)" },
];

export function leagueForXp(xp: number): League {
  return LEAGUES.find((l) => xp >= l.min && xp <= l.max) ?? LEAGUES[0];
}

export function nextLeague(xp: number): League | null {
  const cur = leagueForXp(xp);
  const idx = LEAGUES.indexOf(cur);
  return idx >= 0 && idx < LEAGUES.length - 1 ? LEAGUES[idx + 1] : null;
}

export function progressInLeague(xp: number): { pct: number; toNext: number } {
  const cur = leagueForXp(xp);
  if (!isFinite(cur.max)) return { pct: 100, toNext: 0 };
  const span = cur.max - cur.min + 1;
  const pos = xp - cur.min;
  return { pct: Math.max(0, Math.min(100, (pos / span) * 100)), toNext: Math.max(0, cur.max + 1 - xp) };
}
