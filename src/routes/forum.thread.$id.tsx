import { useState } from "react";
import { createFileRoute, Link, notFound, useNavigate } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Send, Pin, PinOff, Lock, Unlock, Pencil, Trash2, X, Check } from "lucide-react";
import { getForumThread } from "@/lib/public.functions";
import {
  createReply, togglePinThread, toggleLockThread,
  updateThread, deleteThread, updateReply, deleteReply,
} from "@/lib/community.functions";
import { useAuth } from "@/hooks/use-auth";
import { useAdmin } from "@/hooks/use-admin";
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
  const { canModerate } = useAdmin();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);
  const [editingThread, setEditingThread] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editContent, setEditContent] = useState("");
  const [editingReplyId, setEditingReplyId] = useState<string | null>(null);
  const [editReplyContent, setEditReplyContent] = useState("");
  const send = useServerFn(createReply);
  const pin = useServerFn(togglePinThread);
  const lock = useServerFn(toggleLockThread);
  const editThreadFn = useServerFn(updateThread);
  const removeThreadFn = useServerFn(deleteThread);
  const editReplyFn = useServerFn(updateReply);
  const removeReplyFn = useServerFn(deleteReply);

  if (!data.thread) return null;
  const t = data.thread;
  const isOwnThread = session?.user.id === t.author_id;

  function invalidate() {
    return qc.invalidateQueries({ queryKey: ["forum-thread", id] });
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!reply.trim()) return;
    setBusy(true);
    try {
      await send({ data: { threadId: id, content: reply.trim() } });
      setReply("");
      await invalidate();
      toast.success("Ответ отправлен");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function doPin() {
    try {
      await pin({ data: { threadId: id, pinned: !t.is_pinned } });
      await invalidate();
    } catch (e) { toast.error((e as Error).message); }
  }

  async function doLock() {
    try {
      await lock({ data: { threadId: id, locked: !t.is_locked } });
      await invalidate();
    } catch (e) { toast.error((e as Error).message); }
  }

  function startEditThread() {
    setEditTitle(t.title);
    setEditContent(t.content);
    setEditingThread(true);
  }

  async function saveThreadEdit() {
    if (editTitle.trim().length < 4 || editContent.trim().length < 4) return;
    try {
      await editThreadFn({ data: { threadId: id, title: editTitle.trim(), content: editContent.trim() } });
      setEditingThread(false);
      await invalidate();
      toast.success("Тема обновлена");
    } catch (e) { toast.error((e as Error).message); }
  }

  async function removeThread() {
    if (!confirm("Удалить тему целиком, вместе со всеми ответами?")) return;
    try {
      await removeThreadFn({ data: { threadId: id } });
      toast.success("Тема удалена");
      navigate({ to: "/forum/$category", params: { category: t.category?.slug ?? "" } });
    } catch (e) { toast.error((e as Error).message); }
  }

  function startEditReply(replyId: string, content: string) {
    setEditingReplyId(replyId);
    setEditReplyContent(content);
  }

  async function saveReplyEdit() {
    if (!editingReplyId || !editReplyContent.trim()) return;
    try {
      await editReplyFn({ data: { replyId: editingReplyId, content: editReplyContent.trim() } });
      setEditingReplyId(null);
      await invalidate();
      toast.success("Ответ обновлён");
    } catch (e) { toast.error((e as Error).message); }
  }

  async function removeReply(replyId: string) {
    if (!confirm("Удалить ответ?")) return;
    try {
      await removeReplyFn({ data: { replyId } });
      await invalidate();
      toast.success("Ответ удалён");
    } catch (e) { toast.error((e as Error).message); }
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
        {canModerate && (
          <div className="ml-auto flex items-center gap-1">
            <button
              onClick={doPin}
              className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[10px] font-semibold ${t.is_pinned ? "border-mint/50 bg-mint/15 text-mint" : "border-border text-muted-foreground hover:text-foreground"}`}
            >
              {t.is_pinned ? <PinOff className="h-3 w-3" /> : <Pin className="h-3 w-3" />} {t.is_pinned ? "Открепить" : "Закрепить"}
            </button>
            <button
              onClick={doLock}
              className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[10px] font-semibold ${t.is_locked ? "border-destructive/50 bg-destructive/15 text-destructive" : "border-border text-muted-foreground hover:text-foreground"}`}
            >
              {t.is_locked ? <Unlock className="h-3 w-3" /> : <Lock className="h-3 w-3" />} {t.is_locked ? "Разблокировать" : "Закрыть"}
            </button>
          </div>
        )}
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
          {(isOwnThread || canModerate) && !editingThread && (
            <>
              <button onClick={startEditThread} className="rounded p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground" title="Редактировать">
                <Pencil className="h-3.5 w-3.5" />
              </button>
              <button onClick={removeThread} className="rounded p-1.5 text-muted-foreground hover:bg-destructive/20 hover:text-destructive" title="Удалить">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </>
          )}
          <ReportButton targetType="thread" targetId={t.id} compact />
        </header>
        {editingThread ? (
          <div className="mt-3 space-y-2">
            <input
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              maxLength={140}
              className="w-full rounded border border-input bg-background px-3 py-2 text-sm"
            />
            <textarea
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              rows={5}
              maxLength={8000}
              className="w-full resize-none rounded border border-input bg-background px-3 py-2 text-sm"
            />
            <div className="flex justify-end gap-2">
              <button onClick={() => setEditingThread(false)} className="inline-flex items-center gap-1 rounded border border-border bg-secondary px-3 py-1.5 text-xs">
                <X className="h-3 w-3" /> Отмена
              </button>
              <button onClick={saveThreadEdit} className="inline-flex items-center gap-1 rounded bg-mint px-3 py-1.5 text-xs font-bold text-black">
                <Check className="h-3 w-3" /> Сохранить
              </button>
            </div>
          </div>
        ) : (
          <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">{t.content}</p>
        )}
      </article>

      <div className="mt-6 space-y-3">
        {data.replies.map((r) => {
          const isOwnReply = session?.user.id === r.author_id;
          const isEditingThis = editingReplyId === r.id;
          return (
            <article key={r.id} className="panel rounded-xl p-4">
              <header className="flex items-center gap-2">
                <span className="grid h-7 w-7 place-items-center rounded-full bg-secondary text-xs font-bold text-cyan">
                  {(r.author?.username ?? "A")[0].toUpperCase()}
                </span>
                <span className="text-xs font-semibold">{r.author?.username ?? "Аноним"}</span>
                <span className="text-[10px] text-muted-foreground">
                  · {new Date(r.created_at).toLocaleString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                </span>
                <div className="ml-auto flex items-center gap-1">
                  {(isOwnReply || canModerate) && !isEditingThis && (
                    <>
                      <button onClick={() => startEditReply(r.id, r.content)} className="rounded p-1 text-muted-foreground hover:bg-secondary hover:text-foreground" title="Редактировать">
                        <Pencil className="h-3 w-3" />
                      </button>
                      <button onClick={() => removeReply(r.id)} className="rounded p-1 text-muted-foreground hover:bg-destructive/20 hover:text-destructive" title="Удалить">
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </>
                  )}
                  <ReportButton targetType="reply" targetId={r.id} compact />
                </div>
              </header>
              {isEditingThis ? (
                <div className="mt-2 space-y-2">
                  <textarea
                    value={editReplyContent}
                    onChange={(e) => setEditReplyContent(e.target.value)}
                    rows={3}
                    maxLength={4000}
                    className="w-full resize-none rounded border border-input bg-background px-3 py-2 text-sm"
                  />
                  <div className="flex justify-end gap-2">
                    <button onClick={() => setEditingReplyId(null)} className="inline-flex items-center gap-1 rounded border border-border bg-secondary px-2.5 py-1 text-[11px]">
                      <X className="h-3 w-3" /> Отмена
                    </button>
                    <button onClick={saveReplyEdit} className="inline-flex items-center gap-1 rounded bg-mint px-2.5 py-1 text-[11px] font-bold text-black">
                      <Check className="h-3 w-3" /> Сохранить
                    </button>
                  </div>
                </div>
              ) : (
                <p className="mt-2 whitespace-pre-wrap text-sm text-foreground/90">{r.content}</p>
              )}
            </article>
          );
        })}
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
