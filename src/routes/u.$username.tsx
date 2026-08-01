import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { BadgeCheck, Trophy, Zap } from "lucide-react";
import { getProfileByUsername } from "@/lib/public.functions";
import { RouteError, RouteNotFound } from "@/components/route-fallbacks";
import { AvatarImage } from "@/components/avatar-image";
import { leagueForXp } from "@/lib/leagues";
import { SocialLinksView, parseSocials } from "@/components/social-links";

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
  if (!p) return null;
  const league = leagueForXp(p.xp ?? 0);
  const socials = parseSocials(p.socials);

  return (
    <div className="mx-auto max-w-3xl px-4 py-14">
      <div className="panel rounded-2xl p-6 md:p-8">
        <div className="flex items-center gap-4">
          <div className="grid h-16 w-16 place-items-center overflow-hidden rounded-full bg-secondary text-lg font-bold text-mint">
            <AvatarImage path={p.avatar_url} fallback={p.username.slice(0, 2).toUpperCase()} className={p.avatar_url ? "h-full w-full object-cover" : ""} />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="truncate text-2xl font-bold">@{p.username}</h1>
              {p.verified && <BadgeCheck className="h-5 w-5 text-cyan" />}
            </div>
            {p.full_name && <p className="mt-0.5 truncate text-sm font-medium text-foreground/90">{p.full_name}</p>}
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1"><Zap className="h-3 w-3 text-mint" />{p.xp ?? 0} XP</span>
              <span>·</span>
              <span>LVL {p.level ?? 1}</span>
              {league && (
                <>
                  <span>·</span>
                  <span className="inline-flex items-center gap-1"><Trophy className="h-3 w-3" style={{ color: league.color }} />{league.name}</span>
                </>
              )}
              {p.subscription_tier && p.subscription_tier !== "free" && (
                <>
                  <span>·</span>
                  <span className="rounded bg-mint/15 px-1.5 py-0.5 uppercase tracking-wider text-mint">{p.subscription_tier}</span>
                </>
              )}
            </div>
          </div>
        </div>

        {p.bio && <p className="mt-5 whitespace-pre-wrap text-sm text-foreground/85">{p.bio}</p>}

        {socials.length > 0 && (
          <div className="mt-5">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Ссылки</p>
            <SocialLinksView socials={socials} />
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
    </div>
  );
}
