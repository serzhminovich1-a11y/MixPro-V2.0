import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import {
  GraduationCap,
  Clock,
  BookOpen,
  Heart,
  Users,
  Search,
  Award,
  ImageIcon,
  ChevronDown,
} from "lucide-react";
import { getCourseModules } from "@/lib/public.functions";
import { getMyProgress } from "@/lib/community.functions";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useSubscription } from "@/hooks/use-subscription";
import { RouteError, RouteNotFound } from "@/components/route-fallbacks";


const modulesQuery = queryOptions({ queryKey: ["course-modules"], queryFn: () => getCourseModules() });

export const Route = createFileRoute("/learn/")({
  head: () => ({
    meta: [
      { title: "Каталог курсов — MixPro" },
      { name: "description", content: "Каталог курсов по звукорежиссуре. Фильтры по уровню, цене и сертификату. Бесплатные и премиум-курсы." },
      { property: "og:title", content: "Каталог курсов — MixPro" },
      { property: "og:description", content: "Курсы от новичков до профи. Бесплатно и премиум." },
    ],
  }),
  loader: ({ context }) => {
    context.queryClient.ensureQueryData(modulesQuery);
  },
  component: LearnPage,
  errorComponent: RouteError,
  notFoundComponent: RouteNotFound,
});

type Level = "beginner" | "intermediate" | "pro";
type LevelFilter = Level | "all";
type PriceFilter = "all" | "free" | "paid";

const levelLabel: Record<Level, string> = {
  beginner: "Для начинающих",
  intermediate: "Для продолжающих",
  pro: "Для профи",
};

function LearnPage() {
  const { data } = useSuspenseQuery(modulesQuery);
  const { session } = useAuth();
  

  const sub = useSubscription();
  const getProgress = useServerFn(getMyProgress);

  const [passed, setPassed] = useState<Set<string>>(new Set());
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [level, setLevel] = useState<LevelFilter>("all");
  const [price, setPrice] = useState<PriceFilter>("all");
  const [onlyCert, setOnlyCert] = useState(false);
  const [query, setQuery] = useState("");
  const [openSections, setOpenSections] = useState({ level: true, price: true, extra: true });

  useEffect(() => {
    if (!session) return;
    getProgress({})
      .then((r) => setPassed(new Set(r.progress.filter((p) => p.passed).map((p) => p.lesson_id))))
      .catch(() => {});
  }, [session, getProgress]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("mixpro:course-favs");
      if (raw) setFavorites(new Set(JSON.parse(raw)));
    } catch {}
  }, []);

  function toggleFav(id: string) {
    setFavorites((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      try { localStorage.setItem("mixpro:course-favs", JSON.stringify([...next])); } catch {}
      return next;
    });
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return data.modules.filter((m) => {
      const lvl = ((m as { level?: string }).level as Level) ?? "beginner";
      if (level !== "all" && lvl !== level) return false;
      const paid = (m as { is_premium?: boolean }).is_premium === true;
      if (price === "free" && paid) return false;
      if (price === "paid" && !paid) return false;
      if (onlyCert && !((m as { certification_id?: string | null }).certification_id)) return false;
      if (q && !(m.title.toLowerCase().includes(q) || (m.description ?? "").toLowerCase().includes(q))) return false;
      return true;
    });
  }, [data.modules, level, price, onlyCert, query]);

  const totalLessons = data.modules.reduce((n, m) => n + m.lessons.length, 0);

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-10">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="grid h-9 w-9 place-items-center rounded-lg bg-violet/10 text-violet">
          <GraduationCap className="h-4 w-4" />
        </div>
        <span className="label-mono">Каталог // {data.modules.length} курсов · {totalLessons} уроков</span>
      </div>
      <h1 className="mt-3 text-3xl font-bold tracking-tight md:text-4xl">Курсы</h1>
      <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
        Курсы по звукорежиссуре — от первых шагов до мастеринга. Отфильтруй по уровню, цене или наличию сертификата.
      </p>




      <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
        {/* Sidebar filters */}
        <aside className="space-y-3">
          <FilterGroup
            label="Уровень сложности"
            open={openSections.level}
            onToggle={() => setOpenSections((s) => ({ ...s, level: !s.level }))}
          >
            <Radio checked={level === "beginner"} onChange={() => setLevel("beginner")} label="Для начинающих" />
            <Radio checked={level === "intermediate"} onChange={() => setLevel("intermediate")} label="Для продолжающих" />
            <Radio checked={level === "pro"} onChange={() => setLevel("pro")} label="Для профи" />
            <Radio checked={level === "all"} onChange={() => setLevel("all")} label="Для всех" />
          </FilterGroup>

          <FilterGroup
            label="Цена"
            open={openSections.price}
            onToggle={() => setOpenSections((s) => ({ ...s, price: !s.price }))}
          >
            <div className="flex flex-wrap gap-2">
              <Chip active={price === "free"} onClick={() => setPrice(price === "free" ? "all" : "free")}>Бесплатно</Chip>
              <Chip active={price === "paid"} onClick={() => setPrice(price === "paid" ? "all" : "paid")}>Премиум</Chip>
              <Chip active={price === "all"} onClick={() => setPrice("all")}>Все</Chip>
            </div>
          </FilterGroup>

          <FilterGroup
            label="Дополнительно"
            open={openSections.extra}
            onToggle={() => setOpenSections((s) => ({ ...s, extra: !s.extra }))}
          >
            <label className="flex items-center justify-between gap-2 text-sm">
              <span>Только с сертификатом</span>
              <button
                type="button"
                onClick={() => setOnlyCert((v) => !v)}
                className={`relative h-5 w-9 rounded-full transition ${onlyCert ? "bg-mint" : "bg-black/40"}`}
                aria-pressed={onlyCert}
              >
                <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition ${onlyCert ? "left-[18px]" : "left-0.5"}`} />
              </button>
            </label>
          </FilterGroup>

          <button
            onClick={() => { setLevel("all"); setPrice("all"); setOnlyCert(false); setQuery(""); }}
            className="w-full rounded-lg border border-black/40 bg-black/20 px-3 py-2 text-xs text-muted-foreground hover:bg-black/30"
          >
            Сбросить фильтры
          </button>
        </aside>

        {/* Content */}
        <section>
          {/* Search bar */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[220px]">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Название курса, автор или предмет"
                className="w-full rounded-lg border border-black/40 bg-black/30 py-2.5 pl-10 pr-3 text-sm outline-none focus:border-mint/40"
              />
            </div>
            <button className="rounded-lg bg-mint px-5 py-2.5 text-sm font-semibold text-black transition hover:bg-mint/90">
              Искать
            </button>
          </div>

          <div className="mt-3 text-xs text-muted-foreground">
            Найдено: <span className="font-mono text-foreground">{filtered.length}</span> из {data.modules.length}
          </div>

          {/* Course cards */}
          <div className="mt-4 space-y-3">
            {filtered.length === 0 ? (
              <div className="glass rounded-2xl p-10 text-center text-sm text-muted-foreground">
                Курсов по выбранным фильтрам не найдено
              </div>
            ) : (
              filtered.map((mod) => {
                const paid = (mod as { is_premium?: boolean }).is_premium === true;
                const cert = !!(mod as { certification_id?: string | null }).certification_id;
                const lvl = ((mod as { level?: string }).level as Level) ?? "beginner";
                const totalMin = mod.lessons.reduce((n, l) => n + (l.duration_min || 0), 0);
                const doneCount = mod.lessons.filter((l) => passed.has(l.id)).length;
                const isFav = favorites.has(mod.id);
                const locked = paid && !sub.active;
                return (
                  <article key={mod.id} className="glass group relative flex gap-4 rounded-2xl p-4 transition hover:border-mint/30">
                    {/* Cover */}
                    <Link
                      to="/courses/$slug"
                      params={{ slug: mod.slug }}
                      className="relative block h-24 w-24 shrink-0 overflow-hidden rounded-xl bg-black/40 sm:h-28 sm:w-28"
                    >

                      {mod.cover_url ? (
                        <img src={mod.cover_url} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                          <ImageIcon className="h-6 w-6" />
                        </div>
                      )}
                      <span className="absolute left-1 top-1 rounded bg-black/70 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-widest text-mint">
                        {levelLabel[lvl].replace("Для ", "")}
                      </span>
                    </Link>

                    {/* Meta */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <Link
                            to="/courses/$slug"
                            params={{ slug: mod.slug }}
                            className="block text-base font-bold leading-snug hover:text-mint sm:text-lg"
                          >
                            {mod.title}
                          </Link>

                          <div className="mt-0.5 text-xs text-muted-foreground">MixPro · {levelLabel[lvl]}</div>
                        </div>
                        <div className="flex shrink-0 items-center gap-3">
                          <div className="text-right">
                            {paid ? (
                              <div className="text-base font-bold text-amber-300 sm:text-lg">Premium</div>
                            ) : (
                              <div className="text-base font-bold text-mint sm:text-lg">Бесплатно</div>
                            )}
                            {locked && <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">нужна подписка</div>}
                          </div>
                          <button
                            onClick={() => toggleFav(mod.id)}
                            aria-label="В избранное"
                            className={`grid h-8 w-8 place-items-center rounded-full border border-black/40 transition ${isFav ? "bg-mint/20 text-mint" : "bg-black/30 text-muted-foreground hover:text-mint"}`}
                          >
                            <Heart className={`h-4 w-4 ${isFav ? "fill-current" : ""}`} />
                          </button>
                        </div>
                      </div>

                      {mod.description && (
                        <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{mod.description}</p>
                      )}

                      {/* Stats row */}
                      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                        <span className="inline-flex items-center gap-1">
                          <BookOpen className="h-3.5 w-3.5" /> {mod.lessons.length} уроков
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <Clock className="h-3.5 w-3.5" /> {formatDuration(totalMin)}
                        </span>
                        {cert && (
                          <span className="inline-flex items-center gap-1 text-mint">
                            <Award className="h-3.5 w-3.5" /> сертификат
                          </span>
                        )}
                        {session && mod.lessons.length > 0 && (
                          <span className="inline-flex items-center gap-1">
                            <Users className="h-3.5 w-3.5" /> прогресс {doneCount}/{mod.lessons.length}
                          </span>
                        )}
                      </div>

                      {session && mod.lessons.length > 0 && (
                        <div className="mt-2 h-1 overflow-hidden rounded-full bg-black/40">
                          <div className="h-full bg-mint transition-all" style={{ width: `${(doneCount / mod.lessons.length) * 100}%` }} />
                        </div>
                      )}
                    </div>
                  </article>
                );
              })
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

function FilterGroup({
  label, open, onToggle, children,
}: {
  label: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="glass rounded-xl p-3">
      <button
        onClick={onToggle}
        className="flex w-full items-center justify-between text-left text-sm font-semibold"
      >
        <span>{label}</span>
        <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${open ? "" : "-rotate-90"}`} />
      </button>
      {open && <div className="mt-3 space-y-2">{children}</div>}
    </div>
  );
}

function Radio({ checked, onChange, label }: { checked: boolean; onChange: () => void; label: string }) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-sm">
      <span
        className={`grid h-4 w-4 shrink-0 place-items-center rounded border transition ${checked ? "border-mint bg-mint" : "border-muted-foreground/40 bg-black/30"}`}
      >
        {checked && (
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="black" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        )}
      </span>
      <input type="radio" className="sr-only" checked={checked} onChange={onChange} />
      <span onClick={onChange}>{label}</span>
    </label>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full px-3 py-1 text-xs font-medium transition ${active ? "bg-mint text-black" : "bg-black/30 text-muted-foreground hover:bg-black/50"}`}
    >
      {children}
    </button>
  );
}

function formatDuration(min: number) {
  if (!min) return "—";
  if (min < 60) return `${min} мин`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} ч ${m} мин` : `${h} ч`;
}
