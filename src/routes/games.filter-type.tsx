import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Play, Square } from "lucide-react";
import { EndScreen, FeedbackStrip, GameFrame, ModePicker, ScorePills } from "@/components/games/game-frame";
import { FILTER_LABELS, type FilterKind, getAnalyser, getAudioContext, randRange, startSource } from "@/lib/games/engine";
import { saveGameScore } from "@/lib/games/score";
import { playFailCue, playSuccessChime } from "@/lib/audio";

export const Route = createFileRoute("/games/filter-type")({
  head: () => ({
    meta: [
      { title: "Filter Type — Тренажёр слуха | MixPro" },
      { name: "description", content: "Определи тип фильтра на слух: LP, HP, BP, Notch." },
      { property: "og:title", content: "Filter Type — Тренажёр слуха | MixPro" },
      { property: "og:description", content: "Определи тип фильтра на слух." },
    ],
  }),
  component: FilterType,
});

const KINDS: FilterKind[] = ["lowpass", "highpass", "bandpass", "notch"];
const ROUNDS = 8;

function FilterType() {
  const [mode, setMode] = useState<"practice" | "ranked" | null>(null);
  const [round, setRound] = useState(1);
  const [correct, setCorrect] = useState(0);
  const [streak, setStreak] = useState(0);
  const [accSum, setAccSum] = useState(0);
  const [target, setTarget] = useState<FilterKind>("lowpass");
  const [cutoff, setCutoff] = useState(1500);
  const [guess, setGuess] = useState<FilterKind | null>(null);
  const [feedback, setFeedback] = useState<boolean | null>(null);
  const [finished, setFinished] = useState(false);
  const [saved, setSaved] = useState(false);
  const [playing, setPlaying] = useState(false);
  const chain = useRef<{ stop: () => void } | null>(null);

  function newRound() {
    setTarget(KINDS[Math.floor(Math.random() * KINDS.length)]);
    setCutoff(Math.round(randRange(700, 2500) / 50) * 50);
    setGuess(null); setFeedback(null); setPlaying(false);
    chain.current?.stop(); chain.current = null;
  }

  function play() {
    if (playing) { chain.current?.stop(); chain.current = null; setPlaying(false); return; }
    const ac = getAudioContext();
    const src = startSource("drums");
    const f = ac.createBiquadFilter();
    f.type = target; f.frequency.value = cutoff; f.Q.value = target === "bandpass" || target === "notch" ? 4 : 0.9;
    const out = ac.createGain(); out.gain.value = 0;
    src.node.connect(f); f.connect(out); out.connect(getAnalyser());
    out.gain.linearRampToValueAtTime(0.45, ac.currentTime + 0.05);
    chain.current = { stop() {
      const t = ac.currentTime; out.gain.cancelScheduledValues(t);
      out.gain.linearRampToValueAtTime(0, t + 0.08);
      window.setTimeout(() => src.stop(), 120);
    }};
    setPlaying(true);
  }

  function submit(k: FilterKind) {
    if (feedback !== null) return;
    setGuess(k);
    const isCorrect = k === target;
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
          const res = await saveGameScore("filter-type", finalScore, finalScore / ROUNDS);
          if (res.saved) setSaved(true);
        }
      } else { setRound(r => r + 1); newRound(); }
    }, 1600);
  }

  useEffect(() => () => { chain.current?.stop(); }, []);

  if (!mode) return (
    <GameFrame gameId="filter-type" tag="Filter Type" title="Какой фильтр применён?" description="Low Pass · High Pass · Band Pass · Notch.">
      <ModePicker onPick={m => { setMode(m); newRound(); }} />
    </GameFrame>
  );
  if (finished) return (
    <GameFrame gameId="filter-type" tag="Filter Type" title="Итог сессии">
      <EndScreen
        score={Math.round(accSum)} accuracy={accSum / ROUNDS} rounds={ROUNDS} correct={correct}
        savedTo={saved ? "ranked" : null}
        onRestart={() => { setMode(null); setRound(1); setCorrect(0); setStreak(0); setAccSum(0); setFinished(false); setSaved(false); }}
      />
    </GameFrame>
  );

  return (
    <GameFrame gameId="filter-type" tag="Filter Type" title="Определи тип фильтра">
      <ScorePills round={round} rounds={ROUNDS} streak={streak} score={Math.round(accSum)} />
      <div className="panel mt-6 rounded-2xl p-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">Прослушай</div>
            <p className="mt-1 text-sm text-muted-foreground">Cutoff в этой сессии скрыт — только тип на слух.</p>
          </div>
          <button type="button" onClick={play}
            className="inline-flex items-center gap-2 rounded-full bg-mint px-5 py-2 text-sm font-bold text-mint-foreground hover:bg-mint/90">
            {playing ? <><Square className="h-4 w-4" /> Стоп</> : <><Play className="h-4 w-4" /> Играть</>}
          </button>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {KINDS.map((k) => {
            const isTarget = feedback !== null && k === target;
            const isGuess = guess === k;
            return (
              <button key={k} type="button" onClick={() => submit(k)} disabled={feedback !== null}
                className={`rounded-xl border p-4 text-sm font-bold transition-all
                  ${feedback === true && isGuess ? "border-mint bg-mint/20 text-mint" : ""}
                  ${feedback === false && isGuess ? "border-red-500 bg-red-500/15 text-red-400" : ""}
                  ${!isGuess && isTarget ? "border-mint/60 bg-mint/10 text-mint" : ""}
                  ${feedback === null ? "border-border bg-background/60 hover:border-mint/40" : ""}
                `}>
                {FILTER_LABELS[k]}
              </button>
            );
          })}
        </div>

        <FeedbackStrip
          correct={feedback}
          message={feedback !== null ? `Правильно: ${FILTER_LABELS[target]}` : undefined}
        />
      </div>
    </GameFrame>
  );
}
