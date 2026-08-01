import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Play, Square } from "lucide-react";
import { EndScreen, FeedbackStrip, GameFrame, ModePicker, ScorePills } from "@/components/games/game-frame";
import { getAnalyser, getAudioContext, startSource } from "@/lib/games/engine";
import { saveGameScore } from "@/lib/games/score";
import { playFailCue, playSuccessChime } from "@/lib/audio";

export const Route = createFileRoute("/games/delay-time")({
  head: () => ({
    meta: [
      { title: "Delay Time — Тренажёр слуха | MixPro" },
      { name: "description", content: "Угадай точное время задержки в миллисекундах." },
      { property: "og:title", content: "Delay Time — Тренажёр слуха | MixPro" },
      { property: "og:description", content: "Угадай точное время задержки в миллисекундах." },
    ],
  }),
  component: DelayTime,
});

const TARGETS_MS = [80, 100, 125, 150, 200, 250, 300, 375, 400, 500, 600, 700, 800];
const ROUNDS = 8;

function DelayTime() {
  const [mode, setMode] = useState<"practice" | "ranked" | null>(null);
  const [round, setRound] = useState(1);
  const [correct, setCorrect] = useState(0);
  const [streak, setStreak] = useState(0);
  const [accSum, setAccSum] = useState(0);
  const [target, setTarget] = useState(200);
  const [guess, setGuess] = useState(300);
  const [feedback, setFeedback] = useState<boolean | null>(null);
  const [finished, setFinished] = useState(false);
  const [saved, setSaved] = useState(false);
  const [playing, setPlaying] = useState(false);
  const chain = useRef<{ stop: () => void } | null>(null);

  function newRound() {
    setTarget(TARGETS_MS[Math.floor(Math.random() * TARGETS_MS.length)]);
    setGuess(300); setFeedback(null); setPlaying(false);
    chain.current?.stop(); chain.current = null;
  }

  function play() {
    if (playing) { chain.current?.stop(); chain.current = null; setPlaying(false); return; }
    const ac = getAudioContext();
    const src = startSource("pad");
    const wet = ac.createGain(); wet.gain.value = 0.55;
    const dry = ac.createGain(); dry.gain.value = 0.8;
    const delay = ac.createDelay(2.0);
    delay.delayTime.value = target / 1000;
    const fb = ac.createGain(); fb.gain.value = 0.35;
    delay.connect(fb); fb.connect(delay);
    src.node.connect(dry); src.node.connect(delay); delay.connect(wet);
    const out = ac.createGain(); out.gain.value = 0;
    dry.connect(out); wet.connect(out); out.connect(getAnalyser());
    out.gain.linearRampToValueAtTime(0.4, ac.currentTime + 0.05);
    chain.current = { stop() {
      const t = ac.currentTime; out.gain.cancelScheduledValues(t);
      out.gain.linearRampToValueAtTime(0, t + 0.15);
      window.setTimeout(() => src.stop(), 200);
    }};
    setPlaying(true);
  }

  function submit() {
    if (feedback !== null) return;
    const diff = Math.abs(target - guess);
    const acc = Math.max(0, 100 - diff / 6);
    const isCorrect = diff <= 40;
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
          const res = await saveGameScore("delay-time", finalScore, finalScore / ROUNDS);
          if (res.saved) setSaved(true);
        }
      } else { setRound(r => r + 1); newRound(); }
    }, 1600);
  }

  useEffect(() => () => { chain.current?.stop(); }, []);

  if (!mode) return (
    <GameFrame gameId="delay-time" tag="Delay Time" title="Точное время задержки" description="Пад с delay-эффектом. Определи время между повторениями в миллисекундах.">
      <ModePicker onPick={m => { setMode(m); newRound(); }} />
    </GameFrame>
  );
  if (finished) return (
    <GameFrame gameId="delay-time" tag="Delay Time" title="Итог сессии">
      <EndScreen
        score={Math.round(accSum)} accuracy={accSum / ROUNDS} rounds={ROUNDS} correct={correct}
        savedTo={saved ? "ranked" : null}
        onRestart={() => { setMode(null); setRound(1); setCorrect(0); setStreak(0); setAccSum(0); setFinished(false); setSaved(false); }}
      />
    </GameFrame>
  );

  return (
    <GameFrame gameId="delay-time" tag="Delay Time" title="Сколько миллисекунд?">
      <ScorePills round={round} rounds={ROUNDS} streak={streak} score={Math.round(accSum)} />
      <div className="panel mt-6 rounded-2xl p-6">
        <div className="flex items-center justify-between gap-4">
          <div className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">Delay · feedback 35%</div>
          <button type="button" onClick={play}
            className="inline-flex items-center gap-2 rounded-full bg-mint px-5 py-2 text-sm font-bold text-mint-foreground hover:bg-mint/90">
            {playing ? <><Square className="h-4 w-4" /> Стоп</> : <><Play className="h-4 w-4" /> Играть</>}
          </button>
        </div>
        <div className="mt-8">
          <div className="flex items-baseline justify-between">
            <span className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">Твой ответ</span>
            <span className="font-mono text-3xl font-black text-mint">{guess} мс</span>
          </div>
          <input type="range" min={50} max={900} step={5} value={guess} disabled={feedback !== null}
            onChange={(e) => setGuess(Number(e.target.value))} className="mt-3 w-full accent-mint" />
          <div className="mt-1 flex justify-between font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            <span>50</span><span>500</span><span>900 мс</span>
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
          message={feedback !== null ? `Правильно: ${target} мс (разница ${Math.abs(target - guess)})` : undefined}
        />
      </div>
    </GameFrame>
  );
}
