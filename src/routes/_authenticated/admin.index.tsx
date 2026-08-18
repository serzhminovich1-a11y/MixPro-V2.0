import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Shield, Crown, Search, Zap, Ban, ShieldCheck, Award,
  UserX, Sparkles, ChevronDown, ChevronLeft, ChevronRight, Clock, Infinity as InfinityIcon,
  FileSpreadsheet, BadgeCheck,
} from "lucide-react";
import { exportUsersXlsx } from "@/lib/admin-export.functions";
import {
  claimSuperAdmin, getMyAdminContext, listUsers, listCertifications,
  setRole, adjustXp, banUser, unbanUser, awardCert,
  setSubscription, extendSubscription, setVerified, selfBoost,
} from "@/lib/admin.functions";
import { supabase } from "@/integrations/supabase/client";
import { LEAGUES } from "@/lib/leagues";
import { AdminTabs } from "@/components/admin-tabs";
import { RouteError, RouteNotFound } from "@/components/route-fallbacks";

export const Route = createFileRoute("/_authenticated/admin/")({
  head: () => ({ meta: [{ title: "Админ-панель — MixPro" }, { name: "robots", content: "noindex" }] }),
  component: AdminPage,
  errorComponent: RouteError,
  notFoundComponent: RouteNotFound,
});

const PAGE_SIZE = 50;

type Cert = { id: string; slug: string; name: string; color: string; icon: string | null };
type UserRow = {
  id: string; username: string | null; avatar_url: string | null; xp: number; level: number;
  roles: string[]; targetRank: number; canAct: boolean;
  ban: { reason: string; expires_at: string | null; created_at: string } | null;
  certs: Cert[];
  verified: boolean | null;
  subscription_tier: "free" | "trial" | "pro" | "lifetime" | string;
  subscription_until: string | null;
};

type MyProfile = { id: string; xp: number; level: number; verified: boolean };

const TIER_LABEL: Record<string, string> = {
  free: "Free", trial: "Trial", pro: "PRO", lifetime: "Lifetime",
};
const TIER_COLORS: Record<string, string> = {
  free: "bg-secondary text-muted-foreground border-black/60",
  trial: "bg-cyan/20 text-cyan border-cyan/40",
  pro: "bg-mint/20 text-mint border-mint/40",
  lifetime: "bg-yellow-400/20 text-yellow-300 border-yellow-400/40",
};

function subActive(u: { subscription_tier: string; subscription_until: string | null }) {
  if (u.subscription_tier === "lifetime") return true;
  if (!u.subscription_until) return false;
  return new Date(u.subscription_until) > new Date();
}
function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" });
}

const ROLE_LABEL: Record<string, string> = {
  super_admin: "Супер-админ", admin: "Админ", moderator: "Модератор", user: "Юзер",
};
const ROLE_COLORS: Record<string, string> = {
  super_admin: "bg-pink-500/20 text-pink-300 border-pink-500/40",
  admin: "bg-violet/20 text-violet border-violet/40",
  moderator: "bg-cyan/20 text-cyan border-cyan/40",
  user: "bg-secondary text-muted-foreground border-black/60",
};

function AdminPage() {
  const { user } = Route.useRouteContext();
  const [ctx, setCtx] = useState<{ userId: string; roles: string[]; isSuperAdmin: boolean; isAdmin: boolean } | null>(null);
  const [me, setMe] = useState<MyProfile | null>(null);
  const [selfBusy, setSelfBusy] = useState(false);
  const [boostDelta, setBoostDelta] = useState(1000);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [certs, setCerts] = useState<Cert[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [myRank, setMyRank] = useState(0);
  const [filter, setFilter] = useState<"all" | "roles" | "subs">("all");

  useEffect(() => {
    const sync = () => {
      const h = window.location.hash.replace("#", "");
      if (h === "roles" || h === "subs") setFilter(h);
      else setFilter("all");
    };
    sync();
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);

  const _ctx = useServerFn(getMyAdminContext);
  const _list = useServerFn(listUsers);
  const _listCerts = useServerFn(listCertifications);
  const _claim = useServerFn(claimSuperAdmin);
  const _setRole = useServerFn(setRole);
  const _xp = useServerFn(adjustXp);
  const _ban = useServerFn(banUser);
  const _unban = useServerFn(unbanUser);
  const _cert = useServerFn(awardCert);
  const _extendSub = useServerFn(extendSubscription);
  const _setSub = useServerFn(setSubscription);
  const _setVerified = useServerFn(setVerified);
  const _selfBoost = useServerFn(selfBoost);

  async function reload(opts?: { offset?: number }) {
    setLoading(true);
    try {
      const [c, cs] = await Promise.all([_ctx({}), _listCerts()]);
      setCtx(c);
      setCerts(cs.certifications as Cert[]);
      if (c.isAdmin) {
        const offset = opts?.offset ?? page * PAGE_SIZE;
        const r = await _list({ data: { search, limit: PAGE_SIZE, offset } });
        setUsers(r.users as UserRow[]);
        setMyRank(r.myRank);
        setTotal(r.total);
      }
      if (c.isSuperAdmin) {
        const { data } = await supabase.from("profiles").select("id, xp, level, verified").eq("id", user.id).maybeSingle();
        if (data) setMe(data as MyProfile);
      }
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  // `reload` is a plain function re-created every render — adding it to the
  // deps below would refire this effect in a loop. Only page changes (and
  // the initial mount) should reload.
  useEffect(() => {
    reload().catch(() => {});
  }, [page]); // eslint-disable-line react-hooks/exhaustive-deps

  function doSearch() {
    setPage(0);
    reload({ offset: 0 }).catch(() => {});
  }

  async function doClaim() {
    try {
      await _claim({});
      toast.success("Ты теперь супер-админ 👑");
      await reload();
    } catch (e) { toast.error((e as Error).message); }
  }

  async function run(fn: () => Promise<unknown>, ok: string) {
    try {
      await fn();
      toast.success(ok);
      await reload();
    } catch (e) { toast.error((e as Error).message); }
  }

  async function doSelfBoost(patch: { deltaXp?: number; verified?: boolean; level?: number }) {
    setSelfBusy(true);
    try {
      await _selfBoost({ data: patch });
      const { data } = await supabase.from("profiles").select("id, xp, level, verified").eq("id", user.id).maybeSingle();
      if (data) setMe(data as MyProfile);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSelfBusy(false);
    }
  }

  if (loading && users.length === 0 && !ctx) return <div className="p-8 text-sm text-muted-foreground">Загрузка...</div>;
  if (!ctx) return null;

  if (!ctx.isAdmin) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <Shield className="mx-auto h-10 w-10 text-muted-foreground" />
        <h1 className="mt-4 text-xl font-bold">Админ-панель</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Доступ только для админов. Если ты — владелец проекта и супер-админа ещё нет, забери роль:
        </p>
        <button onClick={doClaim} className="btn-primary mt-4 inline-flex items-center gap-2">
          <Crown className="h-4 w-4" /> Забрать роль супер-админа
        </button>
        <p className="mt-3 text-[10px] text-muted-foreground">
          Кнопка сработает только один раз — пока в системе нет ни одного супер-админа.
        </p>
      </div>
    );
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <AdminTabs active="users" />

      <div className="mt-6 flex items-center gap-3">
        <div className="grid h-10 w-10 place-items-center rounded-lg bg-pink-500/10 text-pink-400">
          {ctx.isSuperAdmin ? <Crown className="h-5 w-5" /> : <Shield className="h-5 w-5" />}
        </div>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">Пользователи</h1>
          <p className="text-xs text-muted-foreground">
            Твой ранг: <span className="text-mint">{ctx.roles.map((r) => ROLE_LABEL[r] ?? r).join(", ") || "—"}</span>
            {" · "}Ты можешь действовать только на пользователей ниже по рангу.
          </p>
        </div>
        <button
          onClick={async () => {
            const t = toast.loading("Готовлю Excel-выгрузку...");
            try {
              const res = await exportUsersXlsx();
              const bin = atob(res.base64);
              const bytes = new Uint8Array(bin.length);
              for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
              const blob = new Blob([bytes], {
                type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
              });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = res.filename;
              document.body.appendChild(a);
              a.click();
              a.remove();
              URL.revokeObjectURL(url);
              toast.success(`Экспортировано пользователей: ${res.users_count}`, { id: t });
            } catch (e) {
              toast.error(`Ошибка выгрузки: ${(e as Error).message}`, { id: t });
            }
          }}
          className="flex items-center gap-2 rounded-lg border border-mint/40 bg-mint/10 px-3 py-2 text-xs font-semibold text-mint hover:bg-mint/20"
          title="Выгрузить всех пользователей в Excel"
        >
          <FileSpreadsheet className="h-4 w-4" />
          Экспорт в Excel
        </button>
      </div>

      {ctx.isSuperAdmin && (
        <div className="mt-6 rounded-xl border border-yellow-400/30 bg-yellow-400/5 p-4">
          <div className="flex items-center gap-2">
            <Crown className="h-4 w-4 text-yellow-300" />
            <h3 className="text-sm font-semibold text-yellow-200">Self-boost (только для своего аккаунта)</h3>
            <span className="ml-auto text-[10px] uppercase tracking-widest text-yellow-400/70">dev</span>
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
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
                  disabled={selfBusy}
                  onClick={() => doSelfBoost({ deltaXp: boostDelta })}
                  className="inline-flex items-center gap-1 rounded-md bg-mint px-2 py-1 text-xs font-bold text-black hover:brightness-110 disabled:opacity-50"
                >
                  <Zap className="h-3 w-3" />+
                </button>
                <button
                  disabled={selfBusy}
                  onClick={() => doSelfBoost({ deltaXp: -Math.abs(boostDelta) })}
                  className="rounded-md border border-border px-2 py-1 text-xs"
                >
                  −
                </button>
              </div>
              <div className="mt-2 flex flex-wrap gap-1">
                {[100, 500, 1000, 5000, 25000].map((v) => (
                  <button
                    key={v}
                    disabled={selfBusy}
                    onClick={() => doSelfBoost({ deltaXp: v })}
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
                    disabled={selfBusy}
                    onClick={() => doSelfBoost({ deltaXp: L.min - (me?.xp ?? 0) })}
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
                disabled={selfBusy}
                onClick={() => doSelfBoost({ verified: !me?.verified })}
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
        </div>
      )}

      <div className="glass mt-6 flex items-center gap-2 rounded-xl p-2">
        <Search className="ml-2 h-4 w-4 text-muted-foreground" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && doSearch()}
          placeholder="Поиск по username..."
          className="flex-1 bg-transparent px-2 py-1.5 text-sm outline-none"
        />
        <button onClick={doSearch} className="rounded bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground">
          Найти
        </button>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        {([
          { key: "all", label: "Все" },
          { key: "roles", label: "С ролями" },
          { key: "subs", label: "С подпиской" },
        ] as const).map((t) => (
          <button
            key={t.key}
            onClick={() => {
              setFilter(t.key);
              if (typeof window !== "undefined") {
                const h = t.key === "all" ? " " : `#${t.key}`;
                history.replaceState(null, "", window.location.pathname + (t.key === "all" ? "" : h));
              }
            }}
            className={`rounded-md border px-2.5 py-1 text-[11px] font-semibold ${
              filter === t.key ? "border-mint/50 bg-mint/15 text-mint" : "border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
        <span className="ml-2 text-[10px] uppercase tracking-widest text-muted-foreground">
          {filter === "roles" ? "показаны с назначенными ролями" : filter === "subs" ? "показаны с активной подпиской" : ""}
        </span>
      </div>

      <div className="mt-4 space-y-2">
        {users
          .filter((u) => {
            if (filter === "roles") return u.roles.some((r) => r !== "user");
            if (filter === "subs") return u.subscription_tier !== "free" || subActive(u);
            return true;
          })
          .map((u) => {
          const isOpen = expanded === u.id;
          const isSelf = u.id === ctx.userId;
          const disabled = !u.canAct;
          return (
            <div key={u.id} className={`panel rounded-xl ${u.ban ? "border-destructive/40" : ""}`}>
              <button
                onClick={() => setExpanded(isOpen ? null : u.id)}
                className="flex w-full items-center gap-3 p-3 text-left"
              >
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-secondary text-sm font-bold text-mint">
                  {(u.username ?? "?")[0]?.toUpperCase()}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="truncate text-sm font-semibold">{u.username ?? "—"}</span>
                    {u.verified && <BadgeCheck className="h-3.5 w-3.5 shrink-0 text-cyan-300" />}
                    {isSelf && <span className="rounded bg-mint/20 px-1.5 py-0.5 text-[9px] font-bold uppercase text-mint">Ты</span>}
                    {u.roles.map((r) => (
                      <span key={r} className={`rounded border px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider ${ROLE_COLORS[r] ?? ROLE_COLORS.user}`}>
                        {ROLE_LABEL[r] ?? r}
                      </span>
                    ))}
                    {u.certs.map((c) => (
                      <span key={c.id} title={c.name} className="rounded-full border px-1.5 py-0.5 text-[10px]" style={{ borderColor: c.color, color: c.color }}>
                        {c.icon ?? "★"} {c.name}
                      </span>
                    ))}
                    {u.ban && <span className="rounded bg-destructive/20 px-1.5 py-0.5 text-[9px] font-bold uppercase text-destructive">Бан</span>}
                    {(u.subscription_tier !== "free" || subActive(u)) && (
                      <span className={`rounded border px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider ${TIER_COLORS[u.subscription_tier] ?? TIER_COLORS.free}`}>
                        {TIER_LABEL[u.subscription_tier] ?? u.subscription_tier}
                        {u.subscription_tier !== "lifetime" && u.subscription_until && ` · ${fmtDate(u.subscription_until)}`}
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                    LVL {u.level} · {u.xp} XP · {u.id.slice(0, 8)}
                  </p>
                </div>
                <ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${isOpen ? "rotate-180" : ""}`} />
              </button>

              {isOpen && (
                <div className="border-t border-black/60 p-4">
                  {disabled ? (
                    <p className="text-xs text-muted-foreground">
                      {isSelf ? "Ты не можешь применять действия к самому себе." : "Ранг этого пользователя не ниже твоего — действия недоступны."}
                    </p>
                  ) : (
                    <div className="grid gap-4 md:grid-cols-2">
                      {/* Roles */}
                      <section>
                        <h4 className="label-mono">Роли</h4>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {(["moderator", "admin", "super_admin"] as const).map((r) => {
                            const has = u.roles.includes(r);
                            const rankNeeded = { moderator: 2, admin: 3, super_admin: 4 }[r];
                            const canGrant = myRank >= rankNeeded;
                            return (
                              <button
                                key={r}
                                disabled={!canGrant}
                                onClick={() => run(() => _setRole({ data: { targetId: u.id, role: r, grant: !has } }), has ? "Роль снята" : "Роль выдана")}
                                className={`rounded border px-2 py-1 text-[10px] font-bold uppercase tracking-wider disabled:opacity-30 ${
                                  has ? "border-destructive/50 bg-destructive/20 text-destructive" : "border-mint/50 bg-mint/10 text-mint hover:bg-mint/20"
                                }`}
                              >
                                {has ? "− " : "+ "}{ROLE_LABEL[r]}
                              </button>
                            );
                          })}
                        </div>
                      </section>

                      {/* Verification */}
                      <section>
                        <h4 className="label-mono">Верификация</h4>
                        <button
                          onClick={() => run(() => _setVerified({ data: { targetId: u.id, verified: !u.verified } }), u.verified ? "Верификация снята" : "Верификация выдана")}
                          className={`mt-2 inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-semibold transition ${
                            u.verified ? "border-cyan-400/60 bg-cyan-400/15 text-cyan-200" : "border-border hover:bg-secondary"
                          }`}
                        >
                          <BadgeCheck className="h-3.5 w-3.5" />
                          {u.verified ? "Снять галочку" : "Выдать галочку"}
                        </button>
                      </section>

                      {/* XP */}
                      <section>
                        <h4 className="label-mono">XP</h4>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {[-500, -100, +100, +500, +2000].map((d) => (
                            <button
                              key={d}
                              onClick={() => run(() => _xp({ data: { targetId: u.id, delta: d } }), `XP ${d > 0 ? "+" : ""}${d}`)}
                              className={`inline-flex items-center gap-1 rounded border px-2 py-1 text-[10px] font-bold ${
                                d > 0 ? "border-mint/50 bg-mint/10 text-mint" : "border-destructive/40 bg-destructive/10 text-destructive"
                              }`}
                            >
                              <Zap className="h-3 w-3" /> {d > 0 ? `+${d}` : d}
                            </button>
                          ))}
                          <XpCustom onSubmit={(v) => run(() => _xp({ data: { targetId: u.id, delta: v } }), `XP ${v > 0 ? "+" : ""}${v}`)} />
                        </div>
                      </section>

                      {/* Ban */}
                      <section>
                        <h4 className="label-mono">Бан</h4>
                        {u.ban ? (
                          <div className="mt-2 space-y-2">
                            <p className="rounded bg-destructive/10 p-2 text-[11px] text-destructive">
                              <strong>Причина:</strong> {u.ban.reason}
                              {u.ban.expires_at && <> · до {new Date(u.ban.expires_at).toLocaleDateString("ru-RU")}</>}
                            </p>
                            <button
                              onClick={() => run(() => _unban({ data: { targetId: u.id } }), "Разбанен")}
                              className="inline-flex items-center gap-1 rounded bg-mint/20 px-2 py-1 text-[10px] font-bold text-mint"
                            >
                              <ShieldCheck className="h-3 w-3" /> Разбанить
                            </button>
                          </div>
                        ) : (
                          <BanForm onSubmit={(reason, days) => run(() => _ban({ data: { targetId: u.id, reason, days } }), "Забанен")} />
                        )}
                      </section>

                      {/* Certs */}
                      <section>
                        <h4 className="label-mono">Сертификации</h4>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {certs.map((c) => {
                            const has = u.certs.some((x) => x.id === c.id);
                            return (
                              <button
                                key={c.id}
                                onClick={() => run(() => _cert({ data: { targetId: u.id, certificationId: c.id, grant: !has } }), has ? "Сертификат снят" : "Сертификат выдан")}
                                className="inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[10px] font-semibold transition-opacity"
                                style={{
                                  borderColor: c.color,
                                  color: has ? "#0a0a0a" : c.color,
                                  background: has ? c.color : "transparent",
                                }}
                              >
                                {has ? <UserX className="h-3 w-3" /> : <Award className="h-3 w-3" />}
                                {c.icon ?? "★"} {c.name}
                              </button>
                            );
                          })}
                        </div>
                      </section>

                      {/* Subscription */}
                      <section className="md:col-span-2">
                        <h4 className="label-mono flex items-center gap-1.5">
                          <Clock className="h-3 w-3" /> Подписка / время пользования
                        </h4>
                        <div className="mt-2 rounded-lg border border-black/60 bg-black/20 p-3">
                          <div className="flex flex-wrap items-center gap-2 text-[11px]">
                            <span className="text-muted-foreground">Тариф:</span>
                            <span className={`rounded border px-1.5 py-0.5 text-[10px] font-bold uppercase ${TIER_COLORS[u.subscription_tier] ?? TIER_COLORS.free}`}>
                              {TIER_LABEL[u.subscription_tier] ?? u.subscription_tier}
                            </span>
                            <span className="text-muted-foreground">·</span>
                            <span className="text-muted-foreground">Действует до:</span>
                            <span className={subActive(u) ? "text-mint font-mono" : "text-destructive font-mono"}>
                              {u.subscription_tier === "lifetime" ? "∞ навсегда" : fmtDate(u.subscription_until)}
                            </span>
                            {subActive(u) ? (
                              <span className="rounded bg-mint/20 px-1.5 py-0.5 text-[9px] font-bold uppercase text-mint">Активна</span>
                            ) : (
                              <span className="rounded bg-secondary px-1.5 py-0.5 text-[9px] font-bold uppercase text-muted-foreground">Не активна</span>
                            )}
                          </div>

                          <div className="mt-3">
                            <p className="mb-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">Продлить (добавить время)</p>
                            <div className="flex flex-wrap gap-1.5">
                              {[7, 30, 90, 180, 365].map((d) => (
                                <button
                                  key={d}
                                  onClick={() => run(() => _extendSub({ data: { targetId: u.id, days: d, tier: "pro" } }), `+${d} дней PRO`)}
                                  className="inline-flex items-center gap-1 rounded border border-mint/40 bg-mint/10 px-2 py-1 text-[10px] font-bold text-mint hover:bg-mint/20"
                                >
                                  <Clock className="h-3 w-3" /> +{d} дн
                                </button>
                              ))}
                              <ExtendCustom onSubmit={(days) => run(() => _extendSub({ data: { targetId: u.id, days, tier: "pro" } }), `+${days} дней PRO`)} />
                            </div>
                          </div>

                          <div className="mt-3">
                            <p className="mb-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">Установить тариф</p>
                            <div className="flex flex-wrap gap-1.5">
                              <button
                                onClick={() => run(() => _setSub({ data: { targetId: u.id, tier: "free", until: null } }), "Тариф: Free")}
                                className="inline-flex items-center gap-1 rounded border border-destructive/40 bg-destructive/10 px-2 py-1 text-[10px] font-bold text-destructive"
                              >
                                <UserX className="h-3 w-3" /> Сбросить (Free)
                              </button>
                              <button
                                onClick={() => run(() => _extendSub({ data: { targetId: u.id, days: 14, tier: "trial" } }), "Trial 14 дн")}
                                className="inline-flex items-center gap-1 rounded border border-cyan/40 bg-cyan/10 px-2 py-1 text-[10px] font-bold text-cyan"
                              >
                                <Sparkles className="h-3 w-3" /> Trial 14 дн
                              </button>
                              <button
                                onClick={() => run(() => _setSub({ data: { targetId: u.id, tier: "lifetime", until: null } }), "Lifetime ∞")}
                                className="inline-flex items-center gap-1 rounded border border-yellow-400/40 bg-yellow-400/10 px-2 py-1 text-[10px] font-bold text-yellow-300"
                              >
                                <InfinityIcon className="h-3.5 w-3.5" /> Lifetime
                              </button>
                            </div>
                            <p className="mt-2 text-[10px] text-muted-foreground">
                              Заглушка под будущую систему подписок — сейчас просто хранит тариф и срок для каждого пользователя.
                            </p>
                          </div>
                        </div>
                      </section>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {users.length === 0 && (
          <p className="py-10 text-center text-sm text-muted-foreground">
            <Sparkles className="mx-auto mb-2 h-5 w-5 opacity-40" />
            Пользователей не найдено
          </p>
        )}
      </div>

      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-center gap-3 text-xs text-muted-foreground">
          <button
            disabled={page === 0}
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 font-semibold disabled:opacity-30"
          >
            <ChevronLeft className="h-3.5 w-3.5" /> Назад
          </button>
          <span>Стр. {page + 1} из {totalPages} · {total} польз.</span>
          <button
            disabled={page + 1 >= totalPages}
            onClick={() => setPage((p) => p + 1)}
            className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 font-semibold disabled:opacity-30"
          >
            Вперёд <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}

function XpCustom({ onSubmit }: { onSubmit: (v: number) => void }) {
  const [v, setV] = useState("");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const n = parseInt(v, 10);
        if (!Number.isFinite(n) || n === 0) return;
        onSubmit(n);
        setV("");
      }}
      className="flex items-center gap-1"
    >
      <input
        value={v}
        onChange={(e) => setV(e.target.value)}
        placeholder="±"
        className="w-16 rounded border border-input bg-background px-2 py-1 text-[10px] outline-none"
      />
      <button className="rounded border border-black/60 bg-secondary px-2 py-1 text-[10px] font-bold">OK</button>
    </form>
  );
}

function BanForm({ onSubmit }: { onSubmit: (reason: string, days?: number) => void }) {
  const [reason, setReason] = useState("");
  const [days, setDays] = useState<number | "">("");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (reason.trim().length < 3) return;
        onSubmit(reason.trim(), typeof days === "number" ? days : undefined);
        setReason("");
        setDays("");
      }}
      className="mt-2 space-y-1.5"
    >
      <input
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Причина..."
        className="w-full rounded border border-input bg-background px-2 py-1 text-[11px] outline-none"
      />
      <div className="flex items-center gap-1.5">
        <input
          type="number"
          value={days}
          onChange={(e) => setDays(e.target.value ? Number(e.target.value) : "")}
          placeholder="Дней (пусто = навсегда)"
          className="w-40 rounded border border-input bg-background px-2 py-1 text-[10px] outline-none"
        />
        <button className="inline-flex items-center gap-1 rounded bg-destructive/20 px-2 py-1 text-[10px] font-bold text-destructive">
          <Ban className="h-3 w-3" /> Забанить
        </button>
      </div>
    </form>
  );
}

function ExtendCustom({ onSubmit }: { onSubmit: (days: number) => void }) {
  const [v, setV] = useState("");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const n = parseInt(v, 10);
        if (!Number.isFinite(n) || n <= 0) return;
        onSubmit(n);
        setV("");
      }}
      className="flex items-center gap-1"
    >
      <input
        value={v}
        onChange={(e) => setV(e.target.value)}
        placeholder="дней"
        className="w-20 rounded border border-input bg-background px-2 py-1 text-[10px] outline-none"
      />
      <button className="rounded border border-mint/40 bg-mint/10 px-2 py-1 text-[10px] font-bold text-mint">+ Добавить</button>
    </form>
  );
}
