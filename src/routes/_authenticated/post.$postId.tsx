import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { zodValidator } from "@tanstack/zod-adapter";
import { ArrowLeft, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { TrackCard } from "@/components/track-card";
import type { PlayerTrack } from "@/components/track-player";

const searchSchema = z.object({
  track: z.coerce.number().int().min(0).optional(),
  t: z.coerce.number().int().min(0).optional(),
});

export const Route = createFileRoute("/_authenticated/post/$postId")({
  validateSearch: zodValidator(searchSchema),
  component: PostViewPage,
  errorComponent: ({ error }) => (
    <div className="mx-auto max-w-3xl p-6 text-sm text-destructive">Ошибка: {error.message}</div>
  ),
  notFoundComponent: () => (
    <div className="mx-auto max-w-3xl p-6 text-sm text-muted-foreground">Пост не найден.</div>
  ),
  head: () => ({
    meta: [
      { title: "Обсуждение трека — MixPro" },
      { name: "description", content: "Обсуждение трека и таймстемп-комментарии на MixPro." },
    ],
  }),
});

async function signWall(path: string): Promise<string | null> {
  if (!path) return null;
  if (path.startsWith("http")) return path;
  const { data, error } = await supabase.storage.from("wall").createSignedUrl(path, 3600);
  if (error) console.error("[post] failed to sign track URL", path, error.message);
  return data?.signedUrl ?? null;
}

function PostViewPage() {
  const { postId } = Route.useParams();
  const { track, t } = Route.useSearch();
  const { user } = Route.useRouteContext();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [tracks, setTracks] = useState<PlayerTrack[]>([]);
  const [title, setTitle] = useState<string>("");
  const [author, setAuthor] = useState<{ username: string; avatar_url: string | null } | null>(null);
  const [cover, setCover] = useState<string | null>(null);
  const [createdAt, setCreatedAt] = useState<string | null>(null);
  const [genre, setGenre] = useState<string | null>(null);
  const [playCount, setPlayCount] = useState(0);
  const [commentCount, setCommentCount] = useState(0);
  const [likeCount, setLikeCount] = useState(0);
  const [likedByMe, setLikedByMe] = useState(false);
  const [canDeleteAny, setCanDeleteAny] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      const { data: post, error } = await supabase
        .from("posts")
        .select("id, author_id, title, genre, play_count, media_urls, tracks, content, created_at")
        .eq("id", postId)
        .maybeSingle();
      if (!alive) return;
      if (error || !post) { setErr(error?.message ?? "Пост не найден"); setLoading(false); return; }
      setTitle(post.title ?? post.content?.slice(0, 60) ?? "Пост");
      setGenre(post.genre ?? null);
      setCreatedAt(post.created_at ?? null);
      setPlayCount(post.play_count ?? 0);
      const media = Array.isArray(post.media_urls) ? post.media_urls : [];
      setCover(media[0] ? await signWall(media[0]) : null);
      const { data: prof } = await supabase.from("profiles").select("username, avatar_url").eq("id", post.author_id).maybeSingle();
      if (prof) setAuthor(prof);
      const [likesRes, commentsRes] = await Promise.all([
        supabase.from("post_likes").select("user_id").eq("post_id", postId),
        supabase.from("track_comments").select("id").eq("post_id", postId),
      ]);
      setLikeCount((likesRes.data ?? []).length);
      setLikedByMe((likesRes.data ?? []).some((l) => l.user_id === user.id));
      setCommentCount((commentsRes.data ?? []).length);
      const list = Array.isArray(post.tracks) ? (post.tracks as Array<{ path: string; label?: string; format?: string; size?: number; analysis?: unknown; warnings?: string[] }>) : [];
      const built = (await Promise.all(list.map(async (tr) => {
        const url = await signWall(tr.path);
        if (!url) return null;
        return {
          url,
          label: tr.label || "Без названия",
          format: tr.format || "wav",
          size: tr.size,
          analysis: tr.analysis,
          warnings: tr.warnings,
        } as PlayerTrack;
      }))).filter(Boolean) as PlayerTrack[];
      setTracks(built);
      if (built.length === 0 && list.length > 0) {
        setErr("Не удалось загрузить треки этого поста — файлы недоступны в хранилище.");
        setLoading(false);
        return;
      }

      // Moderation flag
      const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", user.id);
      setCanDeleteAny((roles ?? []).some((r) => ["admin", "moderator", "super_admin"].includes(r.role as string)));

      setLoading(false);
    })();
    return () => { alive = false; };
  }, [postId, user.id]);

  if (loading) {
    return (
      <div className="mx-auto max-w-3xl p-6 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Загружаем…
      </div>
    );
  }
  if (err) {
    return <div className="mx-auto max-w-3xl p-6 text-sm text-destructive">{err}</div>;
  }
  if (tracks.length === 0) {
    return (
      <div className="mx-auto max-w-3xl p-6 space-y-3">
        <button onClick={() => navigate({ to: "/community" })} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3 w-3" /> назад
        </button>
        <p className="text-sm text-muted-foreground">В этом посте нет треков.</p>
      </div>
    );
  }

  const initialTrack = track != null && track < tracks.length ? track : 0;

  async function toggleLike() {
    if (likedByMe) await supabase.from("post_likes").delete().eq("post_id", postId).eq("user_id", user.id);
    else await supabase.from("post_likes").insert({ post_id: postId, user_id: user.id });
    setLikedByMe((v) => !v);
    setLikeCount((n) => Math.max(0, n + (likedByMe ? -1 : 1)));
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4 md:p-6">
      <div className="flex items-center justify-between">
        <button onClick={() => history.length > 1 ? history.back() : navigate({ to: "/notifications" })} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3 w-3" /> назад
        </button>
        {author && (
          <Link to="/u/$username" params={{ username: author.username }} className="text-xs text-muted-foreground hover:text-foreground">
            от <span className="font-semibold text-mint">@{author.username}</span>
          </Link>
        )}
      </div>
      <TrackCard
        postId={postId}
        tracks={tracks}
        cover={cover}
        title={title}
        artist={author?.username}
        createdAt={createdAt}
        genre={genre}
        playCount={playCount}
        commentCount={commentCount}
        likeCount={likeCount}
        likedByMe={likedByMe}
        currentUserId={user.id}
        canDeleteAny={canDeleteAny}
        initialTrackIndex={initialTrack}
        initialSeekMs={t}
        onLike={toggleLike}
      />
    </div>
  );
}
