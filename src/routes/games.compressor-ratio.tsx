import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Play, Square } from "lucide-react";
import { EndScreen, FeedbackStrip, GameFrame, ModePicker, ScorePills } from "@/components/games/game-frame";
import { getAnalyser, getAudioContext, startSource } from "@/lib/games/engine";
import { saveGameScore } from "@/lib/games/score";
import { playFailCue, playSuccessChime } from "@/lib/audio";

/**
 * Universal 3-choice compressor game. Different games pass a `param`
 * config (ratio / attack / release) — we play three variants and the
 * user picks the extreme one (highest ratio / fastest attack / slowest release).
 */
type Variant = "ratio" | "attack" | "release";
type Cfg = { threshold: number; knee: number; ratio: number; attack: number; release: number };

const SETS: Record<Variant, Cfg[]> = {
  ratio: [
    { threshold: -18, knee: 6, ratio: 2,  attack: 0.01, release: 0.15 },
    { threshold: -18, knee: 6, ratio: 6,  attack: 0.01, release: 0.15 },
    { threshold: -18, knee: 6, ratio: 20, attack: 0.01, release: 0.15 },
  ],
  attack: [
    { threshold: -20, knee: 4, ratio: 8, attack: 0.0005, release: 0.2 },
    { threshold: -20, knee: 4, ratio: 8, attack: 0.02,   release: 0.2 },
    { threshold: -20, knee: 4, ratio: 8, attack: 0.1,    release: 0.2 },
  ],
  release: [
    { threshold: -20, knee: 4, ratio: 6, attack: 0.005, release: 0.05 },
    { threshold: -20, knee: 4, ratio: 6, attack: 0.005, release: 0.25 },
    { threshold: -20, knee: 4, ratio: 6, attack: 0.005, release: 1.2  },
  ],
};

const PROMPT: Record<Variant, { tag: string; title: string; desc: string; question: string; correctIndex: (cfgs: Cfg[]) => number }> = {
  ratio: {
    tag: "Comp Ratio",
    title: "Где ratio самый большой?",
    desc: "Слушай A/B/C. У всех одинаковые attack/release и threshold — отличается только ratio.",
    question: "Который вариант с самым большим ratio?",
    correctIndex: (c) => c.reduce((mx, x, i) => (x.ratio > c[mx].ratio ? i : mx), 0),
  },
  attack: {
    tag: "Comp Attack",
    title: "Где attack самый быстрый?",
    desc: "У всех одинаковый ratio/release — отличается только attack. Ищи самый быстрый.",
    question: "Который вариант с самым быстрым attack?",
    correctIndex: (c) => c.reduce((mn, x, i) => (x.attack < c[mn].attack ? i : mn), 0),
  },
  release: {
    tag: "Comp Release",
    title: "Где release самый медленный?",
    desc: "У всех одинаковый ratio/attack — отличается только release. Ищи самый долгий хвост.",
    question: "Который вариант с самым медленным release?",
    correctIndex: (c) => c.reduce((mx, x, i) => (x.release > c[mx].release ? i : mx), 0),
  },
};

const ROUNDS = 6;
const LABELS = ["A", "B", "C"] as const;

export function CompressorGame({ variant, gameType }: { variant: Variant; gameType: string }) {
  const [mode, setMode] = useState<"practice" | "ranked" | null>(null);
  const [round, setRound] = useState(1);
  const [correct, setCorrect] = useState(0);
  const [streak, setStreak] = useState(0);
  const [accSum, setAccSum] = useState(0);
  // Randomized index mapping so the correct answer isn't always the same slot
  const [order, setOrder] = useState<number[]>([0, 1, 2]);
  const [guess, setGuess] = useState<number | null>(null);
  const [feedback, setFeedback] = useState<boolean | null>(null);
  const [finished, setFinished] = useState(false);
  const [saved, setSaved] = useState(false);
  const [playing, setPlaying] = useState<number | null>(null);
  const chain = useRef<{ stop: () => void } | null>(null);

  const P = PROMPT[variant];
  const cfgs = SETS[variant];
  // Correct order-index = position of the "extreme" cfg in the current order
  const correctCfgIdx = P.correctIndex(cfgs);
  const correctSlot = order.indexOf(correctCfgIdx);

  function shuffle() {
    const o = [0, 1, 2].sort(() => Math.random() - 0.5);
    setOrder(o);
  }

  function newRound() {
    shuffle();
    setGuess(null); setFeedback(null); setPlaying(null);
    chain.current?.stop(); chain.current = null;
  }

  function play(slot: number) {
    if (playing === slot) { chain.current?.stop(); chain.current = null; setPlaying(null); return; }
    chain.current?.stop();
    const ac = getAudioContext();
    const cfg = cfgs[order[slot]];
    const src = startSource("drums");
    const preGain = ac.createGain(); preGain.gain.value = 2.2; // push into threshold
    const comp = ac.createDynamicsCompressor();
    comp.threshold.value = cfg.threshold;
    comp.knee.value = cfg.knee;
    comp.ratio.value = cfg.ratio;
    comp.attack.value = cfg.attack;
    comp.release.value = cfg.release;
    const makeup = ac.createGain(); makeup.gain.value = 0.7;
    const out = ac.createGain(); out.gain.value = 0;
    src.node.connect(preGain); preGain.connect(comp); comp.connect(makeup); makeup.connect(out); out.connect(getAnalyser());
    out.gain.linearRampToValueAtTime(0.45, ac.currentTime + 0.05);
    chain.current = { stop() {
      const t = ac.currentTime; out.gain.cancelScheduledValues(t);
      out.gain.linearRampToValueAtTime(0, t + 0.08);
      window.setTimeout(() => src.stop(), 120);
    }};
    setPlaying(slot);
  }

  function submit(slot: number) {
    if (feedback !== null) return;
    setGuess(slot);
    const isCorrect = slot === correctSlot;
    setFeedback(isCorrect);
    if (isCorrect) { setCorrect(c => c + 1); setStreak(s => s + 1); playSuccessChime(); }
    else { setStreak(0); playFailCue(); }
    const acc = isCorrect ? 100 : 0;
    setAccSum(a => a + acc);
    chain.current?.stop(); chain.current = null; setPlaying(null);
    window.setTimeout(async () => {
      if (round >= ROUNDS) {
        setFinished(true);
        if (mode === "ranked") {
          const finalScore = accSum + acc;
          const res = await saveGameScore(gameType, finalScore, finalScore / ROUNDS);
          if (res.saved) setSaved(true);
        }
      } else { setRound(r => r + 1); newRound(); }
    }, 1600);
  }

  useEffect(() => () => { chain.current?.stop(); }, []);

  if (!mode) return (
    <GameFrame gameId={`compressor-${variant}`} tag={P.tag} title={P.title} description={P.desc}>
      <ModePicker onPick={m => { setMode(m); newRound(); }} />
    </GameFrame>
  );
  if (finished) return (
    <GameFrame gameId={`compressor-${variant}`} tag={P.tag} title="Итог сессии">
      <EndScreen
        score={Math.round(accSum)} accuracy={accSum / ROUNDS} rounds={ROUNDS} correct={correct}
        savedTo={saved ? "ranked" : null}
        onRestart={() => { setMode(null); setRound(1); setCorrect(0); setStreak(0); setAccSum(0); setFinished(false); setSaved(false); }}
      />
    </GameFrame>
  );

  return (
    <GameFrame gameId={`compressor-${variant}`} tag={P.tag} title={P.question}>
      <ScorePills round={round} rounds={ROUNDS} streak={streak} score={Math.round(accSum)} />
      <div className="panel mt-6 rounded-2xl p-6">
        <div className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
          Три компрессии одного и того же лупа
        </div>
        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          {LABELS.map((L, slot) => {
            const isTarget = feedback !== null && slot === correctSlot;
            const isGuess = guess === slot;
            return (
              <div key={L} className={`rounded-xl border p-4 transition-all
                ${feedback === true && isGuess ? "border-mint bg-mint/20" : ""}
                ${feedback === false && isGuess ? "border-red-500 bg-red-500/15" : ""}
                ${!isGuess && isTarget ? "border-mint/60 bg-mint/10" : ""}
                ${feedback === null ? "border-border bg-background/60" : ""}
              `}>
                <div className="flex items-center justify-between">
                  <span className="font-mono text-2xl font-black">{L}</span>
                  <button type="button" onClick={() => play(slot)}
                    className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-bold
                      ${playing === slot ? "bg-red-500/20 text-red-400" : "bg-mint text-mint-foreground hover:bg-mint/90"}`}>
                    {playing === slot ? <Square className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                    {playing === slot ? "Стоп" : "Play"}
                  </button>
                </div>
                <button type="button" onClick={() => submit(slot)} disabled={feedback !== null}
                  className="mt-4 w-full rounded-lg border border-mint/40 bg-mint/10 py-2 text-xs font-bold text-mint hover:bg-mint/15 disabled:opacity-60">
                  Выбрать {L}
                </button>
              </div>
            );
          })}
        </div>
        <FeedbackStrip
          correct={feedback}
          message={feedback !== null ? `Правильно: ${LABELS[correctSlot]}` : undefined}
        />
      </div>
    </GameFrame>
  );
}

export const Route = createFileRoute("/games/compressor-ratio")({
  head: () => ({
    meta: [
      { title: "Compressor Ratio — Тренажёр слуха | MixPro" },
      { name: "description", content: "Слушай три компрессии и найди самое агрессивное сжатие." },
      { property: "og:title", content: "Compressor Ratio — Тренажёр слуха | MixPro" },
      { property: "og:description", content: "Слушай три компрессии и найди самое агрессивное сжатие." },
    ],
  }),
  component: () => <CompressorGame variant="ratio" gameType="comp-ratio" />,
});
