import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { CreditCard, Users, Percent, Wallet, Crown, Loader2, Clock, TrendingUp } from "lucide-react";
import { getSubscriptionAnalytics } from "@/lib/admin-analytics.functions";
import { RoleGate } from "@/components/role-gate";
import { RouteError, RouteNotFound } from "@/components/route-fallbacks";

export const Route = createFileRoute("/_authenticated/admin/subscriptions")({
  head: () => ({ meta: [{ title: "Подписки и выручка — MixPro" }, { name: "robots", content: "noindex" }] }),
  component: () => (
    <RoleGate role="super_admin">
      <AdminSubscriptionsPage />
    </RoleGate>
  ),
  errorComponent: RouteError,
  notFoundComponent: RouteNotFound,
});

type Analytics = Awaited<ReturnType<typeof getSubscriptionAnalytics>>;

const TIER_LABEL: Record<string, string> = { free: "Free", trial: "Trial", pro: "PRO", lifetime: "Lifetime" };
// Same colors already used for tier badges in the users list (admin.index.tsx)
// — kept consistent rather than picking a fresh categorical set. Free/Trial/
// PRO/Lifetime here always ship with their name as text (never color alone) —
// the yellow/mint pair specifically doesn't clear the colorblind-separation
// bar on its own, so the label is load-bearing, not decorative.
const TIER_DOT: Record<string, string> = {
  free: "bg-muted-foreground/50",
  trial: "bg-cyan",
  pro: "bg-mint",
  lifetime: "bg-yellow-400",
};

function rub(n: number): string {
  return n.toLocaleString("ru-RU") + " ₽";
}

function Tile({ icon, label, value, accent, hint }: { icon: React.ReactNode; label: string; value: string; accent?: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-border bg-card/40 p-4">
      <div className={`flex items-center gap-2 text-[10px] font-semibold uppercase tracking-widest ${accent ?? "text-muted-foreground"}`}>
        {icon} {label}
      </div>
      <div className="mt-2 text-2xl font-bold tracking-tight">{value}</div>
      {hint && <div className="mt-1 text-[11px] text-muted-foreground">{hint}</div>}
    </div>
  );
}

function GrowthChart({ growth }: { growth: { week: string; count: number }[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...growth.map((g) => g.count));
  const w = 720;
  const h = 160;
  const padL = 8;
  const padB = 20;
  const barGap = 4;
  const barW = (w - padL * 2 - barGap * (growth.length - 1)) / growth.length;

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${w} ${h + padB}`} className="w-full" role="img" aria-label="Новые/продлённые подписки по неделям">
        {/* recessive baseline */}
        <line x1={padL} y1={h} x2={w - padL} y2={h} stroke="currentColor" strokeOpacity="0.12" strokeWidth="1" />
        {growth.map((g, i) => {
          const barH = g.count === 0 ? 0 : Math.max(3, (g.count / max) * (h - 12));
          const x = padL + i * (barW + barGap);
          const y = h - barH;
          const isHover = hover === i;
          return (
            <g key={g.week}>
              <rect
                x={x}
                y={y}
                width={barW}
                height={barH}
                rx={Math.min(4, barW / 2)}
                className={isHover ? "fill-mint" : "fill-mint/60"}
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover((cur) => (cur === i ? null : cur))}
              />
              {/* invisible full-height hit target, taller than the bar so hover works on short/zero bars too */}
              <rect
                x={x}
                y={0}
                width={barW}
                height={h}
                fill="transparent"
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover((cur) => (cur === i ? null : cur))}
              />
              {i % 2 === 0 && (
                <text x={x + barW / 2} y={h + 14} textAnchor="middle" className="fill-muted-foreground" style={{ fontSize: 9 }}>
                  {new Date(g.week).toLocaleDateString("ru-RU", { day: "numeric", month: "short" })}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      {hover !== null && growth[hover] && (
        <div
          className="pointer-events-none absolute -translate-x-1/2 -translate-y-full rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs shadow-lg"
          style={{ left: `${((hover + 0.5) / growth.length) * 100}%`, top: 0 }}
        >
          <div className="font-semibold">{growth[hover].count} {growth[hover].count === 1 ? "подписка" : "подписок"}</div>
          <div className="text-muted-foreground">
            неделя от {new Date(growth[hover].week).toLocaleDateString("ru-RU", { day: "numeric", month: "long" })}
          </div>
        </div>
      )}
    </div>
  );
}

function AdminSubscriptionsPage() {
  const [data, setData] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const fetchAnalytics = useServerFn(getSubscriptionAnalytics);

  useEffect(() => {
    fetchAnalytics({})
      .then(setData)
      .catch((e: any) => setError(e.message ?? "Не удалось загрузить"))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const tierRows = useMemo(() => {
    if (!data) return [];
    return (["free", "trial", "pro", "lifetime"] as const).map((tier) => ({
      tier,
      count: data.tierCounts[tier] ?? 0,
      pct: data.totalUsers > 0 ? ((data.tierCounts[tier] ?? 0) / data.totalUsers) * 100 : 0,
    }));
  }, [data]);

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <div className="flex items-center gap-3">
        <div className="grid h-10 w-10 place-items-center rounded-lg bg-yellow-400/10 text-yellow-300">
          <CreditCard className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Подписки и выручка</h1>
          <p className="text-xs text-muted-foreground">
            Только для супер-админа. Оплаты пока нет — тарифы выдаются вручную, суммы ниже посчитаны из цен PRO {rub(1000)}/мес и Lifetime {rub(14990)} разово.
          </p>
        </div>
      </div>

      {loading ? (
        <div className="mt-10 flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Считаю…
        </div>
      ) : error ? (
        <div className="mt-10 rounded-xl border border-destructive/40 bg-destructive/10 p-6 text-center text-sm text-destructive">{error}</div>
      ) : data ? (
        <>
          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Tile icon={<Users className="h-3.5 w-3.5" />} label="Пользователей всего" value={data.totalUsers.toLocaleString("ru-RU")} />
            <Tile icon={<CreditCard className="h-3.5 w-3.5" />} label="Платящих сейчас" value={data.payingActive.toLocaleString("ru-RU")} accent="text-mint" />
            <Tile icon={<Percent className="h-3.5 w-3.5" />} label="% платящих" value={`${data.payingPct.toFixed(1)}%`} accent="text-cyan" />
            <Tile icon={<Wallet className="h-3.5 w-3.5" />} label="Оценка MRR (PRO/мес)" value={rub(data.mrr)} accent="text-mint" hint="Активные PRO × 1000₽" />
            <Tile icon={<Crown className="h-3.5 w-3.5" />} label="Выручка с Lifetime" value={rub(data.lifetimeRevenue)} accent="text-yellow-300" hint="Накоплено разово, не помесячно" />
            <Tile icon={<Clock className="h-3.5 w-3.5" />} label="Истекает в ближайшие 30 дней" value={data.expiringSoon.length.toLocaleString("ru-RU")} accent={data.expiringSoon.length > 0 ? "text-amber-300" : "text-muted-foreground"} />
          </div>

          {/* Tier breakdown */}
          <div className="mt-6 rounded-xl border border-border bg-card/40 p-4">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">По тарифам</h2>
            <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {tierRows.map((r) => (
                <div key={r.tier} className="flex items-center justify-between rounded-lg border border-border/60 bg-background/40 px-3 py-2.5">
                  <span className="flex items-center gap-2 text-sm">
                    <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${TIER_DOT[r.tier]}`} aria-hidden="true" />
                    {TIER_LABEL[r.tier]}
                  </span>
                  <span className="text-right">
                    <span className="font-mono text-sm font-bold">{r.count}</span>
                    <span className="ml-1 text-[10px] text-muted-foreground">{r.pct.toFixed(1)}%</span>
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Growth chart */}
          <div className="mt-6 rounded-xl border border-border bg-card/40 p-4">
            <h2 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              <TrendingUp className="h-3.5 w-3.5" /> Выдачи и продления подписок по неделям
            </h2>
            <p className="mt-0.5 text-[11px] text-muted-foreground">Последние ~12 недель, по журналу действий админов.</p>
            <div className="mt-4">
              {data.growth.every((g) => g.count === 0) ? (
                <p className="py-8 text-center text-sm text-muted-foreground">Пока пусто — ни одной выдачи/продления за этот период.</p>
              ) : (
                <GrowthChart growth={data.growth} />
              )}
            </div>
          </div>

          {/* Expiring soon */}
          <div className="mt-6 rounded-xl border border-border bg-card/40 p-4">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Истекает в ближайшие 30 дней</h2>
            {data.expiringSoon.length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">Никто не истекает в ближайший месяц.</p>
            ) : (
              <ul className="mt-3 divide-y divide-border/60">
                {data.expiringSoon.map((u) => {
                  const daysLeft = Math.max(0, Math.ceil((new Date(u.until).getTime() - Date.now()) / (24 * 60 * 60 * 1000)));
                  return (
                    <li key={u.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                      <Link to="/u/$username" params={{ username: u.username }} className="flex items-center gap-2 hover:underline">
                        <span className={`h-2 w-2 shrink-0 rounded-full ${TIER_DOT[u.tier]}`} aria-hidden="true" />
                        @{u.username}
                      </Link>
                      <span className="flex items-center gap-2 text-muted-foreground">
                        <span className="font-mono text-xs">{new Date(u.until).toLocaleDateString("ru-RU", { day: "numeric", month: "long" })}</span>
                        <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${daysLeft <= 3 ? "bg-destructive/15 text-destructive" : "bg-secondary text-muted-foreground"}`}>
                          {daysLeft === 0 ? "сегодня" : `${daysLeft} дн.`}
                        </span>
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}
