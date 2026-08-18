import { useEffect, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Send } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { AvatarImage } from "@/components/avatar-image";
import { RouteError, RouteNotFound } from "@/components/route-fallbacks";

export const Route = createFileRoute("/_authenticated/messages/$threadId")({
  head: () => ({ meta: [{ title: "Диалог — MixPro" }] }),
  component: ThreadPage,
  errorComponent: RouteError,
  notFoundComponent: RouteNotFound,
});

type Msg = {
  id: string;
  thread_id: string;
  sender_id: string;
  content: string;
  created_at: string;
  is_read: boolean;
};

function ThreadPage() {
  const { threadId } = Route.useParams();
  const { session } = useAuth();
  const myId = session?.user.id ?? null;
  const [messages, setMessages] = useState<Msg[]>([]);
  const [other, setOther] = useState<{ id: string; username: string; avatar_url: string | null } | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!myId) return;
      setLoading(true);
      const { data: thread } = await supabase.from("dm_threads").select("id, user_a, user_b").eq("id", threadId).maybeSingle();
      if (!thread) { if (!cancelled) setLoading(false); return; }
      const otherId = thread.user_a === myId ? thread.user_b : thread.user_a;
      const [profRes, msgsRes] = await Promise.all([
        supabase.from("profiles").select("id, username, avatar_url").eq("id", otherId).maybeSingle(),
        supabase.from("dm_messages").select("*").eq("thread_id", threadId).order("created_at", { ascending: true }).limit(200),
      ]);
      if (cancelled) return;
      setOther(profRes.data ?? null);
      setMessages((msgsRes.data ?? []) as Msg[]);
      setLoading(false);
      // Mark incoming messages read — RLS only allows flipping the other
      // sender's rows, never our own (see dm_messages_participants_mark_read).
      await supabase.from("dm_messages").update({ is_read: true }).eq("thread_id", threadId).eq("is_read", false).neq("sender_id", myId);
    }
    load();

    const channel = supabase
      .channel(`dm-${threadId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "dm_messages", filter: `thread_id=eq.${threadId}` },
        (payload) => {
          const m = payload.new as Msg;
          setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]));
          if (m.sender_id !== myId) {
            supabase.from("dm_messages").update({ is_read: true }).eq("id", m.id).then(() => {});
          }
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [threadId, myId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!myId || !text.trim()) return;
    setBusy(true);
    const content = text.trim().slice(0, 4000);
    const { error } = await supabase.from("dm_messages").insert({ thread_id: threadId, sender_id: myId, content });
    setBusy(false);
    if (!error) setText("");
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-3 border-b border-border px-4 py-3">
        <Link to="/messages" aria-label="Назад к сообщениям" className="text-muted-foreground hover:text-foreground md:hidden">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        {other && (
          <>
            <div className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-full bg-secondary text-xs font-bold text-mint">
              <AvatarImage path={other.avatar_url} fallback={other.username.slice(0, 2).toUpperCase()} className={other.avatar_url ? "h-full w-full object-cover" : ""} />
            </div>
            <Link to="/u/$username" params={{ username: other.username }} className="text-sm font-semibold hover:underline">
              @{other.username}
            </Link>
          </>
        )}
      </header>

      <div className="flex-1 space-y-2 overflow-y-auto px-4 py-4">
        {loading ? (
          <p className="text-center text-sm text-muted-foreground py-8">Загрузка...</p>
        ) : messages.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground py-8">Пока пусто. Напиши первым!</p>
        ) : (
          messages.map((m) => {
            const mine = myId === m.sender_id;
            return (
              <div key={m.id} className={`flex gap-2 ${mine ? "flex-row-reverse" : ""}`}>
                <div className={`max-w-[75%] rounded-2xl px-3 py-2 text-sm ${mine ? "bg-primary text-primary-foreground" : "bg-secondary"}`}>
                  <p className="whitespace-pre-wrap break-words">{m.content}</p>
                  <span className="mt-0.5 block text-[9px] opacity-60">
                    {new Date(m.created_at).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      <form onSubmit={send} className="flex items-center gap-2 border-t border-border p-3">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Сообщение..."
          maxLength={4000}
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
