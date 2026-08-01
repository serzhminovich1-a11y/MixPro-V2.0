import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getCourseBySlug, getMyCourseProgress } from "@/lib/courses.functions";
import { BookOpen, Clock, CheckCircle2, Lock, Trophy, ArrowLeft, PlayCircle } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { CertificateButton } from "@/components/certificate-button";
import { RouteError, RouteNotFound } from "@/components/route-fallbacks";

import { getMyProgress } from "@/lib/community.functions";

export const Route = createFileRoute("/courses/$slug")({
  loader: async ({ params }) => {
    const r = await getCourseBySlug({ data: { slug: params.slug } });
    if (!r.course) throw notFound();
    return { course: r.course, lessons: r.lessons, cert: r.cert };
  },
  head: ({ loaderData }) => {
    if (!loaderData) return { meta: [{ title: "Курс не найден — MixPro" }, { name: "robots", content: "noindex" }] };
    const c = loaderData.course as any;
    return {
      meta: [
        { title: `${c.title} — курс — MixPro` },
        { name: "description", content: c.description ?? `Курс «${c.title}» — уроки и сертификат по завершении.` },
        { property: "og:title", content: `${c.title} — MixPro` },
        { property: "og:description", content: c.description ?? "" },
      ],
    };
  },
  component: CoursePage,
  errorComponent: RouteError,
  notFoundComponent: RouteNotFound,
});

const LEVEL: Record<string, { label: string; cls: string }> = {
  beginner: { label: "Новичок", cls: "text-mint bg-mint/10" },
  intermediate: { label: "Средний", cls: "text-cyan bg-cyan/10" },
  pro: { label: "Про", cls: "text-violet bg-violet/10" },
};

function CoursePage() {
  const { course, lessons, cert } = Route.useLoaderData();
  const { session, user } = useAuth();
  const studentName = (user?.user_metadata?.username as string | undefined) ?? user?.email?.split("@")[0] ?? "MixPro Student";
  const [passedIds, setPassedIds] = useState<Set<string>>(new Set());
  const [coursePassed, setCoursePassed] = useState<{ completed_at: string | null; completed_lessons: number; total_lessons: number } | null>(null);
  const getProg = useServerFn(getMyProgress);
  const getMyCourse = useServerFn(getMyCourseProgress);

  useEffect(() => {
    if (!session) return;
    getProg({}).then((r) => setPassedIds(new Set(r.progress.filter((p) => p.passed).map((p) => p.lesson_id)))).catch(() => {});
    getMyCourse().then((r) => {
      const mine = (r.progress as any[]).find((p) => p.course_id === (course as any).id);
      if (mine) setCoursePassed({ completed_at: mine.completed_at, completed_lessons: mine.completed_lessons, total_lessons: mine.total_lessons });
    }).catch(() => {});
  }, [session, getProg, getMyCourse, course]);

  const c = course as any;
  const total = lessons.length;
  const passed = lessons.filter((l: any) => passedIds.has(l.id)).length;
  const pct = total > 0 ? Math.round((passed / total) * 100) : 0;
  const isDone = total > 0 && passed >= total;
  const nextLesson = (lessons as any[]).find((l) => !passedIds.has(l.id)) ?? (lessons as any[])[0];

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <Link to="/learn" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-3.5 w-3.5" /> Все курсы
      </Link>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <span className={`rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-wider ${LEVEL[c.level ?? "beginner"].cls}`}>
          {LEVEL[c.level ?? "beginner"].label}
        </span>
        <span className="rounded-full bg-secondary px-3 py-1 text-[10px] font-mono uppercase text-muted-foreground">
          {total} уроков
        </span>
        {cert && (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-400/10 px-3 py-1 text-[10px] font-semibold uppercase text-amber-300">
            <Trophy className="h-3 w-3" /> сертификат
          </span>
        )}
      </div>

      <h1 className="mt-4 text-3xl font-bold tracking-tight md:text-4xl">{c.title}</h1>
      {c.description && <p className="mt-3 max-w-2xl text-sm text-muted-foreground">{c.description}</p>}

      {nextLesson && (
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <Link
            to="/learn/$slug"
            params={{ slug: nextLesson.slug }}
            className="inline-flex items-center gap-2 rounded-lg bg-mint px-4 py-2 text-sm font-bold text-black transition-transform hover:scale-[1.02]"
          >
            <PlayCircle className="h-4 w-4" /> {session && passed > 0 && !isDone ? "Продолжить курс" : "Начать курс"}
          </Link>
          <span className="text-xs text-muted-foreground">
            Следующий урок: <span className="text-foreground">{nextLesson.title}</span>
          </span>
        </div>
      )}


      {session && total > 0 && (
        <div className="glass mt-6 rounded-2xl p-4">
          <div className="flex items-center justify-between text-xs uppercase tracking-wider text-muted-foreground">
            <span>Твой прогресс</span>
            <span className="font-mono text-mint">{passed} / {total} · {pct}%</span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-black/40">
            <div className="h-full bg-gradient-to-r from-mint to-cyan transition-all" style={{ width: `${pct}%` }} />
          </div>
          {isDone && (
            <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-mint/40 bg-mint/10 p-3">
              <CheckCircle2 className="h-5 w-5 text-mint" />
              <div className="flex-1">
                <div className="text-sm font-semibold text-mint">Курс пройден!</div>
                {coursePassed?.completed_at && (
                  <div className="text-xs text-muted-foreground">
                    Завершено: {new Date(coursePassed.completed_at).toLocaleDateString("ru-RU")}
                  </div>
                )}
              </div>
              <CertificateButton
                courseTitle={c.title}
                studentName={studentName}
                completedAt={coursePassed?.completed_at ?? null}
                certificateSlug={c.slug}
              />
            </div>
          )}
        </div>
      )}

      <div className="mt-6 space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Уроки</h2>
        {total === 0 ? (
          <div className="glass rounded-xl p-6 text-center text-sm text-muted-foreground">В курсе пока нет уроков.</div>
        ) : (
          lessons.map((l: any, i: number) => {
            const done = passedIds.has(l.id);
            const prev = lessons[i - 1] as any | undefined;
            const locked = !!prev && !passedIds.has(prev.id) && !!session;
            return (
              <Link
                key={l.id}
                to="/learn/$slug"
                params={{ slug: l.slug }}
                disabled={locked}
                className={`group flex items-center gap-3 rounded-xl border p-3 transition-colors ${
                  done ? "border-mint/40 bg-mint/5" : locked ? "border-black/40 bg-black/30 opacity-60 pointer-events-none" : "border-black/50 bg-black/20 hover:border-cyan/40"
                }`}
              >
                <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-black/40 text-xs font-mono">
                  {done ? <CheckCircle2 className="h-4 w-4 text-mint" /> : locked ? <Lock className="h-3.5 w-3.5 text-muted-foreground" /> : i + 1}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold group-hover:text-cyan">{l.title}</div>
                  <div className="flex items-center gap-3 text-[10px] uppercase tracking-wider text-muted-foreground">
                    <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" /> {l.duration_min} мин</span>
                    <span className="inline-flex items-center gap-1"><BookOpen className="h-3 w-3" /> +{l.xp_reward ?? 50} XP</span>
                    <span>{l.difficulty}</span>
                  </div>
                </div>
              </Link>
            );
          })
        )}
      </div>
    </div>
  );
}
