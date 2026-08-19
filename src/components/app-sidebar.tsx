import { useEffect, useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import {
  ChevronRight,
  ChevronDown,
  Folder,
  FolderOpen,
  Trophy,
  AudioWaveform,
  Volume2,
  GraduationCap,
  Gauge,
  ScrollText,
  MessagesSquare,
  User as UserIcon,
  PanelLeftClose,
  PanelLeftOpen,
  Radio,
  Shield,
  Users,
  BookOpen,
  Library,
  Waves,
  ShieldAlert,
  ShieldCheck,
  Bell,
  Crown,
  CreditCard,
  UserCog,
} from "lucide-react";
import { useAdmin } from "@/hooks/use-admin";

type Leaf = { label: string; to: string; hash?: string; icon: React.ComponentType<{ className?: string }>; badge?: string };
type Group = {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  items: Leaf[];
  adminOnly?: boolean;
  superOnly?: boolean;
  teacherOnly?: boolean;
  moderatorOnly?: boolean;
  tone?: "admin" | "super" | "teacher" | "moderator";
};

const groups: Group[] = [
  {
    label: "Admin · Studio",
    icon: Folder,
    adminOnly: true,
    tone: "admin",
    items: [
      { label: "Дашборд", to: "/admin/dashboard", icon: Gauge, badge: "ADM" },
      { label: "Пользователи", to: "/admin", icon: Users, badge: "ADM" },
      { label: "Журнал действий", to: "/admin/log", icon: ScrollText, badge: "ADM" },
      { label: "Курсы · редактор", to: "/admin/courses", icon: BookOpen, badge: "ADM" },
      { label: "Глоссарий", to: "/admin/glossary", icon: Library, badge: "ADM" },
      { label: "Библиотека лупов", to: "/admin/loops", icon: Waves, badge: "ADM" },
      { label: "Категории форума", to: "/admin/forum", icon: MessagesSquare, badge: "ADM" },
      { label: "Модерация", to: "/moderation", icon: ShieldAlert, badge: "ADM" },
    ],
  },
  {
    // Plain moderators (rank 1, not also admin+) previously had no sidebar
    // entries at all despite already having real RoleGate access to these
    // four pages — content moderation/editing tools specifically, not the
    // admin-only ones (Пользователи/Дашборд/Глоссарий/Библиотека лупов
    // need rank >= 2) or super-admin-only ones. Surfacing what's already
    // theirs, not widening any actual permission.
    label: "Moderator · Studio",
    icon: Folder,
    moderatorOnly: true,
    tone: "moderator",
    items: [
      { label: "Модерация", to: "/moderation", icon: ShieldAlert, badge: "MOD" },
      { label: "Журнал действий", to: "/admin/log", icon: ScrollText, badge: "MOD" },
      { label: "Курсы · редактор", to: "/admin/courses", icon: BookOpen, badge: "MOD" },
      { label: "Категории форума", to: "/admin/forum", icon: MessagesSquare, badge: "MOD" },
    ],
  },
  {
    label: "Super · System",
    icon: Folder,
    superOnly: true,
    tone: "super",
    items: [
      { label: "Роли и права", to: "/admin", hash: "roles", icon: Shield, badge: "SU" },
      { label: "Подписки", to: "/admin", hash: "subs", icon: Crown, badge: "SU" },
      { label: "Выручка и аналитика", to: "/admin/subscriptions", icon: CreditCard, badge: "SU" },
      { label: "Команда", to: "/admin/team", icon: UserCog, badge: "SU" },
    ],
  },
  {
    // Plain teachers (rank 0, no admin/moderator rank) get no other group —
    // this is their only way into the course editor. Scoped server-side
    // (course-editor.functions.ts) to their own created_by rows unless a
    // super-admin also grants the can_manage_courses staff flag.
    label: "Teacher · Studio",
    icon: Folder,
    teacherOnly: true,
    tone: "teacher",
    items: [{ label: "Мои курсы", to: "/admin/courses", icon: BookOpen, badge: "TCH" }],
  },
];

const SIDEBAR_COLLAPSED_KEY = "mixpro:sidebar-collapsed";
const SIDEBAR_GROUPS_KEY = "mixpro:sidebar-groups";

function readCollapsed(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "1";
  } catch {
    return false;
  }
}

function writeCollapsed(value: boolean) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, value ? "1" : "0");
  } catch (e) {
    console.error("[sidebar] failed to save collapsed state", e);
  }
}

function readGroupState(): Record<string, boolean> {
  if (typeof window === "undefined") {
    return Object.fromEntries(groups.map((g) => [g.label, true]));
  }
  try {
    const raw = window.localStorage.getItem(SIDEBAR_GROUPS_KEY);
    const parsed = raw ? (JSON.parse(raw) as Record<string, boolean>) : {};
    return Object.fromEntries(
      groups.map((g) => [g.label, parsed[g.label] ?? true]),
    );
  } catch {
    return Object.fromEntries(groups.map((g) => [g.label, true]));
  }
}

function writeGroupState(value: Record<string, boolean>) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(SIDEBAR_GROUPS_KEY, JSON.stringify(value));
  } catch (e) {
    console.error("[sidebar] failed to save group state", e);
  }
}

export function AppSidebar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { isAdmin, isSuperAdmin, isTeacher, canModerate, ready } = useAdmin();
  const [collapsed, setCollapsed] = useState<boolean>(() => readCollapsed());
  const [open, setOpen] = useState<Record<string, boolean>>(() => readGroupState());

  useEffect(() => {
    writeCollapsed(collapsed);
  }, [collapsed]);

  useEffect(() => {
    writeGroupState(open);
  }, [open]);

  useEffect(() => {
    const onToggle = () => setCollapsed((c) => !c);
    window.addEventListener("mixpro:toggle-sidebar", onToggle);
    return () => window.removeEventListener("mixpro:toggle-sidebar", onToggle);
  }, []);

  useEffect(() => {
    const sync = () => {
      setCollapsed(readCollapsed());
      setOpen(readGroupState());
    };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);

  const visible = groups.filter((g) => {
    if (g.superOnly) return ready && isSuperAdmin;
    if (g.adminOnly) return ready && isAdmin;
    // Once someone is admin+, the plain teacher/moderator shortcut groups
    // are redundant — everything in them is already in Admin · Studio.
    if (g.teacherOnly) return ready && isTeacher && !isAdmin;
    if (g.moderatorOnly) return ready && canModerate && !isAdmin;
    return true;
  });

  // Sidebar is a staff-only control surface. Hide for everyone else.
  if (!ready || (!isAdmin && !isSuperAdmin && !isTeacher && !canModerate) || visible.length === 0) return null;


  if (collapsed) {
    return (
      <aside className="sb-shell sticky top-[76px] hidden h-[calc(100vh-76px)] w-8 shrink-0 flex-col items-center py-2 md:flex">
        <button
          onClick={() => setCollapsed(false)}
          className="sb-chip grid h-6 w-6 place-items-center rounded-sm"
          title="Показать браузер"
        >
          <PanelLeftOpen className="h-3 w-3" />
        </button>
      </aside>
    );
  }

  return (
    <aside className="sb-shell sticky top-[76px] hidden h-[calc(100vh-76px)] w-56 shrink-0 flex-col md:flex">
      {/* header */}
      <div className="sb-header flex h-7 items-center justify-between px-2">
        <span className="font-mono text-[9px] font-bold uppercase tracking-[0.14em] opacity-70">
          Browser
        </span>
        <button
          onClick={() => setCollapsed(true)}
          className="sb-chip grid h-5 w-5 place-items-center rounded-sm"
          title="Скрыть"
        >
          <PanelLeftClose className="h-3 w-3" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto py-1 text-[11px]">
        {visible.map((g) => {
          const isOpen = open[g.label];
          const Icon = isOpen ? FolderOpen : g.icon;
          const toneLabel =
            g.tone === "super"
              ? "text-yellow-300"
              : g.tone === "admin"
                ? "text-mint"
                : g.tone === "teacher"
                  ? "text-orange-300"
                  : g.tone === "moderator"
                    ? "text-cyan-300"
                    : "";
          const toneIcon =
            g.tone === "super"
              ? "text-yellow-300 drop-shadow-[0_0_4px_rgba(250,204,21,0.6)]"
              : g.tone === "admin"
                ? "text-mint drop-shadow-[0_0_4px_var(--mint)]"
                : g.tone === "teacher"
                  ? "text-orange-300 drop-shadow-[0_0_4px_rgba(253,186,116,0.6)]"
                  : g.tone === "moderator"
                    ? "text-cyan-300 drop-shadow-[0_0_4px_rgba(103,232,249,0.6)]"
                    : "";
          return (
            <div key={g.label} className="mb-0.5">
              <button
                onClick={() => setOpen((s) => ({ ...s, [g.label]: !s[g.label] }))}
                className="sb-group flex w-full items-center gap-1 px-1.5 py-[3px] text-left"
              >
                {isOpen ? (
                  <ChevronDown className="h-3 w-3 shrink-0 opacity-70" />
                ) : (
                  <ChevronRight className="h-3 w-3 shrink-0 opacity-70" />
                )}
                <Icon className={`sb-folder-icon h-3.5 w-3.5 shrink-0 ${toneIcon}`} />
                <span className={`truncate text-[11px] font-semibold ${toneLabel}`}>
                  {g.label}
                </span>
                {g.tone === "super" && (
                  <Crown className="ml-auto h-3 w-3 shrink-0 text-yellow-300 opacity-90" />
                )}
                {g.tone === "admin" && (
                  <Shield className="ml-auto h-3 w-3 shrink-0 text-mint opacity-90" />
                )}
                {g.tone === "teacher" && (
                  <GraduationCap className="ml-auto h-3 w-3 shrink-0 text-orange-300 opacity-90" />
                )}
                {g.tone === "moderator" && (
                  <ShieldCheck className="ml-auto h-3 w-3 shrink-0 text-cyan-300 opacity-90" />
                )}
              </button>
              {isOpen && (
                <div>
                  {g.items.map((leaf) => {
                    const active =
                      pathname === leaf.to &&
                      (!leaf.hash || (typeof window !== "undefined" && window.location.hash === `#${leaf.hash}`));
                    return (
                      <Link
                        key={`${g.label}:${leaf.to}:${leaf.label}`}
                        to={leaf.to}
                        hash={leaf.hash}
                        className={`sb-item flex items-center gap-1.5 py-[3px] pl-7 pr-2 text-[11px] transition-colors ${active ? "is-active" : ""}`}
                      >
                        <leaf.icon className="h-3 w-3 shrink-0 opacity-80" />
                        <span className="truncate">{leaf.label}</span>
                        {leaf.badge && (
                          <span
                            className={`ml-auto rounded-sm border px-1 py-[1px] font-mono text-[8px] tracking-wider ${
                              leaf.badge === "SU"
                                ? "border-yellow-300/50 bg-yellow-300/10 text-yellow-300"
                                : leaf.badge === "TCH"
                                  ? "border-orange-300/50 bg-orange-300/10 text-orange-300"
                                  : leaf.badge === "MOD"
                                    ? "border-cyan-300/50 bg-cyan-300/10 text-cyan-300"
                                    : "border-mint/50 bg-mint/10 text-mint"
                            }`}
                          >
                            {leaf.badge}
                          </span>
                        )}
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* footer status */}
      <div className="sb-footer px-2 py-1 font-mono text-[9px] uppercase tracking-wider">
        <div className="flex items-center justify-between">
          <span>MixPro v1.0</span>
          <span className="flex items-center gap-1">
            {isSuperAdmin ? (
              <>
                <span className="h-1.5 w-1.5 rounded-full bg-yellow-300 shadow-[0_0_5px_rgba(250,204,21,0.8)]" />
                SUPER
              </>
            ) : isAdmin ? (
              <>
                <span className="h-1.5 w-1.5 rounded-full bg-mint shadow-[0_0_5px_var(--mint)]" />
                ADMIN
              </>
            ) : isTeacher ? (
              <>
                <span className="h-1.5 w-1.5 rounded-full bg-orange-300 shadow-[0_0_5px_rgba(253,186,116,0.8)]" />
                TEACHER
              </>
            ) : canModerate ? (
              <>
                <span className="h-1.5 w-1.5 rounded-full bg-cyan-300 shadow-[0_0_5px_rgba(103,232,249,0.8)]" />
                MODERATOR
              </>
            ) : (
              <>
                <span className="h-1.5 w-1.5 rounded-full bg-mint shadow-[0_0_5px_var(--mint)]" />
                READY
              </>
            )}
          </span>
        </div>
      </div>
    </aside>
  );
}
