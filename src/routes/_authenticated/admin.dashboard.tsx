import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Gauge, Users, UserPlus, CreditCard, Gamepad2, MessageSquare, MessagesSquare, Flag, Loader2, Crown, Zap, BadgeCheck, ChevronDown } from "lucide-react";
import { getAdminStats, selfBoost } from "@/lib/admin.functions";
import { supabase } from "@/integrations/supabase/client";
import { useAdmin } from "@/hooks/use-admin";
import { LEAGUES } from "@/lib/leagues";
import { RoleGate } from "@/components/role-gate";
import { RouteError, RouteNotFound } from "@/components/route-fallbacks";

export const Route = createFileRoute("/_authenticated/admin/dashboard")({
  head: () => ({ meta: [{ title: "Дашборд — MixPro" }, { name: "robots", content: "noindex" }] }),
  component: () => (
    <RoleGate role="admin">
      <AdminDashboardPage />
    </RoleGate>
  ),
  errorComponent: RouteError,
  notFoundComponent: RouteNotFound,
});

type Stats = Awaited<ReturnType<typeof getAdminStats>>;
type MyProfile = { id: string; xp: number; level: number; verified: boolean };

function Tile({ icon, label, value, accent }: { icon: React.ReactNode; label: string; value: number; accent?: string }) {
  return (
    <div className="rounded-xl border border-border bg-card/40 p-4">
      <div className={`flex items-center gap-2 text-[10px] font-semibold uppercase tracking-widest ${accent ?? "text-muted-foreground"}`}>
        {icon} {label}
      </div>
      <div className="mt-2 text-2xl font-bold tracking-tight">{value.toLocaleString("ru-RU")}</div>
    </div>
  );
}

/** Moved here from /admin (Пользователи) — it was cluttering the top of a
 * page meant to scale to hundreds of user rows, and self-actions belong
 * with the rest of the admin tooling, not the user-management list.
 * Collapsed by default, super-admin only. */
function SelfBoostPanel({ userId }: { userId: string }) {
  const [open, setOpen] = useState(false);
  const [me, setMe] = useState<MyProfile | null>(null);
  const [busy, setBusy] = useState(false);
  const [boostDelta, setBoostDelta] = useState(1000);
  const _selfBoost = useServerFn(selfBoost);

  async function load() {
    const { data } = await supabase.from("profiles").select("id, xp, level, verified").eq("id", userId).maybeSingle();
    if (data) setMe(data as MyProfile);
  }

  async function doBoost(patch: { deltaXp?: number; verified?: boolean; level?: number }) {
    setBusy(true);
    try {
      await _selfBoost({ data: patch });
      await load();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-6 rounded-xl border border-yellow-400/30 bg-yellow-400/5">
      <button
        onClick={() => {
          setOpen((v) => !v);
          if (!me) load();
        }}
        className="flex w-full items-center gap-2 p-4 text-left"
      >
        <Crown className="h-4 w-4 text-yellow-300" />
        <h3 className="text-sm font-semibold text-yellow-200">Self-boost (только для своего аккаунта)</h3>
        <span className="text-[10px] uppercase tracking-widest text-yellow-400/70">dev</span>
        <ChevronDown className={`ml-auto h-4 w-4 text-yellow-400/70 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="grid gap-3 border-t border-yellow-400/20 p-4 sm:grid-cols-3">
          <div className="rounded-lg border border-border bg-background/40 p-3">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-mint">XP · Lvl {me?.level ?? 1}</p>
            <div className="mt-2 flex items-center gap-1.5">
              <input
                type="number"
                value={boostDelta}
                onChange={(e) => setBoostDelta(Number(e.target.value) || 0)}
                className="w-full min-w-0 rounded border border-input bg-background px-2 py-1 text-sm font-mono outline-none focus:ring-1 focus:ring-ring"
              />
              <button
                disabled={busy}
                onClick={() => doBoost({ deltaXp: boostDelta })}
                className="inline-flex items-center gap-1 rounded-md bg-mint px-2 py-1 text-xs font-bold text-black hover:brightness-110 disabled:opacity-50"
              >
                <Zap className="h-3 w-3" />+
              </button>
              <button
                disabled={busy}
                onClick={() => doBoost({ deltaXp: -Math.abs(boostDelta) })}
                className="rounded-md border border-border px-2 py-1 text-xs"
              >
                −
              </button>
            </div>
            <div className="mt-2 flex flex-wrap gap-1">
              {[100, 500, 1000, 5000, 25000].map((v) => (
                <button
                  key={v}
                  disabled={busy}
                  onClick={() => doBoost({ deltaXp: v })}
                  className="rounded-full border border-border px-2 py-0.5 text-[10px] hover:bg-secondary"
                >
                  +{v.toLocaleString()}
                </button>
              ))}
            </div>
          </div>
          <div className="rounded-lg border border-border bg-background/40 p-3">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-violet">Лига</p>
            <div className="mt-2 flex flex-wrap gap-1">
              {LEAGUES.map((L) => (
                <button
                  key={L.key}
                  disabled={busy}
                  onClick={() => doBoost({ deltaXp: L.min - (me?.xp ?? 0) })}
                  className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] ${L.color} ${L.border}`}
                >
                  <span>{L.icon}</span>
                  {L.name}
                </button>
              ))}
            </div>
          </div>
          <div className="rounded-lg border border-border bg-background/40 p-3">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-cyan">Верификация</p>
            <button
              disabled={busy}
              onClick={() => doBoost({ verified: !me?.verified })}
              className={`mt-2 inline-flex w-full items-center justify-center gap-2 rounded-md border px-3 py-1.5 text-xs font-semibold transition ${
                me?.verified
                  ? "border-cyan-400/60 bg-cyan-400/15 text-cyan-200"
                  : "border-border hover:bg-secondary"
              }`}
            >
              <BadgeCheck className="h-3.5 w-3.5" />
              {me?.verified ? "Верифицирован" : "Выдать себе"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function AdminDashboardPage() {
  const { ctx, isSuperAdmin } = useAdmin();
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const _stats = useServerFn(getAdminStats);

  useEffect(() => {
    _stats({})
      .then(setStats)
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <div className="flex items-center gap-3">
        <div className="grid h-10 w-10 place-items-center rounded-lg bg-mint/10 text-mint">
          <Gauge className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Дашборд</h1>
          <p className="text-xs text-muted-foreground">Сводка по проекту на сейчас.</p>
        </div>
      </div>

      {loading || !stats ? (
        <div className="mt-10 flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Считаю…
        </div>
      ) : (
        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Tile icon={<Users className="h-3.5 w-3.5" />} label="Пользователей всего" value={stats.totalUsers} />
          <Tile icon={<UserPlus className="h-3.5 w-3.5" />} label="Новых за 24ч" value={stats.newUsers24h} accent="text-mint" />
          <Tile icon={<UserPlus className="h-3.5 w-3.5" />} label="Новых за 7 дней" value={stats.newUsers7d} accent="text-mint" />
          <Tile icon={<CreditCard className="h-3.5 w-3.5" />} label="Активных подписок" value={stats.activeSubs} accent="text-yellow-300" />
          <Tile icon={<Gamepad2 className="h-3.5 w-3.5" />} label="Игр сыграно за 24ч" value={stats.games24h} accent="text-violet" />
          <Tile icon={<MessageSquare className="h-3.5 w-3.5" />} label="Постов за 24ч" value={stats.posts24h} />
          <Tile icon={<MessagesSquare className="h-3.5 w-3.5" />} label="Тредов форума за 24ч" value={stats.threads24h} />
          <Tile icon={<MessagesSquare className="h-3.5 w-3.5" />} label="Сообщений чата за 24ч" value={stats.chat24h} />
          <Tile icon={<Flag className="h-3.5 w-3.5" />} label="Открытых жалоб" value={stats.openReports} accent={stats.openReports > 0 ? "text-destructive" : "text-muted-foreground"} />
        </div>
      )}

      {isSuperAdmin && ctx && <SelfBoostPanel userId={ctx.userId} />}
    </div>
  );
}
