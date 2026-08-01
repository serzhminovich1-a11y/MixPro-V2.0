import { useState } from "react";
import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Send, Pin, Lock } from "lucide-react";
import { getForumThread } from "@/lib/public.functions";
import { createReply } from "@/lib/community.functions";
import { useAuth } from "@/hooks/use-auth";
import { ReportButton } from "@/components/report-button";
import { RouteError, RouteNotFound } from "@/components/route-fallbacks";

const threadQuery = (id: string) =>
  queryOptions({ queryKey: ["forum-thread", id], queryFn: () => getForumThread({ data: { id } }) });

export const Route = createFileRoute("/forum/thread/$id")({
  loader: async ({ context, params }) => {
    const res = await context.queryClient.ensureQueryData(threadQuery(params.id));
    if (!res.thread) throw notFound();
    return { title: res.thread.title };
  },
  head: ({ loaderData }) => {
    if (!loaderData) return { meta: [{ title: "Тема не найдена — MixPro" }, { name: "robots", content: "noindex" }] };
    return {
      meta: [
        { title: `${loaderData.title} — Форум MixPro` },
        { name: "description", content: `Обсуждение «${loaderData.title}» на форуме звукорежиссёров MixPro.` },
        { property: "og:title", content: `${loaderData.title} — Форум MixPro` },
      ],
    };
  },
  component: ThreadPage,
  errorComponent: RouteError,
  notFoundComponent: RouteNotFound,
});

function ThreadPage() {
  const { id } = Route.useParams();
  const { data } = useSuspenseQuery(threadQuery(id));
  const { session } = useAuth();
  const qc = useQueryClient();
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);
  const send = useServerFn(createReply);

  if (!data.thread) return null;
  const t = data.thread;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!reply.trim()) return;
    setBusy(true);
    try {
      await send({ data: { threadId: id, content: reply.trim() } });
      setReply("");
      qc.invalidateQueries({ queryKey: ["forum-thread", id] });
      toast.success("Ответ отправлен");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-14">
      {t.category && (
        <Link to="/forum/$category" params={{ category: t.category.slug }} className="text-sm text-muted-foreground hover:text-foreground">
          ← {t.category.name}
        </Link>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {t.is_pinned && <Pin className="h-4 w-4 text-mint" />}
        {t.is_locked && <Lock className="h-4 w-4 text-muted-foreground" />}
        <h1 className="text-2xl font-bold">{t.title}</h1>
      </div>

      <article className="glass mt-4 rounded-2xl p-5">
        <header className="flex items-center gap-3">
          <span className="grid h-9 w-9 place-items-center rounded-full bg-secondary text-sm font-bold text-mint">
            {(t.author?.username ?? "A")[0].toUpperCase()}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{t.author?.username ?? "Аноним"}</p>
            <p className="text-xs text-muted-foreground">
              {new Date(t.created_at).toLocaleString("ru-RU")}
            </p>
          </div>
          <ReportButton targetType="thread" targetId={t.id} compact />
        </header>
        <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">{t.content}</p>
      </article>

      <div className="mt-6 space-y-3">
        {data.replies.map((r) => (
          <article key={r.id} className="panel rounded-xl p-4">
            <header className="flex items-center gap-2">
              <span className="grid h-7 w-7 place-items-center rounded-full bg-secondary text-xs font-bold text-cyan">
                {(r.author?.username ?? "A")[0].toUpperCase()}
              </span>
              <span className="text-xs font-semibold">{r.author?.username ?? "Аноним"}</span>
              <span className="text-[10px] text-muted-foreground">
                · {new Date(r.created_at).toLocaleString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
              </span>
              <div className="ml-auto">
                <ReportButton targetType="reply" targetId={r.id} compact />
              </div>
            </header>
            <p className="mt-2 whitespace-pre-wrap text-sm text-foreground/90">{r.content}</p>
          </article>
        ))}
        {data.replies.length === 0 && (
          <p className="text-center text-sm text-muted-foreground py-6">Ответов пока нет.</p>
        )}
      </div>

      {t.is_locked ? (
        <div className="glass mt-8 rounded-xl p-4 text-center text-xs text-muted-foreground">
          <Lock className="mx-auto h-4 w-4" /> Тема закрыта для новых ответов
        </div>
      ) : session ? (
        <form onSubmit={submit} className="glass mt-8 rounded-2xl p-4">
          <textarea
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            placeholder="Напиши ответ..."
            rows={3}
            maxLength={4000}
            className="w-full resize-none rounded border border-input bg-background px-3 py-2 text-sm"
          />
          <div className="mt-2 flex justify-end">
            <button
              type="submit"
              disabled={busy || !reply.trim()}
              className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
            >
              <Send className="h-4 w-4" /> Ответить
            </button>
          </div>
        </form>
      ) : (
        <div className="glass mt-8 rounded-xl p-4 text-center text-sm text-muted-foreground">
          <Link to="/auth" className="text-primary hover:underline">Войдите</Link>, чтобы ответить.
        </div>
      )}
    </div>
  );
}
