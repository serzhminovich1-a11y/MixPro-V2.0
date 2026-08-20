import { useEffect, useState } from "react";
import { createFileRoute, Link, notFound, useNavigate } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { BadgeCheck, Trophy, Zap, UserPlus, UserCheck, MessageSquare, Loader2, Clock } from "lucide-react";
import { getProfileByUsername } from "@/lib/public.functions";
import { RouteError, RouteNotFound } from "@/components/route-fallbacks";
import { AvatarImage } from "@/components/avatar-image";
import { leagueForXp } from "@/lib/leagues";
import { SocialLinksView, parseSocials } from "@/components/social-links";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { BannerImage } from "@/components/banner-image";
import { accentHex, fontFamily, tenureLabel } from "@/lib/profile-customization";
import { CertBadgeRow, type ProfileBadge } from "@/components/cert-badges";
import { PremiumBadge } from "@/components/premium-paywall";
import { ScreenshotGallery } from "@/components/screenshot-gallery";
import { StarRating } from "@/components/star-rating";

const profileQuery = (username: string) =>
  queryOptions({
    queryKey: ["public-profile", username.toLowerCase()],
    queryFn: () => getProfileByUsername({ data: { username } }),
  });

export const Route = createFileRoute("/u/$username")({
  head: ({ params }) => ({
    meta: [
      { title: `@${params.username} — MixPro` },
      { name: "description", content: `Публичный профиль @${params.username} на MixPro.` },
      { property: "og:title", content: `@${params.username} — MixPro` },
      { property: "og:description", content: `Публичный профиль @${params.username} на MixPro.` },
    ],
  }),
  loader: async ({ context, params }) => {
    const res = await context.queryClient.ensureQueryData(profileQuery(params.username));
    if (!res.profile) throw notFound();
  },
  component: PublicProfilePage,
  errorComponent: RouteError,
  notFoundComponent: RouteNotFound,
});

function PublicProfilePage() {
  const { username } = Route.useParams();
  const { data } = useSuspenseQuery(profileQuery(username));
  const p = data.profile as (typeof data.profile & { bio?: string | null; full_name?: string | null; socials?: unknown }) | null;
  const { session } = useAuth();
  const navigate = useNavigate();
  const viewerId = session?.user.id ?? null;
  const isOwnProfile = !!p && viewerId === p.id;

  const [following, setFollowing] = useState(false);
  const [followerCount, setFollowerCount] = useState(data.followerCount);
  const [followBusy, setFollowBusy] = useState(false);
  const [followChecked, setFollowChecked] = useState(false);
  const [dmBusy, setDmBusy] = useState(false);

  useEffect(() => {
    setFollowerCount(data.followerCount);
  }, [data.followerCount]);

  useEffect(() => {
    let cancelled = false;
    async function check() {
      if (!viewerId || !p || isOwnProfile) { setFollowChecked(true); return; }
      const { data: row } = await supabase
        .from("user_follows")
        .select("follower_id")
        .eq("follower_id", viewerId)
        .eq("followed_id", p.id)
        .maybeSingle();
      if (!cancelled) { setFollowing(!!row); setFollowChecked(true); }
    }
    check();
    return () => { cancelled = true; };
  }, [viewerId, p, isOwnProfile]);

  if (!p) return null;
  const league = leagueForXp(p.xp ?? 0);
  const socials = parseSocials(p.socials);

  async function toggleFollow() {
    if (!viewerId || !p || followBusy) return;
    setFollowBusy(true);
    if (following) {
      const { error } = await supabase.from("user_follows").delete().eq("follower_id", viewerId).eq("followed_id", p.id);
      if (!error) { setFollowing(false); setFollowerCount((c) => Math.max(0, c - 1)); }
    } else {
      const { error } = await supabase.from("user_follows").insert({ follower_id: viewerId, followed_id: p.id });
      if (!error) { setFollowing(true); setFollowerCount((c) => c + 1); }
    }
    setFollowBusy(false);
  }

  async function openDm() {
    if (!p || dmBusy) return;
    setDmBusy(true);
    const { data: threadId, error } = await supabase.rpc("get_or_create_dm_thread", { _other: p.id });
    setDmBusy(false);
    if (!error && threadId) navigate({ to: "/messages/$threadId", params: { threadId } });
  }

  const accent = accentHex(p.accent_color);
  const nameFont = fontFamily(p.display_font);
  const badges: ProfileBadge[] = (data.certs ?? []).map((c) => ({ id: c.id, name: c.name, color: c.color, icon: c.icon, awardedAt: c.awarded_at }));
  const showPremiumBg = data.isPremium && !!p.banner_url;

  return (
    <>
      {/* Full-page ambient background — PRO/Lifetime-only perk, same
          treatment as the owner's own view. See profile.tsx for why this
          is position:fixed rather than the hero's w-full technique. */}
      {showPremiumBg && (
        <div className="pointer-events-none fixed inset-0 -z-10">
          <BannerImage path={p.banner_url} className="h-full w-full object-cover" style={{ filter: "brightness(0.4) saturate(1.15) blur(6px)" }} />
          <div className="absolute inset-0" style={{ background: "radial-gradient(120% 90% at 50% 0%, transparent, var(--background) 78%)" }} />
        </div>
      )}
      {/* Full-width hero — spans the whole visible content area instead of a
          small boxed card, same treatment as the owner's own view, read-only
          here. See profile.tsx for why this is a plain w-full and not the
          usual "100vw bleed" trick (breaks when the admin sidebar is
          present). */}
      <div className="relative w-full">
        <div className={`relative w-full overflow-hidden bg-secondary ${p.banner_url ? "h-72 sm:h-[28rem]" : "h-40 sm:h-56"}`} style={{ background: p.banner_url ? undefined : `radial-gradient(120% 140% at 20% 0%, ${accent}33, transparent 60%), var(--background)` }}>
          {!p.banner_url && (
            <div className="absolute inset-0 opacity-40" style={{ backgroundImage: `radial-gradient(circle at 1px 1px, ${accent}22 1px, transparent 0)`, backgroundSize: "18px 18px" }} />
          )}
          <BannerImage path={p.banner_url} className="h-full w-full object-cover" style={{ filter: "brightness(0.62) saturate(1.15)" }} />
          <div className="pointer-events-none absolute inset-0" style={{ background: "linear-gradient(to bottom, transparent 35%, var(--background) 96%)" }} />
        </div>

        {/* relative z-10: see profile.tsx — the banner above is
            `position: relative`, which paints after static siblings
            regardless of DOM order unless this is positioned too. */}
        <div className="relative z-10 mx-auto max-w-4xl px-4 pb-6">
        <div className="-mt-20 flex flex-wrap items-start gap-6 sm:-mt-24">
          <div className="grid h-32 w-32 shrink-0 place-items-center overflow-hidden rounded-2xl border-4 border-background bg-secondary text-4xl font-bold text-mint sm:h-40 sm:w-40" style={{ boxShadow: `0 0 32px -6px ${accent}b0` }}>
            <AvatarImage path={p.avatar_url} fallback={p.username.slice(0, 2).toUpperCase()} className={p.avatar_url ? "h-full w-full object-cover" : ""} />
          </div>
          <div className="min-w-0 flex-1 pt-16 sm:pt-20">
            <div className="flex items-center gap-2">
              <h1 className="truncate text-3xl font-bold sm:text-4xl" style={{ fontFamily: nameFont }}>@{p.username}</h1>
              {p.verified && <BadgeCheck className="h-5 w-5 text-cyan" />}
            </div>
            {p.full_name && <p className="mt-1 truncate text-sm font-medium text-foreground/90">{p.full_name}</p>}
            {p.status_text && (
              <p className="mt-1 inline-flex items-center gap-1.5 truncate rounded-md bg-secondary/50 px-2 py-1 text-sm text-foreground/85">
                {p.status_text}
              </p>
            )}
            {/* Each stat is its own self-contained chip (not text joined by
                "·" separators) — with flex-wrap, a standalone separator
                span can end up orphaned alone at the end of a wrapped
                line, which is exactly what happened here before. */}
            <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1 rounded-md bg-secondary/60 px-1.5 py-0.5"><Zap className="h-3 w-3 text-mint" />{p.xp ?? 0} XP</span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-violet/40 bg-violet/10 py-0.5 pl-0.5 pr-2 font-semibold text-violet">
                <span className="grid h-4 w-4 place-items-center rounded-full bg-violet/25 font-mono text-[9px]">{p.level ?? 1}</span>
                Уровень
              </span>
              {/* league.color is a Tailwind text-color *class* (see
                  leagues.ts), not a CSS color value — belongs in
                  className, not a style prop (found while fixing the
                  sidebar full-bleed bug; pre-existing, not new here). */}
              {league && (
                <span className="inline-flex items-center gap-1 rounded-md bg-secondary/60 px-1.5 py-0.5"><Trophy className={`h-3 w-3 ${league.color}`} />{league.name}</span>
              )}
              <span className="inline-flex items-center gap-1 rounded-md bg-secondary/60 px-1.5 py-0.5"><Clock className="h-3 w-3" />{tenureLabel(p.created_at)}</span>
            </div>
            <div className="mt-2 flex items-center gap-3 text-xs">
              <span><span className="font-semibold text-foreground">{followerCount}</span> <span className="text-muted-foreground">подписчиков</span></span>
              <span><span className="font-semibold text-foreground">{data.followingCount}</span> <span className="text-muted-foreground">подписок</span></span>
            </div>
          </div>

          {!isOwnProfile && viewerId && followChecked && (
            <div className="flex shrink-0 gap-2">
              <button
                type="button"
                onClick={toggleFollow}
                disabled={followBusy}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition disabled:opacity-50 ${
                  following ? "border border-border bg-background/80 backdrop-blur hover:bg-secondary" : "bg-primary text-primary-foreground hover:opacity-90"
                }`}
              >
                {followBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : following ? <UserCheck className="h-3.5 w-3.5" /> : <UserPlus className="h-3.5 w-3.5" />}
                {following ? "Вы подписаны" : "Подписаться"}
              </button>
              <button
                type="button"
                onClick={openDm}
                disabled={dmBusy}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background/80 px-3 py-1.5 text-xs font-semibold backdrop-blur hover:bg-secondary disabled:opacity-50"
              >
                {dmBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <MessageSquare className="h-3.5 w-3.5" />}
                Написать
              </button>
            </div>
          )}
          {!isOwnProfile && !viewerId && (
            <Link to="/auth" className="shrink-0 rounded-lg border border-border bg-background/80 px-3 py-1.5 text-xs font-semibold backdrop-blur hover:bg-secondary">
              Войдите, чтобы подписаться
            </Link>
          )}
        </div>
        </div>
      </div>

      <div className="mx-auto max-w-3xl px-4 pb-14">
        {p.bio && <p className="mt-1 whitespace-pre-wrap text-sm text-foreground/85">{p.bio}</p>}

        {socials.length > 0 && (
          <div className="mt-5">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Ссылки</p>
            <SocialLinksView socials={socials} />
          </div>
        )}

        {badges.length > 0 && (
          <div className="glass mt-5 rounded-2xl p-5">
            <CertBadgeRow badges={badges} />
          </div>
        )}

        {data.presets.length > 0 && (
          <div className="glass mt-5 rounded-2xl p-5">
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Пресеты · {data.presets.length}</p>
              <Link to="/presets" className="text-xs font-medium text-mint hover:underline">Каталог пресетов →</Link>
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {data.presets.map((preset) => (
                <div key={preset.id} className="rounded-xl border border-border/60 bg-secondary/30 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="rounded-full bg-secondary px-2.5 py-0.5 text-[11px] font-semibold text-cyan">{preset.daw}</span>
                    {preset.is_premium && <PremiumBadge />}
                  </div>
                  <p className="mt-2 truncate text-sm font-semibold">{preset.title}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{preset.genre ?? "Без жанра"} · {preset.downloads} ⬇</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {data.screenshots.length > 0 && (
          <div className="glass mt-5 rounded-2xl p-5">
            <p className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Скриншоты · {data.screenshots.length}</p>
            <ScreenshotGallery screenshots={data.screenshots} />
          </div>
        )}

        {data.reviews.length > 0 && (
          <div className="glass mt-5 rounded-2xl p-5">
            <p className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Обзоры · {data.reviews.length}</p>
            <div className="space-y-3">
              {data.reviews.map((r) => (
                <div key={r.id} className="border-t border-border/60 pt-3 first:border-t-0 first:pt-0">
                  <div className="flex items-center justify-between gap-2">
                    <Link to="/presets" className="truncate text-sm font-semibold text-mint hover:underline">{r.preset?.title ?? "Пресет"}</Link>
                    <StarRating value={r.rating} />
                  </div>
                  {r.content && <p className="mt-1 text-sm text-foreground/80">{r.content}</p>}
                </div>
              ))}
            </div>
          </div>
        )}

        {data.guides.length > 0 && (
          <div className="glass mt-5 rounded-2xl p-5">
            <p className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Руководства · {data.guides.length}</p>
            <div className="space-y-2">
              {data.guides.map((g) => (
                <Link key={g.id} to="/guides/$id" params={{ id: g.id }} className="block rounded-xl border border-border/60 bg-secondary/30 px-3 py-2.5 text-sm font-semibold text-mint hover:underline">
                  {g.title}
                </Link>
              ))}
            </div>
          </div>
        )}

        <p className="mt-6 text-xs text-muted-foreground">
          С нами с {new Date(p.created_at).toLocaleDateString("ru-RU", { month: "long", year: "numeric" })}.
        </p>
        <div className="mt-6 flex gap-2">
          <Link to="/leaderboard" className="rounded-md border border-border px-3 py-1.5 text-xs hover:bg-secondary">Рейтинг</Link>
          <Link to="/community" className="rounded-md border border-border px-3 py-1.5 text-xs hover:bg-secondary">Сообщество</Link>
        </div>
      </div>
    </>
  );
}
