import { Link } from "@tanstack/react-router";
import { ArrowLeft, Flame, HelpCircle, Star, Target, Trophy, Zap } from "lucide-react";
import type { ReactNode } from "react";
import { HowToPlay, useTutorial } from "./how-to-play";
import { TUTORIALS } from "@/lib/games/tutorials";

/** Outer chrome shared by every game route. */
export function GameFrame({
  tag, title, description, children, gameId,
}: {
  tag: string; title: string; description?: string; children: ReactNode; gameId?: string;
}) {
  const hasTutorial = !!gameId && !!TUTORIALS[gameId];
  const { open, setOpen } = useTutorial(hasTutorial ? gameId : undefined);
  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <Link
        to="/games"
        className="inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-widest text-muted-foreground transition-colors hover:text-mint"
      >
        <ArrowLeft className="h-3 w-3" /> Все игры
      </Link>
      <div className="mt-5 flex items-center gap-3">
        <span className="label-mono text-mint">{tag}</span>
        {hasTutorial && (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-background/60 px-2 py-0.5 font-mono text-[10px] uppercase tracking-widest text-muted-foreground transition-colors hover:border-mint/40 hover:text-mint"
            aria-label="Как играть"
          >
            <HelpCircle className="h-3 w-3" /> Как играть
          </button>
        )}
      </div>
      <h1 className="mt-2 text-3xl font-bold tracking-tight">{title}</h1>
      {description && <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{description}</p>}
      <div className="mt-8">{children}</div>
      {hasTutorial && <HowToPlay gameId={gameId!} open={open} onClose={() => setOpen(false)} />}
    </div>
  );
}

/** Score / round pills strip. */
export function ScorePills({
  round, rounds, streak, score,
}: { round: number; rounds: number; streak: number; score: number }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Pill icon={<Target className="h-3.5 w-3.5" />} label="Раунд" value={`${round}/${rounds}`} />
      <Pill icon={<Flame className="h-3.5 w-3.5" />} label="Серия" value={String(streak)} />
      <Pill icon={<Star className="h-3.5 w-3.5" />} label="Очки" value={String(score)} accent />
    </div>
  );
}

function Pill({ icon, label, value, accent }: { icon: ReactNode; label: string; value: string; accent?: boolean }) {
  return (
    <div className={`panel flex items-center gap-2 rounded-full border px-3 py-1.5 ${accent ? "border-mint/40 bg-mint/10" : ""}`}>
      <span className={accent ? "text-mint" : "text-muted-foreground"}>{icon}</span>
      <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">{label}</span>
      <span className={`text-sm font-bold ${accent ? "text-mint" : ""}`}>{value}</span>
    </div>
  );
}

/** Practice / Ranked mode picker. */
export function ModePicker({ onPick }: { onPick: (m: "practice" | "ranked") => void }) {
  return (
    <div className="panel rounded-2xl p-8 text-center">
      <p className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">Выбери режим</p>
      <h2 className="mt-2 text-xl font-bold">Готов тренировать слух?</h2>
      <div className="mx-auto mt-6 grid max-w-md grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => onPick("practice")}
          className="rounded-xl border border-border bg-background/60 p-4 text-left transition-all hover:border-mint/40"
        >
          <div className="flex items-center gap-2 text-mint">
            <Zap className="h-4 w-4" />
            <span className="font-mono text-[10px] uppercase tracking-widest">Practice</span>
          </div>
          <p className="mt-2 text-sm font-bold">Тренировка</p>
          <p className="mt-1 text-xs text-muted-foreground">Без записи — просто оттачивай слух.</p>
        </button>
        <button
          type="button"
          onClick={() => onPick("ranked")}
          className="rounded-xl border border-mint/40 bg-mint/10 p-4 text-left transition-all hover:bg-mint/15"
        >
          <div className="flex items-center gap-2 text-mint">
            <Trophy className="h-4 w-4" />
            <span className="font-mono text-[10px] uppercase tracking-widest">Ranked</span>
          </div>
          <p className="mt-2 text-sm font-bold">Рейтинг</p>
          <p className="mt-1 text-xs text-mint/80">Очки идут в общий рейтинг + XP.</p>
        </button>
      </div>
    </div>
  );
}

/** End-of-session screen. */
export function EndScreen({
  score, accuracy, rounds, correct, savedTo, onRestart,
}: {
  score: number;
  accuracy: number;
  rounds: number;
  correct: number;
  savedTo?: "ranked" | null;
  onRestart: () => void;
}) {
  return (
    <div className="panel rounded-2xl p-8 text-center">
      <span className="label-mono text-mint">Session complete</span>
      <h2 className="mt-3 text-3xl font-bold">{score} очков</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        {correct} из {rounds} · точность {accuracy.toFixed(1)}%
      </p>
      {savedTo === "ranked" && (
        <div className="mx-auto mt-4 inline-flex items-center gap-2 rounded-full border border-mint/40 bg-mint/10 px-3 py-1 text-xs font-bold text-mint">
          <Trophy className="h-3.5 w-3.5" /> Записано в рейтинг
        </div>
      )}
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        <button
          type="button"
          onClick={onRestart}
          className="rounded-full bg-mint px-6 py-2 text-sm font-bold text-mint-foreground hover:bg-mint/90"
        >
          Ещё раунд
        </button>
        <Link
          to="/games"
          className="rounded-full border border-border px-6 py-2 text-sm font-bold hover:border-mint/40"
        >
          К играм
        </Link>
      </div>
    </div>
  );
}

/** Feedback strip after a submit. */
export function FeedbackStrip({
  correct, message,
}: { correct: boolean | null; message?: string }) {
  if (correct === null) return null;
  return (
    <div
      className={`mt-4 rounded-xl border px-4 py-3 text-sm ${
        correct
          ? "border-mint/40 bg-mint/10 text-mint"
          : "border-red-500/40 bg-red-500/10 text-red-400"
      }`}
    >
      <span className="font-mono text-[10px] uppercase tracking-widest">
        {correct ? "Точно" : "Мимо"}
      </span>
      {message && <span className="ml-2">{message}</span>}
    </div>
  );
}
