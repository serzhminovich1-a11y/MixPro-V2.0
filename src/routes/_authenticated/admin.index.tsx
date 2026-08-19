import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Shield, Crown, Search, Zap, Ban, ShieldCheck, Award,
  UserX, Sparkles, ChevronDown, ChevronLeft, ChevronRight, Clock,
  FileSpreadsheet, BadgeCheck,
} from "lucide-react";
import { exportUsersXlsx } from "@/lib/admin-export.functions";
import {
  claimSuperAdmin, getMyAdminContext, listUsers, listCertifications,
  setRole, adjustXp, banUser, unbanUser, awardCert,
  setSubscription, extendSubscription, setVerified,
} from "@/lib/admin.functions";
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
  super_admin: "Супер-админ", admin: "Админ", moderator: "Модератор", teacher: "Преподаватель", user: "Юзер",
};
const ROLE_COLORS: Record<string, string> = {
  super_admin: "bg-pink-500/20 text-pink-300 border-pink-500/40",
  admin: "bg-violet/20 text-violet border-violet/40",
  moderator: "bg-cyan/20 text-cyan border-cyan/40",
  teacher: "bg-orange-500/20 text-orange-300 border-orange-500/40",
  user: "bg-secondary text-muted-foreground border-black/60",
};
const ROLE_RANK: Record<string, number> = { super_admin: 4, admin: 3, moderator: 2, teacher: 1 };
/** Highest-ranked role only — a compact table row shows one badge, not
 * one per role a person happens to hold. Full list is still in the
 * expanded detail panel below (the checkbox grid). */
function topRole(roles: string[]): string | null {
  return roles.reduce<string | null>((top, r) => (!top || (ROLE_RANK[r] ?? 0) > (ROLE_RANK[top] ?? 0) ? r : top), null);
}

function AdminPage() {
  const [ctx, setCtx] = useState<{ userId: string; roles: string[]; isSuperAdmin: boolean; isAdmin: boolean } | null>(null);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [certs, setCerts] = useState<Cert[]>([]);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<"xp" | "created_at" | "username">("xp");
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

  async function reload(opts?: { offset?: number; sort?: typeof sort }) {
    setLoading(true);
    try {
      const [c, cs] = await Promise.all([_ctx({}), _listCerts()]);
      setCtx(c);
      setCerts(cs.certifications as Cert[]);
      if (c.isAdmin) {
        const offset = opts?.offset ?? page * PAGE_SIZE;
        const r = await _list({ data: { search, limit: PAGE_SIZE, offset, sort: opts?.sort ?? sort } });
        setUsers(r.users as UserRow[]);
        setMyRank(r.myRank);
        setTotal(r.total);
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

  function onSortChange(next: typeof sort) {
    setSort(next);
    setPage(0);
    reload({ offset: 0, sort: next }).catch(() => {});
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
      <div className="flex items-center gap-3">
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

      <div className="glass mt-6 flex flex-wrap items-center gap-2 rounded-xl p-2">
        <Search className="ml-2 h-4 w-4 shrink-0 text-muted-foreground" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && doSearch()}
          placeholder="Поиск по username..."
          className="min-w-0 flex-1 bg-transparent px-2 py-1.5 text-sm outline-none"
        />
        <button onClick={doSearch} className="rounded bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground">
          Найти
        </button>
        <select
          value={sort}
          onChange={(e) => onSortChange(e.target.value as typeof sort)}
          className="rounded-md border border-input bg-background px-2 py-1.5 text-xs outline-none focus:ring-1 focus:ring-ring"
        >
          <option value="xp">По XP</option>
          <option value="created_at">По дате регистрации</option>
          <option value="username">По имени</option>
        </select>
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

      {/* Column headers — a real table shape scans far faster once this list
          is hundreds of rows long than the old stacked-badge cards did. */}
      <div className="mt-4 hidden grid-cols-[2.5rem_1fr_8rem_7rem_5.5rem_1.25rem] gap-3 px-3 font-mono text-[10px] uppercase tracking-wider text-muted-foreground sm:grid">
        <span />
        <span>Пользователь</span>
        <span>Роль</span>
        <span>Тариф</span>
        <span className="text-right">LVL · XP</span>
        <span />
      </div>

      <div className="mt-1.5 space-y-1.5">
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
          const role = topRole(u.roles);
          const paid = u.subscription_tier !== "free" || subActive(u);
          return (
            <div key={u.id} className={`panel rounded-xl ${u.ban ? "border-destructive/40" : ""}`}>
              <button
                onClick={() => setExpanded(isOpen ? null : u.id)}
                className="grid w-full grid-cols-[2.5rem_1fr_auto] items-center gap-3 p-2.5 text-left sm:grid-cols-[2.5rem_1fr_8rem_7rem_5.5rem_1.25rem]"
              >
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-secondary text-sm font-bold text-mint">
                  {(u.username ?? "?")[0]?.toUpperCase()}
                </span>

                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="truncate text-sm font-semibold">{u.username ?? "—"}</span>
                    {u.verified && <BadgeCheck className="h-3.5 w-3.5 shrink-0 text-cyan-300" />}
                    {isSelf && <span className="rounded bg-mint/20 px-1.5 py-0.5 text-[9px] font-bold uppercase text-mint">Ты</span>}
                    {u.ban && <span className="rounded bg-destructive/20 px-1.5 py-0.5 text-[9px] font-bold uppercase text-destructive">Бан</span>}
                    {u.certs.length > 0 && (
                      <span title={u.certs.map((c) => c.name).join(", ")} className="rounded border border-border/60 px-1.5 py-0.5 text-[9px] text-muted-foreground">
                        ★ {u.certs.length}
                      </span>
                    )}
                  </div>
                  {/* Role/tier/LVL repeated here, compact, for mobile where the
                      dedicated columns are hidden. */}
                  <p className="mt-0.5 truncate font-mono text-[10px] uppercase tracking-wider text-muted-foreground sm:hidden">
                    {role ? `${ROLE_LABEL[role]} · ` : ""}{paid ? `${TIER_LABEL[u.subscription_tier] ?? u.subscription_tier} · ` : ""}LVL {u.level} · {u.xp} XP
                  </p>
                </div>

                <span className="hidden sm:block">
                  {role && (
                    <span className={`rounded border px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider ${ROLE_COLORS[role] ?? ROLE_COLORS.user}`}>
                      {ROLE_LABEL[role]}
                    </span>
                  )}
                </span>

                <span className="hidden sm:block">
                  {paid && (
                    <span className={`rounded border px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider ${TIER_COLORS[u.subscription_tier] ?? TIER_COLORS.free}`}>
                      {TIER_LABEL[u.subscription_tier] ?? u.subscription_tier}
                    </span>
                  )}
                </span>

                <span className="hidden text-right font-mono text-[11px] text-muted-foreground sm:block">
                  {u.level} · {u.xp}
                </span>

                <ChevronDown className={`h-4 w-4 shrink-0 justify-self-end transition-transform ${isOpen ? "rotate-180" : ""}`} />
              </button>

              {isOpen && (
                <div className="border-t border-black/60 p-4">
                  {disabled ? (
                    <p className="text-xs text-muted-foreground">
                      {isSelf ? "Ты не можешь применять действия к самому себе." : "Ранг этого пользователя не ниже твоего — действия недоступны."}
                    </p>
                  ) : (
                    <div className="grid gap-3 md:grid-cols-2">
                      {/* Roles */}
                      <section className="rounded-lg border border-border/60 bg-background/40 p-3">
                        <h4 className="label-mono">Роли</h4>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {(["teacher", "moderator", "admin", "super_admin"] as const).map((r) => {
                            const has = u.roles.includes(r);
                            const rankNeeded = { teacher: 1, moderator: 2, admin: 3, super_admin: 4 }[r];
                            const canGrant = myRank >= rankNeeded;
                            return (
                              <label
                                key={r}
                                className={`flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium transition ${
                                  canGrant ? "cursor-pointer" : "cursor-not-allowed opacity-30"
                                } ${has ? "border-mint/40 bg-mint/10 text-mint" : "border-border text-muted-foreground hover:text-foreground"}`}
                              >
                                <input
                                  type="checkbox"
                                  checked={has}
                                  disabled={!canGrant}
                                  onChange={() => run(() => _setRole({ data: { targetId: u.id, role: r, grant: !has } }), has ? "Роль снята" : "Роль выдана")}
                                  className="h-3.5 w-3.5 accent-mint"
                                />
                                {ROLE_LABEL[r]}
                              </label>
                            );
                          })}
                        </div>
                      </section>

                      {/* Verification */}
                      <section className="rounded-lg border border-border/60 bg-background/40 p-3">
                        <h4 className="label-mono">Верификация</h4>
                        <div className="mt-2">
                          <Toggle
                            checked={!!u.verified}
                            onChange={() => run(() => _setVerified({ data: { targetId: u.id, verified: !u.verified } }), u.verified ? "Верификация снята" : "Верификация выдана")}
                            label={u.verified ? "Верифицирован" : "Не верифицирован"}
                          />
                        </div>
                      </section>

                      {/* XP */}
                      <section className="rounded-lg border border-border/60 bg-background/40 p-3">
                        <h4 className="label-mono">XP · Lvl {u.level}</h4>
                        <XpEditor onApply={(delta) => run(() => _xp({ data: { targetId: u.id, delta } }), `XP ${delta > 0 ? "+" : ""}${delta}`)} />
                      </section>

                      {/* Ban */}
                      <section className="rounded-lg border border-border/60 bg-background/40 p-3">
                        <h4 className="label-mono">Бан</h4>
                        {u.ban ? (
                          <div className="mt-2 space-y-2">
                            <p className="rounded-md border border-destructive/30 bg-destructive/5 p-2 text-[11px] text-muted-foreground">
                              <span className="text-destructive">{u.ban.reason}</span>
                              {u.ban.expires_at && <> · до {new Date(u.ban.expires_at).toLocaleDateString("ru-RU")}</>}
                            </p>
                            <button
                              onClick={() => run(() => _unban({ data: { targetId: u.id } }), "Разбанен")}
                              className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-xs font-semibold hover:border-mint/50 hover:text-mint"
                            >
                              <ShieldCheck className="h-3 w-3" /> Разбанить
                            </button>
                          </div>
                        ) : (
                          <BanForm onSubmit={(reason, days) => run(() => _ban({ data: { targetId: u.id, reason, days } }), "Забанен")} />
                        )}
                      </section>

                      {/* Certs */}
                      <section className="rounded-lg border border-border/60 bg-background/40 p-3 md:col-span-2">
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
                                  borderColor: has ? c.color : `${c.color}55`,
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
                      <section className="rounded-lg border border-border/60 bg-background/40 p-3 md:col-span-2">
                        <h4 className="label-mono flex items-center gap-1.5">
                          <Clock className="h-3 w-3" /> Подписка / время пользования
                        </h4>

                        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                          <span className="text-muted-foreground">Тариф:</span>
                          <span className="font-semibold">{TIER_LABEL[u.subscription_tier] ?? u.subscription_tier}</span>
                          <span className="text-muted-foreground">·</span>
                          <span className="text-muted-foreground">действует до:</span>
                          <span className="font-mono">{u.subscription_tier === "lifetime" ? "∞ навсегда" : fmtDate(u.subscription_until)}</span>
                          <span className={`inline-flex items-center gap-1.5 text-[10px] ${subActive(u) ? "text-mint" : "text-muted-foreground"}`}>
                            <span className={`h-1.5 w-1.5 rounded-full ${subActive(u) ? "bg-mint" : "bg-muted-foreground/50"}`} aria-hidden="true" />
                            {subActive(u) ? "активна" : "не активна"}
                          </span>
                        </div>

                        <div className="mt-3 grid gap-3 sm:grid-cols-2">
                          <div>
                            <p className="mb-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">Продлить</p>
                            <ExtendEditor onApply={(days) => run(() => _extendSub({ data: { targetId: u.id, days, tier: "pro" } }), `+${days} дней PRO`)} />
                          </div>
                          <div>
                            <p className="mb-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">Установить тариф</p>
                            <TierSetter
                              onApply={(choice) => {
                                if (choice === "free") run(() => _setSub({ data: { targetId: u.id, tier: "free", until: null } }), "Тариф: Free");
                                else if (choice === "trial") run(() => _extendSub({ data: { targetId: u.id, days: 14, tier: "trial" } }), "Trial 14 дн");
                                else run(() => _setSub({ data: { targetId: u.id, tier: "lifetime", until: null } }), "Lifetime ∞");
                              }}
                            />
                          </div>
                        </div>
                        <p className="mt-2 text-[10px] text-muted-foreground">
                          Заглушка под будущую систему подписок — сейчас просто хранит тариф и срок для каждого пользователя.
                        </p>
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

/** Neutral on/off switch — used in place of a colored button for binary
 * state (verification). One accent color regardless of what it controls;
 * the label text carries the meaning, never the color alone. */
function Toggle({ checked, onChange, label }: { checked: boolean; onChange: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onChange}
      className={`inline-flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-xs font-medium transition ${
        checked ? "border-mint/40 bg-mint/10 text-mint" : "border-border text-muted-foreground hover:text-foreground"
      }`}
    >
      <span className={`relative inline-flex h-4 w-7 shrink-0 rounded-full transition-colors ${checked ? "bg-mint" : "bg-secondary"}`}>
        <span className={`absolute top-0.5 h-3 w-3 rounded-full bg-background transition-transform ${checked ? "translate-x-3.5" : "translate-x-0.5"}`} />
      </span>
      {label}
    </button>
  );
}

/** Single number input + apply/remove buttons, with small preset chips that
 * just pre-fill the input rather than firing immediately — replaces a row
 * of 5 differently-colored one-shot buttons with one deliberate control. */
function XpEditor({ onApply }: { onApply: (delta: number) => void }) {
  const [v, setV] = useState("100");
  const n = parseInt(v, 10) || 0;
  return (
    <div className="mt-2 space-y-1.5">
      <div className="flex items-center gap-1.5">
        <input
          type="number"
          value={v}
          onChange={(e) => setV(e.target.value)}
          className="w-24 rounded-md border border-input bg-background px-2 py-1.5 text-xs font-mono outline-none focus:ring-1 focus:ring-ring"
        />
        <button
          disabled={n === 0}
          onClick={() => onApply(Math.abs(n))}
          className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-xs font-semibold text-foreground hover:border-mint/50 hover:text-mint disabled:opacity-30"
        >
          <Zap className="h-3 w-3" /> Начислить
        </button>
        <button
          disabled={n === 0}
          onClick={() => onApply(-Math.abs(n))}
          className="rounded-md border border-border px-2.5 py-1.5 text-xs font-semibold text-muted-foreground hover:border-destructive/50 hover:text-destructive disabled:opacity-30"
        >
          Списать
        </button>
      </div>
      <div className="flex flex-wrap gap-1">
        {[100, 500, 2000].map((p) => (
          <button
            key={p}
            onClick={() => setV(String(p))}
            className="rounded-full border border-border px-2 py-0.5 text-[10px] text-muted-foreground hover:border-mint/40 hover:text-mint"
          >
            {p.toLocaleString()}
          </button>
        ))}
      </div>
    </div>
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
        className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-xs outline-none focus:ring-1 focus:ring-ring"
      />
      <div className="flex items-center gap-1.5">
        <input
          type="number"
          value={days}
          onChange={(e) => setDays(e.target.value ? Number(e.target.value) : "")}
          placeholder="Дней (пусто = навсегда)"
          className="w-40 rounded-md border border-input bg-background px-2 py-1.5 text-xs outline-none focus:ring-1 focus:ring-ring"
        />
        <button className="inline-flex items-center gap-1 rounded-md border border-destructive/40 bg-destructive/10 px-2.5 py-1.5 text-xs font-semibold text-destructive hover:bg-destructive/20">
          <Ban className="h-3 w-3" /> Заблокировать
        </button>
      </div>
    </form>
  );
}

/** Tier dropdown + one confirm button, instead of 3 separately-colored
 * one-shot buttons (Free/Trial/Lifetime). */
function TierSetter({ onApply }: { onApply: (choice: "free" | "trial" | "lifetime") => void }) {
  const [choice, setChoice] = useState<"free" | "trial" | "lifetime">("trial");
  return (
    <div className="flex items-center gap-1.5">
      <select
        value={choice}
        onChange={(e) => setChoice(e.target.value as "free" | "trial" | "lifetime")}
        className="min-w-0 flex-1 rounded-md border border-input bg-background px-2 py-1.5 text-xs outline-none focus:ring-1 focus:ring-ring"
      >
        <option value="free">Free</option>
        <option value="trial">Trial · 14 дней</option>
        <option value="lifetime">Lifetime · навсегда</option>
      </select>
      <button
        onClick={() => onApply(choice)}
        className="shrink-0 rounded-md border border-border px-2.5 py-1.5 text-xs font-semibold hover:border-mint/50 hover:text-mint"
      >
        Применить
      </button>
    </div>
  );
}

/** Days-to-extend input + presets that pre-fill it, instead of 5 one-shot
 * buttons plus a separate custom-days form. */
function ExtendEditor({ onApply }: { onApply: (days: number) => void }) {
  const [v, setV] = useState("30");
  const n = parseInt(v, 10) || 0;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5">
        <input
          type="number"
          value={v}
          onChange={(e) => setV(e.target.value)}
          className="w-20 rounded-md border border-input bg-background px-2 py-1.5 text-xs font-mono outline-none focus:ring-1 focus:ring-ring"
        />
        <span className="text-[10px] text-muted-foreground">дней</span>
        <button
          disabled={n <= 0}
          onClick={() => onApply(n)}
          className="ml-auto inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-xs font-semibold hover:border-mint/50 hover:text-mint disabled:opacity-30"
        >
          <Clock className="h-3 w-3" /> Продлить PRO
        </button>
      </div>
      <div className="flex flex-wrap gap-1">
        {[7, 30, 90, 365].map((p) => (
          <button
            key={p}
            onClick={() => setV(String(p))}
            className="rounded-full border border-border px-2 py-0.5 text-[10px] text-muted-foreground hover:border-mint/40 hover:text-mint"
          >
            {p} дн
          </button>
        ))}
      </div>
    </div>
  );
}
