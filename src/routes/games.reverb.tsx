import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Play, Square } from "lucide-react";
import { EndScreen, FeedbackStrip, GameFrame, ModePicker, ScorePills } from "@/components/games/game-frame";
import { getAnalyser, getAudioContext, makeReverbIR, REVERB_PRESETS, type ReverbPreset, startSource } from "@/lib/games/engine";
import { saveGameScore } from "@/lib/games/score";
import { playFailCue, playSuccessChime } from "@/lib/audio";

export const Route = createFileRoute("/games/reverb")({
  head: () => ({
    meta: [
      { title: "Reverb — Тренажёр слуха | MixPro" },
      { name: "description", content: "Определи тип реверберации: Room, Chamber, Hall, Plate." },
      { property: "og:title", content: "Reverb — Тренажёр слуха | MixPro" },
      { property: "og:description", content: "Определи тип реверберации: Room, Chamber, Hall, Plate." },
    ],
  }),
  component: Reverb,
});

const PRESETS: ReverbPreset[] = ["room", "chamber", "hall", "plate"];
const ROUNDS = 8;

function Reverb() {
  const [mode, setMode] = useState<"practice" | "ranked" | null>(null);
  const [round, setRound] = useState(1);
  const [correct, setCorrect] = useState(0);
  const [streak, setStreak] = useState(0);
  const [accSum, setAccSum] = useState(0);
  const [target, setTarget] = useState<ReverbPreset>("room");
  const [guess, setGuess] = useState<ReverbPreset | null>(null);
  const [feedback, setFeedback] = useState<boolean | null>(null);
  const [finished, setFinished] = useState(false);
  const [saved, setSaved] = useState(false);
  const [playing, setPlaying] = useState(false);
  const chain = useRef<{ stop: () => void } | null>(null);

  const irs = useMemo(() => {
    const ac = getAudioContext();
    return Object.fromEntries(
      PRESETS.map((p) => [p, makeReverbIR(ac, REVERB_PRESETS[p].seconds, REVERB_PRESETS[p].decay)])
    ) as Record<ReverbPreset, AudioBuffer>;
  }, []);

  function newRound() {
    setTarget(PRESETS[Math.floor(Math.random() * PRESETS.length)]);
    setGuess(null); setFeedback(null); setPlaying(false);
    chain.current?.stop(); chain.current = null;
  }

  function play() {
    if (playing) { chain.current?.stop(); chain.current = null; setPlaying(false); return; }
    const ac = getAudioContext();
    const src = startSource("pad");
    const conv = ac.createConvolver(); conv.buffer = irs[target];
    const pre = ac.createDelay(0.5); pre.delayTime.value = REVERB_PRESETS[target].predelayMs / 1000;
    const wet = ac.createGain(); wet.gain.value = 0.55;
    const dry = ac.createGain(); dry.gain.value = 0.55;
    src.node.connect(dry);
    src.node.connect(pre); pre.connect(conv); conv.connect(wet);
    const out = ac.createGain(); out.gain.value = 0;
    dry.connect(out); wet.connect(out); out.connect(getAnalyser());
    out.gain.linearRampToValueAtTime(0.4, ac.currentTime + 0.05);
    chain.current = { stop() {
      const t = ac.currentTime; out.gain.cancelScheduledValues(t);
      out.gain.linearRampToValueAtTime(0, t + 0.2);
      window.setTimeout(() => src.stop(), 260);
    }};
    setPlaying(true);
  }

  function submit(p: ReverbPreset) {
    if (feedback !== null) return;
    setGuess(p);
    const isCorrect = p === target;
    setFeedback(isCorrect);
    if (isCorrect) { setCorrect(c => c + 1); setStreak(s => s + 1); playSuccessChime(); }
    else { setStreak(0); playFailCue(); }
    const acc = isCorrect ? 100 : 0;
    setAccSum(a => a + acc);
    chain.current?.stop(); chain.current = null; setPlaying(false);
    window.setTimeout(async () => {
      if (round >= ROUNDS) {
        setFinished(true);
        if (mode === "ranked") {
          const finalScore = accSum + acc;
          const res = await saveGameScore("reverb", finalScore, finalScore / ROUNDS);
          if (res.saved) setSaved(true);
        }
      } else { setRound(r => r + 1); newRound(); }
    }, 1600);
  }

  useEffect(() => () => { chain.current?.stop(); }, []);

  if (!mode) return (
    <GameFrame gameId="reverb" tag="Reverb" title="Определи тип реверберации" description="Small Room · Chamber · Hall · Plate. Слушай хвост и предзадержку.">
      <ModePicker onPick={m => { setMode(m); newRound(); }} />
    </GameFrame>
  );
  if (finished) return (
    <GameFrame gameId="reverb" tag="Reverb" title="Итог сессии">
      <EndScreen
        score={Math.round(accSum)} accuracy={accSum / ROUNDS} rounds={ROUNDS} correct={correct}
        savedTo={saved ? "ranked" : null}
        onRestart={() => { setMode(null); setRound(1); setCorrect(0); setStreak(0); setAccSum(0); setFinished(false); setSaved(false); }}
      />
    </GameFrame>
  );

  return (
    <GameFrame gameId="reverb" tag="Reverb" title="Что за реверб?">
      <ScorePills round={round} rounds={ROUNDS} streak={streak} score={Math.round(accSum)} />
      <div className="panel mt-6 rounded-2xl p-6">
        <div className="flex items-center justify-between gap-4">
          <div className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">Пад через ConvolverNode</div>
          <button type="button" onClick={play}
            className="inline-flex items-center gap-2 rounded-full bg-mint px-5 py-2 text-sm font-bold text-mint-foreground hover:bg-mint/90">
            {playing ? <><Square className="h-4 w-4" /> Стоп</> : <><Play className="h-4 w-4" /> Играть</>}
          </button>
        </div>
        <div className="mt-6 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {PRESETS.map((p) => {
            const isTarget = feedback !== null && p === target;
            const isGuess = guess === p;
            const pre = REVERB_PRESETS[p];
            return (
              <button key={p} type="button" onClick={() => submit(p)} disabled={feedback !== null}
                className={`rounded-xl border p-3 text-left transition-all
                  ${feedback === true && isGuess ? "border-mint bg-mint/20 text-mint" : ""}
                  ${feedback === false && isGuess ? "border-red-500 bg-red-500/15 text-red-400" : ""}
                  ${!isGuess && isTarget ? "border-mint/60 bg-mint/10 text-mint" : ""}
                  ${feedback === null ? "border-border bg-background/60 hover:border-mint/40" : ""}
                `}>
                <div className="text-sm font-bold">{pre.label}</div>
                <div className="mt-1 font-mono text-[10px] uppercase tracking-widest opacity-70">
                  {pre.seconds}s · pre {pre.predelayMs}ms
                </div>
              </button>
            );
          })}
        </div>
        <FeedbackStrip
          correct={feedback}
          message={feedback !== null ? `Правильно: ${REVERB_PRESETS[target].label}` : undefined}
        />
      </div>
    </GameFrame>
  );
}
