import { Link } from "@tanstack/react-router";
import { BookOpen, Gauge, Library, MessagesSquare, Music2, ScrollText, Users } from "lucide-react";
import { useAdmin } from "@/hooks/use-admin";

type Tab = "dashboard" | "users" | "log" | "courses" | "glossary" | "loops" | "forum";

/** Shared nav strip for every /admin/* page. Tabs are gated by the caller's
 * own real role (via useAdmin) — never trust a prop for this, a caller can
 * (and did) pass the wrong value. */
export function AdminTabs({ active }: { active: Tab }) {
  const { isAdmin, canModerate } = useAdmin();
  const base = "inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-semibold transition";
  const on = "border-mint/50 bg-mint/15 text-mint";
  const off = "border-border text-muted-foreground hover:text-foreground";

  const tabs: { key: Tab; to: string; label: string; icon: React.ReactNode; show: boolean }[] = [
    { key: "dashboard", to: "/admin/dashboard", label: "Дашборд", icon: <Gauge className="h-3.5 w-3.5" />, show: isAdmin },
    { key: "users", to: "/admin", label: "Пользователи", icon: <Users className="h-3.5 w-3.5" />, show: isAdmin },
    { key: "log", to: "/admin/log", label: "Журнал", icon: <ScrollText className="h-3.5 w-3.5" />, show: canModerate },
    { key: "courses", to: "/admin/courses", label: "Курсы", icon: <BookOpen className="h-3.5 w-3.5" />, show: isAdmin },
    { key: "glossary", to: "/admin/glossary", label: "Термины", icon: <Library className="h-3.5 w-3.5" />, show: canModerate },
    { key: "loops", to: "/admin/loops", label: "Лупы", icon: <Music2 className="h-3.5 w-3.5" />, show: canModerate },
    { key: "forum", to: "/admin/forum", label: "Форум", icon: <MessagesSquare className="h-3.5 w-3.5" />, show: canModerate },
  ];

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-border pb-3">
      {tabs.filter((t) => t.show).map((t) => (
        <Link key={t.key} to={t.to} className={`${base} ${active === t.key ? on : off}`}>
          {t.icon} {t.label}
        </Link>
      ))}
    </div>
  );
}
