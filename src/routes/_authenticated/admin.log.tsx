import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { ScrollText, Loader2 } from "lucide-react";
import { listAdminActions } from "@/lib/admin.functions";
import { RoleGate } from "@/components/role-gate";
import { RouteError, RouteNotFound } from "@/components/route-fallbacks";

export const Route = createFileRoute("/_authenticated/admin/log")({
  head: () => ({ meta: [{ title: "Журнал действий — MixPro" }, { name: "robots", content: "noindex" }] }),
  component: () => (
    <RoleGate role="moderator">
      <AdminLogPage />
    </RoleGate>
  ),
  errorComponent: RouteError,
  notFoundComponent: RouteNotFound,
});

const ACTION_LABEL: Record<string, string> = {
  claim_super_admin: "Забрал роль супер-админа",
  role_grant: "Выдал роль",
  role_revoke: "Снял роль",
  verify: "Выдал верификацию",
  unverify: "Снял верификацию",
  xp_adjust: "Изменил XP",
  ban: "Забанил",
  unban: "Разбанил",
  cert_grant: "Выдал сертификат",
  cert_revoke: "Снял сертификат",
  subscription_set: "Установил подписку",
  subscription_extend: "Продлил подписку",
  self_boost: "Self-boost",
};

type Row = {
  id: string;
  actor_id: string;
  actor_username: string | null;
  action: string;
  target_id: string | null;
  target_username: string | null;
  meta: Record<string, unknown>;
  created_at: string;
};

function fmt(iso: string) {
  return new Date(iso).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function metaSummary(meta: Record<string, unknown>) {
  const entries = Object.entries(meta ?? {}).filter(([, v]) => v !== null && v !== undefined);
  if (entries.length === 0) return null;
  return entries.map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : String(v)}`).join(" · ");
}

function AdminLogPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [done, setDone] = useState(false);
  const _list = useServerFn(listAdminActions);

  async function loadMore() {
    setLoadingMore(true);
    try {
      const before = rows.length ? rows[rows.length - 1].created_at : undefined;
      const r = await _list({ data: { limit: 50, before } });
      const batch = r.actions as Row[];
      setRows((prev) => [...prev, ...batch]);
      if (batch.length < 50) setDone(true);
    } finally {
      setLoadingMore(false);
    }
  }

  useEffect(() => {
    loadMore().finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <div className="flex items-center gap-3">
        <div className="grid h-10 w-10 place-items-center rounded-lg bg-violet/10 text-violet">
          <ScrollText className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Журнал действий</h1>
          <p className="text-xs text-muted-foreground">Кто, кому и что выдал/забрал — начиная с {new Date("2026-08-02").toLocaleDateString("ru-RU")}, когда завели журнал.</p>
        </div>
      </div>

      {loading ? (
        <div className="mt-10 flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Загружаю…
        </div>
      ) : rows.length === 0 ? (
        <p className="mt-10 text-center text-sm text-muted-foreground">Пока пусто.</p>
      ) : (
        <div className="mt-6 space-y-1.5">
          {rows.map((r) => (
            <div key={r.id} className="flex flex-wrap items-baseline gap-x-2 gap-y-1 rounded-lg border border-border bg-card/30 px-3 py-2 text-sm">
              <span className="font-mono text-[10px] text-muted-foreground">{fmt(r.created_at)}</span>
              <span className="font-semibold text-mint">{r.actor_username ?? r.actor_id.slice(0, 8)}</span>
              <span className="text-muted-foreground">{ACTION_LABEL[r.action] ?? r.action}</span>
              {r.target_id && (
                <>
                  <span className="text-muted-foreground">→</span>
                  <span className="font-semibold">{r.target_username ?? r.target_id.slice(0, 8)}</span>
                </>
              )}
              {metaSummary(r.meta) && (
                <span className="w-full font-mono text-[10px] text-muted-foreground/70">{metaSummary(r.meta)}</span>
              )}
            </div>
          ))}
          {!done && (
            <button
              disabled={loadingMore}
              onClick={loadMore}
              className="mx-auto mt-4 flex items-center gap-2 rounded-md border border-border px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground disabled:opacity-50"
            >
              {loadingMore && <Loader2 className="h-3 w-3 animate-spin" />}
              Загрузить ещё
            </button>
          )}
        </div>
      )}
    </div>
  );
}
