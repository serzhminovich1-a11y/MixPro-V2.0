import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  LogOut,
  User as UserIcon,
  Trophy,
  Gamepad2,
  GraduationCap,
  SlidersHorizontal,
  MessagesSquare,
  MessageCircle,
  Play,
  Square,
  Circle,
  Check,
  ChevronRight,
  BookMarked,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useSiteTheme } from "@/hooks/use-theme-mode";
import { SITE_THEMES, type SiteThemeId } from "@/lib/site-themes";
import { MixproLogo, type LogoVariant } from "@/components/mixpro-logo";
import { NotificationsBell } from "@/components/notifications-bell";

const LOGO_KEY = "mixpro:logo-variant";
function readLogoVariant(): LogoVariant {
  if (typeof window === "undefined") return "inline";
  const v = window.localStorage.getItem(LOGO_KEY) as LogoVariant | null;
  return v ?? "inline";
}

const tools = [
  { to: "/leaderboard", label: "Рейтинг", icon: Trophy },
  { to: "/games", label: "Игры", icon: Gamepad2 },
  { to: "/learn", label: "Обучение", icon: GraduationCap },

  { to: "/glossary", label: "Термины", icon: BookMarked },
  { to: "/presets", label: "Пресеты", icon: SlidersHorizontal },
  { to: "/forum", label: "Форум", icon: MessagesSquare },
  { to: "/chat", label: "Чат", icon: MessageCircle },
] as const;

const MENU_LABELS = ["Файл", "Вид", "Опции", "Помощь"] as const;
type MenuLabel = (typeof MENU_LABELS)[number];

function toggleFullscreen() {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen?.().catch(() => {});
  } else {
    document.exitFullscreen?.().catch(() => {});
  }
}

function toggleSidebar() {
  window.dispatchEvent(new Event("mixpro:toggle-sidebar"));
}

export function SiteNav() {
  const { session } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [openMenu, setOpenMenu] = useState<MenuLabel | null>(null);
  const [openSub, setOpenSub] = useState<string | null>(null);
  const [cpu, setCpu] = useState(14);
  const [lvl, setLvl] = useState(6);
  const { theme, auto, setTheme, toggleAuto } = useSiteTheme();
  const [logoVariant, setLogoVariant] = useState<LogoVariant>(readLogoVariant);
  useEffect(() => {
    setLogoVariant(readLogoVariant());
    const onChange = () => setLogoVariant(readLogoVariant());
    window.addEventListener("mixpro:logo-variant", onChange);
    window.addEventListener("storage", onChange);
    return () => {
      window.removeEventListener("mixpro:logo-variant", onChange);
      window.removeEventListener("storage", onChange);
    };
  }, []);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const id = window.setInterval(() => setCpu(10 + Math.floor(Math.random() * 14)), 2400);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    const tick = () => {
      const t = Date.now() / 1000;
      const v = 5 + Math.sin(t * 1.7) * 2 + Math.sin(t * 0.6) * 1.5 + Math.sin(t * 3.1) * 0.8;
      setLvl(Math.max(2, Math.min(11, Math.round(v + 4))));
      rafRef.current = window.setTimeout(tick, 120) as unknown as number;
    };
    tick();
    return () => {
      if (rafRef.current) window.clearTimeout(rafRef.current);
    };
  }, []);

  useEffect(() => {
    const close = () => {
      setOpenMenu(null);
      setOpenSub(null);
    };
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, []);

  async function handleSignOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  function pickTheme(id: SiteThemeId) {
    setTheme(id);
    const t = SITE_THEMES.find((x) => x.id === id);
    toast.success(`Тема: ${t?.label ?? id}`, { description: t?.hint });
    setOpenMenu(null);
    setOpenSub(null);
  }

  function onAutoToggle() {
    toggleAuto();
    toast(auto ? "Авто-смена темы: выкл." : "Авто-смена темы: вкл.", {
      description: !auto
        ? "День 07:00–19:00 → светлая, ночью → тёмная"
        : "Тема больше не меняется автоматически",
    });
    setOpenMenu(null);
  }

  const menuAction = (id: string) => {
    switch (id) {
      case "file:new":
        navigate({ to: "/games/frequency" });
        break;
      case "file:save":
        toast("Прогресс сохраняется автоматически", {
          description: "Каждый раунд и урок пишутся в облако",
        });
        break;
      case "file:signout":
        void handleSignOut();
        break;
      case "view:sidebar":
        toggleSidebar();
        break;
      case "view:fullscreen":
        toggleFullscreen();
        break;
      case "opt:audio":
        toast("Аудио настройки", { description: "Скоро добавим панель настроек" });
        break;
      case "opt:profile":
        navigate({ to: "/profile" });
        break;
      case "opt:moderation":
        navigate({ to: "/moderation" });
        break;
      case "opt:admin":
        navigate({ to: "/admin" });
        break;
      case "opt:courses":
        navigate({ to: "/admin/courses" });
        break;
      case "opt:glossary":
        navigate({ to: "/admin/glossary" });
        break;
      case "help:tour":
        toast("Интерактивный тур", {
          description: "Скоро мы проведём тебя по всем инструментам MixPro",
        });
        break;
      case "help:play":
        navigate({ to: "/games" });
        break;
      case "help:telegram":
        window.open("https://t.me/mixpro_support", "_blank", "noopener,noreferrer");
        break;
      case "help:about":
        toast("MixPro v1.0", {
          description: "Платформа для звукорежиссёров — слух, знания, комьюнити",
        });
        break;
    }
    setOpenMenu(null);
  };

  return (
    <header className="nav-shell sticky top-0 z-50 select-none">
      {/* Row 1 — menu strip */}
      <div className="nav-menu-strip flex h-7 items-stretch pl-2 pr-3 text-[11px]">
        <Link to="/" className="mr-3 flex items-center">
          <MixproLogo variant={logoVariant} size="sm" />
        </Link>

        <nav className="flex items-stretch" onClick={(e) => e.stopPropagation()}>
          {MENU_LABELS.map((label) => (
            <div key={label} className="relative">
              <button
                onClick={() => {
                  setOpenMenu(openMenu === label ? null : label);
                  setOpenSub(null);
                }}
                onMouseEnter={() => openMenu && setOpenMenu(label)}
                className={`nav-menu-btn h-full px-2.5 text-[11px] ${openMenu === label ? "is-active" : ""}`}
              >
                {label}
              </button>
              {openMenu === label && (
                <div className="nav-dropdown absolute left-0 top-full min-w-[220px] py-1 text-[11px]">
                  {label === "Файл" && (
                    <>
                      <MenuItem onClick={() => menuAction("file:new")}>Новая сессия</MenuItem>
                      <MenuItem onClick={() => menuAction("file:save")}>Сохранить прогресс</MenuItem>
                      <MenuSep />
                      <MenuItem onClick={() => menuAction("file:signout")} danger>
                        Выйти
                      </MenuItem>
                    </>
                  )}
                  {label === "Вид" && (
                    <>
                      <MenuItem onClick={() => menuAction("view:sidebar")}>
                        Показать / скрыть браузер
                      </MenuItem>
                      <MenuItem onClick={() => menuAction("view:fullscreen")}>
                        Полный экран
                      </MenuItem>
                    </>
                  )}
                  {label === "Опции" && (
                    <>
                      <div
                        className="relative"
                        onMouseEnter={() => setOpenSub("theme")}
                      >
                        <button
                          onClick={() => setOpenSub(openSub === "theme" ? null : "theme")}
                          className="nav-menu-item flex w-full items-center justify-between px-3 py-1 text-left"
                        >
                          <span>Тема</span>
                          <ChevronRight className="h-3 w-3 opacity-70" />
                        </button>
                        {openSub === "theme" && (
                          <div className="nav-dropdown absolute left-full top-0 -ml-px min-w-[240px] py-1">
                            {SITE_THEMES.map((t) => {
                              const active = !auto && theme === t.id;
                              return (
                                <button
                                  key={t.id}
                                  onClick={() => pickTheme(t.id)}
                                  className={`nav-menu-item flex w-full items-center gap-2 px-3 py-1.5 text-left ${active ? "is-active" : ""}`}
                                >
                                  <span
                                    className="inline-block h-2.5 w-2.5 rounded-full border border-black/40"
                                    style={{ background: t.swatch }}
                                  />
                                  <span className="flex-1">
                                    <span className="font-medium">{t.label}</span>
                                    <span className="ml-1 text-[10px] opacity-60">
                                      {t.hint}
                                    </span>
                                  </span>
                                  {active && <Check className="h-3 w-3" />}
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>

                      <MenuItem onClick={onAutoToggle}>
                        <span className="flex-1">Авто-смена день / ночь</span>
                        <span className={`nav-badge ml-2 ${auto ? "is-on" : ""}`}>
                          {auto ? "ВКЛ" : "ВЫКЛ"}
                        </span>
                      </MenuItem>

                      <MenuSep />
                      <MenuItem onClick={() => menuAction("opt:audio")}>Аудио настройки</MenuItem>
                      <MenuItem onClick={() => menuAction("opt:profile")}>Профиль</MenuItem>
                    </>
                  )}
                  {label === "Помощь" && (
                    <>
                      <MenuItem onClick={() => menuAction("help:tour")}>
                        Интерактивный тур
                        <span className="nav-badge ml-2 is-on">скоро</span>
                      </MenuItem>
                      <MenuItem onClick={() => menuAction("help:play")}>Как играть</MenuItem>
                      <MenuItem onClick={() => menuAction("help:telegram")}>
                        Telegram поддержка
                      </MenuItem>
                      <MenuItem onClick={() => menuAction("help:about")}>О MixPro</MenuItem>
                    </>
                  )}
                </div>
              )}
            </div>
          ))}
        </nav>

        <div className="nav-status ml-auto hidden sm:flex items-center gap-3 font-mono text-[10px] uppercase tracking-wider">
          <span className="flex items-center gap-1">
            <span className="nav-status-dot" />
            ONLINE
          </span>
          <span>CPU {cpu.toString().padStart(2, "0")}%</span>
          <span className="nav-status-accent">44.1 kHz</span>
        </div>
      </div>

      {/* Row 2 — toolbar strip */}
      <div className="nav-toolbar-strip flex h-11 items-center gap-1 px-2 overflow-x-auto">
        <div className="nav-transport-group mr-2 flex items-center gap-0.5 p-0.5">
          <TransportBtn title="Play — начать сессию" onClick={() => navigate({ to: "/games/frequency" })}>
            <Play className="h-3 w-3 fill-current text-[color:var(--mint)]" />
          </TransportBtn>
          <TransportBtn title="Stop — на главную" onClick={() => navigate({ to: "/" })}>
            <Square className="h-3 w-3 fill-current opacity-70" />
          </TransportBtn>
          <TransportBtn
            title="Rec — открыть профиль"
            onClick={() => navigate({ to: session ? "/profile" : "/auth" })}
          >
            <Circle className="h-3 w-3 fill-current text-[color:var(--destructive)]" />
          </TransportBtn>
        </div>

        <nav className="flex items-center gap-1">
          {tools.map((t) => {
            const active = pathname === t.to || pathname.startsWith(t.to + "/");
            return (
              <Link
                key={t.to}
                to={t.to}
                className={`nav-tool-btn group inline-flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${active ? "is-active" : ""}`}
              >
                <t.icon className="h-3 w-3" />
                <span className="hidden sm:inline">{t.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-1.5">
          <div className="hidden items-center gap-1 md:flex">
            <span className="font-mono text-[9px] uppercase opacity-70">LVL</span>
            <div className="nav-lvl-meter flex h-3 items-end gap-[1px] p-[1px]">
              {Array.from({ length: 12 }).map((_, i) => {
                const on = i < lvl;
                const tone = i > 9 ? "danger" : i > 6 ? "warn" : "ok";
                return (
                  <span
                    key={i}
                    className={`nav-lvl-bar ${on ? `is-on ${tone}` : ""}`}
                  />
                );
              })}
            </div>
          </div>

          {session ? (
            <>
              <NotificationsBell />
              <Link
                to="/profile"
                className="nav-tool-btn inline-flex items-center gap-1 px-2 py-1 text-[10px] font-bold uppercase tracking-wider"
              >
                <UserIcon className="h-3 w-3" /> Профиль
              </Link>
              <button
                onClick={handleSignOut}
                className="nav-tool-btn nav-tool-btn-danger inline-flex items-center gap-1 px-2 py-1 text-[10px] font-bold uppercase tracking-wider"
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


function MenuItem({
  children,
  onClick,
  danger,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`nav-menu-item flex w-full items-center px-3 py-1 text-left ${danger ? "is-danger" : ""}`}
    >
      {children}
    </button>
  );
}

function MenuSep() {
  return <div className="nav-menu-sep my-1 h-px" />;
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
      className="nav-transport-btn grid h-5 w-6 place-items-center transition-all active:translate-y-[1px]"
    >
      {children}
    </button>
  );
}

