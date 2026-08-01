import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Play, Square } from "lucide-react";
import { EndScreen, FeedbackStrip, GameFrame, ModePicker, ScorePills } from "@/components/games/game-frame";
import { dbToGain, getAnalyser, getAudioContext, randRange, startSource } from "@/lib/games/engine";
import { saveGameScore } from "@/lib/games/score";
import { playFailCue, playSuccessChime } from "@/lib/audio";

export const Route = createFileRoute("/games/db-pro")({
  head: () => ({
    meta: [
      { title: "dB Pro — Тренажёр слуха | MixPro" },
      { name: "description", content: "Точно определи разницу громкости в дБ." },
      { property: "og:title", content: "dB Pro — Тренажёр слуха | MixPro" },
      { property: "og:description", content: "Точно определи разницу громкости в дБ." },
    ],
  }),
  component: DbPro,
});

const ROUNDS = 8;

function DbPro() {
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
  const [playing, setPlaying] = useState<"A" | "B" | null>(null);
  const chain = useRef<{ stop: () => void } | null>(null);

  function newRound() {
    setTarget(Math.round(randRange(-12, 12) * 2) / 2);
    setGuess(0); setFeedback(null); setPlaying(null);
    chain.current?.stop(); chain.current = null;
  }

  function play(which: "A" | "B") {
    if (playing) { chain.current?.stop(); chain.current = null; setPlaying(null); return; }
    const ac = getAudioContext();
    const src = startSource("drums");
    const g = ac.createGain(); g.gain.value = which === "A" ? 1 : dbToGain(target);
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

  function submit() {
    if (feedback !== null) return;
    const diff = Math.abs(target - guess);
    const acc = Math.max(0, 100 - diff * 8);
    const isCorrect = diff <= 1;
    setFeedback(isCorrect);
    if (isCorrect) { setCorrect(c => c + 1); setStreak(s => s + 1); playSuccessChime(); }
    else { setStreak(0); playFailCue(); }
    setAccSum(a => a + acc);
    chain.current?.stop(); chain.current = null; setPlaying(null);
    window.setTimeout(async () => {
      if (round >= ROUNDS) {
        setFinished(true);
        if (mode === "ranked") {
          const finalScore = accSum + acc;
          const res = await saveGameScore("db-pro", finalScore, finalScore / ROUNDS);
          if (res.saved) setSaved(true);
        }
      } else { setRound(r => r + 1); newRound(); }
    }, 1600);
  }

  useEffect(() => () => { chain.current?.stop(); }, []);

  if (!mode) return (
    <GameFrame gameId="db-pro" tag="dB Pro" title="Точное определение уровня" description="Введи точное значение изменения громкости в дБ (шаг 0.5).">
      <ModePicker onPick={m => { setMode(m); newRound(); }} />
    </GameFrame>
  );
  if (finished) return (
    <GameFrame gameId="db-pro" tag="dB Pro" title="Итог сессии">
      <EndScreen
        score={Math.round(accSum)} accuracy={accSum / ROUNDS} rounds={ROUNDS} correct={correct}
        savedTo={saved ? "ranked" : null}
        onRestart={() => { setMode(null); setRound(1); setCorrect(0); setStreak(0); setAccSum(0); setFinished(false); setSaved(false); }}
      />
    </GameFrame>
  );

  return (
    <GameFrame gameId="db-pro" tag="dB Pro" title="Сколько именно дБ?">
      <ScorePills round={round} rounds={ROUNDS} streak={streak} score={Math.round(accSum)} />
      <div className="panel mt-6 rounded-2xl p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">A/B compare</div>
          <div className="flex gap-2">
            {(["A", "B"] as const).map((w) => (
              <button key={w} type="button" onClick={() => play(w)}
                className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-bold
                  ${playing === w ? "bg-red-500/20 text-red-400" : "bg-mint text-mint-foreground hover:bg-mint/90"}`}>
                {playing === w ? <Square className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                {w === "A" ? "A · Оригинал" : "B · Обработка"}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-8">
          <div className="flex items-baseline justify-between">
            <span className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">Твой ответ</span>
            <span className="font-mono text-3xl font-black text-mint">
              {guess > 0 ? `+${guess.toFixed(1)}` : guess.toFixed(1)} дБ
            </span>
          </div>
          <input
            type="range" min={-12} max={12} step={0.5}
            value={guess} disabled={feedback !== null}
            onChange={(e) => setGuess(Number(e.target.value))}
            className="mt-3 w-full accent-mint"
          />
          <div className="mt-1 flex justify-between font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            <span>−12 дБ</span><span>0</span><span>+12 дБ</span>
          </div>
        </div>

        {feedback === null && (
          <button type="button" onClick={submit}
            className="mt-6 w-full rounded-xl border border-mint/40 bg-mint/10 py-3 text-sm font-bold text-mint hover:bg-mint/15">
            Ответить
          </button>
        )}
        <FeedbackStrip
          correct={feedback}
          message={feedback !== null ? `Правильно: ${target > 0 ? "+" : ""}${target.toFixed(1)} дБ (разница ${Math.abs(target - guess).toFixed(1)})` : undefined}
        />
      </div>
    </GameFrame>
  );
}
