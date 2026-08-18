import { useEffect, useRef, useState } from "react";
import { createFileRoute, Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, MessageSquare, MessageSquarePlus, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { AvatarImage } from "@/components/avatar-image";
import { searchUsernames } from "@/lib/public.functions";
import { RouteError, RouteNotFound } from "@/components/route-fallbacks";

export const Route = createFileRoute("/_authenticated/messages")({
  head: () => ({ meta: [{ title: "Сообщения — MixPro" }] }),
  component: MessagesLayout,
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

/** VK-style inbox shell: a persistent dialog list on the left, the active
 * chat (rendered by the /messages/$threadId child route) in an <Outlet/>
 * on the right. Switching threads never remounts the list, so incoming
 * messages can update previews/unread badges/ordering without a refetch. */
function MessagesLayout() {
  const { session } = useAuth();
  const myId = session?.user.id ?? null;
  const [threads, setThreads] = useState<Enriched[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const threadsRef = useRef<Enriched[]>([]);
  useEffect(() => { threadsRef.current = threads; }, [threads]);

  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const activeThreadId = pathname.startsWith("/messages/") ? pathname.slice("/messages/".length) : null;

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
    if (list.length === 0) { setThreads([]); setLoading(false); return; }
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
    setThreads(enriched);
    setLoading(false);
  }

  useEffect(() => {
    if (!myId) return;
    load();

    // Inbox-wide realtime: bump/update whichever thread just got a new
    // message so the list reorders + shows a preview/unread badge without
    // the user having to reopen the page. RLS restricts delivery to rows
    // this user can actually see, same as the per-thread channel below.
    const channel = supabase
      .channel("dm-inbox")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "dm_messages" }, (payload) => {
        const m = payload.new as { thread_id: string; sender_id: string; content: string; created_at: string };
        if (!threadsRef.current.some((t) => t.id === m.thread_id)) { load(); return; }
        setThreads((prev) => {
          const next = prev.map((t) =>
            t.id === m.thread_id
              ? {
                  ...t,
                  lastMessage: m.content,
                  last_message_at: m.created_at,
                  unread: m.sender_id === myId || m.thread_id === activeThreadId ? t.unread : t.unread + 1,
                }
              : t,
          );
          next.sort((a, b) => +new Date(b.last_message_at) - +new Date(a.last_message_at));
          return next;
        });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myId]);

  // Opening a thread clears its badge locally right away (the thread page
  // itself flips is_read in the DB).
  useEffect(() => {
    if (!activeThreadId) return;
    setThreads((prev) => prev.map((t) => (t.id === activeThreadId ? { ...t, unread: 0 } : t)));
  }, [activeThreadId]);

  const filtered = query.trim()
    ? threads.filter((t) => t.otherUsername.toLowerCase().includes(query.trim().toLowerCase()))
    : threads;

  return (
    <div className="mx-auto flex h-[calc(100vh-4rem)] max-w-6xl md:h-[calc(100vh-6rem)] md:px-4 md:py-6">
      <div className="flex h-full w-full overflow-hidden border-border bg-card md:rounded-2xl md:border">
        <aside className={`w-full shrink-0 flex-col border-border md:flex md:w-[320px] md:border-r ${activeThreadId ? "hidden" : "flex"}`}>
          <header className="flex items-center gap-2 border-b border-border px-4 py-3.5">
            <div className="grid h-7 w-7 place-items-center rounded-lg bg-mint/10 text-mint">
              <MessageSquare className="h-3.5 w-3.5" />
            </div>
            <h1 className="text-sm font-bold">Сообщения</h1>
          </header>
          <div className="border-b border-border px-3 py-2">
            <div className="flex items-center gap-2 rounded-lg bg-secondary/60 px-2.5 py-1.5">
              <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Поиск диалогов…"
                className="w-full bg-transparent text-xs outline-none placeholder:text-muted-foreground"
              />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <p className="px-4 py-8 text-center text-xs text-muted-foreground">Загрузка...</p>
            ) : filtered.length === 0 ? (
              <p className="px-4 py-8 text-center text-xs text-muted-foreground">
                {threads.length === 0 ? "Пока нет диалогов — найди собеседника справа." : "Ничего не найдено"}
              </p>
            ) : (
              <ul>
                {filtered.map((t) => {
                  const active = t.id === activeThreadId;
                  return (
                    <li key={t.id}>
                      <Link
                        to="/messages/$threadId"
                        params={{ threadId: t.id }}
                        className={`flex items-center gap-3 border-b border-border/40 px-4 py-3 transition hover:bg-secondary/40 ${active ? "bg-secondary/60" : ""}`}
                      >
                        <div className="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-full bg-secondary text-sm font-bold text-mint">
                          <AvatarImage path={t.otherAvatar} fallback={t.otherUsername.slice(0, 2).toUpperCase()} className={t.otherAvatar ? "h-full w-full object-cover" : ""} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className={`truncate text-sm ${t.unread > 0 ? "font-bold" : "font-semibold"}`}>@{t.otherUsername}</span>
                            <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">
                              {new Date(t.last_message_at).toLocaleDateString("ru-RU", { day: "numeric", month: "short" })}
                            </span>
                          </div>
                          {t.lastMessage && (
                            <p className={`mt-0.5 truncate text-xs ${t.unread > 0 ? "font-medium text-foreground/90" : "text-muted-foreground"}`}>{t.lastMessage}</p>
                          )}
                        </div>
                        {t.unread > 0 && (
                          <span className="grid h-5 min-w-[20px] shrink-0 place-items-center rounded-full bg-mint px-1.5 text-[10px] font-bold text-black">
                            {t.unread}
                          </span>
                        )}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </aside>

        <main className={`min-w-0 flex-1 flex-col md:flex ${activeThreadId ? "flex" : "hidden"}`}>
          {activeThreadId ? <Outlet /> : <ComposePane />}
        </main>
      </div>
    </div>
  );
}

/** Right-pane placeholder shown at the bare /messages path — "select a
 * dialog" welcome state plus a quick username search to start a new one,
 * so you don't have to leave the page to message someone for the first
 * time (the profile page's "Написать" button still works too). */
function ComposePane() {
  const navigate = useNavigate();
  const search = useServerFn(searchUsernames);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<{ id: string; username: string; avatar_url: string | null }[]>([]);
  const [searching, setSearching] = useState(false);
  const [starting, setStarting] = useState<string | null>(null);

  useEffect(() => {
    const query = q.trim();
    if (!query) { setResults([]); setSearching(false); return; }
    let cancelled = false;
    setSearching(true);
    const t = setTimeout(async () => {
      const { users } = await search({ data: { q: query } });
      if (!cancelled) { setResults(users); setSearching(false); }
    }, 250);
    return () => { cancelled = true; clearTimeout(t); };
  }, [q, search]);

  async function start(id: string) {
    setStarting(id);
    const { data: threadId, error } = await supabase.rpc("get_or_create_dm_thread", { _other: id });
    setStarting(null);
    if (!error && threadId) navigate({ to: "/messages/$threadId", params: { threadId } });
  }

  return (
    <div className="flex h-full flex-col items-center justify-center gap-6 px-6 text-center">
      <div className="grid h-14 w-14 place-items-center rounded-2xl bg-mint/10 text-mint">
        <MessageSquarePlus className="h-6 w-6" />
      </div>
      <div>
        <p className="text-sm font-semibold">Выбери диалог слева</p>
        <p className="mt-1 text-xs text-muted-foreground">или найди собеседника, чтобы начать новую переписку</p>
      </div>
      <div className="w-full max-w-xs">
        <div className="flex items-center gap-2 rounded-lg bg-secondary/60 px-3 py-2">
          <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Найти по нику…"
            className="w-full bg-transparent text-xs outline-none placeholder:text-muted-foreground"
          />
        </div>
        {(searching || results.length > 0) && (
          <ul className="mt-2 overflow-hidden rounded-lg border border-border text-left">
            {searching ? (
              <li className="flex items-center justify-center gap-2 px-3 py-3 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Поиск...
              </li>
            ) : (
              results.map((u) => (
                <li key={u.id}>
                  <button
                    type="button"
                    onClick={() => start(u.id)}
                    disabled={starting === u.id}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left transition hover:bg-secondary/40 disabled:opacity-50"
                  >
                    <div className="grid h-7 w-7 shrink-0 place-items-center overflow-hidden rounded-full bg-secondary text-[10px] font-bold text-mint">
                      <AvatarImage path={u.avatar_url} fallback={u.username.slice(0, 2).toUpperCase()} className={u.avatar_url ? "h-full w-full object-cover" : ""} />
                    </div>
                    <span className="truncate text-xs font-semibold">@{u.username}</span>
                    {starting === u.id && <Loader2 className="ml-auto h-3.5 w-3.5 animate-spin" />}
                  </button>
                </li>
              ))
            )}
          </ul>
        )}
      </div>
    </div>
  );
}
