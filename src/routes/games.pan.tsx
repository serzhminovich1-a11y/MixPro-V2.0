import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Play, Square } from "lucide-react";
import { EndScreen, FeedbackStrip, GameFrame, ModePicker, ScorePills } from "@/components/games/game-frame";
import { getAudioContext, getAnalyser, preloadSources, randRange, startSource } from "@/lib/games/engine";
import { saveGameScore } from "@/lib/games/score";
import { playFailCue, playSuccessChime } from "@/lib/audio";

export const Route = createFileRoute("/games/pan")({
  head: () => ({
    meta: [
      { title: "Pan — Тренажёр слуха | MixPro" },
      { name: "description", content: "Определи точное положение сигнала в стерео." },
      { property: "og:title", content: "Pan — Тренажёр слуха | MixPro" },
      { property: "og:description", content: "Определи точное положение сигнала в стерео." },
    ],
  }),
  component: Pan,
});

const ROUNDS = 8;

function Pan() {
  const [mode, setMode] = useState<"practice" | "ranked" | null>(null);
  const [round, setRound] = useState(1);
  const [correct, setCorrect] = useState(0);
  const [streak, setStreak] = useState(0);
  const [accSum, setAccSum] = useState(0);
  const [target, setTarget] = useState(0);
  const [guess, setGuess] = useState(0);
  const [feedback, setFeedback] = useState<boolean | null>(null);
  const [finished, setFinished] = useState(false);
  const [saved, setSaved] = useState(false);
  const [playing, setPlaying] = useState(false);
  const chain = useRef<{ stop: () => void } | null>(null);

  useEffect(() => { preloadSources(); }, []);

  function newRound() {
    setTarget(Math.round(randRange(-100, 100) / 5) * 5);
    setGuess(0); setFeedback(null); setPlaying(false);
    chain.current?.stop(); chain.current = null;
  }

  function play() {
    if (playing) { chain.current?.stop(); chain.current = null; setPlaying(false); return; }
    const ac = getAudioContext();
    const src = startSource("drums");
    const pan = ac.createStereoPanner();
    pan.pan.value = target / 100;
    const out = ac.createGain(); out.gain.value = 0;
    src.node.connect(pan); pan.connect(out); out.connect(getAnalyser());
    out.gain.linearRampToValueAtTime(0.45, ac.currentTime + 0.05);
    chain.current = { stop() {
      const t = ac.currentTime; out.gain.cancelScheduledValues(t);
      out.gain.linearRampToValueAtTime(0, t + 0.08);
      window.setTimeout(() => src.stop(), 120);
    }};
    setPlaying(true);
  }

  function submit() {
    if (feedback !== null) return;
    const diff = Math.abs(target - guess);
    const acc = Math.max(0, 100 - diff);
    const isCorrect = diff <= 10;
    setFeedback(isCorrect);
    if (isCorrect) { setCorrect(c => c + 1); setStreak(s => s + 1); playSuccessChime(); }
    else { setStreak(0); playFailCue(); }
    setAccSum(a => a + acc);
    chain.current?.stop(); chain.current = null; setPlaying(false);

    window.setTimeout(async () => {
      if (round >= ROUNDS) {
        setFinished(true);
        if (mode === "ranked") {
          const finalScore = accSum + acc;
          const res = await saveGameScore("pan", finalScore, finalScore / ROUNDS);
          if (res.saved) setSaved(true);
        }
      } else { setRound(r => r + 1); newRound(); }
    }, 1600);
  }

  useEffect(() => () => { chain.current?.stop(); }, []);

  if (!mode) return (
    <GameFrame gameId="pan" tag="Pan" title="Угадай позицию в стерео" description="Определи, насколько сигнал сдвинут влево (−100) или вправо (+100).">
      <ModePicker onPick={m => { setMode(m); newRound(); }} />
    </GameFrame>
  );

  if (finished) return (
    <GameFrame gameId="pan" tag="Pan" title="Итог сессии">
      <EndScreen
        score={Math.round(accSum)} accuracy={accSum / ROUNDS} rounds={ROUNDS} correct={correct}
        savedTo={saved ? "ranked" : null}
        onRestart={() => { setMode(null); setRound(1); setCorrect(0); setStreak(0); setAccSum(0); setFinished(false); setSaved(false); }}
      />
    </GameFrame>
  );

  const guessPct = (guess + 100) / 2;
  const targetPct = (target + 100) / 2;

  return (
    <GameFrame gameId="pan" tag="Pan" title="Куда ушёл сигнал?">
      <ScorePills round={round} rounds={ROUNDS} streak={streak} score={Math.round(accSum)} />

      <div className="panel mt-6 rounded-2xl p-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">Стерео</div>
            <p className="mt-1 text-sm text-muted-foreground">−100 = левый край, 0 = центр, +100 = правый край.</p>
          </div>
          <button
            type="button" onClick={play}
            className="inline-flex items-center gap-2 rounded-full bg-mint px-5 py-2 text-sm font-bold text-mint-foreground hover:bg-mint/90"
          >
            {playing ? <><Square className="h-4 w-4" /> Стоп</> : <><Play className="h-4 w-4" /> Играть</>}
          </button>
        </div>

        <div className="relative mt-8 h-2 rounded-full bg-border">
          <div className="absolute left-1/2 top-1/2 h-4 w-px -translate-x-1/2 -translate-y-1/2 bg-border" />
          {feedback !== null && (
            <div
              className="absolute top-1/2 h-6 w-6 -translate-x-1/2 -translate-y-1/2 rounded-full bg-mint/30 ring-2 ring-mint"
              style={{ left: `${targetPct}%` }}
            />
          )}
          <div
            className="absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full bg-mint shadow-lg"
            style={{ left: `${guessPct}%` }}
          />
        </div>
        <input
          type="range" min={-100} max={100} step={1}
          value={guess} disabled={feedback !== null}
          onChange={(e) => setGuess(Number(e.target.value))}
          className="mt-4 w-full accent-mint"
        />
        <div className="mt-2 flex items-center justify-between font-mono text-xs text-muted-foreground">
          <span>L 100</span>
          <span className="text-mint">{guess > 0 ? `R ${guess}` : guess < 0 ? `L ${-guess}` : "C"}</span>
          <span>R 100</span>
        </div>

        {feedback === null && (
          <button
            type="button" onClick={submit}
            className="mt-6 w-full rounded-xl border border-mint/40 bg-mint/10 py-3 text-sm font-bold text-mint hover:bg-mint/15"
          >
            Ответить
          </button>
        )}

        <FeedbackStrip
          correct={feedback}
          message={feedback !== null ? `Правильно: ${target > 0 ? "R" : target < 0 ? "L" : "C"} ${Math.abs(target)}` : undefined}
        />
      </div>
    </GameFrame>
  );
}
