import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { Bell, Check, CheckCheck, Play, Trash2, AtSign, MessagesSquare } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { MentionText } from "@/lib/mentions";

export const Route = createFileRoute("/_authenticated/notifications")({
  component: NotificationsPage,
  errorComponent: ({ error }) => (
    <div className="mx-auto max-w-3xl p-6 text-sm text-destructive">Ошибка: {error.message}</div>
  ),
  notFoundComponent: () => (
    <div className="mx-auto max-w-3xl p-6 text-sm text-muted-foreground">Нет уведомлений.</div>
  ),
  head: () => ({
    meta: [
      { title: "Уведомления — MixPro" },
      { name: "description", content: "Мои упоминания и уведомления на MixPro." },
    ],
  }),
});

export type NotificationRow = {
  id: string;
  user_id: string;
  actor_id: string | null;
  type: string;
  post_id: string | null;
  track_index: number | null;
  comment_id: string | null;
  thread_id: string | null;
  timestamp_ms: number | null;
  snippet: string | null;
  is_read: boolean;
  created_at: string;
  actor?: { username: string; avatar_url: string | null; avatarSigned?: string | null } | null;
};

async function signAvatar(path: string | null): Promise<string | null> {
  if (!path) return null;
  if (path.startsWith("http")) return path;
  const { data } = await supabase.storage.from("avatars").createSignedUrl(path, 3600);
  return data?.signedUrl ?? null;
}

export async function fetchNotifications(userId: string): Promise<NotificationRow[]> {
  const { data } = await supabase
    .from("notifications")
    .select("id, user_id, actor_id, type, post_id, track_index, comment_id, thread_id, timestamp_ms, snippet, is_read, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(100);
  const rows = (data ?? []) as NotificationRow[];
  const actorIds = Array.from(new Set(rows.map((r) => r.actor_id).filter(Boolean))) as string[];
  if (actorIds.length) {
    const { data: profs } = await supabase.from("profiles").select("id, username, avatar_url").in("id", actorIds);
    const map = new Map<string, { username: string; avatar_url: string | null; avatarSigned?: string | null }>();
    for (const p of profs ?? []) {
      const signed = await signAvatar(p.avatar_url);
      map.set(p.id, { username: p.username, avatar_url: p.avatar_url, avatarSigned: signed });
    }
    for (const r of rows) if (r.actor_id) r.actor = map.get(r.actor_id) ?? null;
  }
  return rows;
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  const now = Date.now();
  const diff = (now - d.getTime()) / 1000;
  if (diff < 60) return "только что";
  if (diff < 3600) return `${Math.floor(diff / 60)} мин назад`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} ч назад`;
  return d.toLocaleString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

function fmtMs(ms: number | null): string | null {
  if (ms == null) return null;
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`;
}

function NotificationsPage() {
  const { user } = Route.useRouteContext();
  const navigate = useNavigate();
  const [rows, setRows] = useState<NotificationRow[]>([]);
  const [filter, setFilter] = useState<"all" | "unread" | "mentions">("all");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const list = await fetchNotifications(user.id);
    setRows(list);
    setLoading(false);
  }, [user.id]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const channel = supabase
      .channel("notifications-list")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` },
        () => { load(); },
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user.id, load]);

  async function markRead(id: string) {
    await supabase.from("notifications").update({ is_read: true }).eq("id", id);
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, is_read: true } : r)));
  }

  async function markAll() {
    await supabase.from("notifications").update({ is_read: true }).eq("user_id", user.id).eq("is_read", false);
    setRows((prev) => prev.map((r) => ({ ...r, is_read: true })));
  }

  async function remove(id: string) {
    await supabase.from("notifications").delete().eq("id", id);
    setRows((prev) => prev.filter((r) => r.id !== id));
  }

  async function open(n: NotificationRow) {
    if (!n.is_read) await markRead(n.id);
    if (n.type === "mention_track_comment" && n.post_id) {
      navigate({
        to: "/post/$postId",
        params: { postId: n.post_id },
        search: { track: n.track_index ?? 0, t: n.timestamp_ms ?? 0 },
      } as never);
    } else if (n.type === "forum_reply" && n.thread_id) {
      navigate({ to: "/forum/thread/$id", params: { id: n.thread_id } });
    }
  }

  const filtered = rows.filter((r) => {
    if (filter === "unread") return !r.is_read;
    if (filter === "mentions") return r.type === "mention_track_comment";
    return true;
  });

  const unreadCount = rows.filter((r) => !r.is_read).length;
  const mentionCount = rows.filter((r) => r.type === "mention_track_comment").length;

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4 md:p-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="flex items-center gap-2 text-xl font-bold tracking-tight">
          <Bell className="h-5 w-5 text-mint" /> Уведомления
        </h1>
        {unreadCount > 0 && (
          <span className="rounded-full bg-mint/20 px-2 py-0.5 text-[10px] font-bold text-mint">{unreadCount} новых</span>
        )}
        <div className="ml-auto flex items-center gap-1">
          <button
            onClick={markAll}
            disabled={unreadCount === 0}
            className="inline-flex items-center gap-1 rounded-md border border-border bg-secondary/40 px-2.5 py-1 text-[11px] text-muted-foreground hover:bg-secondary hover:text-foreground disabled:opacity-40"
          >
            <CheckCheck className="h-3 w-3" /> Прочитать всё
          </button>
        </div>
      </div>

      <div className="flex items-center gap-1 text-[11px]">
        {(
          [
            { id: "all", label: `Все (${rows.length})` },
            { id: "unread", label: `Непрочитанные (${unreadCount})` },
            { id: "mentions", label: `@упоминания (${mentionCount})` },
          ] as const
        ).map((tab) => (
          <button
            key={tab.id}
            onClick={() => setFilter(tab.id)}
            className={`rounded-full border px-3 py-1 transition ${filter === tab.id ? "border-mint bg-mint/15 text-mint" : "border-border bg-secondary/30 text-muted-foreground hover:text-foreground"}`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="p-6 text-center text-sm text-muted-foreground">Загружаем…</p>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-background/40 p-8 text-center">
          <Bell className="mx-auto h-8 w-8 text-muted-foreground/50" />
          <p className="mt-2 text-sm text-muted-foreground">
            {filter === "mentions" ? "Тебя ещё никто не упомянул." : filter === "unread" ? "Все прочитано ✓" : "Пока пусто."}
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {filtered.map((n) => {
            const stamp = fmtMs(n.timestamp_ms);
            const isMention = n.type === "mention_track_comment";
            const isForumReply = n.type === "forum_reply";
            return (
              <li
                key={n.id}
                className={`group relative flex items-start gap-3 rounded-xl border p-3 transition ${n.is_read ? "border-border/60 bg-background/30" : "border-mint/50 bg-mint/5"}`}
              >
                <div className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-full bg-secondary text-xs font-bold text-mint">
                  {n.actor?.avatarSigned ? (
                    <img src={n.actor.avatarSigned} className="h-full w-full object-cover" alt="" />
                  ) : (
                    (n.actor?.username ?? "?")[0]?.toUpperCase() ?? "?"
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    {n.actor?.username ? (
                      <Link to="/u/$username" params={{ username: n.actor.username }} className="font-semibold text-foreground hover:text-mint">
                        @{n.actor.username}
                      </Link>
                    ) : (
                      <span className="font-semibold text-foreground">Кто-то</span>
                    )}
                    {isMention && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-violet-500/15 px-2 py-0.5 text-[10px] font-medium text-violet-300">
                        <AtSign className="h-2.5 w-2.5" /> упомянул тебя
                      </span>
                    )}
                    {isForumReply && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-cyan-500/15 px-2 py-0.5 text-[10px] font-medium text-cyan-300">
                        <MessagesSquare className="h-2.5 w-2.5" /> ответил в твоей теме
                      </span>
                    )}
                    {stamp && (
                      <span className="inline-flex items-center gap-1 rounded bg-mint/15 px-1.5 py-0.5 font-mono text-[10px] text-mint">
                        <Play className="h-2.5 w-2.5 fill-current" /> {stamp}
                      </span>
                    )}
                    <span className="ml-auto text-[10px] text-muted-foreground">{fmtDate(n.created_at)}</span>
                  </div>
                  {n.snippet && (
                    <button
                      onClick={() => open(n)}
                      className="mt-1 block w-full rounded-lg bg-secondary/40 px-3 py-2 text-left text-sm text-foreground/90 hover:bg-secondary"
                    >
                      <MentionText text={n.snippet} />
                    </button>
                  )}
                  <div className="mt-2 flex items-center gap-2">
                    {isMention && n.post_id && (
                      <button
                        onClick={() => open(n)}
                        className="inline-flex items-center gap-1 rounded-md border border-mint/40 bg-mint/10 px-2 py-1 text-[11px] text-mint hover:bg-mint/20"
                      >
                        <Play className="h-3 w-3" />
                        Перейти {stamp ? `к ${stamp}` : "к треку"}
                      </button>
                    )}
                    {isForumReply && n.thread_id && (
                      <button
                        onClick={() => open(n)}
                        className="inline-flex items-center gap-1 rounded-md border border-cyan/40 bg-cyan/10 px-2 py-1 text-[11px] text-cyan hover:bg-cyan/20"
                      >
                        <MessagesSquare className="h-3 w-3" />
                        Перейти к теме
                      </button>
                    )}
                    {!n.is_read && (
                      <button
                        onClick={() => markRead(n.id)}
                        className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
                      >
                        <Check className="h-3 w-3" /> Прочитано
                      </button>
                    )}
                    <button
                      onClick={() => remove(n.id)}
                      className="ml-auto inline-flex items-center gap-1 text-[11px] text-muted-foreground opacity-0 hover:text-destructive group-hover:opacity-100"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
