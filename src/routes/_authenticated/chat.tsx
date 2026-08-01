import { useEffect, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Send, MessageCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { ReportButton } from "@/components/report-button";
import { RouteError, RouteNotFound } from "@/components/route-fallbacks";

export const Route = createFileRoute("/_authenticated/chat")({
  head: () => ({
    meta: [
      { title: "Живой чат — MixPro" },
      { name: "description", content: "Общий чат звукорежиссёров MixPro в реальном времени." },
      { property: "og:title", content: "Живой чат — MixPro" },
    ],
  }),
  component: ChatPage,
  errorComponent: RouteError,
  notFoundComponent: RouteNotFound,
});

type Msg = {
  id: string;
  author_id: string;
  content: string;
  created_at: string;
  is_hidden: boolean;
  author?: { username: string | null } | null;
};

function ChatPage() {
  const { session } = useAuth();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [profiles, setProfiles] = useState<Record<string, { username: string | null }>>({});
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const { data: msgs } = await supabase
        .from("chat_messages")
        .select("id, author_id, content, created_at, is_hidden")
        .eq("is_hidden", false)
        .order("created_at", { ascending: false })
        .limit(80);
      if (cancelled || !msgs) return;
      const ids = [...new Set(msgs.map((m) => m.author_id))];
      const { data: profs } = await supabase.from("profiles").select("id, username").in("id", ids);
      const map: Record<string, { username: string | null }> = {};
      for (const p of profs ?? []) map[p.id] = { username: p.username };
      setProfiles(map);
      setMessages(msgs.reverse());
    }
    load();

    const channel = supabase
      .channel("chat")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "chat_messages" }, async (payload) => {
        const m = payload.new as Msg;
        if (m.is_hidden) return;
        if (!profiles[m.author_id]) {
          const { data: p } = await supabase.from("profiles").select("id, username").eq("id", m.author_id).maybeSingle();
          if (p) setProfiles((prev) => ({ ...prev, [p.id]: { username: p.username } }));
        }
        setMessages((prev) => [...prev, m].slice(-200));
      })
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!session || !text.trim()) return;
    setBusy(true);
    const content = text.trim().slice(0, 1000);
    const { error } = await supabase.from("chat_messages").insert({ author_id: session.user.id, content });
    setBusy(false);
    if (!error) setText("");
  }

  return (
    <div className="mx-auto flex h-[calc(100vh-6rem)] max-w-3xl flex-col px-4 py-6">
      <header className="flex items-center gap-3 border-b border-black/60 pb-3">
        <div className="grid h-9 w-9 place-items-center rounded-lg bg-mint/10 text-mint">
          <MessageCircle className="h-4 w-4" />
        </div>
        <div>
          <h1 className="text-lg font-bold">Живой чат</h1>
          <p className="text-xs text-muted-foreground">Общий канал для звукорежиссёров · Realtime</p>
        </div>
      </header>

      <div className="flex-1 space-y-2 overflow-y-auto py-4">
        {messages.length === 0 && (
          <p className="text-center text-sm text-muted-foreground py-8">Пока тихо. Напиши первым!</p>
        )}
        {messages.map((m) => {
          const mine = session?.user.id === m.author_id;
          const uname = profiles[m.author_id]?.username ?? "…";
          return (
            <div key={m.id} className={`flex gap-2 ${mine ? "flex-row-reverse" : ""}`}>
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-secondary text-xs font-bold text-mint">
                {(uname ?? "A")[0].toUpperCase()}
              </span>
              <div className={`group max-w-[75%] rounded-2xl px-3 py-2 text-sm ${mine ? "bg-primary text-primary-foreground" : "bg-secondary"}`}>
                <div className="flex items-baseline gap-2">
                  <span className="text-[10px] font-semibold uppercase tracking-wider opacity-70">{uname}</span>
                  <span className="text-[9px] opacity-50">
                    {new Date(m.created_at).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}
                  </span>
                  {!mine && (
                    <span className="opacity-0 transition-opacity group-hover:opacity-100">
                      <ReportButton targetType="message" targetId={m.id} compact />
                    </span>
                  )}
                </div>
                <p className="mt-0.5 whitespace-pre-wrap break-words">{m.content}</p>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      <form onSubmit={send} className="glass flex items-center gap-2 rounded-xl p-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Сообщение..."
          maxLength={1000}
          className="flex-1 rounded-lg bg-background px-3 py-2 text-sm outline-none"
        />
        <button
          type="submit"
          disabled={busy || !text.trim()}
          className="inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
        >
          <Send className="h-4 w-4" />
        </button>
      </form>
    </div>
  );
}
