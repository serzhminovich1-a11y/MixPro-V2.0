import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { MessagesSquare, MessageSquare, Users, Clock } from "lucide-react";
import { getForumCategories } from "@/lib/public.functions";
import { RouteError, RouteNotFound } from "@/components/route-fallbacks";

const catsQuery = queryOptions({ queryKey: ["forum-categories"], queryFn: () => getForumCategories() });

export const Route = createFileRoute("/forum/")({
  head: () => ({
    meta: [
      { title: "Форум звукорежиссёров — MixPro" },
      { name: "description", content: "Обсуждения микса, мастеринга, оборудования и барахолка. Задавай вопросы и делись опытом." },
      { property: "og:title", content: "Форум — MixPro" },
      { property: "og:description", content: "Обсуждения микса, мастеринга и железа." },
    ],
  }),
  loader: ({ context }) => {
    context.queryClient.ensureQueryData(catsQuery);
  },
  component: ForumIndex,
  errorComponent: RouteError,
  notFoundComponent: RouteNotFound,
});

type Cat = ReturnType<typeof useSuspenseQuery<Awaited<ReturnType<typeof getForumCategories>>>>["data"]["categories"][number];

function timeAgo(iso: string) {
  const d = new Date(iso);
  const diffMin = Math.round((Date.now() - d.getTime()) / 60000);
  if (diffMin < 1) return "только что";
  if (diffMin < 60) return `${diffMin} мин назад`;
  const diffH = Math.round(diffMin / 60);
  if (diffH < 24) return `${diffH} ч назад`;
  return d.toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
}

/** One clickable forum/subforum row — icon, name+description, stats, last post. */
function ForumRow({ c }: { c: Cat }) {
  return (
    <Link
      to="/forum/$category"
      params={{ category: c.slug }}
      className="grid grid-cols-[auto_1fr] items-center gap-3 px-4 py-3 transition-colors hover:bg-foreground/[0.03] sm:grid-cols-[auto_1fr_auto_16rem]"
    >
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-secondary text-xl">{c.icon ?? "💬"}</span>
      <div className="min-w-0">
        <h3 className="truncate text-sm font-semibold text-foreground">{c.name}</h3>
        {c.description && <p className="mt-0.5 truncate text-xs text-muted-foreground">{c.description}</p>}
      </div>
      <div className="col-span-2 mt-1 flex items-center gap-4 font-mono text-[11px] text-muted-foreground sm:col-span-1 sm:mt-0 sm:flex-col sm:items-end sm:gap-0 sm:text-right sm:w-24">
        <span>{c.thread_count} тем</span>
        <span>{c.post_count} сообщ.</span>
      </div>
      <div className="col-span-2 min-w-0 border-t border-border/50 pt-2 text-xs sm:col-span-1 sm:border-t-0 sm:border-l sm:border-border/50 sm:pl-4 sm:pt-0">
        {c.last_thread ? (
          <>
            <p className="truncate font-medium text-foreground/90">{c.last_thread.title}</p>
            <p className="mt-0.5 flex items-center gap-1 text-muted-foreground">
              <span className="truncate">{c.last_thread.author?.username ?? "Аноним"}</span>
              <span>·</span>
              <Clock className="h-3 w-3 shrink-0" />
              {timeAgo(c.last_thread.at)}
            </p>
          </>
        ) : (
          <p className="text-muted-foreground">Пока нет тем</p>
        )}
      </div>
    </Link>
  );
}

function ForumIndex() {
  const { data } = useSuspenseQuery(catsQuery);
  const cats = data.categories as Cat[];
  const byParent = new Map<string | null, Cat[]>();
  for (const c of cats) {
    const key = c.parent_id ?? null;
    const arr = byParent.get(key) ?? [];
    arr.push(c);
    byParent.set(key, arr);
  }
  const topLevel = (byParent.get(null) ?? []).slice().sort((a, b) => a.order_index - b.order_index);
  const totalThreads = cats.reduce((n, c) => n + c.thread_count, 0);
  const totalPosts = cats.reduce((n, c) => n + c.post_count, 0);

  return (
    <div className="mx-auto max-w-4xl px-4 py-14">
      <div className="flex items-center gap-3">
        <div className="grid h-9 w-9 place-items-center rounded-lg bg-cyan/10 text-cyan">
          <MessagesSquare className="h-4 w-4" />
        </div>
        <span className="label-mono">Форум // {cats.length} разделов</span>
      </div>
      <h1 className="mt-4 text-3xl font-bold tracking-tight md:text-4xl">Форум</h1>
      <p className="mt-2 max-w-lg text-sm text-muted-foreground">
        Тематические обсуждения — микс, мастеринг, железо, барахолка, оффтоп.
      </p>

      <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-1 rounded-lg border border-border/60 bg-card/30 px-4 py-2.5 font-mono text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1.5"><MessageSquare className="h-3 w-3" /> {totalThreads} тем</span>
        <span className="flex items-center gap-1.5"><MessagesSquare className="h-3 w-3" /> {totalPosts} сообщений</span>
        <span className="flex items-center gap-1.5"><Users className="h-3 w-3" /> {cats.length} разделов</span>
      </div>

      <div className="mt-6 space-y-5">
        {topLevel.map((parent) => {
          const children = (byParent.get(parent.id) ?? []).slice().sort((a, b) => a.order_index - b.order_index);
          // No subforums under it — it holds threads directly, so it's just
          // its own row, not a section header repeating the same name.
          if (children.length === 0) {
            return (
              <section key={parent.id} className="panel overflow-hidden">
                <ForumRow c={parent} />
              </section>
            );
          }
          return (
            <section key={parent.id} className="panel overflow-hidden">
              <div className="flex items-center gap-2 border-b border-black/50 bg-black/20 px-4 py-2.5">
                <span className="text-base leading-none">{parent.icon ?? "📁"}</span>
                <h2 className="text-sm font-bold tracking-wide text-foreground">{parent.name}</h2>
                {parent.description && <span className="hidden truncate text-xs text-muted-foreground sm:inline">— {parent.description}</span>}
              </div>
              <div className="divide-y divide-border/50">
                {children.map((c) => <ForumRow key={c.id} c={c} />)}
              </div>
            </section>
          );
        })}
        {topLevel.length === 0 && (
          <p className="py-10 text-center text-sm text-muted-foreground">Разделов пока нет.</p>
        )}
      </div>
    </div>
  );
}
