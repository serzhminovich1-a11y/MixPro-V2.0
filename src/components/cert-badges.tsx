// Steam-style "badges" row — earned certifications rendered as a small
// icon-tile grid instead of buried in a list. Shared between the owner's
// own profile and the public /u/:username view since both need the exact
// same read-only presentation.

export type ProfileBadge = { id: string; name: string; color: string; icon: string | null; awardedAt?: string | null };

export function CertBadgeRow({ badges }: { badges: ProfileBadge[] }) {
  if (badges.length === 0) return null;
  return (
    <div>
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
        Награды · {badges.length}
      </p>
      <div className="grid grid-cols-4 gap-2 sm:grid-cols-6 md:grid-cols-8">
        {badges.map((b) => (
          <div
            key={b.id}
            title={b.awardedAt ? `${b.name} · выдан ${new Date(b.awardedAt).toLocaleDateString("ru-RU")}` : b.name}
            className="flex flex-col items-center gap-1.5 rounded-xl border border-border/60 bg-secondary/30 p-2.5 text-center transition hover:border-border hover:bg-secondary/50"
          >
            <div
              className="grid h-10 w-10 place-items-center rounded-lg text-lg"
              style={{ background: `${b.color}22`, color: b.color, boxShadow: `inset 0 0 0 1px ${b.color}40` }}
            >
              {b.icon ?? "★"}
            </div>
            <span className="line-clamp-2 text-[10px] font-medium leading-tight text-foreground/75">{b.name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
