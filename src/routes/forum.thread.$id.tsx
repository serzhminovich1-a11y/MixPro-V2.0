import { useEffect, useState } from "react";
import { createFileRoute, Link, notFound, useNavigate } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Send, Pin, PinOff, Lock, Unlock, Pencil, Trash2, X, Check, ChevronRight, BadgeCheck, Quote, Eye } from "lucide-react";
import { getForumThread } from "@/lib/public.functions";
import {
  createReply, togglePinThread, toggleLockThread,
  updateThread, deleteThread, updateReply, deleteReply,
} from "@/lib/community.functions";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useAdmin } from "@/hooks/use-admin";
import { ReportButton } from "@/components/report-button";
import { RouteError, RouteNotFound } from "@/components/route-fallbacks";
import { ROLE_LABEL, ROLE_DOT } from "@/lib/role-rules";

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

type Author = { id: string; username: string; avatar_url: string | null; level: number; verified: boolean; created_at: string; post_count: number; role: string | null } | null;

function PosterCard({ author }: { author: Author }) {
  return (
    <div className="flex shrink-0 flex-row items-center gap-3 border-b border-black/40 p-3 sm:w-40 sm:flex-col sm:items-center sm:border-b-0 sm:border-r sm:py-4 sm:text-center">
      <span className="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-full bg-secondary text-base font-bold text-mint sm:h-16 sm:w-16 sm:text-xl">
        {author?.avatar_url ? (
          <img src={author.avatar_url} alt="" className="h-full w-full object-cover" loading="lazy" />
        ) : (
          (author?.username ?? "A")[0].toUpperCase()
        )}
      </span>
      <div className="min-w-0 sm:mt-2">
        <p className="flex items-center gap-1 text-sm font-bold sm:justify-center">
          <span className="truncate">{author?.username ?? "Аноним"}</span>
          {author?.verified && <BadgeCheck className="h-3.5 w-3.5 shrink-0 text-cyan-300" />}
        </p>
        {author?.role && (
          <p className="mt-0.5 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide sm:justify-center" style={{ color: "var(--mint)" }}>
            <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${ROLE_DOT[author.role] ?? "bg-muted-foreground"}`} aria-hidden="true" />
            {ROLE_LABEL[author.role] ?? author.role}
          </p>
        )}
        <p className="mt-1 hidden font-mono text-[10px] text-muted-foreground sm:block">LVL {author?.level ?? 1}</p>
        <p className="hidden font-mono text-[10px] text-muted-foreground sm:block">Сообщений: {author?.post_count ?? 0}</p>
        <p className="hidden font-mono text-[10px] text-muted-foreground sm:block">
          На форуме с {author ? new Date(author.created_at).toLocaleDateString("ru-RU", { month: "short", year: "numeric" }) : "—"}
        </p>
      </div>
    </div>
  );
}

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

  // Fire-and-forget, same pattern as increment_post_play/increment_downloads
  // elsewhere — a public view counter needs no identity check, see the
  // migration. Once per mount, not once per render.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    supabase.rpc("increment_thread_views", { _thread_id: id }).then(() => {});
  }, [id]);

  if (!data.thread) return null;
  const t = data.thread;
  const isOwnThread = session?.user.id === t.author_id;

  function invalidate() {
    return qc.invalidateQueries({ queryKey: ["forum-thread", id] });
  }

  function quote(author: string | undefined, content: string) {
    const q = `> ${(author ?? "Аноним")}:\n> ${content.replace(/\n/g, "\n> ")}\n\n`;
    setReply((r) => q + r);
    document.getElementById("reply-box")?.scrollIntoView({ behavior: "smooth", block: "center" });
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
    <div className="mx-auto max-w-4xl px-4 py-14">
      {/* Breadcrumb */}
      <nav className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
        <Link to="/forum" className="hover:text-foreground">Форум</Link>
        {t.category && (
          <>
            <ChevronRight className="h-3 w-3" />
            <Link to="/forum/$category" params={{ category: t.category.slug }} className="hover:text-foreground">{t.category.name}</Link>
          </>
        )}
        <ChevronRight className="h-3 w-3" />
        <span className="truncate text-foreground">{t.title}</span>
      </nav>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {t.is_pinned && <Pin className="h-4 w-4 text-mint" />}
        {t.is_locked && <Lock className="h-4 w-4 text-muted-foreground" />}
        <h1 className="text-2xl font-bold">{t.title}</h1>
        <span className="ml-1 flex items-center gap-1 font-mono text-xs text-muted-foreground">
          <Eye className="h-3.5 w-3.5" /> {t.views}
        </span>
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

      {/* Posts — classic postbit: poster card on the side, content on the other */}
      <div className="mt-4 space-y-3">
        {/* Opening post (#1) */}
        <article className="panel flex flex-col overflow-hidden sm:flex-row">
          <PosterCard author={t.author as Author} />
          <div className="min-w-0 flex-1">
            <header className="flex items-center gap-2 border-b border-black/40 bg-black/20 px-4 py-1.5 text-[11px] text-muted-foreground">
              <span className="font-mono">#1</span>
              <span>·</span>
              <span className="font-mono">{new Date(t.created_at).toLocaleString("ru-RU")}</span>
              <div className="ml-auto flex items-center gap-1">
                {(isOwnThread || canModerate) && !editingThread && (
                  <>
                    <button onClick={startEditThread} className="rounded p-1 text-muted-foreground hover:bg-secondary hover:text-foreground" title="Редактировать">
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button onClick={removeThread} className="rounded p-1 text-muted-foreground hover:bg-destructive/20 hover:text-destructive" title="Удалить">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </>
                )}
                <ReportButton targetType="thread" targetId={t.id} compact />
              </div>
            </header>
            <div className="p-4">
              {editingThread ? (
                <div className="space-y-2">
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
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">{t.content}</p>
              )}
            </div>
          </div>
        </article>

        {/* Replies (#2, #3, ...) */}
        {data.replies.map((r, i) => {
          const isOwnReply = session?.user.id === r.author_id;
          const isEditingThis = editingReplyId === r.id;
          return (
            <article key={r.id} className="panel flex flex-col overflow-hidden sm:flex-row">
              <PosterCard author={r.author as Author} />
              <div className="min-w-0 flex-1">
                <header className="flex items-center gap-2 border-b border-black/40 bg-black/20 px-4 py-1.5 text-[11px] text-muted-foreground">
                  <span className="font-mono">#{i + 2}</span>
                  <span>·</span>
                  <span className="font-mono">{new Date(r.created_at).toLocaleString("ru-RU")}</span>
                  <div className="ml-auto flex items-center gap-1">
                    {!t.is_locked && session && !isEditingThis && (
                      <button onClick={() => quote(r.author?.username, r.content)} className="rounded p-1 text-muted-foreground hover:bg-secondary hover:text-foreground" title="Цитировать">
                        <Quote className="h-3.5 w-3.5" />
                      </button>
                    )}
                    {(isOwnReply || canModerate) && !isEditingThis && (
                      <>
                        <button onClick={() => startEditReply(r.id, r.content)} className="rounded p-1 text-muted-foreground hover:bg-secondary hover:text-foreground" title="Редактировать">
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button onClick={() => removeReply(r.id)} className="rounded p-1 text-muted-foreground hover:bg-destructive/20 hover:text-destructive" title="Удалить">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </>
                    )}
                    <ReportButton targetType="reply" targetId={r.id} compact />
                  </div>
                </header>
                <div className="p-4">
                  {isEditingThis ? (
                    <div className="space-y-2">
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
                    <p className="whitespace-pre-wrap text-sm text-foreground/90">{r.content}</p>
                  )}
                </div>
              </div>
            </article>
          );
        })}
        {data.replies.length === 0 && (
          <p className="py-6 text-center text-sm text-muted-foreground">Ответов пока нет.</p>
        )}
      </div>

      {t.is_locked ? (
        <div className="glass mt-8 rounded-xl p-4 text-center text-xs text-muted-foreground">
          <Lock className="mx-auto h-4 w-4" /> Тема закрыта для новых ответов
        </div>
      ) : session ? (
        <form id="reply-box" onSubmit={submit} className="glass mt-8 rounded-2xl p-4">
          <textarea
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            placeholder="Напиши ответ..."
            rows={4}
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
