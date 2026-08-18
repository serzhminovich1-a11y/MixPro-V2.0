import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link, useNavigate } from "@tanstack/react-router";
import { Bell, AtSign, MessagesSquare, Play, CheckCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { fetchNotifications, type NotificationRow } from "@/routes/_authenticated/notifications";

function fmtMs(ms: number | null): string | null {
  if (ms == null) return null;
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`;
}
function fmtAgo(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return "сейчас";
  if (diff < 3600) return `${Math.floor(diff / 60)}м`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}ч`;
  return `${Math.floor(diff / 86400)}д`;
}

export function NotificationsBell() {
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  const [rows, setRows] = useState<NotificationRow[]>([]);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  const load = useCallback(async () => {
    if (!userId) return;
    const list = await fetchNotifications(userId);
    setRows(list.slice(0, 10));
  }, [userId]);

  useEffect(() => { if (userId) load(); }, [userId, load]);

  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel(`notif-bell-${userId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` },
        () => { load(); },
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [userId, load]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      // Panel is portaled to <body> (see render below) so it's not a DOM
      // descendant of wrapRef anymore — check both.
      if (wrapRef.current?.contains(t) || panelRef.current?.contains(t)) return;
      setOpen(false);
    };
    window.addEventListener("mousedown", onDoc);
    return () => window.removeEventListener("mousedown", onDoc);
  }, [open]);

  // The nav toolbar strip this button lives in scrolls horizontally
  // (overflow-x-auto), which per the CSS spec forces its overflow-y to
  // "auto" too — an absolutely-positioned dropdown nested inside it gets
  // clipped instead of extending below the header. Portal the panel to
  // <body> instead and position it from the button's own screen position.
  useEffect(() => {
    if (!open) return;
    const update = () => {
      const r = wrapRef.current?.getBoundingClientRect();
      if (r) setPos({ top: r.bottom + 4, right: window.innerWidth - r.right });
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [open]);

  if (!userId) return null;

  const unread = rows.filter((r) => !r.is_read).length;

  async function openItem(n: NotificationRow) {
    if (!n.is_read) {
      await supabase.from("notifications").update({ is_read: true }).eq("id", n.id);
      setRows((prev) => prev.map((r) => (r.id === n.id ? { ...r, is_read: true } : r)));
    }
    setOpen(false);
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

  async function markAll() {
    if (!userId) return;
    await supabase.from("notifications").update({ is_read: true }).eq("user_id", userId).eq("is_read", false);
    setRows((prev) => prev.map((r) => ({ ...r, is_read: true })));
  }

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="nav-tool-btn relative inline-flex items-center gap-1 px-2 py-1 text-[10px] font-bold uppercase tracking-wider"
        title="Уведомления"
        aria-label="Уведомления"
      >
        <Bell className="h-3 w-3" />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 grid h-3.5 min-w-[14px] place-items-center rounded-full bg-[color:var(--destructive)] px-1 text-[9px] font-bold leading-none text-white">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>

      {open && pos && createPortal(
        <div
          ref={panelRef}
          style={{ position: "fixed", top: pos.top, right: pos.right }}
          className="nav-dropdown z-50 w-[340px] max-w-[92vw] overflow-hidden rounded-lg border border-border bg-popover shadow-xl"
        >
          <div className="flex items-center gap-2 border-b border-border/70 px-3 py-2 text-[11px]">
            <Bell className="h-3 w-3 text-mint" />
            <span className="font-semibold uppercase tracking-wider">Уведомления</span>
            {unread > 0 && <span className="rounded-full bg-mint/20 px-1.5 py-0.5 text-[9px] font-bold text-mint">{unread}</span>}
            <button
              onClick={markAll}
              disabled={unread === 0}
              className="ml-auto inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground disabled:opacity-40"
            >
              <CheckCheck className="h-3 w-3" /> прочитать
            </button>
          </div>

          <div className="max-h-96 overflow-y-auto">
            {rows.length === 0 ? (
              <p className="px-3 py-6 text-center text-xs text-muted-foreground">Пока пусто.</p>
            ) : (
              <ul className="divide-y divide-border/60">
                {rows.map((n) => {
                  const stamp = fmtMs(n.timestamp_ms);
                  const isMention = n.type === "mention_track_comment";
                  const isForumReply = n.type === "forum_reply";
                  return (
                    <li key={n.id}>
                      <button
                        type="button"
                        onClick={() => openItem(n)}
                        className={`flex w-full items-start gap-2 px-3 py-2 text-left transition hover:bg-secondary/50 ${n.is_read ? "" : "bg-mint/[0.06]"}`}
                      >
                        <div className="grid h-8 w-8 shrink-0 place-items-center overflow-hidden rounded-full bg-secondary text-[10px] font-bold text-mint">
                          {n.actor?.avatarSigned ? (
                            <img src={n.actor.avatarSigned} className="h-full w-full object-cover" alt="" />
                          ) : (
                            (n.actor?.username ?? "?")[0]?.toUpperCase() ?? "?"
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1 text-[11px]">
                            <span className="truncate font-semibold">@{n.actor?.username ?? "?"}</span>
                            {isMention && <AtSign className="h-2.5 w-2.5 text-violet-300" />}
                            {isForumReply && <MessagesSquare className="h-2.5 w-2.5 text-cyan-300" />}
                            {stamp && (
                              <span className="inline-flex items-center gap-0.5 rounded bg-mint/15 px-1 font-mono text-[9px] text-mint">
                                <Play className="h-2 w-2 fill-current" />
                                {stamp}
                              </span>
                            )}
                            <span className="ml-auto text-[9px] text-muted-foreground">{fmtAgo(n.created_at)}</span>
                          </div>
                          {n.snippet && (
                            <p className="mt-0.5 line-clamp-2 text-[11px] text-muted-foreground">{n.snippet}</p>
                          )}
                        </div>
                        {!n.is_read && <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-mint" />}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <Link
            to="/notifications"
            onClick={() => setOpen(false)}
            className="block border-t border-border/70 px-3 py-2 text-center text-[11px] font-semibold uppercase tracking-wider text-mint hover:bg-secondary/40"
          >
            Все уведомления →
          </Link>
        </div>,
        document.body,
      )}
    </div>
  );
}
