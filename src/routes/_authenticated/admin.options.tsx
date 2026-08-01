import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Crown,
  Zap,
  BadgeCheck,
  Search,
  Users,
  SlidersHorizontal,
  BookOpen,
  Library,
  Music2,
  CalendarClock,
  Infinity as InfinityIcon,
  ShieldCheck,
  CreditCard,
  Loader2,
  X,
  Sparkles,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { LEAGUES } from "@/lib/leagues";
import { RouteError, RouteNotFound } from "@/components/route-fallbacks";
import { RoleGate } from "@/components/role-gate";

type Profile = Tables<"profiles"> & { verified?: boolean | null };

export const Route = createFileRoute("/_authenticated/admin/options")({
  head: () => ({ meta: [{ title: "Опции супер-админа — MixPro" }, { name: "robots", content: "noindex" }] }),
  component: () => (
    <RoleGate role="super_admin">
      <AdminOptionsPage />
    </RoleGate>
  ),
  errorComponent: RouteError,
  notFoundComponent: RouteNotFound,
});

const TIERS = [
  { key: "free", label: "Free", color: "text-muted-foreground", ring: "border-border" },
  { key: "trial", label: "Trial", color: "text-cyan-300", ring: "border-cyan-400/40" },
  { key: "pro", label: "Pro", color: "text-mint", ring: "border-mint/50" },
  { key: "lifetime", label: "Lifetime", color: "text-yellow-300", ring: "border-yellow-400/50" },
] as const;

const PRESET_DURATIONS = [
  { days: 30, label: "1 мес" },
  { days: 90, label: "3 мес" },
  { days: 180, label: "6 мес" },
  { days: 365, label: "1 год" },
  { days: 730, label: "2 года" },
];

function AdminOptionsPage() {
  const { user } = Route.useRouteContext();

  // Self section
  const [me, setMe] = useState<Profile | null>(null);
  const [boostDelta, setBoostDelta] = useState<number>(1000);
  const [selfBusy, setSelfBusy] = useState(false);

  // User management
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Profile[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<Profile | null>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    supabase.from("profiles").select("*").eq("id", user.id).maybeSingle().then(({ data }) => {
      if (data) setMe(data);
    });
  }, [user.id]);

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }
    let alive = true;
    setSearching(true);
    const t = setTimeout(async () => {
      const q = query.trim();
      const { data } = await supabase
        .from("profiles")
        .select("*")
        .or(`username.ilike.%${q}%,full_name.ilike.%${q}%,id.eq.${isUUID(q) ? q : "00000000-0000-0000-0000-000000000000"}`)
        .order("username")
        .limit(20);
      if (!alive) return;
      setResults((data ?? []) as Profile[]);
      setSearching(false);
    }, 250);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [query]);

  function flash(msg: string) {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2400);
  }

  async function refreshSelected() {
    if (!selected) return;
    const { data } = await supabase.from("profiles").select("*").eq("id", selected.id).maybeSingle();
    if (data) setSelected(data as Profile);
  }

  async function grantSubscription(days: number | "lifetime", tier: "pro" | "trial" | "lifetime" = "pro") {
    if (!selected) return;
    setBusy(true);
    try {
      if (days === "lifetime") {
        const { error } = await supabase.rpc("admin_set_subscription", {
          _actor: user.id,
          _target: selected.id,
          _tier: "lifetime",
          _until: null as unknown as string,
        });
        if (error) throw error;
        flash("Выдан Lifetime доступ");
      } else {
        const { error } = await supabase.rpc("admin_extend_subscription", {
          _actor: user.id,
          _target: selected.id,
          _days: days,
          _tier: tier,
        });
        if (error) throw error;
        flash(`+${days} дн. ${tier.toUpperCase()}`);
      }
      await refreshSelected();
    } catch (e) {
      alert("Ошибка: " + (e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function revokeSubscription() {
    if (!selected) return;
    if (!confirm("Отозвать подписку у пользователя?")) return;
    setBusy(true);
    const { error } = await supabase.rpc("admin_set_subscription", {
      _actor: user.id,
      _target: selected.id,
      _tier: "free",
      _until: null as unknown as string,
    });
    if (error) alert("Ошибка: " + error.message);
    else {
      flash("Подписка отозвана");
      await refreshSelected();
    }
    setBusy(false);
  }

  async function toggleVerified() {
    if (!selected) return;
    setBusy(true);
    const next = !selected.verified;
    const { error } = await supabase.from("profiles").update({ verified: next } as never).eq("id", selected.id);
    if (error) alert("Ошибка: " + error.message);
    else {
      flash(next ? "Верификация выдана" : "Верификация снята");
      setSelected({ ...selected, verified: next });
    }
    setBusy(false);
  }

  async function adjustUserXP(delta: number) {
    if (!selected) return;
    setBusy(true);
    const { error } = await supabase.rpc("admin_adjust_xp", {
      _actor: user.id,
      _target: selected.id,
      _delta: delta,
    });
    if (error) alert("Ошибка: " + error.message);
    else {
      flash(`${delta > 0 ? "+" : ""}${delta} XP`);
      await refreshSelected();
    }
    setBusy(false);
  }

  async function selfBoost(field: "xp" | "verified" | "level", value: number | boolean) {
    if (!me) return;
    setSelfBusy(true);
    const patch: Record<string, number | boolean> =
      field === "xp"
        ? { xp: Math.max(0, (me.xp ?? 0) + (value as number)) }
        : field === "level"
          ? { level: Math.max(1, Math.min(999, value as number)) }
          : { verified: value as boolean };
    if (field === "xp") patch.level = 1 + Math.floor(Math.sqrt((patch.xp as number) / 100));
    const { error } = await supabase.from("profiles").update(patch as never).eq("id", user.id);
    if (!error) setMe({ ...me, ...(patch as Partial<Profile>) });
    else alert("Ошибка: " + error.message);
    setSelfBusy(false);
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 md:py-10">
      {/* Header */}
      <div className="flex flex-col gap-3 border-b border-border pb-5 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-lg bg-yellow-400/15 text-yellow-300 ring-1 ring-yellow-400/40">
            <Crown className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Опции супер-админа</h1>
            <p className="text-xs text-muted-foreground">
              Управление подписками, верификацией и правами пользователей.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 rounded-lg border border-dashed border-mint/40 bg-mint/5 px-3 py-2 text-[11px] text-mint">
          <Sparkles className="h-3.5 w-3.5" />
          После подключения платежей выдача прав будет автоматической по вебхуку.
        </div>
      </div>

      {/* Two-column layout */}
      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)]">
        {/* Left: user search */}
        <aside className="rounded-xl border border-border bg-card/40 p-4">
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
            <Users className="h-3.5 w-3.5" /> Пользователи
          </div>
          <div className="relative mt-3">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Поиск: username, имя или UUID"
              className="w-full rounded-md border border-input bg-background pl-8 pr-2 py-2 text-sm outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
          <div className="mt-3 max-h-[520px] space-y-1 overflow-y-auto pr-1">
            {searching && (
              <div className="flex items-center gap-2 px-1 py-2 text-xs text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" /> Поиск…
              </div>
            )}
            {!searching && query && results.length === 0 && (
              <p className="px-1 py-2 text-xs text-muted-foreground">Ничего не найдено.</p>
            )}
            {!query && (
              <p className="px-1 py-2 text-xs text-muted-foreground">
                Начни вводить имя пользователя — выбери его для управления правами.
              </p>
            )}
            {results.map((p) => (
              <button
                key={p.id}
                onClick={() => setSelected(p)}
                className={`flex w-full items-center gap-2 rounded-md border px-2 py-1.5 text-left text-sm transition ${
                  selected?.id === p.id
                    ? "border-mint/60 bg-mint/10"
                    : "border-transparent hover:border-border hover:bg-secondary/60"
                }`}
              >
                <div className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-secondary text-[10px] font-bold uppercase">
                  {(p.username ?? "?").slice(0, 2)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1 truncate text-sm font-medium">
                    <span className="truncate">{p.username}</span>
                    {p.verified && <BadgeCheck className="h-3 w-3 shrink-0 text-cyan-300" />}
                  </div>
                  <div className="truncate text-[10px] text-muted-foreground">
                    {p.subscription_tier ?? "free"} · Lvl {p.level ?? 1}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </aside>

        {/* Right: management + self */}
        <section className="min-w-0 space-y-6">
          {selected ? (
            <UserManagementCard
              profile={selected}
              busy={busy}
              onClose={() => setSelected(null)}
              onGrant={grantSubscription}
              onRevoke={revokeSubscription}
              onToggleVerified={toggleVerified}
              onAdjustXP={adjustUserXP}
            />
          ) : (
            <div className="rounded-xl border border-dashed border-border p-10 text-center">
              <CreditCard className="mx-auto h-8 w-8 text-muted-foreground" />
              <p className="mt-3 text-sm font-medium">Выбери пользователя слева</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Здесь появится карточка с выдачей подписки, верификации и XP.
              </p>
            </div>
          )}

          {/* Self-boost — compact */}
          <div className="rounded-xl border border-yellow-400/30 bg-yellow-400/5 p-4">
            <div className="flex items-center gap-2">
              <Crown className="h-4 w-4 text-yellow-300" />
              <h3 className="text-sm font-semibold text-yellow-200">Self-boost (только для своего аккаунта)</h3>
              <span className="ml-auto text-[10px] uppercase tracking-widest text-yellow-400/70">dev</span>
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              <div className="rounded-lg border border-border bg-background/40 p-3">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-mint">XP</p>
                <div className="mt-2 flex items-center gap-1.5">
                  <input
                    type="number"
                    value={boostDelta}
                    onChange={(e) => setBoostDelta(Number(e.target.value) || 0)}
                    className="w-full min-w-0 rounded border border-input bg-background px-2 py-1 text-sm font-mono outline-none focus:ring-1 focus:ring-ring"
                  />
                  <button
                    disabled={selfBusy}
                    onClick={() => selfBoost("xp", boostDelta)}
                    className="inline-flex items-center gap-1 rounded-md bg-mint px-2 py-1 text-xs font-bold text-black hover:brightness-110 disabled:opacity-50"
                  >
                    <Zap className="h-3 w-3" />+
                  </button>
                  <button
                    disabled={selfBusy}
                    onClick={() => selfBoost("xp", -Math.abs(boostDelta))}
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
                      onClick={() => selfBoost("xp", v)}
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
                      onClick={() => selfBoost("xp", L.min - (me?.xp ?? 0))}
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
                  onClick={() => selfBoost("verified", !me?.verified)}
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
        </section>
      </div>

      {/* Toast */}
      {toast && (
        <div className="pointer-events-none fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-full border border-mint/50 bg-background/95 px-4 py-2 text-xs font-semibold text-mint shadow-lg backdrop-blur">
          {toast}
        </div>
      )}
    </div>
  );
}

function UserManagementCard({
  profile,
  busy,
  onClose,
  onGrant,
  onRevoke,
  onToggleVerified,
  onAdjustXP,
}: {
  profile: Profile;
  busy: boolean;
  onClose: () => void;
  onGrant: (days: number | "lifetime", tier?: "pro" | "trial" | "lifetime") => void;
  onRevoke: () => void;
  onToggleVerified: () => void;
  onAdjustXP: (delta: number) => void;
}) {
  const tier = (profile.subscription_tier ?? "free") as (typeof TIERS)[number]["key"];
  const tierMeta = TIERS.find((t) => t.key === tier) ?? TIERS[0];
  const until = profile.subscription_until ? new Date(profile.subscription_until) : null;
  const active = tier === "lifetime" || (until && until.getTime() > Date.now());
  const daysLeft = until ? Math.max(0, Math.ceil((until.getTime() - Date.now()) / 86400000)) : null;

  const [selectedTier, setSelectedTier] = useState<"pro" | "trial">("pro");
  const [customDays, setCustomDays] = useState<number>(30);

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card/60">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-border bg-secondary/30 px-4 py-3">
        <div className="grid h-10 w-10 place-items-center rounded-full bg-gradient-to-br from-mint/30 to-violet/30 text-sm font-bold uppercase">
          {(profile.username ?? "?").slice(0, 2)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate font-semibold">{profile.username}</span>
            {profile.verified && <BadgeCheck className="h-3.5 w-3.5 text-cyan-300" />}
            <span className={`ml-1 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${tierMeta.ring} ${tierMeta.color}`}>
              {tierMeta.label}
            </span>
          </div>
          <p className="truncate text-[10px] text-muted-foreground font-mono">{profile.id}</p>
        </div>
        <button onClick={onClose} className="rounded p-1 text-muted-foreground hover:bg-secondary hover:text-foreground">
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Status strip */}
      <div className="grid gap-0 border-b border-border sm:grid-cols-3">
        <Stat label="Статус" value={active ? "Активна" : "Нет"} accent={active ? "text-mint" : "text-muted-foreground"} icon={<ShieldCheck className="h-3.5 w-3.5" />} />
        <Stat
          label="Действует до"
          value={tier === "lifetime" ? "∞ Lifetime" : until ? until.toLocaleDateString("ru-RU") : "—"}
          accent={tier === "lifetime" ? "text-yellow-300" : "text-foreground"}
          icon={<CalendarClock className="h-3.5 w-3.5" />}
        />
        <Stat
          label="Осталось"
          value={tier === "lifetime" ? "∞" : daysLeft !== null ? `${daysLeft} дн.` : "—"}
          accent="text-foreground"
          icon={<InfinityIcon className="h-3.5 w-3.5" />}
        />
      </div>

      {/* Subscription controls */}
      <div className="grid gap-4 p-4 md:grid-cols-2">
        <div className="rounded-lg border border-border bg-background/40 p-4">
          <div className="flex items-center gap-2">
            <CreditCard className="h-4 w-4 text-mint" />
            <h4 className="text-sm font-semibold">Выдать подписку</h4>
          </div>

          <div className="mt-3 flex gap-1 rounded-md border border-border bg-background p-1">
            {(["pro", "trial"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setSelectedTier(t)}
                className={`flex-1 rounded px-2 py-1 text-xs font-semibold uppercase tracking-wider transition ${
                  selectedTier === t ? "bg-mint text-black" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {t}
              </button>
            ))}
          </div>

          <div className="mt-3 grid grid-cols-2 gap-1.5 sm:grid-cols-3">
            {PRESET_DURATIONS.map((d) => (
              <button
                key={d.days}
                disabled={busy}
                onClick={() => onGrant(d.days, selectedTier)}
                className="rounded-md border border-border bg-background px-2 py-2 text-xs font-semibold transition hover:border-mint/50 hover:bg-mint/10 disabled:opacity-50"
              >
                +{d.label}
              </button>
            ))}
          </div>

          <div className="mt-3 flex items-center gap-2">
            <input
              type="number"
              min={1}
              value={customDays}
              onChange={(e) => setCustomDays(Math.max(1, Number(e.target.value) || 1))}
              className="w-20 rounded border border-input bg-background px-2 py-1.5 text-sm font-mono outline-none focus:ring-1 focus:ring-ring"
            />
            <span className="text-xs text-muted-foreground">дней</span>
            <button
              disabled={busy}
              onClick={() => onGrant(customDays, selectedTier)}
              className="ml-auto inline-flex items-center gap-1 rounded-md bg-mint px-3 py-1.5 text-xs font-bold text-black hover:brightness-110 disabled:opacity-50"
            >
              {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Zap className="h-3 w-3" />}
              Выдать
            </button>
          </div>

          <div className="mt-3 flex flex-wrap gap-2 border-t border-border pt-3">
            <button
              disabled={busy}
              onClick={() => onGrant("lifetime")}
              className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-md border border-yellow-400/50 bg-yellow-400/10 px-3 py-2 text-xs font-bold text-yellow-200 hover:bg-yellow-400/20 disabled:opacity-50"
            >
              <InfinityIcon className="h-3.5 w-3.5" /> Lifetime
            </button>
            <button
              disabled={busy || tier === "free"}
              onClick={onRevoke}
              className="inline-flex items-center gap-1.5 rounded-md border border-destructive/40 px-3 py-2 text-xs font-semibold text-destructive hover:bg-destructive/10 disabled:opacity-40"
            >
              Отозвать
            </button>
          </div>
        </div>

        <div className="space-y-4">
          {/* Verification */}
          <div className="rounded-lg border border-border bg-background/40 p-4">
            <div className="flex items-center gap-2">
              <BadgeCheck className="h-4 w-4 text-cyan-300" />
              <h4 className="text-sm font-semibold">Верификация</h4>
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground">Синяя галочка у имени пользователя.</p>
            <button
              disabled={busy}
              onClick={onToggleVerified}
              className={`mt-3 inline-flex w-full items-center justify-center gap-2 rounded-md border px-3 py-2 text-sm font-semibold transition ${
                profile.verified
                  ? "border-cyan-400/60 bg-cyan-400/15 text-cyan-200 hover:bg-cyan-400/20"
                  : "border-border hover:bg-secondary"
              }`}
            >
              <BadgeCheck className="h-4 w-4" />
              {profile.verified ? "Снять галочку" : "Выдать галочку"}
            </button>
          </div>

          {/* XP */}
          <div className="rounded-lg border border-border bg-background/40 p-4">
            <div className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-violet" />
              <h4 className="text-sm font-semibold">XP · Lvl {profile.level ?? 1}</h4>
              <span className="ml-auto text-[10px] text-muted-foreground font-mono">
                {(profile.xp ?? 0).toLocaleString()} XP
              </span>
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {[100, 500, 1000, 5000, 25000].map((v) => (
                <button
                  key={`p-${v}`}
                  disabled={busy}
                  onClick={() => onAdjustXP(v)}
                  className="rounded-full border border-border px-2 py-0.5 text-[11px] hover:border-mint/50 hover:bg-mint/10"
                >
                  +{v.toLocaleString()}
                </button>
              ))}
              {[-100, -1000, -5000].map((v) => (
                <button
                  key={`n-${v}`}
                  disabled={busy}
                  onClick={() => onAdjustXP(v)}
                  className="rounded-full border border-border px-2 py-0.5 text-[11px] hover:border-destructive/50 hover:bg-destructive/10"
                >
                  {v.toLocaleString()}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, accent, icon }: { label: string; value: string; accent?: string; icon?: React.ReactNode }) {
  return (
    <div className="border-r border-border px-4 py-3 last:border-r-0">
      <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className={`mt-1 text-sm font-semibold ${accent ?? ""}`}>{value}</div>
    </div>
  );
}

function isUUID(s: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}

// Kept for compatibility with other admin pages that still import AdminTabs.
export function AdminTabs({
  superAdmin,
  active,
}: {
  superAdmin: boolean;
  active: "users" | "courses" | "glossary" | "loops" | "options";
}) {
  const base = "inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-semibold transition";
  const on = "border-mint/50 bg-mint/15 text-mint";
  const off = "border-border text-muted-foreground hover:text-foreground";
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-border pb-3">
      <Link to="/admin" className={`${base} ${active === "users" ? on : off}`}>
        <Users className="h-3.5 w-3.5" /> Пользователи
      </Link>
      <Link to="/admin/courses" className={`${base} ${active === "courses" ? on : off}`}>
        <BookOpen className="h-3.5 w-3.5" /> Курсы
      </Link>
      <Link to="/admin/glossary" className={`${base} ${active === "glossary" ? on : off}`}>
        <Library className="h-3.5 w-3.5" /> Термины
      </Link>
      <Link to="/admin/loops" className={`${base} ${active === "loops" ? on : off}`}>
        <Music2 className="h-3.5 w-3.5" /> Лупы
      </Link>
      {superAdmin && (
        <Link to="/admin/options" className={`${base} ${active === "options" ? on : off}`}>
          <SlidersHorizontal className="h-3.5 w-3.5" /> Опции
        </Link>
      )}
    </div>
  );
}
