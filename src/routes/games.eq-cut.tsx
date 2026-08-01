import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Play, Square } from "lucide-react";
import { EndScreen, FeedbackStrip, GameFrame, ModePicker, ScorePills } from "@/components/games/game-frame";
import { getAudioContext, getAnalyser, startSource } from "@/lib/games/engine";
import { saveGameScore } from "@/lib/games/score";
import { playFailCue, playSuccessChime } from "@/lib/audio";

export const Route = createFileRoute("/games/eq-cut")({
  head: () => ({
    meta: [
      { title: "EQ Cut — Тренажёр слуха | MixPro" },
      { name: "description", content: "Угадай, какая частота вырезана. Классика ear training." },
      { property: "og:title", content: "EQ Cut — Тренажёр слуха | MixPro" },
      { property: "og:description", content: "Угадай, какая частота вырезана." },
    ],
  }),
  component: EqCut,
});

const BANDS = [125, 250, 500, 1000, 2000, 4000, 8000, 16000];
const ROUNDS = 8;
const CUT_DB = -12;

function fmt(hz: number) { return hz >= 1000 ? `${hz / 1000}k` : `${hz}`; }

function EqCut() {
  const [mode, setMode] = useState<"practice" | "ranked" | null>(null);
  const [round, setRound] = useState(1);
  const [correct, setCorrect] = useState(0);
  const [streak, setStreak] = useState(0);
  const [accSum, setAccSum] = useState(0);
  const [target, setTarget] = useState<number>(1000);
  const [guess, setGuess] = useState<number | null>(null);
  const [feedback, setFeedback] = useState<boolean | null>(null);
  const [finished, setFinished] = useState(false);
  const [saved, setSaved] = useState(false);
  const [playing, setPlaying] = useState(false);
  const chain = useRef<{ stop: () => void } | null>(null);

  function newRound() {
    setTarget(BANDS[Math.floor(Math.random() * BANDS.length)]);
    setGuess(null); setFeedback(null); setPlaying(false);
    chain.current?.stop(); chain.current = null;
  }

  function play() {
    if (playing) { chain.current?.stop(); chain.current = null; setPlaying(false); return; }
    const ac = getAudioContext();
    const src = startSource("pink");
    const peak = ac.createBiquadFilter();
    peak.type = "peaking"; peak.frequency.value = target; peak.Q.value = 3.5; peak.gain.value = CUT_DB;
    const out = ac.createGain(); out.gain.value = 0;
    src.node.connect(peak); peak.connect(out); out.connect(getAnalyser());
    const now = ac.currentTime;
    out.gain.linearRampToValueAtTime(0.4, now + 0.05);
    chain.current = { stop() {
      const t = ac.currentTime; out.gain.cancelScheduledValues(t);
      out.gain.linearRampToValueAtTime(0, t + 0.08);
      window.setTimeout(() => src.stop(), 120);
    }};
    setPlaying(true);
  }

  function submit(g: number) {
    if (feedback !== null) return;
    setGuess(g);
    const isCorrect = g === target;
    const acc = isCorrect ? 100 : 0;
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
          const finalAcc = finalScore / ROUNDS;
          const res = await saveGameScore("eq-cut", finalScore, finalAcc);
          if (res.saved) setSaved(true);
        }
      } else {
        setRound(r => r + 1); newRound();
      }
    }, 1600);
  }

  useEffect(() => () => { chain.current?.stop(); }, []);

  if (!mode) return (
    <GameFrame gameId="eq-cut" tag="EQ Cut" title="Угадай вырезанную частоту" description="Мы гасим одну полосу на −12 дБ. Найди её.">
      <ModePicker onPick={m => { setMode(m); newRound(); }} />
    </GameFrame>
  );

  if (finished) return (
    <GameFrame gameId="eq-cut" tag="EQ Cut" title="Итог сессии">
      <EndScreen
        score={Math.round(accSum)} accuracy={accSum / ROUNDS} rounds={ROUNDS} correct={correct}
        savedTo={saved ? "ranked" : null}
        onRestart={() => { setMode(null); setRound(1); setCorrect(0); setStreak(0); setAccSum(0); setFinished(false); setSaved(false); }}
      />
    </GameFrame>
  );

  return (
    <GameFrame gameId="eq-cut" tag="EQ Cut" title="Угадай вырезанную частоту">
      <ScorePills round={round} rounds={ROUNDS} streak={streak} score={Math.round(accSum)} />

      <div className="panel mt-6 rounded-2xl p-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">Слушай</div>
            <p className="mt-1 text-sm text-muted-foreground">Розовый шум с одной вырезанной полосой. Q = 3.5, −12 дБ.</p>
          </div>
          <button
            type="button" onClick={play}
            className="inline-flex items-center gap-2 rounded-full bg-mint px-5 py-2 text-sm font-bold text-mint-foreground hover:bg-mint/90"
          >
            {playing ? <><Square className="h-4 w-4" /> Стоп</> : <><Play className="h-4 w-4" /> Играть</>}
          </button>
        </div>

        <div className="mt-6 grid grid-cols-4 gap-2">
          {BANDS.map((hz) => {
            const isTarget = feedback !== null && hz === target;
            const isGuess = guess === hz;
            const correctPick = feedback === true && isGuess;
            const wrongPick = feedback === false && isGuess;
            return (
              <button
                key={hz} type="button" onClick={() => submit(hz)} disabled={feedback !== null}
                className={`rounded-xl border p-3 font-mono text-sm font-bold transition-all
                  ${correctPick ? "border-mint bg-mint/20 text-mint" : ""}
                  ${wrongPick ? "border-red-500 bg-red-500/15 text-red-400" : ""}
                  ${!isGuess && isTarget ? "border-mint/60 bg-mint/10 text-mint" : ""}
                  ${feedback === null ? "border-border bg-background/60 hover:border-mint/40" : ""}
                `}
              >
                {fmt(hz)} Hz
              </button>
            );
          })}
        </div>

        <FeedbackStrip
          correct={feedback}
          message={feedback === false ? `Правильно: ${fmt(target)} Hz` : feedback === true ? "Идеально." : undefined}
        />
      </div>
    </GameFrame>
  );
}
