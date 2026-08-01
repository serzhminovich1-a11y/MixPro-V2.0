import { useState } from "react";
import { createFileRoute, Link, notFound, useRouter } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { MessageSquare, Pin, Lock, Plus } from "lucide-react";
import { getForumCategoryBySlug } from "@/lib/public.functions";
import { createThread } from "@/lib/community.functions";
import { useAuth } from "@/hooks/use-auth";
import { RouteError, RouteNotFound } from "@/components/route-fallbacks";

const catQuery = (slug: string) =>
  queryOptions({ queryKey: ["forum-cat", slug], queryFn: () => getForumCategoryBySlug({ data: { slug } }) });

export const Route = createFileRoute("/forum/$category")({
  loader: async ({ context, params }) => {
    const res = await context.queryClient.ensureQueryData(catQuery(params.category));
    if (!res.category) throw notFound();
    return { name: res.category.name };
  },
  head: ({ loaderData }) => {
    if (!loaderData) return { meta: [{ title: "Категория не найдена — MixPro" }, { name: "robots", content: "noindex" }] };
    return {
      meta: [
        { title: `${loaderData.name} — Форум MixPro` },
        { name: "description", content: `Обсуждения в категории «${loaderData.name}» на форуме MixPro.` },
        { property: "og:title", content: `${loaderData.name} — Форум MixPro` },
      ],
    };
  },
  component: CategoryPage,
  errorComponent: RouteError,
  notFoundComponent: RouteNotFound,
});

function CategoryPage() {
  const { category: slug } = Route.useParams();
  const { data } = useSuspenseQuery(catQuery(slug));
  const { session } = useAuth();
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [busy, setBusy] = useState(false);
  const create = useServerFn(createThread);

  if (!data.category) return null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!data.category) return;
    setBusy(true);
    try {
      const { id } = await create({ data: { categoryId: data.category.id, title: title.trim(), content: content.trim() } });
      toast.success("Тема создана");
      setTitle("");
      setContent("");
      setCreating(false);
      router.navigate({ to: "/forum/thread/$id", params: { id } });
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-14">
      <Link to="/forum" className="text-sm text-muted-foreground hover:text-foreground">← Все категории</Link>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">{data.category.name}</h1>
          {data.category.description && <p className="text-sm text-muted-foreground">{data.category.description}</p>}
        </div>
        {session && (
          <button
            onClick={() => setCreating((v) => !v)}
            className="btn-primary inline-flex items-center gap-1"
          >
            <Plus className="h-4 w-4" /> Новая тема
          </button>
        )}
      </div>

      {creating && session && (
        <form onSubmit={submit} className="glass mt-6 rounded-2xl p-4">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Заголовок темы"
            maxLength={140}
            className="w-full rounded border border-input bg-background px-3 py-2 text-sm"
            required
            minLength={4}
          />
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Опиши вопрос или тему подробно..."
            rows={5}
            maxLength={8000}
            className="mt-2 w-full resize-none rounded border border-input bg-background px-3 py-2 text-sm"
            required
            minLength={4}
          />
          <div className="mt-2 flex justify-end gap-2">
            <button type="button" onClick={() => setCreating(false)} className="rounded border border-black/60 bg-secondary px-3 py-1.5 text-xs">Отмена</button>
            <button
              type="submit"
              disabled={busy || title.trim().length < 4 || content.trim().length < 4}
              className="rounded bg-primary px-4 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-50"
            >
              {busy ? "..." : "Создать"}
            </button>
          </div>
        </form>
      )}

      <div className="mt-6 space-y-2">
        {data.threads.length === 0 && (
          <p className="text-center text-sm text-muted-foreground py-10">Пока нет тем. Будь первым!</p>
        )}
        {data.threads.map((t) => (
          <Link
            key={t.id}
            to="/forum/thread/$id"
            params={{ id: t.id }}
            className="panel flex items-center gap-3 rounded-lg p-4 transition-all hover:border-cyan/40"
          >
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-secondary text-xs font-bold text-mint">
              {(t.author?.username ?? "A")[0].toUpperCase()}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                {t.is_pinned && <Pin className="h-3 w-3 text-mint" />}
                {t.is_locked && <Lock className="h-3 w-3 text-muted-foreground" />}
                <h3 className="truncate text-sm font-semibold">{t.title}</h3>
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {t.author?.username ?? "Аноним"} · {new Date(t.last_activity_at).toLocaleString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
              </p>
            </div>
            <div className="hidden items-center gap-1 font-mono text-[11px] text-muted-foreground sm:flex">
              <MessageSquare className="h-3 w-3" /> {t.reply_count}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
