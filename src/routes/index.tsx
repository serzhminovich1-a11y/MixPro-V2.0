import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  Trophy,
  Gamepad2,
  GraduationCap,
  SlidersHorizontal,
  MessagesSquare,
  ArrowRight,
  AudioWaveform,
  Radio,
  Sparkles,
} from "lucide-react";
import { getSiteStats } from "@/lib/public.functions";
import { Waveform } from "@/components/waveform";
import { RouteError, RouteNotFound } from "@/components/route-fallbacks";

const statsQuery = queryOptions({ queryKey: ["site-stats"], queryFn: () => getSiteStats() });

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "MixPro — командный центр звукорежиссёра" },
      {
        name: "description",
        content:
          "Тренировка слуха, рейтинг, уроки сведения, пресеты и сообщество звукорежиссёров — всё в одном командном центре.",
      },
      { property: "og:title", content: "MixPro — командный центр звукорежиссёра" },
      { property: "og:description", content: "Тренировка слуха, рейтинг, уроки и пресеты для звукорежиссёров." },
    ],
  }),
  loader: ({ context }) => {
    context.queryClient.ensureQueryData(statsQuery);
  },
  component: Index,
  errorComponent: RouteError,
  notFoundComponent: RouteNotFound,
});

function Index() {
  const { data: stats } = useSuspenseQuery(statsQuery);

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 md:py-14">
      <div className="grid grid-cols-12 gap-3 md:gap-4">
        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="panel relative col-span-12 overflow-hidden rounded-2xl p-6 md:p-8 lg:col-span-8"
        >
          <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-mint/10 blur-[100px]" />
          <Waveform className="pointer-events-none absolute inset-x-0 bottom-0 h-32 w-full opacity-40" />

          <div className="relative flex flex-col gap-6">
            <div className="flex items-center gap-2">
              <span className="ping-dot" />
              <span className="label-mono">{"\n"}</span>
            </div>
            <h1 className="max-w-2xl text-3xl font-bold leading-[1.05] tracking-tight md:text-5xl">
              Прокачай свои навыки. Собери <span className="text-gradient-emerald">мастер-микс</span>.
              Поднимись в рейтинге.
            </h1>
            <p className="max-w-xl text-sm leading-relaxed text-muted-foreground md:text-base">
              Тренажёры слуха, разбор техник сведения, каталог пресетов и живое сообщество инженеров — на одной платформе.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <Link to="/games" className="btn-primary inline-flex items-center gap-2">
                Начать сессию <ArrowRight className="h-3.5 w-3.5" />
              </Link>
              <Link to="/learn" className="btn-ghost inline-flex items-center gap-2">
                Смотреть уроки
              </Link>
            </div>
          </div>
        </motion.section>

        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.05 }}
          className="panel col-span-12 flex flex-col justify-between rounded-2xl p-6 lg:col-span-4"
        >
          <div className="flex items-center justify-between">
            <span className="label-mono">ОНЛАЙН</span>
            <div className="flex gap-1">
              <div className="h-1.5 w-1.5 rounded-full bg-mint shadow-[0_0_6px_var(--mint)]" />
              <div className="h-1.5 w-1.5 rounded-full bg-muted" />
              <div className="h-1.5 w-1.5 rounded-full bg-muted" />
            </div>
          </div>
          <div className="py-3">
            <div className="font-display text-5xl font-bold tracking-tighter text-foreground">
              {stats.users}
            </div>
            <p className="mt-1 text-xs text-mint">инженеров онлайн</p>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <MiniStat label="Раунды" value={stats.games} />
            <MiniStat label="Уроки" value={stats.lessons} />
            <MiniStat label="Пресеты" value={stats.presets} />
          </div>
        </motion.section>

        <ModuleCard
          to="/games"
          delay={0.1}
          span="col-span-12 md:col-span-4"
          icon={AudioWaveform}
          accent="mint"
          label="Ear training"
          title="Тренажёры слуха"
          desc="Угадай частоту, лови изменение высоты. XP за каждое попадание."
          cta="Играть"
        >
          <div className="panel-deep relative flex h-24 items-center justify-center overflow-hidden rounded-xl">
            <svg className="absolute inset-x-2 h-12 w-[calc(100%-1rem)] text-mint/25" preserveAspectRatio="none" viewBox="0 0 100 40">
              <path d="M0 20 Q 8 5, 16 20 T 32 20 T 48 20 T 64 20 T 80 20 T 100 20" fill="none" stroke="currentColor" strokeWidth="0.6" />
              <path d="M0 20 Q 8 35, 16 20 T 32 20 T 48 20 T 64 20 T 80 20 T 100 20" fill="none" stroke="currentColor" strokeWidth="0.6" />
            </svg>
            <span className="relative rounded bg-background/70 px-2 py-0.5 font-mono text-[9px] uppercase tracking-widest text-mint">
              Freq matcher · active
            </span>
          </div>
        </ModuleCard>

        <ModuleCard
          to="/learn"
          delay={0.15}
          span="col-span-12 md:col-span-4"
          icon={GraduationCap}
          accent="cyan"
          label="Masterclass"
          title="Обучение"
          desc="EQ, компрессия, сведение вокала, мастеринг — от новичка к продвинутому."
          cta={`${stats.lessons} уроков`}
        >
          <div className="space-y-2">
            {[
              { i: "01", t: "Основы эквализации" },
              { i: "02", t: "Компрессия: базовые техники" },
            ].map((r) => (
              <div key={r.i} className="panel-deep flex items-center gap-3 rounded-lg p-2.5">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded bg-muted/60 font-mono text-[10px] text-muted-foreground">
                  {r.i}
                </span>
                <span className="truncate text-xs font-semibold">{r.t}</span>
              </div>
            ))}
          </div>
        </ModuleCard>

        <ModuleCard
          to="/leaderboard"
          delay={0.2}
          span="col-span-12 md:col-span-4"
          icon={Trophy}
          accent="violet"
          label="Global ranking"
          title="Рейтинг"
          desc="Топ инженеров MixPro по заработанному XP. Стань первым."
          cta="Смотреть топ"
        >
          <div className="space-y-1.5 font-mono text-[11px]">
            {[
              { r: "01", n: "wave_master", x: "+240" },
              { r: "02", n: "sonic_aura", x: "+195" },
              { r: "03", n: "fader_king", x: "+182" },
            ].map((row) => (
              <div key={row.r} className="panel-deep flex items-center justify-between rounded px-2.5 py-1.5">
                <span className="text-muted-foreground">{row.r}</span>
                <span className="flex-1 truncate px-3 text-foreground/90">{row.n}</span>
                <span className="text-mint">{row.x} xp</span>
              </div>
            ))}
          </div>
        </ModuleCard>

        <ModuleCard
          to="/presets"
          delay={0.25}
          span="col-span-12 md:col-span-5"
          icon={SlidersHorizontal}
          accent="mint"
          label="Studio rack"
          title="Пресеты"
          desc="Готовые чейны для FL Studio, Ableton, Logic и других DAW."
          cta="Открыть каталог"
        >
          <div className="grid grid-cols-4 gap-2">
            {[
              { n: "Warm Vox", c: "mint" },
              { n: "808 Glue", c: "cyan" },
              { n: "Plate Rev", c: "violet" },
              { n: "Gate V3", c: "muted" },
            ].map((p) => (
              <div key={p.n} className="panel-deep group flex aspect-square flex-col items-center justify-center gap-2 rounded-lg transition-colors hover:border-mint/40">
                <div
                  className={
                    p.c === "mint"
                      ? "h-1 w-1 rounded-full bg-mint shadow-[0_0_6px_var(--mint)]"
                      : p.c === "cyan"
                        ? "h-1 w-1 rounded-full bg-cyan shadow-[0_0_6px_var(--cyan)]"
                        : p.c === "violet"
                          ? "h-1 w-1 rounded-full bg-violet shadow-[0_0_6px_var(--violet)]"
                          : "h-1 w-1 rounded-full bg-muted-foreground/40"
                  }
                />
                <span className="font-mono text-[10px] uppercase text-muted-foreground group-hover:text-foreground">
                  {p.n}
                </span>
              </div>
            ))}
          </div>
        </ModuleCard>

        <ModuleCard
          to="/games/frequency"
          delay={0.3}
          span="col-span-12 md:col-span-4"
          icon={Gamepad2}
          accent="cyan"
          label="Live challenge"
          title="Угадай частоту"
          desc="Розовый шум с усиленной полосой — определи, какая частота выделена."
          cta="+10 XP за раунд"
        >
          <div className="panel-deep flex items-center justify-between rounded-lg p-3">
            <div className="flex items-center gap-2">
              <Radio className="h-4 w-4 text-cyan" />
              <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                8 bands · pink noise
              </span>
            </div>
            <span className="rounded bg-cyan/10 px-2 py-0.5 font-mono text-[10px] font-bold text-cyan">
              PLAY
            </span>
          </div>
        </ModuleCard>

        <ModuleCard
          to="/community"
          delay={0.35}
          span="col-span-12 md:col-span-3"
          icon={MessagesSquare}
          accent="violet"
          label="Community"
          title="Пульс"
          desc="Живая лента: миксы, вопросы, споры."
          cta="Открыть"
        >
          <div className="flex items-center gap-2">
            <span className="ping-dot" />
            <span className="font-mono text-[10px] uppercase tracking-widest text-mint">
              live · 3 new
            </span>
          </div>
        </ModuleCard>

        <motion.section
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.15 }}
          className="panel col-span-12 rounded-2xl p-6 md:p-8"
        >
          <div className="flex flex-col items-start justify-between gap-4 md:flex-row md:items-center">
            <div className="flex items-start gap-4">
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-mint/10 text-mint">
                <Sparkles className="h-5 w-5" />
              </div>
              <div>
                <span className="label-mono">Weekly mix challenge</span>
                <h3 className="mt-1 text-lg font-bold">Собери свой первый мастер-микс за неделю</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Ежедневные челленджи, XP-бонус x2 и разбор от топ-инженеров.
                </p>
              </div>
            </div>
            <Link to="/games" className="btn-primary shrink-0">
              Присоединиться
            </Link>
          </div>
        </motion.section>
      </div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="panel-deep rounded-lg p-2 text-center">
      <div className="label-mono">{label}</div>
      <div className="mt-0.5 font-mono text-xs font-bold text-foreground">{value}</div>
    </div>
  );
}

type Accent = "mint" | "cyan" | "violet";
const accentMap: Record<Accent, { bg: string; text: string; ring: string }> = {
  mint: { bg: "bg-mint/10", text: "text-mint", ring: "hover:border-mint/40" },
  cyan: { bg: "bg-cyan/10", text: "text-cyan", ring: "hover:border-cyan/40" },
  violet: { bg: "bg-violet/10", text: "text-violet", ring: "hover:border-violet/40" },
};

function ModuleCard({
  to,
  span,
  icon: Icon,
  accent,
  label,
  title,
  desc,
  cta,
  children,
  delay = 0,
}: {
  to: string;
  span: string;
  icon: React.ComponentType<{ className?: string }>;
  accent: Accent;
  label: string;
  title: string;
  desc: string;
  cta: string;
  children?: React.ReactNode;
  delay?: number;
}) {
  const a = accentMap[accent];
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.4, delay }}
      className={span}
    >
      <Link
        to={to}
        className={`panel group flex h-full flex-col gap-4 rounded-2xl p-5 transition-all hover:-translate-y-0.5 ${a.ring}`}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`grid h-8 w-8 place-items-center rounded-lg ${a.bg} ${a.text}`}>
              <Icon className="h-4 w-4" />
            </div>
            <span className="label-mono">{label}</span>
          </div>
          <ArrowRight className={`h-3.5 w-3.5 -translate-x-1 opacity-0 transition-all group-hover:translate-x-0 group-hover:opacity-100 ${a.text}`} />
        </div>
        <div>
          <h3 className="text-lg font-bold tracking-tight text-foreground">{title}</h3>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{desc}</p>
        </div>
        {children && <div className="mt-auto">{children}</div>}
        <div className={`mt-1 inline-flex w-fit rounded ${a.bg} px-2 py-1 font-mono text-[10px] font-bold uppercase tracking-widest ${a.text}`}>
          {cta}
        </div>
      </Link>
    </motion.div>
  );
}
