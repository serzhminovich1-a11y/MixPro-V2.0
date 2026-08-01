import { useState } from "react";
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
  SlidersHorizontal,
  MessagesSquare,
  User as UserIcon,
  PanelLeftClose,
  PanelLeftOpen,
  Radio,
} from "lucide-react";

type Leaf = { label: string; to: string; icon: React.ComponentType<{ className?: string }> };
type Group = { label: string; icon: React.ComponentType<{ className?: string }>; items: Leaf[] };

const groups: Group[] = [
  {
    label: "Ear training",
    icon: Folder,
    items: [
      { label: "Угадай частоту", to: "/games/frequency", icon: AudioWaveform },
      { label: "Найди изменение", to: "/games/ear-eq", icon: Volume2 },
      { label: "Все тренажёры", to: "/games", icon: Radio },
    ],
  },
  {
    label: "Обучение",
    icon: Folder,
    items: [{ label: "Все уроки", to: "/learn", icon: GraduationCap }],
  },
  {
    label: "Пресеты",
    icon: Folder,
    items: [{ label: "Каталог", to: "/presets", icon: SlidersHorizontal }],
  },
  {
    label: "Сообщество",
    icon: Folder,
    items: [
      { label: "Пульс", to: "/community", icon: MessagesSquare },
      { label: "Рейтинг", to: "/leaderboard", icon: Trophy },
    ],
  },
  {
    label: "Аккаунт",
    icon: Folder,
    items: [{ label: "Профиль", to: "/profile", icon: UserIcon }],
  },
];

export function AppSidebar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [collapsed, setCollapsed] = useState(false);
  const [open, setOpen] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(groups.map((g) => [g.label, true])),
  );

  if (collapsed) {
    return (
      <aside className="sticky top-[76px] hidden h-[calc(100vh-76px)] w-8 shrink-0 flex-col items-center border-r border-black/70 bg-[var(--panel-deep)] py-2 md:flex">
        <button
          onClick={() => setCollapsed(false)}
          className="grid h-6 w-6 place-items-center rounded-sm border border-black/60 bg-gradient-to-b from-[oklch(0.32_0.003_270)] to-[oklch(0.22_0.003_270)] text-muted-foreground hover:text-mint"
          title="Показать браузер"
        >
          <PanelLeftOpen className="h-3 w-3" />
        </button>
      </aside>
    );
  }

  return (
    <aside className="sticky top-[76px] hidden h-[calc(100vh-76px)] w-56 shrink-0 flex-col border-r border-black/70 bg-[var(--panel-deep)] shadow-[inset_-1px_0_0_oklch(1_0_0_/_3%)] md:flex">
      {/* header */}
      <div className="flex h-7 items-center justify-between border-b border-black/60 bg-gradient-to-b from-[oklch(0.28_0.003_270)] to-[oklch(0.22_0.003_270)] px-2">
        <span className="font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
          Browser
        </span>
        <button
          onClick={() => setCollapsed(true)}
          className="grid h-5 w-5 place-items-center rounded-sm border border-black/60 bg-gradient-to-b from-[oklch(0.32_0.003_270)] to-[oklch(0.22_0.003_270)] text-muted-foreground hover:text-mint"
          title="Скрыть"
        >
          <PanelLeftClose className="h-3 w-3" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto py-1 text-[11px]">
        {groups.map((g) => {
          const isOpen = open[g.label];
          const Icon = isOpen ? FolderOpen : g.icon;
          return (
            <div key={g.label} className="mb-0.5">
              <button
                onClick={() => setOpen((s) => ({ ...s, [g.label]: !s[g.label] }))}
                className="flex w-full items-center gap-1 px-1.5 py-[3px] text-left text-foreground/85 hover:bg-mint/15 hover:text-foreground"
              >
                {isOpen ? (
                  <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" />
                ) : (
                  <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground" />
                )}
                <Icon className="h-3.5 w-3.5 shrink-0 text-yellow-500/90" />
                <span className="truncate text-[11px] font-semibold">{g.label}</span>
              </button>
              {isOpen && (
                <div>
                  {g.items.map((leaf) => {
                    const active = pathname === leaf.to;
                    return (
                      <Link
                        key={leaf.to}
                        to={leaf.to}
                        className={`flex items-center gap-1.5 py-[3px] pl-7 pr-2 text-[11px] transition-colors ${
                          active
                            ? "bg-mint/20 text-mint"
                            : "text-foreground/70 hover:bg-white/[0.03] hover:text-foreground"
                        }`}
                      >
                        <leaf.icon className="h-3 w-3 shrink-0 opacity-80" />
                        <span className="truncate">{leaf.label}</span>
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
      <div className="border-t border-black/60 bg-gradient-to-b from-[oklch(0.24_0.003_270)] to-[oklch(0.20_0.003_270)] px-2 py-1 font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
        <div className="flex items-center justify-between">
          <span>MixPro v1.0</span>
          <span className="flex items-center gap-1">
            <span className="h-1.5 w-1.5 rounded-full bg-mint shadow-[0_0_5px_var(--mint)]" />
            READY
          </span>
        </div>
      </div>
    </aside>
  );
}
