import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { UserCog, Loader2, ShieldAlert, Info, BadgeCheck } from "lucide-react";
import { getStaffRoster, setStaffPermission } from "@/lib/admin.functions";
import { RoleGate } from "@/components/role-gate";
import { useAdmin } from "@/hooks/use-admin";
import { RouteError, RouteNotFound } from "@/components/route-fallbacks";
import { toast } from "sonner";
import { ROLE_ORDER, ROLE_LABEL, ROLE_DOT, ROLE_RULES, type StaffRole } from "@/lib/role-rules";

export const Route = createFileRoute("/_authenticated/admin/team")({
  head: () => ({ meta: [{ title: "Команда — MixPro" }, { name: "robots", content: "noindex" }] }),
  component: () => (
    <RoleGate role="moderator">
      <AdminTeamPage />
    </RoleGate>
  ),
  errorComponent: RouteError,
  notFoundComponent: RouteNotFound,
});

type Staff = Awaited<ReturnType<typeof getStaffRoster>>["staff"][number];

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function RoleCard({ role }: { role: StaffRole }) {
  const rules = ROLE_RULES[role];
  return (
    <div className="rounded-xl border border-border bg-card/40 p-4">
      <div className="flex items-center gap-2">
        <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${ROLE_DOT[role]}`} aria-hidden="true" />
        <h3 className="text-sm font-bold">{ROLE_LABEL[role]}</h3>
      </div>
      <ul className="mt-2.5 space-y-1 text-xs text-mint/90">
        {rules.can.map((line, i) => (
          <li key={i} className="flex gap-1.5">
            <span aria-hidden="true">✓</span> {line}
          </li>
        ))}
      </ul>
      <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
        {rules.cannot.map((line, i) => (
          <li key={i} className="flex gap-1.5">
            <span aria-hidden="true">✕</span> {line}
          </li>
        ))}
      </ul>
    </div>
  );
}

function AdminTeamPage() {
  const [staff, setStaff] = useState<Staff[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const fetchRoster = useServerFn(getStaffRoster);
  const toggle = useServerFn(setStaffPermission);
  const { isSuperAdmin } = useAdmin();

  useEffect(() => {
    fetchRoster({})
      .then((r) => setStaff(r.staff))
      .catch((e: any) => setError(e.message ?? "Не удалось загрузить"))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onToggle(userId: string, permission: "can_manage_courses" | "can_view_finances", value: boolean) {
    setBusy(`${userId}:${permission}`);
    // Optimistic — flip immediately, roll back on failure.
    setStaff((s) => s?.map((m) => (m.id === userId ? { ...m, [permission === "can_manage_courses" ? "canManageCourses" : "canViewFinances"]: value } : m)) ?? s);
    try {
      await toggle({ data: { targetId: userId, permission, value } });
    } catch (e: any) {
      toast.error(e.message ?? "Не удалось сохранить");
      setStaff((s) => s?.map((m) => (m.id === userId ? { ...m, [permission === "can_manage_courses" ? "canManageCourses" : "canViewFinances"]: !value } : m)) ?? s);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <div className="flex items-center gap-3">
        <div className="grid h-10 w-10 place-items-center rounded-lg bg-mint/10 text-mint">
          <UserCog className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Команда</h1>
          <p className="text-xs text-muted-foreground">
            Действующие админы, модераторы и преподаватели проекта, и что каждой роли доступно.
          </p>
        </div>
      </div>

      {/* Role explanations */}
      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        {ROLE_ORDER.map((r) => (
          <RoleCard key={r} role={r} />
        ))}
      </div>

      <div className="mt-6 flex items-start gap-2 rounded-xl border border-cyan/30 bg-cyan/5 p-3 text-xs text-cyan-100/90">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <p>
          Чек-боксы ниже — это <b>дополнительные права поверх роли</b>, а не замена ей. Например, преподавателю можно
          выдать «Все курсы», чтобы он редактировал чужие уроки, не становясь модератором. Менять их может только
          супер-админ.
        </p>
      </div>

      {/* Roster */}
      <div className="mt-6 rounded-xl border border-border bg-card/40 p-4">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Состав</h2>

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Загружаю…
          </div>
        ) : error ? (
          <div className="mt-4 rounded-xl border border-destructive/40 bg-destructive/10 p-6 text-center text-sm text-destructive">{error}</div>
        ) : !staff || staff.length === 0 ? (
          <p className="mt-4 text-sm text-muted-foreground">Пока нет ни одного админа, модератора или преподавателя, кроме тебя.</p>
        ) : (
          <ul className="mt-3 divide-y divide-border/60">
            {staff.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div className="flex min-w-0 items-center gap-2.5">
                  {m.avatar_url ? (
                    <img src={m.avatar_url} alt="" className="h-8 w-8 shrink-0 rounded-full object-cover" loading="lazy" />
                  ) : (
                    <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-secondary text-xs font-bold text-muted-foreground">
                      {m.username?.[0]?.toUpperCase() ?? "?"}
                    </div>
                  )}
                  <div className="min-w-0">
                    <Link to="/u/$username" params={{ username: m.username ?? "" }} className="flex items-center gap-1 text-sm font-semibold hover:underline">
                      @{m.username}
                      {m.verified && <BadgeCheck className="h-3.5 w-3.5 shrink-0 text-cyan-300" />}
                    </Link>
                    <div className="mt-0.5 flex flex-wrap gap-1.5">
                      {m.roles.map((r) => (
                        <span key={r} className="flex items-center gap-1 rounded border border-border/60 px-1.5 py-0.5 text-[10px] font-semibold">
                          <span className={`h-1.5 w-1.5 rounded-full ${ROLE_DOT[r] ?? "bg-muted-foreground"}`} aria-hidden="true" />
                          {ROLE_LABEL[r] ?? r}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-3 text-xs">
                  <label className={`flex items-center gap-1.5 ${isSuperAdmin ? "cursor-pointer" : "cursor-not-allowed opacity-60"}`}>
                    <input
                      type="checkbox"
                      checked={m.canManageCourses}
                      disabled={!isSuperAdmin || busy === `${m.id}:can_manage_courses`}
                      onChange={(e) => onToggle(m.id, "can_manage_courses", e.target.checked)}
                      className="h-3.5 w-3.5 accent-mint"
                    />
                    Все курсы
                  </label>
                  <label className={`flex items-center gap-1.5 ${isSuperAdmin ? "cursor-pointer" : "cursor-not-allowed opacity-60"}`}>
                    <input
                      type="checkbox"
                      checked={m.canViewFinances}
                      disabled={!isSuperAdmin || busy === `${m.id}:can_view_finances`}
                      onChange={(e) => onToggle(m.id, "can_view_finances", e.target.checked)}
                      className="h-3.5 w-3.5 accent-mint"
                    />
                    Финансы
                  </label>
                  <span className="text-muted-foreground">с {fmtDate(m.created_at)}</span>
                </div>
              </li>
            ))}
          </ul>
        )}

        {!isSuperAdmin && (
          <p className="mt-4 flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <ShieldAlert className="h-3 w-3" /> Менять права может только супер-админ — здесь только просмотр.
          </p>
        )}
      </div>
    </div>
  );
}
