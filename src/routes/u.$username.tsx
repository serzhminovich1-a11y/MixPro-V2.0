import { useEffect, useState } from "react";
import { createFileRoute, Link, notFound, useNavigate } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { BadgeCheck, Trophy, Zap, UserPlus, UserCheck, MessageSquare, Loader2 } from "lucide-react";
import { getProfileByUsername } from "@/lib/public.functions";
import { RouteError, RouteNotFound } from "@/components/route-fallbacks";
import { AvatarImage } from "@/components/avatar-image";
import { leagueForXp } from "@/lib/leagues";
import { SocialLinksView, parseSocials } from "@/components/social-links";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

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

  return (
    <div className="mx-auto max-w-3xl px-4 py-14">
      <div className="panel rounded-2xl p-6 md:p-8">
        <div className="flex flex-wrap items-start gap-4">
          <div className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-full bg-secondary text-lg font-bold text-mint">
            <AvatarImage path={p.avatar_url} fallback={p.username.slice(0, 2).toUpperCase()} className={p.avatar_url ? "h-full w-full object-cover" : ""} />
          </div>
          <div className="min-w-0 flex-1">
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
                  following ? "border border-border hover:bg-secondary" : "bg-primary text-primary-foreground hover:opacity-90"
                }`}
              >
                {followBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : following ? <UserCheck className="h-3.5 w-3.5" /> : <UserPlus className="h-3.5 w-3.5" />}
                {following ? "Вы подписаны" : "Подписаться"}
              </button>
              <button
                type="button"
                onClick={openDm}
                disabled={dmBusy}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold hover:bg-secondary disabled:opacity-50"
              >
                {dmBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <MessageSquare className="h-3.5 w-3.5" />}
                Написать
              </button>
            </div>
          )}
          {!isOwnProfile && !viewerId && (
            <Link to="/auth" className="shrink-0 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold hover:bg-secondary">
              Войдите, чтобы подписаться
            </Link>
          )}
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
