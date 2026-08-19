import { useState } from "react";
import { createFileRoute, Link, notFound, useRouter } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { MessageSquare, Eye, Pin, Lock, Plus, ChevronRight, Clock } from "lucide-react";
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

function timeAgo(iso: string) {
  const d = new Date(iso);
  const diffMin = Math.round((Date.now() - d.getTime()) / 60000);
  if (diffMin < 1) return "только что";
  if (diffMin < 60) return `${diffMin} мин назад`;
  const diffH = Math.round(diffMin / 60);
  if (diffH < 24) return `${diffH} ч назад`;
  return d.toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
}

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
  const cat = data.category;

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
      {/* Breadcrumb */}
      <nav className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
        <Link to="/forum" className="hover:text-foreground">Форум</Link>
        {data.parent && (
          <>
            <ChevronRight className="h-3 w-3" />
            <Link to="/forum/$category" params={{ category: data.parent.slug }} className="hover:text-foreground">{data.parent.name}</Link>
          </>
        )}
        <ChevronRight className="h-3 w-3" />
        <span className="text-foreground">{cat.name}</span>
      </nav>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-secondary text-lg">{cat.icon ?? "💬"}</span>
          <div>
            <h1 className="text-2xl font-bold leading-tight">{cat.name}</h1>
            {cat.description && <p className="text-sm text-muted-foreground">{cat.description}</p>}
          </div>
        </div>
        {session && (
          <button
            onClick={() => setCreating((v) => !v)}
            className="btn-primary inline-flex shrink-0 items-center gap-1"
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

      {/* Subforums, if this category has any */}
      {data.subforums.length > 0 && (
        <div className="panel mt-6 divide-y divide-border/50 overflow-hidden">
          {data.subforums.map((sf) => (
            <Link
              key={sf.id}
              to="/forum/$category"
              params={{ category: sf.slug }}
              className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-foreground/[0.03]"
            >
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-secondary text-base">{sf.icon ?? "💬"}</span>
              <div className="min-w-0 flex-1">
                <h4 className="truncate text-sm font-semibold">{sf.name}</h4>
                {sf.description && <p className="truncate text-xs text-muted-foreground">{sf.description}</p>}
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* Thread list — classic table: title/author | replies | views | last post */}
      <div className="panel mt-6 overflow-hidden">
        <div className="hidden grid-cols-[1fr_5rem_5rem_14rem] gap-3 border-b border-black/50 bg-black/20 px-4 py-2 font-mono text-[10px] uppercase tracking-wider text-muted-foreground sm:grid">
          <span>Тема</span>
          <span className="text-center">Ответов</span>
          <span className="text-center">Просмотров</span>
          <span>Последнее сообщение</span>
        </div>
        <div className="divide-y divide-border/50">
          {data.threads.length === 0 && (
            <p className="py-10 text-center text-sm text-muted-foreground">Пока нет тем. Будь первым!</p>
          )}
          {data.threads.map((t) => (
            <Link
              key={t.id}
              to="/forum/thread/$id"
              params={{ id: t.id }}
              className="grid grid-cols-[auto_1fr] items-center gap-3 px-4 py-3 transition-colors hover:bg-foreground/[0.03] sm:grid-cols-[1fr_5rem_5rem_14rem]"
            >
              <div className="col-span-2 flex min-w-0 items-center gap-2.5 sm:col-span-1">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-secondary text-xs font-bold text-mint">
                  {(t.author?.username ?? "A")[0].toUpperCase()}
                </span>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    {t.is_pinned && <Pin className="h-3 w-3 shrink-0 text-mint" />}
                    {t.is_locked && <Lock className="h-3 w-3 shrink-0 text-muted-foreground" />}
                    <h3 className="truncate text-sm font-semibold">{t.title}</h3>
                  </div>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {t.author?.username ?? "Аноним"} · {new Date(t.created_at).toLocaleDateString("ru-RU", { day: "numeric", month: "short" })}
                  </p>
                </div>
              </div>
              <div className="hidden items-center justify-center gap-1 font-mono text-[11px] text-muted-foreground sm:flex">
                <MessageSquare className="h-3 w-3" /> {t.reply_count}
              </div>
              <div className="hidden items-center justify-center gap-1 font-mono text-[11px] text-muted-foreground sm:flex">
                <Eye className="h-3 w-3" /> {t.views}
              </div>
              <div className="hidden min-w-0 text-xs sm:block">
                <p className="truncate text-muted-foreground">{t.author?.username ?? "Аноним"}</p>
                <p className="mt-0.5 flex items-center gap-1 text-muted-foreground">
                  <Clock className="h-3 w-3 shrink-0" /> {timeAgo(t.last_activity_at)}
                </p>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
