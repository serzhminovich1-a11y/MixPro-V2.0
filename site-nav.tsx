import { useEffect, useState } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  LogOut,
  User as UserIcon,
  Trophy,
  Gamepad2,
  GraduationCap,
  SlidersHorizontal,
  MessagesSquare,
  Play,
  Square,
  Circle,
  ChevronDown,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

const menuItems = [
  { label: "Файл", entries: ["Новая сессия", "Сохранить прогресс", "Выйти"] },
  { label: "Вид", entries: ["Показать браузер", "Полный экран"] },
  { label: "Опции", entries: ["Аудио настройки", "Профиль", "Тема"] },
  { label: "Помощь", entries: ["Как играть", "Telegram поддержка", "О MixPro"] },
] as const;

const tools = [
  { to: "/leaderboard", label: "Рейтинг", icon: Trophy },
  { to: "/games", label: "Игры", icon: Gamepad2 },
  { to: "/learn", label: "Обучение", icon: GraduationCap },
  { to: "/presets", label: "Пресеты", icon: SlidersHorizontal },
  { to: "/community", label: "Сообщество", icon: MessagesSquare },
] as const;

export function SiteNav() {
  const { session } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [cpu, setCpu] = useState(12);

  useEffect(() => {
    const id = window.setInterval(() => setCpu(8 + Math.floor(Math.random() * 22)), 1800);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    const close = () => setOpenMenu(null);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, []);

  async function handleSignOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <header className="sticky top-0 z-50 select-none border-b border-black/70 bg-[var(--panel)] shadow-[inset_0_1px_0_oklch(1_0_0_/_6%),inset_0_-1px_0_oklch(0_0_0_/_45%)]">
      {/* Row 1 — menu strip */}
      <div className="flex h-7 items-stretch border-b border-black/60 bg-gradient-to-b from-[oklch(0.30_0.003_270)] to-[oklch(0.24_0.003_270)] pl-2 pr-3 text-[11px]">
        <Link to="/" className="mr-3 flex items-center gap-1.5">
          <span
            className="grid h-4 w-4 place-items-center rounded-[2px] bg-mint text-[7px] font-bold text-primary-foreground shadow-[0_0_6px_var(--mint)]"
            style={{ fontFamily: "'Michroma', sans-serif" }}
          >
            M
          </span>
          <span
            className="text-[10px] uppercase tracking-[0.16em] text-foreground"
            style={{ fontFamily: "'Michroma', sans-serif" }}
          >
            Mix<span className="text-mint">Pro</span>
          </span>
        </Link>

        <nav className="flex items-stretch">
          {menuItems.map((m) => (
            <div key={m.label} className="relative" onClick={(e) => e.stopPropagation()}>
              <button
                onClick={() => setOpenMenu(openMenu === m.label ? null : m.label)}
                className={`h-full px-2.5 text-[11px] text-foreground/80 transition-colors hover:bg-[oklch(0.36_0.003_270)] hover:text-foreground ${
                  openMenu === m.label ? "bg-[oklch(0.36_0.003_270)] text-foreground" : ""
                }`}
              >
                {m.label}
              </button>
              {openMenu === m.label && (
                <div className="absolute left-0 top-full min-w-[180px] border border-black/70 bg-[var(--panel-deep)] py-1 text-[11px] shadow-[0_6px_16px_oklch(0_0_0_/_50%)]">
                  {m.entries.map((e) => (
                    <button
                      key={e}
                      className="block w-full px-3 py-1 text-left text-foreground/80 hover:bg-mint/20 hover:text-mint"
                    >
                      {e}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-3 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          <span className="flex items-center gap-1">
            <span className="h-1.5 w-1.5 rounded-full bg-mint shadow-[0_0_5px_var(--mint)]" />
            ONLINE
          </span>
          <span>CPU {cpu.toString().padStart(2, "0")}%</span>
          <span className="text-mint">44.1 kHz</span>
        </div>
      </div>

      {/* Row 2 — toolbar strip */}
      <div className="flex h-11 items-center gap-1 border-b border-black/60 bg-gradient-to-b from-[oklch(0.28_0.003_270)] to-[oklch(0.22_0.003_270)] px-2">
        {/* transport cluster */}
        <div className="mr-2 flex items-center gap-0.5 rounded-sm border border-black/60 bg-[var(--panel-deep)] p-0.5 shadow-[inset_0_1px_0_oklch(1_0_0_/_5%)]">
          <TransportBtn title="Play" onClick={() => navigate({ to: "/games" })}>
            <Play className="h-3 w-3 fill-mint text-mint" />
          </TransportBtn>
          <TransportBtn title="Stop">
            <Square className="h-3 w-3 fill-muted-foreground text-muted-foreground" />
          </TransportBtn>
          <TransportBtn title="Rec">
            <Circle className="h-3 w-3 fill-destructive text-destructive" />
          </TransportBtn>
        </div>

        {/* section tools */}
        <nav className="flex items-center gap-1">
          {tools.map((t) => {
            const active = pathname === t.to || pathname.startsWith(t.to + "/");
            return (
              <Link
                key={t.to}
                to={t.to}
                className={`group inline-flex items-center gap-1.5 rounded-sm border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider transition-all ${
                  active
                    ? "border-black/70 bg-gradient-to-b from-[oklch(0.82_0.19_145)] to-[oklch(0.7_0.18_145)] text-primary-foreground shadow-[inset_0_1px_0_oklch(1_0_0_/_30%),inset_0_-1px_0_oklch(0_0_0_/_35%)]"
                    : "border-black/60 bg-gradient-to-b from-[oklch(0.32_0.003_270)] to-[oklch(0.24_0.003_270)] text-foreground/80 shadow-[inset_0_1px_0_oklch(1_0_0_/_8%)] hover:text-mint"
                }`}
              >
                <t.icon className="h-3 w-3" />
                <span className="hidden sm:inline">{t.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* right side — session */}
        <div className="ml-auto flex items-center gap-1.5">
          {/* level meter */}
          <div className="hidden items-center gap-1 md:flex">
            <span className="font-mono text-[9px] uppercase text-muted-foreground">LVL</span>
            <div className="flex h-3 items-end gap-[1px] rounded-sm border border-black/60 bg-black/50 p-[1px]">
              {Array.from({ length: 12 }).map((_, i) => {
                const on = i < Math.round(cpu / 3);
                const color =
                  i > 9 ? "bg-destructive" : i > 6 ? "bg-yellow-500" : "bg-mint";
                return (
                  <span
                    key={i}
                    className={`h-full w-[3px] ${on ? color : "bg-black/70"} ${
                      on && i <= 6 ? "shadow-[0_0_3px_var(--mint)]" : ""
                    }`}
                  />
                );
              })}
            </div>
          </div>

          {session ? (
            <>
              <Link
                to="/profile"
                className="inline-flex items-center gap-1 rounded-sm border border-black/60 bg-gradient-to-b from-[oklch(0.32_0.003_270)] to-[oklch(0.24_0.003_270)] px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-foreground/80 shadow-[inset_0_1px_0_oklch(1_0_0_/_8%)] hover:text-mint"
              >
                <UserIcon className="h-3 w-3" /> Профиль
              </Link>
              <button
                onClick={handleSignOut}
                className="inline-flex items-center gap-1 rounded-sm border border-black/60 bg-gradient-to-b from-[oklch(0.32_0.003_270)] to-[oklch(0.24_0.003_270)] px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-foreground/80 shadow-[inset_0_1px_0_oklch(1_0_0_/_8%)] hover:text-destructive"
                title="Выйти"
              >
                <LogOut className="h-3 w-3" />
              </button>
            </>
          ) : (
            <Link to="/auth" className="btn-primary !py-1 !text-[10px]">
              Войти
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}

function TransportBtn({
  children,
  onClick,
  title,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  title: string;
}) {
  return (
    <button
      title={title}
      onClick={onClick}
      className="grid h-5 w-6 place-items-center rounded-[2px] border border-black/60 bg-gradient-to-b from-[oklch(0.32_0.003_270)] to-[oklch(0.22_0.003_270)] shadow-[inset_0_1px_0_oklch(1_0_0_/_10%)] transition-all hover:from-[oklch(0.36_0.003_270)] active:translate-y-[1px]"
    >
      {children}
    </button>
  );
}

// Simple chevron export not currently used but kept for future submenu triggers
export const _ChevronDown = ChevronDown;
