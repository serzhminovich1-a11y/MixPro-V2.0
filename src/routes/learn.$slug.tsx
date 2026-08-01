import { createFileRoute, Link, notFound, useNavigate } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import ReactMarkdown from "react-markdown";
import {
  CheckCircle2,
  RotateCcw,
  
  ChevronRight,
  ChevronLeft,
  ChevronDown,
  ChevronUp,
  ListTree,
  MessageSquare,
  Send,
  Sparkles,
} from "lucide-react";
import { getLessonBySlug, getCourseModules } from "@/lib/public.functions";
import { submitQuiz } from "@/lib/community.functions";
import { useServerFn } from "@tanstack/react-start";
import { useAuth } from "@/hooks/use-auth";

import { useSubscription } from "@/hooks/use-subscription";
import { PremiumBadge, PremiumPaywall } from "@/components/premium-paywall";
import { useEffect, useMemo, useState } from "react";
import { RouteError, RouteNotFound } from "@/components/route-fallbacks";
import { BlockRenderer } from "@/components/block-renderer";
import type { Block } from "@/lib/course-blocks";

const lessonQuery = (slug: string) =>
  queryOptions({ queryKey: ["lesson", slug], queryFn: () => getLessonBySlug({ data: { slug } }) });
const tocQuery = queryOptions({ queryKey: ["course-toc"], queryFn: () => getCourseModules() });

type Question = { q: string; options: string[]; correct: number };

export const Route = createFileRoute("/learn/$slug")({
  loader: async ({ context, params }) => {
    const [res] = await Promise.all([
      context.queryClient.ensureQueryData(lessonQuery(params.slug)),
      context.queryClient.ensureQueryData(tocQuery),
    ]);
    if (!res.lesson) throw notFound();
    return { title: res.lesson.title, category: res.lesson.category };
  },
  head: ({ loaderData }) => {
    if (!loaderData) return { meta: [{ title: "Урок не найден — MixPro" }, { name: "robots", content: "noindex" }] };
    return {
      meta: [
        { title: `${loaderData.title} — MixPro` },
        { name: "description", content: `Урок «${loaderData.title}» (${loaderData.category}) — курс звукорежиссуры.` },
        { property: "og:title", content: `${loaderData.title} — MixPro` },
        { property: "og:description", content: `Урок: ${loaderData.title}.` },
      ],
    };
  },
  component: LessonPage,
  errorComponent: RouteError,
  notFoundComponent: RouteNotFound,
});

const REACTIONS = [
  { key: "fire", emoji: "🔥", label: "Огонь" },
  { key: "brain", emoji: "🧠", label: "Инсайт" },
  { key: "ear", emoji: "👂", label: "Слышу" },
  { key: "clap", emoji: "👏", label: "Круто" },
  { key: "hard", emoji: "😵", label: "Сложно" },
];

function LessonPage() {
  const { slug } = Route.useParams();
  const navigate = useNavigate();
  const { data } = useSuspenseQuery(lessonQuery(slug));
  const { data: toc } = useSuspenseQuery(tocQuery);
  const { session } = useAuth();
  
  const sub = useSubscription();

  const lesson = data.lesson;
  const questions = useMemo<Question[]>(() => (lesson?.quiz as Question[] | null) ?? [], [lesson]);
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [result, setResult] = useState<{ score: number; passed: boolean; correct: number; total: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [reaction, setReaction] = useState<string | null>(null);
  const [tocOpen, setTocOpen] = useState(true);
  const send = useServerFn(submitQuiz);

  const modules = useMemo(
    () =>
      (toc.modules ?? []) as Array<{
        id: string;
        title: string;
        lessons: Array<{ id: string; slug: string; title: string; order_index: number }>;
      }>,
    [toc],
  );

  const { flatLessons, currentModuleId, currentIdx } = useMemo(() => {
    const flat: Array<{ mIdx: number; lIdx: number; slug: string; title: string; moduleId: string; moduleTitle: string }> = [];
    modules.forEach((m, mi) => {
      const sorted = [...m.lessons].sort((a, b) => a.order_index - b.order_index);
      sorted.forEach((l, li) => flat.push({ mIdx: mi + 1, lIdx: li + 1, slug: l.slug, title: l.title, moduleId: m.id, moduleTitle: m.title }));
    });
    const idx = flat.findIndex((l) => l.slug === slug);
    return { flatLessons: flat, currentModuleId: idx >= 0 ? flat[idx].moduleId : null, currentIdx: idx };
  }, [modules, slug]);

  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  useEffect(() => {
    if (currentModuleId) setExpanded((prev) => ({ ...prev, [currentModuleId]: true }));
  }, [currentModuleId]);

  const currentLessonRef = currentIdx >= 0 ? flatLessons[currentIdx] : null;
  const prevLesson = currentIdx > 0 ? flatLessons[currentIdx - 1] : null;
  const nextLesson = currentIdx >= 0 && currentIdx < flatLessons.length - 1 ? flatLessons[currentIdx + 1] : null;

  if (!lesson) return null;

  async function submit() {
    if (!session || !lesson) return;
    setBusy(true);
    try {
      const arr: number[] = questions.map((_, i) => answers[i] ?? -1);
      const r = await send({ data: { lessonId: lesson.id, answers: arr } });
      setResult(r);
    } finally {
      setBusy(false);
    }
  }
  function retake() {
    setAnswers({});
    setResult(null);
  }
  const allAnswered = questions.length > 0 && questions.every((_, i) => answers[i] !== undefined);
  const isPremium = (lesson as { is_premium?: boolean }).is_premium;
  const totalLessons = flatLessons.length;
  const progressNum = currentIdx >= 0 ? currentIdx + 1 : 0;
  const pct = totalLessons ? Math.round((progressNum / totalLessons) * 100) : 0;

  return (
    <div className="mx-auto w-full max-w-[1400px] px-3 py-4 sm:px-6 sm:py-6">
      {/* Top rail: breadcrumb + progress meter */}
      <div className="mb-4 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-lg border border-border/60 bg-surface-2/60 px-4 py-3 backdrop-blur sm:flex sm:flex-wrap">
        <div className="flex min-w-0 items-center gap-2 text-xs">
          <Link to="/learn" className="inline-flex shrink-0 items-center gap-1 text-muted-foreground hover:text-mint">
            <ChevronLeft className="h-3.5 w-3.5" /> Каталог
          </Link>
          <span className="text-muted-foreground/50">/</span>
          <span className="truncate text-muted-foreground">{currentLessonRef?.moduleTitle ?? "Курс"}</span>
          <span className="text-muted-foreground/50">/</span>
          <span className="truncate font-mono text-mint">
            {currentLessonRef ? `${currentLessonRef.mIdx}.${currentLessonRef.lIdx}` : ""}
          </span>
        </div>
        <div className="flex items-center gap-3 sm:ml-auto">
          <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
            <span>
              <span className="text-foreground">{progressNum}</span>
              <span className="text-muted-foreground/60"> / {totalLessons}</span>
            </span>
            <div className="relative h-1.5 w-32 overflow-hidden rounded-full bg-surface-3">
              <div
                className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-mint/60 to-mint"
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className="text-mint">{pct}%</span>
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
        {/* Sidebar — module tree (accordion). Collapsible on mobile. */}
        <aside className="lg:sticky lg:top-4 lg:self-start">
          <div className="overflow-hidden rounded-lg border border-border/60 bg-surface-2/60 backdrop-blur">
            <button
              onClick={() => setTocOpen((v) => !v)}
              className="flex w-full items-center justify-between gap-2 border-b border-border/60 bg-surface-3/60 px-3 py-2 text-left text-[11px] font-mono uppercase tracking-[0.16em] text-muted-foreground hover:text-mint"
            >
              <span className="inline-flex items-center gap-2">
                <ListTree className="h-3.5 w-3.5" /> Структура курса
              </span>
              {tocOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            </button>
            {tocOpen && (
              <nav className="max-h-[70vh] overflow-y-auto p-2">
                {modules.map((m, mi) => {
                  const isOpen = expanded[m.id] ?? false;
                  const sorted = [...m.lessons].sort((a, b) => a.order_index - b.order_index);
                  const hasActive = sorted.some((l) => l.slug === slug);
                  return (
                    <div key={m.id} className="mb-1">
                      <button
                        onClick={() => setExpanded((p) => ({ ...p, [m.id]: !isOpen }))}
                        className={`flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-[13px] transition-colors ${
                          hasActive ? "bg-surface-3 text-foreground" : "text-muted-foreground hover:bg-surface-3/60 hover:text-foreground"
                        }`}
                      >
                        <span
                          className={`grid h-6 w-6 shrink-0 place-items-center rounded font-mono text-[11px] ${
                            hasActive ? "bg-mint/20 text-mint" : "bg-surface-3 text-muted-foreground"
                          }`}
                        >
                          {String(mi + 1).padStart(2, "0")}
                        </span>
                        <span className="min-w-0 flex-1 truncate font-medium">{m.title}</span>
                        {isOpen ? (
                          <ChevronUp className="h-3.5 w-3.5 shrink-0 text-muted-foreground/70" />
                        ) : (
                          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground/70" />
                        )}
                      </button>
                      {isOpen && (
                        <ul className="mt-1 ml-3 border-l border-border/60 pl-2">
                          {sorted.map((l, li) => {
                            const active = l.slug === slug;
                            return (
                              <li key={l.id}>
                                <Link
                                  to="/learn/$slug"
                                  params={{ slug: l.slug }}
                                  className={`relative flex items-center gap-2 rounded-md px-2 py-1.5 text-[12.5px] transition-colors ${
                                    active
                                      ? "bg-mint/15 text-mint"
                                      : "text-muted-foreground hover:bg-surface-3/50 hover:text-foreground"
                                  }`}
                                >
                                  {active && (
                                    <span className="absolute -left-[9px] top-1/2 h-4 w-[2px] -translate-y-1/2 rounded-full bg-mint" />
                                  )}
                                  <span className={`font-mono text-[10.5px] ${active ? "text-mint/80" : "text-muted-foreground/60"}`}>
                                    {mi + 1}.{li + 1}
                                  </span>
                                  <span className="min-w-0 flex-1 truncate">{l.title}</span>
                                </Link>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </div>
                  );
                })}
              </nav>
            )}
          </div>
        </aside>

        {/* Content column */}
        <div className="min-w-0 space-y-4">
          {isPremium && !sub.active && !sub.loading ? (
            <div className="rounded-lg border border-border/60 bg-surface-2/60 p-6">
              <PremiumPaywall
                title="Урок доступен по подписке"
                description={`Урок «${lesson.title}» входит в платный курс. Оформи подписку, чтобы открыть его полностью.`}
              />
            </div>
          ) : (
            <>
              {/* Lesson header card */}
              <article className="rounded-lg border border-border/60 bg-surface-2/60 backdrop-blur">
                <header className="border-b border-border/60 px-6 py-5">
                  <div className="flex items-center gap-2 font-mono text-[10.5px] uppercase tracking-[0.18em] text-muted-foreground">
                    <span className="grid h-5 w-5 place-items-center rounded bg-mint/15 text-mint">
                      <Sparkles className="h-3 w-3" />
                    </span>
                    Урок · {currentLessonRef ? `${currentLessonRef.mIdx}.${currentLessonRef.lIdx}` : ""} · {lesson.category}
                    {isPremium && (
                      <span className="ml-1">
                        <PremiumBadge />
                      </span>
                    )}
                  </div>
                  <h1 className="mt-2 text-2xl font-extrabold leading-tight text-foreground sm:text-[28px]">{lesson.title}</h1>
                </header>

                <div className="mixpro-prose px-6 py-6 sm:px-8">
                  {(() => {
                    const blocks = (lesson.content_blocks as Block[] | null) ?? [];
                    if (blocks.length > 0) return <BlockRenderer blocks={blocks} />;
                    return (
                      <ReactMarkdown
                        components={{
                          h1: ({ children }) => <h1 className="mt-8 text-2xl font-bold text-foreground">{children}</h1>,
                          h2: ({ children }) => <h2 className="mt-8 text-xl font-semibold text-foreground">{children}</h2>,
                          h3: ({ children }) => <h3 className="mt-6 text-lg font-semibold text-foreground">{children}</h3>,
                          p: ({ children }) => <p className="mt-4 text-[15px] leading-[1.75] text-foreground/85">{children}</p>,
                          ul: ({ children }) => <ul className="mt-4 list-disc space-y-2 pl-6 text-foreground/85">{children}</ul>,
                          ol: ({ children }) => <ol className="mt-4 list-decimal space-y-2 pl-6 text-foreground/85">{children}</ol>,
                          strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
                          a: ({ children, href }) => (
                            <a href={href} className="text-mint underline decoration-mint/40 underline-offset-2 hover:decoration-mint">
                              {children}
                            </a>
                          ),
                          code: ({ children }) => (
                            <code className="rounded bg-surface-3 px-1.5 py-0.5 font-mono text-[13px] text-mint">{children}</code>
                          ),
                        }}
                      >
                        {lesson.content_md ?? ""}
                      </ReactMarkdown>
                    );
                  })()}
                </div>
              </article>

              {/* Quiz */}
              {session && questions.length > 0 && (
                <div className="rounded-lg border border-border/60 bg-surface-2/60 p-6">
                  {result ? (
                    <div
                      className={`rounded-md border p-5 ${
                        result.passed ? "border-mint/50 bg-mint/10" : "border-destructive/50 bg-destructive/10"
                      }`}
                    >
                      {result.passed ? (
                        <div className="flex items-center gap-3">
                          <CheckCircle2 className="h-6 w-6 text-mint" />
                          <div>
                            <div className="font-semibold text-foreground">Урок пройден</div>
                            <div className="text-sm text-muted-foreground">
                              {result.correct} из {result.total} · {result.score}% · +{lesson.xp_reward ?? 50} XP
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div>
                          <div className="font-semibold text-destructive">Ещё чуть-чуть</div>
                          <div className="text-sm text-muted-foreground">
                            {result.correct} из {result.total} · {result.score}% · нужен минимум {lesson.pass_score ?? 70}%
                          </div>
                          <button
                            onClick={retake}
                            className="mt-3 inline-flex items-center gap-2 rounded-md bg-surface-3 px-4 py-2 text-sm text-foreground hover:bg-surface-3/70"
                          >
                            <RotateCcw className="h-4 w-4" /> Пройти заново
                          </button>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div>
                      <div className="mb-4 flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                        <span className="h-1 w-4 bg-mint" /> Проверка знаний
                      </div>
                      <div className="space-y-5">
                        {questions.map((q, qi) => (
                          <div key={qi}>
                            <p className="text-sm font-semibold text-foreground">
                              {qi + 1}. {q.q}
                            </p>
                            <div className="mt-2 space-y-2">
                              {q.options.map((opt, oi) => (
                                <label
                                  key={oi}
                                  className={`flex cursor-pointer items-center gap-3 rounded-md border px-3 py-2 text-sm transition-colors ${
                                    answers[qi] === oi
                                      ? "border-mint bg-mint/10 text-foreground"
                                      : "border-border/60 bg-surface-3/40 text-foreground/80 hover:border-mint/40"
                                  }`}
                                >
                                  <input
                                    type="radio"
                                    name={`q-${qi}`}
                                    checked={answers[qi] === oi}
                                    onChange={() => setAnswers({ ...answers, [qi]: oi })}
                                    className="accent-mint"
                                  />
                                  <span>{opt}</span>
                                </label>
                              ))}
                            </div>
                          </div>
                        ))}
                        <button
                          onClick={submit}
                          disabled={busy || !allAnswered}
                          className="rounded-md bg-mint px-5 py-2.5 text-sm font-semibold text-background hover:bg-mint/90 disabled:opacity-40"
                        >
                          {busy ? "Проверяем…" : "Отправить ответы"}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Reactions + navigation */}
              <div className="rounded-lg border border-border/60 bg-surface-2/60 p-4 sm:p-5">
                <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 sm:flex sm:flex-wrap sm:justify-between">
                  <div className="flex min-w-0 items-center gap-2 sm:gap-3">
                    {REACTIONS.map((r) => {
                      const active = reaction === r.key;
                      return (
                        <button
                          key={r.key}
                          onClick={() => setReaction((prev) => (prev === r.key ? null : r.key))}
                          title={r.label}
                          className={`group inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-sm transition-colors ${
                            active
                              ? "border-mint/60 bg-mint/15 text-mint"
                              : "border-border/60 bg-surface-3/40 text-muted-foreground hover:border-mint/40 hover:text-foreground"
                          }`}
                        >
                          <span className="text-base leading-none">{r.emoji}</span>
                          <span className="font-mono text-[11px]">{active ? 1 : 0}</span>
                        </button>
                      );
                    })}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {prevLesson && (
                      <button
                        onClick={() => navigate({ to: "/learn/$slug", params: { slug: prevLesson.slug } })}
                        className="inline-flex items-center gap-1.5 rounded-md border border-border/60 bg-surface-3/60 px-3 py-2 text-xs font-medium text-foreground hover:border-mint/40"
                      >
                        <ChevronLeft className="h-4 w-4" /> Назад
                      </button>
                    )}
                    {nextLesson ? (
                      <button
                        onClick={() => navigate({ to: "/learn/$slug", params: { slug: nextLesson.slug } })}
                        className="inline-flex items-center gap-2 rounded-md bg-mint px-4 py-2 text-sm font-semibold text-background shadow-[0_0_20px_-6px_var(--mint)] hover:bg-mint/90"
                      >
                        Следующий урок <ChevronRight className="h-4 w-4" />
                      </button>
                    ) : (
                      <Link
                        to="/learn"
                        className="inline-flex items-center gap-2 rounded-md border border-mint/50 bg-surface-3 px-4 py-2 text-sm font-semibold text-mint hover:bg-mint/10"
                      >
                        Курс окончен · К каталогу
                      </Link>
                    )}
                  </div>
                </div>
              </div>

              {/* Comments */}
              <div className="rounded-lg border border-border/60 bg-surface-2/60 p-5">
                <div className="mb-3 flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                  <MessageSquare className="h-3.5 w-3.5 text-mint" />
                  Обсуждение урока
                </div>
                <p className="text-sm text-muted-foreground">
                  Будьте вежливы и соблюдайте{" "}
                  <span className="text-mint underline decoration-mint/40 underline-offset-2">принципы сообщества</span>. Решения и подсказки
                  оставляйте в форуме, здесь — обсуждение материала.
                </p>
                <div className="mt-4 flex items-center gap-3 rounded-md border border-border/60 bg-surface-3/40 px-3 py-2">
                  <div className="h-8 w-8 shrink-0 rounded-full bg-gradient-to-br from-mint/40 to-mint/10" />
                  {session ? (
                    <>
                      <input
                        placeholder="Оставить комментарий…"
                        className="min-w-0 flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground/60 outline-none"
                      />
                      <button className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-mint text-background hover:bg-mint/90">
                        <Send className="h-3.5 w-3.5" />
                      </button>
                    </>
                  ) : (
                    <Link to="/auth" className="text-sm text-mint hover:underline">
                      Войдите, чтобы оставить комментарий
                    </Link>
                  )}
                </div>
                <p className="mt-4 text-xs text-muted-foreground/70">Пока тишина. Начни обсуждение первым.</p>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
