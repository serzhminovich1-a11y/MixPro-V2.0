import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Mail } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

/** Unread DM count in the nav, next to NotificationsBell. Clicking goes
 * straight to the inbox (/messages) — no dropdown, unlike notifications,
 * since a message needs a reply, not a one-line preview. */
export function MessagesBell() {
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    if (!userId) return;
    const uid = userId;
    let cancelled = false;
    async function load() {
      const { data: threads } = await supabase
        .from("dm_threads")
        .select("id")
        .or(`user_a.eq.${uid},user_b.eq.${uid}`);
      const ids = (threads ?? []).map((t) => t.id);
      if (ids.length === 0) { if (!cancelled) setUnread(0); return; }
      const { count } = await supabase
        .from("dm_messages")
        .select("id", { count: "exact", head: true })
        .in("thread_id", ids)
        .eq("is_read", false)
        .neq("sender_id", uid);
      if (!cancelled) setUnread(count ?? 0);
    }
    load();

    const channel = supabase
      .channel(`dm-bell-${uid}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "dm_messages" }, () => load())
      .subscribe();
    return () => { cancelled = true; supabase.removeChannel(channel); };
  }, [userId]);

  if (!userId) return null;

  return (
    <Link
      to="/messages"
      className="nav-tool-btn relative inline-flex items-center gap-1 px-2 py-1 text-[10px] font-bold uppercase tracking-wider"
      title="Сообщения"
      aria-label="Сообщения"
    >
      <Mail className="h-3 w-3" />
      {unread > 0 && (
        <span className="absolute -right-0.5 -top-0.5 grid h-3.5 min-w-[14px] place-items-center rounded-full bg-[color:var(--destructive)] px-1 text-[9px] font-bold leading-none text-white">
          {unread > 99 ? "99+" : unread}
        </span>
      )}
    </Link>
  );
}
