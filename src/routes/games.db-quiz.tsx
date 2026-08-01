import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Play, Square } from "lucide-react";
import { EndScreen, FeedbackStrip, GameFrame, ModePicker, ScorePills } from "@/components/games/game-frame";
import { dbToGain, getAnalyser, getAudioContext, startSource } from "@/lib/games/engine";
import { saveGameScore } from "@/lib/games/score";
import { playFailCue, playSuccessChime } from "@/lib/audio";

export const Route = createFileRoute("/games/db-quiz")({
  head: () => ({
    meta: [
      { title: "dB Quiz — Тренажёр слуха | MixPro" },
      { name: "description", content: "Выбери из 4 вариантов, на сколько дБ поднят или опущен уровень." },
      { property: "og:title", content: "dB Quiz — Тренажёр слуха | MixPro" },
      { property: "og:description", content: "Выбери из 4 вариантов, на сколько дБ поднят или опущен уровень." },
    ],
  }),
  component: DbQuiz,
});

const OPTIONS = [-9, -6, -3, -1, 1, 3, 6, 9];
const ROUNDS = 8;

function DbQuiz() {
  const [mode, setMode] = useState<"practice" | "ranked" | null>(null);
  const [round, setRound] = useState(1);
  const [correct, setCorrect] = useState(0);
  const [streak, setStreak] = useState(0);
  const [accSum, setAccSum] = useState(0);
  const [target, setTarget] = useState(0);
  const [choices, setChoices] = useState<number[]>([]);
  const [guess, setGuess] = useState<number | null>(null);
  const [feedback, setFeedback] = useState<boolean | null>(null);
  const [finished, setFinished] = useState(false);
  const [saved, setSaved] = useState(false);
  const [playing, setPlaying] = useState<"A" | "B" | null>(null);
  const chain = useRef<{ stop: () => void } | null>(null);

  function newRound() {
    const t = OPTIONS[Math.floor(Math.random() * OPTIONS.length)];
    const pool = [...OPTIONS].sort(() => Math.random() - 0.5);
    const opts = new Set([t]);
    for (const v of pool) { if (opts.size >= 4) break; opts.add(v); }
    setTarget(t);
    setChoices([...opts].sort((a, b) => a - b));
    setGuess(null); setFeedback(null); setPlaying(null);
    chain.current?.stop(); chain.current = null;
  }

  function play(which: "A" | "B") {
    if (playing) { chain.current?.stop(); chain.current = null; setPlaying(null); return; }
    const ac = getAudioContext();
    const src = startSource("drums");
    const g = ac.createGain();
    g.gain.value = which === "A" ? 1 : dbToGain(target);
    const out = ac.createGain(); out.gain.value = 0;
    src.node.connect(g); g.connect(out); out.connect(getAnalyser());
    out.gain.linearRampToValueAtTime(0.4, ac.currentTime + 0.05);
    chain.current = { stop() {
      const t = ac.currentTime; out.gain.cancelScheduledValues(t);
      out.gain.linearRampToValueAtTime(0, t + 0.08);
      window.setTimeout(() => src.stop(), 120);
    }};
    setPlaying(which);
  }

  function submit(v: number) {
    if (feedback !== null) return;
    setGuess(v);
    const isCorrect = v === target;
    setFeedback(isCorrect);
    if (isCorrect) { setCorrect(c => c + 1); setStreak(s => s + 1); playSuccessChime(); }
    else { setStreak(0); playFailCue(); }
    const acc = isCorrect ? 100 : Math.max(0, 100 - Math.abs(v - target) * 15);
    setAccSum(a => a + acc);
    chain.current?.stop(); chain.current = null; setPlaying(null);
    window.setTimeout(async () => {
      if (round >= ROUNDS) {
        setFinished(true);
        if (mode === "ranked") {
          const finalScore = accSum + acc;
          const res = await saveGameScore("db-quiz", finalScore, finalScore / ROUNDS);
          if (res.saved) setSaved(true);
        }
      } else { setRound(r => r + 1); newRound(); }
    }, 1600);
  }

  useEffect(() => () => { chain.current?.stop(); }, []);

  if (!mode) return (
    <GameFrame gameId="db-quiz" tag="dB Quiz" title="На сколько дБ изменилась громкость?" description="Слушай A (оригинал) и B (обработку). Выбери разницу в дБ.">
      <ModePicker onPick={m => { setMode(m); newRound(); }} />
    </GameFrame>
  );
  if (finished) return (
    <GameFrame gameId="db-quiz" tag="dB Quiz" title="Итог сессии">
      <EndScreen
        score={Math.round(accSum)} accuracy={accSum / ROUNDS} rounds={ROUNDS} correct={correct}
        savedTo={saved ? "ranked" : null}
        onRestart={() => { setMode(null); setRound(1); setCorrect(0); setStreak(0); setAccSum(0); setFinished(false); setSaved(false); }}
      />
    </GameFrame>
  );

  return (
    <GameFrame gameId="db-quiz" tag="dB Quiz" title="A ↔ B: сколько дБ разницы?">
      <ScorePills round={round} rounds={ROUNDS} streak={streak} score={Math.round(accSum)} />

      <div className="panel mt-6 rounded-2xl p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">A/B compare · drums loop</div>
          <div className="flex gap-2">
            {(["A", "B"] as const).map((w) => (
              <button key={w} type="button" onClick={() => play(w)}
                className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-bold transition-colors
                  ${playing === w ? "bg-red-500/20 text-red-400" : "bg-mint text-mint-foreground hover:bg-mint/90"}`}>
                {playing === w ? <Square className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                {w === "A" ? "A · Оригинал" : "B · Обработка"}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {choices.map((v) => {
            const isTarget = feedback !== null && v === target;
            const isGuess = guess === v;
            return (
              <button
                key={v} type="button" onClick={() => submit(v)} disabled={feedback !== null}
                className={`rounded-xl border p-4 font-mono text-lg font-bold transition-all
                  ${feedback === true && isGuess ? "border-mint bg-mint/20 text-mint" : ""}
                  ${feedback === false && isGuess ? "border-red-500 bg-red-500/15 text-red-400" : ""}
                  ${!isGuess && isTarget ? "border-mint/60 bg-mint/10 text-mint" : ""}
                  ${feedback === null ? "border-border bg-background/60 hover:border-mint/40" : ""}
                `}
              >
                {v > 0 ? `+${v}` : v} дБ
              </button>
            );
          })}
        </div>

        <FeedbackStrip
          correct={feedback}
          message={feedback === false ? `Правильно: ${target > 0 ? "+" : ""}${target} дБ` : feedback === true ? "Точно." : undefined}
        />
      </div>
    </GameFrame>
  );
}
