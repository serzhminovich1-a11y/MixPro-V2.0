import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Gauge, Users, UserPlus, CreditCard, Gamepad2, MessageSquare, MessagesSquare, Flag, Loader2 } from "lucide-react";
import { getAdminStats } from "@/lib/admin.functions";
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

function AdminDashboardPage() {
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
    </div>
  );
}
