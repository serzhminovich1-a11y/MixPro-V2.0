import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { TutorialLauncher } from "@/components/games/tutorial-launcher";
import { Play } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { playTone } from "@/lib/audio";

export const Route = createFileRoute("/games/ear-eq")({
  head: () => ({
    meta: [
      { title: "Найди изменение — MixPro" },
      { name: "description", content: "Ear training: сравни два тона и определи, стал ли второй выше или ниже. Тренировка слуха для звукорежиссёров." },
    ],
  }),
  component: EarEqGame,
});

const ROUNDS = 10;
const BASE_FREQS = [220, 330, 440, 550, 660, 880];

function EarEqGame() {
  const { session } = useAuth();
  const [round, setRound] = useState(0);
  const [correct, setCorrect] = useState(0);
  const [direction, setDirection] = useState<"up" | "down" | null>(null);
  const [cents, setCents] = useState(50);
  const [baseFreq, setBaseFreq] = useState(440);
  const [answered, setAnswered] = useState<"up" | "down" | null>(null);
  const [finished, setFinished] = useState(false);
  const [saved, setSaved] = useState(false);

  function playPair(base: number, dir: "up" | "down", c: number) {
    playTone(base, 0.9);
    const ratio = Math.pow(2, (dir === "up" ? c : -c) / 1200);
    setTimeout(() => playTone(base * ratio, 0.9), 1100);
  }

  function newRound(nextRound: number) {
    const base = BASE_FREQS[Math.floor(Math.random() * BASE_FREQS.length)];
    const dir = Math.random() > 0.5 ? "up" : "down";
    // Difficulty ramps: fewer cents difference in later rounds
    const c = Math.max(15, 80 - nextRound * 6);
    setBaseFreq(base);
    setDirection(dir);
    setCents(c);
    setAnswered(null);
    playPair(base, dir, c);
  }

  function start() {
    setCorrect(0);
    setFinished(false);
    setSaved(false);
    setRound(1);
    newRound(1);
  }

  function replay() {
    if (direction) playPair(baseFreq, direction, cents);
  }

  async function answer(guess: "up" | "down") {
    if (answered !== null || direction === null) return;
    setAnswered(guess);
    const isCorrect = guess === direction;
    const newCorrect = correct + (isCorrect ? 1 : 0);
    setCorrect(newCorrect);

    setTimeout(async () => {
      if (round >= ROUNDS) {
        setFinished(true);
        if (session) {
          const score = newCorrect * 8;
          const { error } = await supabase.from("game_scores").insert({
            user_id: session.user.id,
            game_type: "ear-eq",
            score,
            accuracy: (newCorrect / ROUNDS) * 100,
          });
          if (!error) setSaved(true);
        }
      } else {
        const next = round + 1;
        setRound(next);
        newRound(next);
      }
    }, 1000);
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-16">
      <TutorialLauncher gameId="ear-eq" />
      <Link to="/games" className="text-sm text-muted-foreground hover:text-foreground">
        ← Все игры
      </Link>
      <h1 className="mt-4 text-3xl font-bold">Найди изменение</h1>
      <p className="mt-2 text-muted-foreground">
        Прозвучат два тона. Второй выше или ниже первого? С каждым раундом разница меньше.
      </p>

      {round === 0 && (
        <div className="glass mt-10 rounded-2xl p-10 text-center">
          <p className="text-muted-foreground">10 раундов. +8 XP за каждый верный ответ.</p>
          <button
            onClick={start}
            className="mt-6 inline-flex items-center gap-2 rounded-xl bg-primary px-8 py-4 text-lg font-semibold text-primary-foreground transition-transform hover:scale-105"
            style={{ boxShadow: "var(--shadow-glow-mint)" }}
          >
            <Play className="h-5 w-5" /> Начать
          </button>
        </div>
      )}

      {round > 0 && !finished && (
        <div className="glass mt-10 rounded-2xl p-8 text-center">
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>Раунд {round}/{ROUNDS}</span>
            <span>Верно: <span className="font-bold text-mint">{correct}</span></span>
            <span>Разница: <span className="font-bold text-cyan">{cents} центов</span></span>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-secondary">
            <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${(round / ROUNDS) * 100}%` }} />
          </div>

          <button
            onClick={replay}
            className="mt-8 rounded-xl border border-border bg-secondary px-5 py-3 text-sm font-semibold transition-colors hover:bg-muted"
          >
            Прослушать ещё раз
          </button>

          <div className="mt-8 flex justify-center gap-4">
            {(["up", "down"] as const).map((dir) => {
              const state =
                answered === null ? "idle" : dir === direction ? "correct" : dir === answered ? "wrong" : "idle";
              return (
                <button
                  key={dir}
                  onClick={() => answer(dir)}
                  disabled={answered !== null}
                  className={`rounded-xl border px-10 py-6 text-2xl transition-all ${
                    state === "correct"
                      ? "border-mint bg-mint/20"
                      : state === "wrong"
                        ? "border-destructive bg-destructive/20"
                        : "border-border bg-secondary hover:bg-muted disabled:opacity-60"
                  }`}
                >
                  {dir === "up" ? "⬆️ Выше" : "⬇️ Ниже"}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {finished && (
        <div className="glass mt-10 rounded-2xl p-10 text-center">
          <div className="text-5xl font-bold text-gradient-neon" style={{ fontFamily: "var(--font-display)" }}>
            {correct}/{ROUNDS}
          </div>
          <p className="mt-3 text-muted-foreground">
            {correct >= 8 ? "Абсолютный слух рядом! 🏆" : correct >= 5 ? "Неплохо! Тренируйся дальше." : "Начало положено — повтори!"}
          </p>
          {session ? (
            <p className="mt-2 text-sm text-mint">{saved ? `+${correct * 8} XP записано в рейтинг!` : "Сохраняем результат..."}</p>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">
              <Link to="/auth" className="text-primary hover:underline">Войдите</Link>, чтобы зарабатывать XP.
            </p>
          )}
          <button
            onClick={start}
            className="mt-6 rounded-xl bg-primary px-8 py-3 font-semibold text-primary-foreground transition-transform hover:scale-105"
          >
            Играть снова
          </button>
        </div>
      )}
    </div>
  );
}
