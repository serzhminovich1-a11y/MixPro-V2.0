import { useEffect, useState } from "react";
import { Ear, Lightbulb, Play, Target, X } from "lucide-react";
import { TUTORIALS, type Tutorial } from "@/lib/games/tutorials";

const STORAGE_PREFIX = "mixpro.tut.";

function readSeen(gameId: string) {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(STORAGE_PREFIX + gameId) === "1";
  } catch {
    return false;
  }
}

function writeSeen(gameId: string, value: boolean) {
  if (typeof window === "undefined") return;
  try {
    if (value) window.localStorage.setItem(STORAGE_PREFIX + gameId, "1");
    else window.localStorage.removeItem(STORAGE_PREFIX + gameId);
  } catch {
    /* ignore */
  }
}

const sessionSeen = new Set<string>();

/** Auto-shows on first visit (per gameId), otherwise controlled via `?` button in the frame header. */
export function useTutorial(gameId: string | undefined) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!gameId) return;
    if (sessionSeen.has(gameId)) return;
    if (!readSeen(gameId)) setOpen(true);
    sessionSeen.add(gameId);
  }, [gameId]);
  return { open, setOpen };
}

export function HowToPlay({
  gameId,
  open,
  onClose,
}: {
  gameId: string;
  open: boolean;
  onClose: () => void;
}) {
  const tut: Tutorial | undefined = TUTORIALS[gameId];
  const [dontShow, setDontShow] = useState(false);

  useEffect(() => {
    if (!open) return;
    setDontShow(readSeen(gameId));
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, gameId]);

  if (!open || !tut) return null;

  function close() {
    writeSeen(gameId, dontShow);
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 px-4 py-8 backdrop-blur-sm animate-fade-in"
      onClick={close}
    >
      <div
        className="panel relative w-full max-w-lg rounded-2xl border border-mint/20 p-6 shadow-2xl animate-scale-in"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="how-to-play-title"
      >
        <button
          type="button"
          onClick={close}
          className="absolute right-3 top-3 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground"
          aria-label="Закрыть"
        >
          <X className="h-4 w-4" />
        </button>

        <span className="label-mono text-mint">Tutorial</span>
        <h2 id="how-to-play-title" className="mt-1 text-xl font-bold tracking-tight">
          {tut.title}
        </h2>

        <div className="mt-4 flex items-start gap-3 rounded-xl border border-mint/25 bg-mint/5 p-3">
          <Target className="mt-0.5 h-4 w-4 shrink-0 text-mint" />
          <div>
            <p className="font-mono text-[10px] uppercase tracking-widest text-mint/80">Цель</p>
            <p className="mt-0.5 text-sm text-foreground">{tut.goal}</p>
          </div>
        </div>

        <ol className="mt-4 space-y-2">
          {tut.steps.map((step, i) => (
            <li key={i} className="flex items-start gap-3 rounded-lg border border-border/50 bg-background/40 p-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-mint/30 bg-mint/10 font-mono text-[11px] font-bold text-mint">
                {i + 1}
              </span>
              <span className="text-sm text-foreground/90">{step}</span>
            </li>
          ))}
        </ol>

        <div className="mt-4 flex items-start gap-3 rounded-xl border border-border/60 bg-background/50 p-3">
          <Ear className="mt-0.5 h-4 w-4 shrink-0 text-mint" />
          <div>
            <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Слушай</p>
            <p className="mt-0.5 text-sm text-foreground/90">{tut.listenFor}</p>
          </div>
        </div>

        {tut.tip && (
          <div className="mt-3 flex items-start gap-3 rounded-xl border border-amber-400/20 bg-amber-400/5 p-3">
            <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
            <div>
              <p className="font-mono text-[10px] uppercase tracking-widest text-amber-300/80">Совет</p>
              <p className="mt-0.5 text-sm text-foreground/90">{tut.tip}</p>
            </div>
          </div>
        )}

        <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
          <label className="flex cursor-pointer select-none items-center gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              className="h-3.5 w-3.5 accent-mint"
              checked={dontShow}
              onChange={(e) => setDontShow(e.target.checked)}
            />
            Больше не показывать
          </label>
          <button
            type="button"
            onClick={close}
            className="inline-flex items-center gap-2 rounded-full bg-mint px-5 py-2 text-sm font-bold text-mint-foreground transition-colors hover:bg-mint/90"
          >
            <Play className="h-4 w-4" />
            Начать тренировку
          </button>
        </div>
      </div>
    </div>
  );
}
