import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { MessagesSquare, Clock, Pin, BarChart3, Rss } from "lucide-react";
import { getForumCategories, getForumActivity } from "@/lib/public.functions";
import { RouteError, RouteNotFound } from "@/components/route-fallbacks";

const catsQuery = queryOptions({ queryKey: ["forum-categories"], queryFn: () => getForumCategories() });
const activityQuery = queryOptions({ queryKey: ["forum-activity"], queryFn: () => getForumActivity() });

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
    context.queryClient.ensureQueryData(activityQuery);
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

/** One clickable forum row — icon, name+description, stats, last post. This
 * is always a real forum (has its own threads), never a bare group label —
 * see ForumIndex for how top-level "section" categories (which just group
 * these, like the reference's "Основной раздел") render separately. */
function ForumRow({ c }: { c: Cat }) {
  return (
    <Link
      to="/forum/$category"
      params={{ category: c.slug }}
      className="grid grid-cols-[auto_1fr] items-center gap-3 px-4 py-3 transition-colors hover:bg-foreground/[0.03] sm:grid-cols-[auto_1fr_auto_15rem]"
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

function RecentActivityWidget() {
  const { data } = useSuspenseQuery(activityQuery);
  return (
    <div className="panel overflow-hidden">
      <div className="flex items-center gap-2 border-b border-black/50 bg-black/20 px-3 py-2.5">
        <Rss className="h-3.5 w-3.5 text-cyan" />
        <h2 className="text-xs font-bold uppercase tracking-wide text-foreground">Последние сообщения</h2>
      </div>
      {data.recent.length === 0 ? (
        <p className="px-3 py-6 text-center text-xs text-muted-foreground">Пока тихо.</p>
      ) : (
        <ul className="divide-y divide-border/50">
          {data.recent.map((t) => (
            <li key={t.id}>
              <Link to="/forum/thread/$id" params={{ id: t.id }} className="flex gap-2.5 px-3 py-2.5 transition-colors hover:bg-foreground/[0.03]">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-secondary text-[11px] font-bold text-mint">
                  {(t.author?.username ?? "A")[0].toUpperCase()}
                </span>
                <div className="min-w-0">
                  <p className="flex items-center gap-1 truncate text-xs font-medium text-foreground/90">
                    {t.is_pinned && <Pin className="h-3 w-3 shrink-0 text-mint" />}
                    {t.title}
                  </p>
                  <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                    От: <span className="text-foreground/70">{t.author?.username ?? "Аноним"}</span> · {timeAgo(t.last_activity_at)}
                  </p>
                  {t.category && <p className="mt-0.5 truncate text-[10px] text-cyan/80">{t.category.name}</p>}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function StatsWidget() {
  const { data } = useSuspenseQuery(activityQuery);
  return (
    <div className="panel overflow-hidden">
      <div className="flex items-center gap-2 border-b border-black/50 bg-black/20 px-3 py-2.5">
        <BarChart3 className="h-3.5 w-3.5 text-mint" />
        <h2 className="text-xs font-bold uppercase tracking-wide text-foreground">Статистика форума</h2>
      </div>
      <dl className="grid grid-cols-3 divide-x divide-border/50 text-center">
        <div className="px-2 py-3">
          <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">Тем</dt>
          <dd className="mt-0.5 font-mono text-sm font-bold text-foreground">{data.stats.threads.toLocaleString("ru-RU")}</dd>
        </div>
        <div className="px-2 py-3">
          <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">Сообщ.</dt>
          <dd className="mt-0.5 font-mono text-sm font-bold text-foreground">{data.stats.posts.toLocaleString("ru-RU")}</dd>
        </div>
        <div className="px-2 py-3">
          <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">Участн.</dt>
          <dd className="mt-0.5 font-mono text-sm font-bold text-foreground">{data.stats.members.toLocaleString("ru-RU")}</dd>
        </div>
      </dl>
    </div>
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

  return (
    <div className="mx-auto max-w-6xl px-4 py-14">
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

      <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_20rem]">
        {/* Main: category tree. A top-level category with subforums is a
            bold section label grouping its children (real forums, each with
            their own stats); a childless top-level category is just its own
            forum row — same "no duplicate name" rule as before. */}
        <div className="min-w-0 space-y-5">
          {topLevel.map((parent) => {
            const children = (byParent.get(parent.id) ?? []).slice().sort((a, b) => a.order_index - b.order_index);
            if (children.length === 0) {
              return (
                <section key={parent.id} className="panel overflow-hidden">
                  <ForumRow c={parent} />
                </section>
              );
            }
            return (
              <section key={parent.id} className="panel overflow-hidden">
                <div className="flex items-center gap-2 border-b border-black/50 bg-black/20 px-4 py-2">
                  <span className="text-xs font-bold uppercase tracking-wide text-foreground">{parent.name}</span>
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

        {/* Sidebar: recent activity + stats — the "won't get unwieldy" part */}
        <aside className="space-y-4 lg:sticky lg:top-20 lg:self-start">
          <RecentActivityWidget />
          <StatsWidget />
        </aside>
      </div>
    </div>
  );
}
