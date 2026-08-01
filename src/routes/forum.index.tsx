import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { MessagesSquare, Users } from "lucide-react";
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

function ForumIndex() {
  const { data } = useSuspenseQuery(catsQuery);
  return (
    <div className="mx-auto max-w-4xl px-4 py-14">
      <div className="flex items-center gap-3">
        <div className="grid h-9 w-9 place-items-center rounded-lg bg-cyan/10 text-cyan">
          <MessagesSquare className="h-4 w-4" />
        </div>
        <span className="label-mono">Форум // {data.categories.length} категорий</span>
      </div>
      <h1 className="mt-4 text-3xl font-bold tracking-tight md:text-4xl">Форум</h1>
      <p className="mt-2 max-w-lg text-sm text-muted-foreground">
        Тематические обсуждения — микс, мастеринг, железо, барахолка, оффтоп.
      </p>

      <div className="mt-8 space-y-3">
        {data.categories.map((c) => (
          <Link
            key={c.id}
            to="/forum/$category"
            params={{ category: c.slug }}
            className="panel group flex items-center gap-4 rounded-2xl p-5 transition-all hover:-translate-y-0.5 hover:border-cyan/40"
          >
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-secondary text-2xl">{c.icon ?? "💬"}</span>
            <div className="min-w-0 flex-1">
              <h3 className="text-lg font-bold group-hover:text-cyan">{c.name}</h3>
              {c.description && <p className="truncate text-xs text-muted-foreground">{c.description}</p>}
            </div>
            <div className="hidden text-right font-mono text-[11px] uppercase tracking-wider text-muted-foreground sm:block">
              <div className="flex items-center gap-1"><Users className="h-3 w-3" />{c.thread_count} тем</div>
              {c.last_activity_at && (
                <div className="mt-1 text-[10px]">
                  {new Date(c.last_activity_at).toLocaleDateString("ru-RU", { day: "numeric", month: "short" })}
                </div>
              )}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
