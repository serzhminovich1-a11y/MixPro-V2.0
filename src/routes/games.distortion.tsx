import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Play, Square } from "lucide-react";
import { EndScreen, FeedbackStrip, GameFrame, ModePicker, ScorePills } from "@/components/games/game-frame";
import { getAnalyser, getAudioContext, makeDistortionCurve, randRange, startSource } from "@/lib/games/engine";
import { saveGameScore } from "@/lib/games/score";
import { playFailCue, playSuccessChime } from "@/lib/audio";

export const Route = createFileRoute("/games/distortion")({
  head: () => ({
    meta: [
      { title: "Distortion — Тренажёр слуха | MixPro" },
      { name: "description", content: "Оцени количество дисторшна в процентах." },
      { property: "og:title", content: "Distortion — Тренажёр слуха | MixPro" },
      { property: "og:description", content: "Оцени количество дисторшна в процентах." },
    ],
  }),
  component: Distortion,
});

const ROUNDS = 8;

function Distortion() {
  const [mode, setMode] = useState<"practice" | "ranked" | null>(null);
  const [round, setRound] = useState(1);
  const [correct, setCorrect] = useState(0);
  const [streak, setStreak] = useState(0);
  const [accSum, setAccSum] = useState(0);
  const [target, setTarget] = useState(50);
  const [guess, setGuess] = useState(50);
  const [feedback, setFeedback] = useState<boolean | null>(null);
  const [finished, setFinished] = useState(false);
  const [saved, setSaved] = useState(false);
  const [playing, setPlaying] = useState(false);
  const chain = useRef<{ stop: () => void } | null>(null);

  function newRound() {
    setTarget(Math.round(randRange(15, 90) / 5) * 5);
    setGuess(50); setFeedback(null); setPlaying(false);
    chain.current?.stop(); chain.current = null;
  }

  function play() {
    if (playing) { chain.current?.stop(); chain.current = null; setPlaying(false); return; }
    const ac = getAudioContext();
    const src = startSource("pad");
    const ws = ac.createWaveShaper();
    ws.curve = makeDistortionCurve(target);
    ws.oversample = "4x";
    const pre = ac.createGain(); pre.gain.value = 1 + target / 100;
    const post = ac.createGain(); post.gain.value = 0.4 / (1 + target / 80);
    const out = ac.createGain(); out.gain.value = 0;
    src.node.connect(pre); pre.connect(ws); ws.connect(post); post.connect(out); out.connect(getAnalyser());
    out.gain.linearRampToValueAtTime(0.4, ac.currentTime + 0.05);
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
          const res = await saveGameScore("distortion", finalScore, finalScore / ROUNDS);
          if (res.saved) setSaved(true);
        }
      } else { setRound(r => r + 1); newRound(); }
    }, 1600);
  }

  useEffect(() => () => { chain.current?.stop(); }, []);

  if (!mode) return (
    <GameFrame gameId="distortion" tag="Distortion" title="Сколько процентов дисторшна?" description="Слушай обработанный пад. Твоя цель — попасть в амаунт от 0 до 100.">
      <ModePicker onPick={m => { setMode(m); newRound(); }} />
    </GameFrame>
  );
  if (finished) return (
    <GameFrame gameId="distortion" tag="Distortion" title="Итог сессии">
      <EndScreen
        score={Math.round(accSum)} accuracy={accSum / ROUNDS} rounds={ROUNDS} correct={correct}
        savedTo={saved ? "ranked" : null}
        onRestart={() => { setMode(null); setRound(1); setCorrect(0); setStreak(0); setAccSum(0); setFinished(false); setSaved(false); }}
      />
    </GameFrame>
  );

  return (
    <GameFrame gameId="distortion" tag="Distortion" title="Оцени амаунт дисторшна">
      <ScorePills round={round} rounds={ROUNDS} streak={streak} score={Math.round(accSum)} />
      <div className="panel mt-6 rounded-2xl p-6">
        <div className="flex items-center justify-between gap-4">
          <div className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">Обработанный пад</div>
          <button type="button" onClick={play}
            className="inline-flex items-center gap-2 rounded-full bg-mint px-5 py-2 text-sm font-bold text-mint-foreground hover:bg-mint/90">
            {playing ? <><Square className="h-4 w-4" /> Стоп</> : <><Play className="h-4 w-4" /> Играть</>}
          </button>
        </div>
        <div className="mt-8">
          <div className="flex items-baseline justify-between">
            <span className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">Твой ответ</span>
            <span className="font-mono text-3xl font-black text-mint">{guess}%</span>
          </div>
          <input type="range" min={0} max={100} step={1} value={guess} disabled={feedback !== null}
            onChange={(e) => setGuess(Number(e.target.value))} className="mt-3 w-full accent-mint" />
          <div className="mt-1 flex justify-between font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            <span>0%</span><span>50%</span><span>100%</span>
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
          message={feedback !== null ? `Правильно: ${target}% (разница ${Math.abs(target - guess)})` : undefined}
        />
      </div>
    </GameFrame>
  );
}
