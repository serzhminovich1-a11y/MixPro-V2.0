import { useEffect, useState } from "react";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { MessagesSquare, Heart, Send } from "lucide-react";
import { getPosts } from "@/lib/public.functions";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { RouteError, RouteNotFound } from "@/components/route-fallbacks";

const postsQuery = queryOptions({ queryKey: ["posts"], queryFn: () => getPosts() });

export const Route = createFileRoute("/community")({
  head: () => ({
    meta: [
      { title: "Сообщество звукорежиссёров — MixPro" },
      { name: "description", content: "Общайся с другими звукорежиссёрами: делись опытом, задавай вопросы, обсуждай сведение и мастеринг." },
      { property: "og:title", content: "Сообщество звукорежиссёров — MixPro" },
      { property: "og:description", content: "Лента постов сообщества MixPro." },
    ],
  }),
  loader: ({ context }) => {
    context.queryClient.ensureQueryData(postsQuery);
  },
  component: CommunityPage,
  errorComponent: RouteError,
  notFoundComponent: RouteNotFound,
});

function CommunityPage() {
  const { data } = useSuspenseQuery(postsQuery);
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const router = useRouter();
  const [content, setContent] = useState("");
  const [busy, setBusy] = useState(false);
  const [likedByMe, setLikedByMe] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!session) return;
    supabase
      .from("post_likes")
      .select("post_id")
      .eq("user_id", session.user.id)
      .then(({ data: likes }) => {
        if (likes) setLikedByMe(new Set(likes.map((l) => l.post_id)));
      });
  }, [session]);

  useEffect(() => {
    const channel = supabase
      .channel("community-feed")
      .on("postgres_changes", { event: "*", schema: "public", table: "posts" }, () => {
        queryClient.invalidateQueries({ queryKey: ["posts"] });
        router.invalidate();
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient, router]);

  async function submitPost(e: React.FormEvent) {
    e.preventDefault();
    if (!session || !content.trim()) return;
    setBusy(true);
    const { error } = await supabase.from("posts").insert({
      author_id: session.user.id,
      content: content.trim(),
    });
    setBusy(false);
    if (!error) {
      setContent("");
      queryClient.invalidateQueries({ queryKey: ["posts"] });
      router.invalidate();
    }
  }

  async function toggleLike(postId: string) {
    if (!session) return;
    const isLiked = likedByMe.has(postId);
    const next = new Set(likedByMe);
    if (isLiked) {
      next.delete(postId);
      setLikedByMe(next);
      await supabase.from("post_likes").delete().eq("post_id", postId).eq("user_id", session.user.id);
    } else {
      next.add(postId);
      setLikedByMe(next);
      await supabase.from("post_likes").insert({ post_id: postId, user_id: session.user.id });
    }
    queryClient.invalidateQueries({ queryKey: ["posts"] });
    router.invalidate();
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-16">
      <div className="text-center">
        <MessagesSquare className="mx-auto h-10 w-10 text-cyan" />
        <h1 className="mt-4 text-3xl font-bold md:text-4xl">Сообщество</h1>
        <p className="mx-auto mt-2 max-w-md text-muted-foreground">
          Делись опытом, задавай вопросы, обсуждай миксы.
        </p>
      </div>

      {session ? (
        <form onSubmit={submitPost} className="glass mt-10 rounded-2xl p-4">
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Что нового в твоей студии?"
            rows={3}
            maxLength={2000}
            className="w-full resize-none rounded-xl border border-input bg-background px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
          <div className="mt-2 flex justify-end">
            <button
              type="submit"
              disabled={busy || !content.trim()}
              className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
            >
              <Send className="h-4 w-4" /> Опубликовать
            </button>
          </div>
        </form>
      ) : (
        <div className="glass mt-10 rounded-2xl p-6 text-center text-sm text-muted-foreground">
          <Link to="/auth" className="text-primary hover:underline">Войдите</Link>, чтобы писать посты и ставить лайки.
        </div>
      )}

      <div className="mt-8 space-y-4">
        {data.posts.length === 0 && (
          <p className="text-center text-muted-foreground">Пока тишина в эфире. Напиши первый пост!</p>
        )}
        {data.posts.map((post) => (
          <article key={post.id} className="glass rounded-2xl p-6">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-secondary text-sm font-bold text-mint">
                {(post.author?.username ?? "A")[0].toUpperCase()}
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{post.author?.username ?? "Аноним"}</p>
                <p className="text-xs text-muted-foreground">
                  {new Date(post.created_at).toLocaleString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                </p>
              </div>
            </div>
            <p className="mt-4 whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">{post.content}</p>
            <div className="mt-4 flex items-center gap-4">
              <button
                onClick={() => toggleLike(post.id)}
                disabled={!session}
                className={`inline-flex items-center gap-1.5 text-sm transition-colors disabled:opacity-50 ${
                  likedByMe.has(post.id) ? "text-destructive" : "text-muted-foreground hover:text-destructive"
                }`}
              >
                <Heart className={`h-4 w-4 ${likedByMe.has(post.id) ? "fill-current" : ""}`} />
                {post.likes.length}
              </button>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
