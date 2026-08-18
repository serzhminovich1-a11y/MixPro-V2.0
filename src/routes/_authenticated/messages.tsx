import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { MessageSquare } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { AvatarImage } from "@/components/avatar-image";
import { RouteError, RouteNotFound } from "@/components/route-fallbacks";

export const Route = createFileRoute("/_authenticated/messages")({
  head: () => ({
    meta: [{ title: "Сообщения — MixPro" }],
  }),
  component: MessagesInbox,
  errorComponent: RouteError,
  notFoundComponent: RouteNotFound,
});

type ThreadRow = {
  id: string;
  user_a: string;
  user_b: string;
  last_message_at: string;
};

type Enriched = ThreadRow & {
  otherId: string;
  otherUsername: string;
  otherAvatar: string | null;
  lastMessage: string | null;
  unread: number;
};

function MessagesInbox() {
  const { session } = useAuth();
  const myId = session?.user.id ?? null;
  const [threads, setThreads] = useState<Enriched[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!myId) return;
      setLoading(true);
      const { data: rows } = await supabase
        .from("dm_threads")
        .select("id, user_a, user_b, last_message_at")
        .or(`user_a.eq.${myId},user_b.eq.${myId}`)
        .order("last_message_at", { ascending: false })
        .limit(50);
      const list = (rows ?? []) as ThreadRow[];
      if (list.length === 0) { if (!cancelled) { setThreads([]); setLoading(false); } return; }
      const otherIds = list.map((t) => (t.user_a === myId ? t.user_b : t.user_a));
      const threadIds = list.map((t) => t.id);
      const [profRes, lastMsgRes, unreadRes] = await Promise.all([
        supabase.from("profiles").select("id, username, avatar_url").in("id", otherIds),
        supabase.from("dm_messages").select("thread_id, content, created_at").in("thread_id", threadIds).order("created_at", { ascending: false }),
        supabase.from("dm_messages").select("thread_id").in("thread_id", threadIds).eq("is_read", false).neq("sender_id", myId),
      ]);
      const profMap = new Map((profRes.data ?? []).map((p) => [p.id, p]));
      const lastMsgMap = new Map<string, string>();
      for (const m of lastMsgRes.data ?? []) if (!lastMsgMap.has(m.thread_id)) lastMsgMap.set(m.thread_id, m.content);
      const unreadCount = new Map<string, number>();
      for (const m of unreadRes.data ?? []) unreadCount.set(m.thread_id, (unreadCount.get(m.thread_id) ?? 0) + 1);
      const enriched: Enriched[] = list.map((t) => {
        const otherId = t.user_a === myId ? t.user_b : t.user_a;
        const prof = profMap.get(otherId);
        return {
          ...t,
          otherId,
          otherUsername: prof?.username ?? "?",
          otherAvatar: prof?.avatar_url ?? null,
          lastMessage: lastMsgMap.get(t.id) ?? null,
          unread: unreadCount.get(t.id) ?? 0,
        };
      });
      if (!cancelled) { setThreads(enriched); setLoading(false); }
    }
    load();
    return () => { cancelled = true; };
  }, [myId]);

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <header className="mb-6 flex items-center gap-3">
        <div className="grid h-9 w-9 place-items-center rounded-lg bg-mint/10 text-mint">
          <MessageSquare className="h-4 w-4" />
        </div>
        <h1 className="text-lg font-bold">Сообщения</h1>
      </header>

      {loading ? (
        <p className="text-center text-sm text-muted-foreground py-8">Загрузка...</p>
      ) : threads.length === 0 ? (
        <p className="text-center text-sm text-muted-foreground py-8">
          Пока нет диалогов. Зайди на чей-нибудь профиль и нажми «Написать».
        </p>
      ) : (
        <ul className="overflow-hidden rounded-2xl border border-border">
          {threads.map((t, i) => (
            <li key={t.id} className={i === threads.length - 1 ? "" : "border-b border-border/60"}>
              <Link
                to="/messages/$threadId"
                params={{ threadId: t.id }}
                className="flex items-center gap-3 px-4 py-3 transition hover:bg-secondary/40"
              >
                <div className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-full bg-secondary text-sm font-bold text-mint">
                  <AvatarImage path={t.otherAvatar} fallback={t.otherUsername.slice(0, 2).toUpperCase()} className={t.otherAvatar ? "h-full w-full object-cover" : ""} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-semibold">@{t.otherUsername}</span>
                    <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">
                      {new Date(t.last_message_at).toLocaleDateString("ru-RU", { day: "numeric", month: "short" })}
                    </span>
                  </div>
                  {t.lastMessage && <p className="mt-0.5 truncate text-xs text-muted-foreground">{t.lastMessage}</p>}
                </div>
                {t.unread > 0 && (
                  <span className="grid h-5 min-w-[20px] shrink-0 place-items-center rounded-full bg-mint px-1.5 text-[10px] font-bold text-black">
                    {t.unread}
                  </span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
