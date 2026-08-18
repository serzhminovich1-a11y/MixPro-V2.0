import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { TutorialLauncher } from "@/components/games/tutorial-launcher";
import {
  ArrowLeft, Volume2, VolumeX, Plus, Minus, Star, Flame, Target, Settings2, Play, RotateCcw,
  Palette, Lightbulb, Check, X, Sliders, HelpCircle, Sparkles,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import {
  playNoiseWithBoost, FREQ_BANDS, getAudioContext, setMasterVolume,
  playSuccessChime, playFailCue, startSustainedNoise,
  type SustainedNoise, type NoiseSource, type SignalOptions,
} from "@/lib/audio";
import { listActiveLoops, decodeLoop, type LoopRow } from "@/lib/games/loops";
import { SignalVisualizer, type VizMode } from "@/components/signal-visualizer";
import { FREQUENCY_THEMES, DEFAULT_THEME_ID, type FrequencyTheme } from "@/lib/frequency-themes";
import { tipFor, type FrequencyTip } from "@/lib/frequency-tips";
import { CHEATSHEET, ANCHORS } from "@/lib/frequency-cheatsheet";

export const Route = createFileRoute("/games/frequency")({
  head: () => ({
    meta: [
      { title: "PeakMaster — тренажёр частот" },
      { name: "description", content: "Услышь любую частоту. Четыре уровня сложности, ranked-режим, свободная тренировка и Perfection-бонус." },
    ],
  }),
  validateSearch: (s: Record<string, unknown>): { loopId?: string } => ({
    ...(typeof s.loopId === "string" ? { loopId: s.loopId } : {}),
  }),
  component: FrequencyGame,
});

const THEME_KEY = "mixpro.frequency.theme";
const SETTINGS_KEY = "mixpro.frequency.settings";
const VOLUME_KEY = "mixpro.frequency.volume";
const VIZ_KEY = "mixpro.frequency.viz";

const VIZ_OPTIONS: { id: VizMode; name: string; hint: string }[] = [
  { id: "spectrum",    name: "Спектр",       hint: "FFT-анализатор" },
  { id: "wave",        name: "Осциллограф",  hint: "форма сигнала во времени" },
  { id: "spectrogram", name: "Спектрограмма", hint: "цветовая карта частоты × времени" },
  { id: "meter",       name: "Уровнемер",    hint: "RMS + Peak в дБ" },
];

type Mode = "ranked" | "practice";
type Difficulty = "easy" | "medium" | "hard" | "god";

type Settings = {
  difficulty: Difficulty;
  rounds: number;
  boostDb: number;
  q: number;           // bandwidth of the peaking EQ
  source: NoiseSource; // pink / white / music / loop
  phone: boolean;      // phone-speaker simulation (HPF 300 + LPF 4k)
  loopId?: string;     // id of active loop when source === "loop"
};

const DIFFICULTY: Record<Difficulty, {
  name: string;
  tier: string;
  tolerancePct: number;   // ± % around target frequency (Hz)
  toleranceOct: number;   // derived octave half-width
  snap: boolean;
  bandCount: number;
}> = {
  easy:   { name: "Легко",  tier: "±25%",  tolerancePct: 25, toleranceOct: Math.log2(1.25),  snap: true,  bandCount: 5  },
  medium: { name: "Средне", tier: "±15%",  tolerancePct: 15, toleranceOct: Math.log2(1.15),  snap: true,  bandCount: 7  },
  hard:   { name: "Сложно", tier: "±5%",   tolerancePct: 5,  toleranceOct: Math.log2(1.05),  snap: false, bandCount: 12 },
  god:    { name: "God",    tier: "±2%",   tolerancePct: 2,  toleranceOct: Math.log2(1.02),  snap: false, bandCount: 12 },
};

const HARD_TARGETS = [60, 90, 150, 250, 400, 700, 1000, 1800, 3000, 5000, 8000, 12000];
const EASY_TARGETS = [80, 400, 1000, 4000, 10000];

const DEFAULT_SETTINGS: Settings = {
  difficulty: "medium",
  rounds: 8,
  boostDb: 12,
  q: 3.0,
  source: "loop",
  phone: false,
};

const PERFECTION_BONUS = 300;
const PERFECTION_THRESHOLD = 97; // accuracy % needed to trigger bonus

const F_MIN = 20;
const F_MAX = 20000;
const LOG_MIN = Math.log10(F_MIN);
const LOG_MAX = Math.log10(F_MAX);
const freqToPct = (f: number) => ((Math.log10(f) - LOG_MIN) / (LOG_MAX - LOG_MIN)) * 100;
const pctToFreq = (p: number) => Math.pow(10, LOG_MIN + (p / 100) * (LOG_MAX - LOG_MIN));


function formatHz(f: number) {
  if (f >= 1000) return `${(f / 1000).toFixed(f % 1000 === 0 ? 0 : 2)}k Hz`;
  return `${Math.round(f)} Hz`;
}

function accuracyPct(guess: number, target: number, toleranceOct: number) {
  const err = Math.abs(Math.log2(guess / target)); // in octaves
  return Math.max(0, Math.min(100, Math.round((1 - err / toleranceOct) * 100)));
}

function FrequencyGame() {
  const { session } = useAuth();
  const search = Route.useSearch();

  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [mode, setMode] = useState<Mode | null>(null);
  const [target, setTarget] = useState<number | null>(null);
  const [round, setRound] = useState(0);
  const [correct, setCorrect] = useState(0);
  const [accSum, setAccSum] = useState(0);
  const [streak, setStreak] = useState(0);
  const [guess, setGuess] = useState<number>(1000); // continuous
  const [answered, setAnswered] = useState<null | { correct: boolean; accuracy: number; tip: FrequencyTip }>(null);
  const [finished, setFinished] = useState(false);
  const [saved, setSaved] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [compare, setCompare] = useState(false);
  const [volume, setVolume] = useState(20);
  const [themeId, setThemeId] = useState<string>(DEFAULT_THEME_ID);
  const [themeOpen, setThemeOpen] = useState(false);
  const [cheatOpen, setCheatOpen] = useState(false);
  const [bonusFlash, setBonusFlash] = useState(0); // pulse animation trigger
  const [viz, setViz] = useState<VizMode>("spectrum");

  const theme = useMemo<FrequencyTheme>(
    () => FREQUENCY_THEMES.find((t) => t.id === themeId) ?? FREQUENCY_THEMES[0],
    [themeId],
  );
  const diff = DIFFICULTY[settings.difficulty];
  const rounds = settings.rounds;

  useEffect(() => {
    // Don't create AudioContext on mount — wait for user interaction so the
    // browser doesn't block it and nothing plays until the user asks for it.
    if (typeof window !== "undefined") {
      const t = window.localStorage.getItem(THEME_KEY);
      if (t && FREQUENCY_THEMES.some((x) => x.id === t)) setThemeId(t);
      const s = window.localStorage.getItem(SETTINGS_KEY);
      if (s) {
        try { setSettings({ ...DEFAULT_SETTINGS, ...JSON.parse(s) }); } catch { /* ignore */ }
      }
      const v = window.localStorage.getItem(VOLUME_KEY);
      if (v !== null) {
        const n = Number(v);
        if (Number.isFinite(n)) setVolume(Math.max(0, Math.min(100, Math.round(n))));
      }
      const vz = window.localStorage.getItem(VIZ_KEY);
      if (vz && VIZ_OPTIONS.some((o) => o.id === vz)) setViz(vz as VizMode);
    }
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined") window.localStorage.setItem(VIZ_KEY, viz);
  }, [viz]);

  useEffect(() => {
    if (typeof window !== "undefined") window.localStorage.setItem(THEME_KEY, themeId);
  }, [themeId]);

  useEffect(() => {
    if (typeof window !== "undefined") window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  }, [settings]);

  // Wire volume slider to Web Audio master gain (0..1). Persist to localStorage.
  useEffect(() => {
    setMasterVolume(volume / 100);
    if (typeof window !== "undefined") window.localStorage.setItem(VOLUME_KEY, String(volume));
  }, [volume]);

  const noiseRef = useRef<SustainedNoise | null>(null);

  function stopSustained() {
    if (noiseRef.current) {
      noiseRef.current.stop();
      noiseRef.current = null;
    }
    setPlaying(false);
    setCompare(false);
  }

  const [loops, setLoops] = useState<LoopRow[]>([]);
  const [loopBuffer, setLoopBuffer] = useState<AudioBuffer | null>(null);

  // Load list of active loops once (for the picker in Settings).
  useEffect(() => {
    let alive = true;
    listActiveLoops().then((rows) => {
      if (!alive) return;
      setLoops(rows);
      // If we arrived with ?loopId=..., force that loop as the source.
      const fromUrl = search.loopId && rows.find((r) => r.id === search.loopId) ? search.loopId : null;
      setSettings((s) => {
        if (fromUrl) return { ...s, source: "loop", loopId: fromUrl };
        if (s.source === "loop" && !s.loopId && rows.length > 0) {
          return { ...s, loopId: rows[0].id };
        }
        // If admin hasn't uploaded any loops, gracefully fall back to pink noise.
        if (s.source === "loop" && rows.length === 0) {
          return { ...s, source: "pink" };
        }
        return s;
      });
    }).catch(() => {});
    return () => { alive = false; };
    // Deliberately mount-only: the initial fetch + empty-loops fallback should
    // only run once. Re-applying ?loopId= after a URL change is handled below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // If ?loopId= changes while this page stays mounted (e.g. a nav link back
  // to /games/frequency with no loopId, after arriving via an admin deep
  // link with one), re-apply it instead of leaving `settings.loopId` stale.
  useEffect(() => {
    if (loops.length === 0) return;
    const fromUrl = search.loopId && loops.find((r) => r.id === search.loopId) ? search.loopId : null;
    if (fromUrl) setSettings((s) => ({ ...s, source: "loop", loopId: fromUrl }));
  }, [search.loopId, loops]);

  // Decode the selected loop when source is "loop".
  useEffect(() => {
    if (settings.source !== "loop") { setLoopBuffer(null); return; }
    const row = loops.find((l) => l.id === settings.loopId) ?? loops[0];
    if (!row) { setLoopBuffer(null); return; }
    let alive = true;
    decodeLoop(row).then((buf) => { if (alive) setLoopBuffer(buf); }).catch(() => { if (alive) setLoopBuffer(null); });
    return () => { alive = false; };
  }, [settings.source, settings.loopId, loops]);

  const signalOpts: SignalOptions = useMemo(
    () => ({
      source: settings.source === "loop" && !loopBuffer ? "pink" : settings.source,
      q: settings.q,
      phone: settings.phone,
      loopBuffer: settings.source === "loop" ? loopBuffer ?? undefined : undefined,
    }),
    [settings.source, settings.q, settings.phone, loopBuffer],
  );

  /** Start looped playback held for as long as the user keeps input. */
  function startHold(freq: number | null, boosted: boolean) {
    if (freq === null || answered !== null) return;
    getAudioContext();
    stopSustained();
    noiseRef.current = startSustainedNoise(freq, settings.boostDb, boosted, signalOpts);
    setPlaying(true);
    setCompare(!boosted);
  }

  /** Short one-shot preview (used by ▶ button). */
  function playPreview(freq: number | null) {
    if (freq === null) return;
    getAudioContext();
    stopSustained();
    setPlaying(true);
    playNoiseWithBoost(freq, 1.6, settings.boostDb, signalOpts);
    window.setTimeout(() => setPlaying(false), 1600);
  }

  // Cleanup on unmount
  useEffect(() => () => { stopSustained(); }, []);

  function targetsForDifficulty(): number[] {
    if (settings.difficulty === "easy") return EASY_TARGETS;
    if (settings.difficulty === "medium") return FREQ_BANDS.map((b) => b.freq);
    return HARD_TARGETS;
  }

  function newRound() {
    const targets = targetsForDifficulty();
    const t = targets[Math.floor(Math.random() * targets.length)];
    setTarget(t);
    setAnswered(null);
    setCompare(false);
    setGuess(1000);
    // Don't auto-play — user starts the signal with the ▶ button.
  }

  function start(m: Mode) {
    setMode(m);
    setRound(1);
    setCorrect(0);
    setAccSum(0);
    setStreak(0);
    setFinished(false);
    setSaved(false);
    newRound();
  }

  function exit() {
    setMode(null);
    setRound(0);
    setFinished(false);
    setTarget(null);
    setAnswered(null);
  }

  async function submit() {
    if (target === null || answered !== null) return;
    const finalGuess = diff.snap ? snapToNearest(guess, targetsForDifficulty()) : guess;
    const acc = accuracyPct(finalGuess, target, diff.toleranceOct);
    const isCorrect = acc > 0 && Math.abs(Math.log2(finalGuess / target)) <= diff.toleranceOct;
    const perfection = isCorrect && acc >= PERFECTION_THRESHOLD;
    const tip = tipFor(target);
    setAnswered({ correct: isCorrect, accuracy: acc, tip });
    setGuess(finalGuess);
    const bonus = perfection ? PERFECTION_BONUS : 0;
    const nextCorrect = correct + (isCorrect ? 1 : 0);
    const nextStreak = isCorrect ? streak + 1 : 0;
    const nextAccSum = accSum + acc + bonus;
    setCorrect(nextCorrect);
    setStreak(nextStreak);
    setAccSum(nextAccSum);

    if (perfection) setBonusFlash((n) => n + 1);
    if (isCorrect) playSuccessChime();
    else playFailCue();

    window.setTimeout(async () => {
      if (round >= rounds) {
        setFinished(true);
        if (session && mode === "ranked") {
          const finalScore = Math.round(nextAccSum);
          const finalAcc = nextAccSum / rounds;
          const { error } = await supabase.from("game_scores").insert({
            user_id: session.user.id,
            game_type: "frequency",
            score: finalScore,
            accuracy: finalAcc,
          });
          if (!error) setSaved(true);
        }
      } else {
        setRound((r) => r + 1);
        newRound();
      }
    }, 2600);
  }

  const level = Math.max(1, Math.floor(correct / 5) + 1);
  const points = Math.round(accSum);
  const inGame = mode !== null && !finished;

  const rootStyle = {
    ...(theme.vars as React.CSSProperties),
    backgroundColor: "var(--fq-bg)",
    backgroundImage: "var(--fq-bg-radial)",
    color: "var(--fq-text)",
  } as React.CSSProperties;

  return (
    <div className="min-h-screen" style={rootStyle} onContextMenu={(e) => e.preventDefault()}>
      <TutorialLauncher gameId="frequency" />
      <div className="mx-auto max-w-6xl px-4 py-6 md:py-8">
        {/* Top bar */}
        <div className="flex items-center justify-between gap-4">
          <Link
            to="/games"
            className="inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm transition-colors"
            style={{ borderColor: "var(--fq-border)", background: "var(--fq-panel)", color: "var(--fq-muted)" }}
          >
            <ArrowLeft className="h-4 w-4" />
            <span>Назад</span>
          </Link>
          <div className="hidden select-none items-baseline gap-1 font-black tracking-tight md:flex" style={{ fontFamily: "'Michroma', ui-sans-serif" }}>
            <span style={{ color: "var(--fq-acc)", textShadow: "var(--fq-acc-glow)" }}>PEAK</span>
            <span className="text-white">MASTER</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setCheatOpen(true)}
              className="inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold"
              style={{ borderColor: "var(--fq-border)", background: "var(--fq-panel)", color: "var(--fq-text)" }}
              aria-label="Что живёт на этих частотах"
              title="Что живёт на этих частотах"
            >
              <HelpCircle className="h-3.5 w-3.5" style={{ color: "var(--fq-acc)" }} />
              <span className="hidden sm:inline">Частоты</span>
            </button>
            <button
              type="button"
              onClick={() => setSettingsOpen(true)}
              className="inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold"
              style={{ borderColor: "var(--fq-border)", background: "var(--fq-panel)", color: "var(--fq-text)" }}
            >
              <Sliders className="h-3.5 w-3.5" style={{ color: "var(--fq-acc)" }} />
              <span className="hidden sm:inline">Настройки</span>
            </button>
            <div className="relative">
              <button
                type="button"
                onClick={() => setThemeOpen((v) => !v)}
                className="inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold"
                style={{ borderColor: "var(--fq-border)", background: "var(--fq-panel)", color: "var(--fq-text)" }}
              >
                <Palette className="h-3.5 w-3.5" style={{ color: "var(--fq-acc)" }} />
                <span className="hidden sm:inline">{theme.name}</span>
                <span className="sm:hidden">Тема</span>
              </button>
              {themeOpen && (
                <>
                  <button
                    type="button"
                    aria-label="Закрыть"
                    className="fixed inset-0 z-40 cursor-default"
                    onClick={() => setThemeOpen(false)}
                  />
                  <div
                    role="listbox"
                    className="absolute right-0 z-50 mt-2 w-72 overflow-hidden rounded-2xl border shadow-2xl backdrop-blur"
                    style={{ borderColor: "var(--fq-border)", background: "rgba(10,10,12,0.92)" }}
                  >
                    <div className="px-4 pb-2 pt-3 font-mono text-[10px] uppercase tracking-[0.28em]" style={{ color: "var(--fq-muted)" }}>
                      Темы · 10 уровней
                    </div>
                    <ul className="max-h-96 overflow-y-auto py-1">
                      {FREQUENCY_THEMES.map((t) => {
                        const active = t.id === themeId;
                        return (
                          <li key={t.id}>
                            <button
                              type="button"
                              onClick={() => { setThemeId(t.id); setThemeOpen(false); }}
                              className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-white/[0.04]"
                            >
                              <span
                                className="h-6 w-6 shrink-0 rounded-full border"
                                style={{
                                  background: t.vars["--fq-acc"] ?? "var(--fq-acc)",
                                  borderColor: "rgba(255,255,255,0.15)",
                                  boxShadow: t.vars["--fq-acc-glow"] ?? "var(--fq-acc-glow)",
                                }}
                              />
                              <span className="flex-1">
                                <span className="block text-sm font-semibold text-white">{t.name}</span>
                                <span className="block font-mono text-[10px] uppercase tracking-widest" style={{ color: "var(--fq-muted)" }}>{t.tier}</span>
                              </span>
                              {active && <span className="font-mono text-[10px]" style={{ color: "var(--fq-acc)" }}>✓</span>}
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                </>
              )}
            </div>
            <Link
              to="/leaderboard"
              className="rounded-full border px-3 py-1.5 text-xs font-semibold"
              style={{ borderColor: "var(--fq-acc)", background: "var(--fq-acc-soft)", color: "var(--fq-acc)" }}
            >
              🏅 Рейтинг
            </Link>
          </div>
        </div>

        {/* Sub-bar: volume + stat badges */}
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5 rounded-full border px-2 py-1" style={{ borderColor: "var(--fq-border)", background: "var(--fq-panel)" }}>
            <button
              type="button"
              onClick={() => setVolume((v) => Math.max(0, v - 5))}
              className="grid h-7 w-7 place-items-center rounded-full border transition-colors hover:bg-white/5"
              style={{ borderColor: "var(--fq-border)", color: "var(--fq-text)" }}
              aria-label="Тише"
            >
              <Minus className="h-3.5 w-3.5" />
            </button>
            {volume === 0
              ? <VolumeX className="h-4 w-4" style={{ color: "var(--fq-muted)" }} />
              : <Volume2 className="h-4 w-4" style={{ color: "var(--fq-muted)" }} />}
            <input
              type="range" min={0} max={100} value={volume}
              onChange={(e) => setVolume(Number(e.target.value))}
              className="h-1 w-28 cursor-pointer appearance-none rounded-full bg-white/15"
              style={{ accentColor: "var(--fq-acc)" }}
              aria-label="Громкость"
            />
            <button
              type="button"
              onClick={() => setVolume((v) => Math.min(100, v + 5))}
              className="grid h-7 w-7 place-items-center rounded-full border transition-colors hover:bg-white/5"
              style={{ borderColor: "var(--fq-border)", color: "var(--fq-text)" }}
              aria-label="Громче"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
            <span className="min-w-[34px] text-right font-mono text-[10px] uppercase tracking-widest" style={{ color: "var(--fq-muted)" }}>{volume}%</span>
          </div>
          <StatBadge icon={Star} value={points} label="очки" />
          <StatBadge icon={Flame} value={streak} label="стрик" />
          <div
            className="rounded-full border px-4 py-1.5 font-mono text-xs font-bold tracking-widest"
            style={{ borderColor: "var(--fq-border)", background: "var(--fq-panel)", color: "var(--fq-acc)" }}
          >
            Lv.{level}
            <div className="mt-1 h-0.5 w-16 overflow-hidden rounded-full bg-white/10">
              <div className="h-full" style={{ width: `${(correct % 5) * 20}%`, background: "var(--fq-acc)" }} />
            </div>
          </div>
          <div
            className="ml-auto rounded-full border px-4 py-1.5 font-mono text-[11px] uppercase tracking-widest"
            style={{ borderColor: "var(--fq-border)", background: "var(--fq-panel)", color: "var(--fq-muted)" }}
          >
            Сложность · <span style={{ color: "var(--fq-acc)" }}>{diff.name}</span>
          </div>
        </div>

        {/* Body */}
        {mode === null && !finished && (
          <Lobby theme={theme} diffName={diff.name} onPlay={() => start("ranked")} onPractice={() => start("practice")} onSettings={() => setSettingsOpen(true)} />
        )}
        {inGame && (
          <PlayScreen
            round={round}
            rounds={rounds}
            target={target}
            guess={guess}
            answered={answered}
            playing={playing}
            compare={compare}
            mode={mode!}
            diff={diff}
            viz={viz}
            onVizChange={setViz}
            allowedTargets={targetsForDifficulty()}
            onGuess={(f) => answered === null && setGuess(f)}
            onSubmit={submit}
            onReplay={() => playPreview(target)}
            onHoldStart={(boosted) => startHold(target, boosted)}
            onHoldEnd={() => stopSustained()}
            onExit={() => { stopSustained(); exit(); }}
          />
        )}
        {finished && (
          <Summary
            correct={correct}
            rounds={rounds}
            avgAcc={Math.round(accSum / rounds)}
            mode={mode!}
            saved={saved}
            signedIn={!!session}
            onAgain={() => start(mode!)}
            onExit={exit}
          />
        )}
      </div>

      {settingsOpen && (
        <SettingsModal
          value={settings}
          onChange={setSettings}
          loops={loops}
          onClose={() => setSettingsOpen(false)}
        />
      )}
      {cheatOpen && <CheatSheetModal onClose={() => setCheatOpen(false)} />}
      <PerfectionFlash trigger={bonusFlash} />
    </div>
  );
}

/* ---------- pieces ---------- */

function StatBadge({ icon: Icon, value, label }: { icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>; value: number; label: string }) {
  return (
    <div className="flex items-center gap-2 rounded-full border px-4 py-1.5" style={{ borderColor: "var(--fq-border)", background: "var(--fq-panel)" }}>
      <Icon className="h-3.5 w-3.5" style={{ color: "var(--fq-acc)" }} />
      <div className="text-right leading-tight">
        <div className="font-mono text-sm font-black text-white">{value}</div>
        <div className="font-mono text-[9px] uppercase tracking-widest" style={{ color: "var(--fq-muted)" }}>{label}</div>
      </div>
    </div>
  );
}

function snapToNearest(f: number, targets: number[]) {
  let best = targets[0];
  let bestD = Infinity;
  for (const t of targets) {
    const d = Math.abs(Math.log2(t / f));
    if (d < bestD) { bestD = d; best = t; }
  }
  return best;
}

function Lobby({
  theme, diffName, onPlay, onPractice, onSettings,
}: { theme: FrequencyTheme; diffName: string; onPlay: () => void; onPractice: () => void; onSettings: () => void }) {
  return (
    <div className="mt-6 rounded-2xl border bg-black/40 p-8 backdrop-blur md:p-12" style={{ borderColor: "var(--fq-border)" }}>
      <div className="text-center">
        <div className="inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.35em]" style={{ color: "var(--fq-acc)" }}>
          <span>EQ тренажёр</span>
          <span style={{ color: "var(--fq-muted)" }}>·</span>
          <span style={{ color: "var(--fq-muted)" }}>{theme.tier}</span>
        </div>
        <h1 className="mt-6 text-4xl font-black leading-[1.05] tracking-tight md:text-6xl">
          Услышь{" "}
          <span className="bg-clip-text text-transparent" style={{ backgroundImage: theme.heroGradient }}>любую</span>
          <br />частоту
        </h1>
        <p className="mx-auto mt-5 max-w-xl text-sm leading-relaxed md:text-base" style={{ color: "var(--fq-muted)" }}>
          Слушай сигнал с поднятой частотой и веди курсором по шкале, чтобы указать её.
          Правая кнопка мыши — сравнение с оригиналом. Текущая сложность: <b style={{ color: "var(--fq-acc)" }}>{diffName}</b>.
        </p>
      </div>

      <div className="mx-auto mt-10 grid max-w-3xl grid-cols-1 gap-4 md:grid-cols-3">
        <button
          type="button" onClick={onPlay}
          className="group relative overflow-hidden rounded-2xl p-6 text-left transition-all hover:-translate-y-1"
          style={{ background: theme.heroGradient, boxShadow: "0 20px 60px -20px var(--fq-acc)" }}
        >
          <Target className="h-7 w-7 text-black/80" />
          <div className="mt-16 text-xl font-black text-black">Играть</div>
          <div className="mt-1 text-xs font-medium text-black/70">Ranked · очки в рейтинг</div>
        </button>
        <button
          type="button" onClick={onPractice}
          className="group relative overflow-hidden rounded-2xl border p-6 text-left transition-all hover:-translate-y-1"
          style={{ borderColor: "var(--fq-border)", background: "var(--fq-panel)" }}
        >
          <Settings2 className="h-7 w-7" style={{ color: "var(--fq-muted)" }} />
          <div className="mt-16 text-xl font-black text-white">Тренировка</div>
          <div className="mt-1 text-xs" style={{ color: "var(--fq-muted)" }}>Без записи в рейтинг</div>
        </button>
        <button
          type="button" onClick={onSettings}
          className="group relative overflow-hidden rounded-2xl border p-6 text-left transition-all hover:-translate-y-1"
          style={{ borderColor: "var(--fq-border)", background: "var(--fq-panel)" }}
        >
          <Sliders className="h-7 w-7" style={{ color: "var(--fq-acc)" }} />
          <div className="mt-16 text-xl font-black text-white">Настроить</div>
          <div className="mt-1 text-xs" style={{ color: "var(--fq-muted)" }}>Сложность, раунды, буст</div>
        </button>
      </div>
    </div>
  );
}

function PlayScreen({
  round, rounds, target, guess, answered, playing, compare, mode, diff, viz, onVizChange, allowedTargets,
  onGuess, onSubmit, onReplay, onHoldStart, onHoldEnd, onExit,
}: {
  round: number; rounds: number; target: number | null; guess: number;
  answered: null | { correct: boolean; accuracy: number; tip: FrequencyTip };
  playing: boolean; compare: boolean; mode: Mode; diff: (typeof DIFFICULTY)[Difficulty];
  viz: VizMode; onVizChange: (v: VizMode) => void;
  allowedTargets: number[];
  onGuess: (f: number) => void; onSubmit: () => void; onReplay: () => void;
  onHoldStart: (boosted: boolean) => void; onHoldEnd: () => void; onExit: () => void;
}) {
  return (
    <div className="mt-6 rounded-2xl border bg-black/40 p-6 backdrop-blur md:p-8" style={{ borderColor: "var(--fq-border)" }}>
      <div className="flex items-center justify-between">
        <div className="font-mono text-[11px] uppercase tracking-[0.3em]" style={{ color: "var(--fq-muted)" }}>
          {mode === "ranked" ? "Ranked" : "Practice"} · Раунд {round}/{rounds} · {diff.name}
        </div>
        <button type="button" onClick={onExit} className="font-mono text-[11px] uppercase tracking-widest hover:text-white" style={{ color: "var(--fq-muted)" }}>
          Выйти
        </button>
      </div>

      <div className="mt-3 flex items-center justify-between gap-4">
        <div className="text-lg font-bold text-white md:text-xl">
          Какая частота <span style={{ color: "var(--fq-acc)" }}>поднята</span> в этом звуке?
        </div>
        <div className="hidden font-mono text-[11px] uppercase tracking-widest md:block" style={{ color: "var(--fq-muted)" }}>
          зажми <b style={{ color: "var(--fq-acc)" }}>ПКМ</b> на графике — играет пока держишь
        </div>
      </div>

      {/* Visualization mode picker */}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <span className="font-mono text-[10px] uppercase tracking-widest" style={{ color: "var(--fq-muted)" }}>Метрика:</span>
        {VIZ_OPTIONS.map((o) => {
          const active = o.id === viz;
          return (
            <button
              key={o.id}
              type="button"
              onClick={() => onVizChange(o.id)}
              title={o.hint}
              className="rounded-full border px-3 py-1 text-[11px] font-bold uppercase tracking-widest transition-all"
              style={active
                ? { borderColor: "var(--fq-acc)", background: "var(--fq-acc)", color: "var(--fq-acc-ink)" }
                : { borderColor: "var(--fq-border)", background: "var(--fq-panel)", color: "var(--fq-text)" }}
            >
              {o.name}
            </button>
          );
        })}
        <span className="ml-auto hidden font-mono text-[10px] uppercase tracking-widest md:inline" style={{ color: playing || compare ? "var(--fq-acc)" : "var(--fq-muted)" }}>
          {compare ? "A · оригинал" : playing ? "Б · с бустом" : "тишина"}
        </span>
      </div>

      {/* EQ chart with overlaid visualizer */}
      <div className="mt-3">
        <EqChart
          target={target}
          guess={guess}
          answered={answered}
          compare={compare}
          playing={playing}
          viz={viz}
          onGuess={onGuess}
          onHoldStart={onHoldStart}
          onHoldEnd={onHoldEnd}
          snapPoints={diff.snap ? allowedTargets : null}
        />
      </div>

      {/* Controls */}
      <div className="mt-6 flex flex-col items-center gap-3">
        <div className="flex items-center gap-4">
          <button
            type="button" onClick={onReplay} disabled={answered !== null}
            className="grid h-14 w-14 place-items-center rounded-full transition-all disabled:opacity-40"
            style={{
              background: "transparent",
              border: "2px solid var(--fq-acc)",
              color: "var(--fq-acc)",
              boxShadow: playing ? "var(--fq-acc-glow)" : "none",
            }}
            aria-label="Play"
          >
            <Play className="h-5 w-5" fill="currentColor" />
          </button>
          <button
            type="button"
            onMouseDown={(e) => { if (e.button === 0) onHoldStart(false); }}
            onMouseUp={onHoldEnd}
            onMouseLeave={onHoldEnd}
            onTouchStart={() => onHoldStart(false)}
            onTouchEnd={onHoldEnd}
            disabled={answered !== null}
            className="rounded-2xl border px-6 py-3 text-sm font-bold uppercase tracking-widest transition-all disabled:opacity-40"
            style={
              compare
                ? { borderColor: "var(--fq-acc)", background: "var(--fq-acc)", color: "var(--fq-acc-ink)" }
                : { borderColor: "var(--fq-border)", background: "var(--fq-panel)", color: "var(--fq-text)" }
            }
          >
            A / Б <span className="ml-2 font-normal normal-case tracking-normal opacity-70">удерживай — оригинал</span>
          </button>
        </div>
        <div className="font-mono text-[11px] uppercase tracking-widest" style={{ color: "var(--fq-muted)" }}>
          {compare ? "Играет оригинал (без буста)" : playing ? "Слушай — идёт сигнал" : answered ? " " : "▶ короткий превью · ПКМ по графику — держать сигнал"}
        </div>
      </div>


      {/* Answer feedback */}
      {answered && (
        <div className="mt-6 rounded-2xl border p-5" style={{
          borderColor: answered.correct ? "var(--fq-acc)" : "var(--fq-danger)",
          background: answered.correct ? "var(--fq-acc-soft)" : "color-mix(in oklab, var(--fq-danger) 12%, transparent)",
        }}>
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-full" style={{
              background: answered.correct ? "var(--fq-acc)" : "var(--fq-danger)",
              color: answered.correct ? "var(--fq-acc-ink)" : "#000",
            }}>
              {answered.correct ? <Check className="h-5 w-5" /> : <X className="h-5 w-5" />}
            </div>
            <div className="flex-1">
              <div className="font-bold" style={{ color: answered.correct ? "var(--fq-acc)" : "var(--fq-danger)" }}>
                {answered.correct ? "Верно!" : "Мимо"}
              </div>
              <div className="font-mono text-xs" style={{ color: "var(--fq-muted)" }}>
                Цель: {formatHz(target ?? 0)} · Точность: {answered.accuracy}%
              </div>
            </div>
            <div className="hidden font-mono text-2xl font-black md:block" style={{ color: answered.correct ? "var(--fq-acc)" : "var(--fq-danger)" }}>
              {answered.accuracy}%
            </div>
          </div>
          <div className="mt-3 flex items-start gap-3 rounded-xl border p-3" style={{ borderColor: "var(--fq-border)", background: "rgba(0,0,0,0.25)" }}>
            <Lightbulb className="mt-0.5 h-4 w-4 shrink-0" style={{ color: "var(--fq-acc)" }} />
            <div className="text-sm leading-relaxed" style={{ color: "var(--fq-text)" }}>
              <div className="mb-1 text-xs font-bold uppercase tracking-widest" style={{ color: "var(--fq-acc)" }}>{answered.tip.title}</div>
              {answered.tip.body}
            </div>
          </div>
        </div>
      )}

      {/* Confirm button */}
      {!answered && (
        <div className="mt-6 flex justify-center">
          <button
            type="button" onClick={onSubmit}
            className="rounded-full px-10 py-3 font-bold transition-all"
            style={{ background: "var(--fq-acc)", color: "var(--fq-acc-ink)", boxShadow: "var(--fq-acc-glow)" }}
          >
            Ответить · {formatHz(diff.snap ? snapToNearest(guess, allowedTargets) : guess)}
          </button>
        </div>
      )}
    </div>
  );
}

/* ------------- EQ Chart ------------- */

function EqChart({
  target, guess, answered, compare, playing, viz, onGuess, onHoldStart, onHoldEnd, snapPoints,
}: {
  target: number | null; guess: number;
  answered: null | { correct: boolean; accuracy: number; tip: FrequencyTip };
  compare: boolean;
  playing: boolean;
  viz: VizMode;
  onGuess: (f: number) => void;
  onHoldStart: (boosted: boolean) => void;
  onHoldEnd: () => void;
  snapPoints: number[] | null;
}) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const draggingRef = useRef(false);
  const rmbRef = useRef(false);

  const setFromClientX = useCallback((clientX: number) => {
    const el = wrapRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const pct = Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100));
    onGuess(pctToFreq(pct));
  }, [onGuess]);

  const onPointerDown = (e: React.PointerEvent) => {
    if (answered) return;
    if (e.button === 2) {
      rmbRef.current = true;
      draggingRef.current = true;
      (e.target as Element).setPointerCapture?.(e.pointerId);
      onHoldStart(true); // hold RMB → sustained boosted signal (A/B target)
      setFromClientX(e.clientX); // allow sweeping the marker while listening
      e.preventDefault();
      return;
    }
    draggingRef.current = true;
    (e.target as Element).setPointerCapture?.(e.pointerId);
    setFromClientX(e.clientX);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (draggingRef.current && !answered) setFromClientX(e.clientX);
  };
  const onPointerUp = (e: React.PointerEvent) => {
    if (rmbRef.current) { rmbRef.current = false; onHoldEnd(); }
    draggingRef.current = false;
    (e.target as Element).releasePointerCapture?.(e.pointerId);
  };


  // For rendering: the marker position — snapped visually only after answer
  const displayFreq = answered && snapPoints ? snapToNearest(guess, snapPoints) : guess;
  const markerPct = freqToPct(displayFreq);
  const targetPct = target !== null ? freqToPct(target) : 50;

  // Bell curve path for post-answer view
  const bellPath = useMemo(() => {
    if (target === null) return "";
    // sample 200 points across width
    const width = 1000;
    const height = 300;
    const midY = height / 2;
    const boostPx = 90; // corresponds to ~+12 dB visual
    const q = 0.35; // width of bell in octaves
    const pts: string[] = [];
    for (let i = 0; i <= 200; i++) {
      const pct = (i / 200) * 100;
      const f = pctToFreq(pct);
      const octDist = Math.log2(f / target);
      const gauss = Math.exp(-(octDist * octDist) / (2 * q * q));
      const x = (pct / 100) * width;
      const y = midY - gauss * boostPx;
      pts.push(`${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`);
    }
    return pts.join(" ");
  }, [target]);

  const ticks = [20, 63, 125, 250, 500, 1000, 2000, 4000, 8000, 16000, 20000];
  const dbLines = [-24, -12, -4, 0, 4, 12, 24];

  return (
    <div
      ref={wrapRef}
      className="relative w-full select-none touch-none"
      style={{
        aspectRatio: "1000 / 320",
        borderRadius: "18px",
        border: "1px solid var(--fq-border)",
        background: "linear-gradient(180deg, rgba(255,255,255,0.02), rgba(0,0,0,0.35))",
        cursor: answered ? "default" : "ew-resize",
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onContextMenu={(e) => e.preventDefault()}
    >
      <svg viewBox="0 0 1000 320" preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
        {/* dB grid */}
        {dbLines.map((db) => {
          const y = 160 - (db / 24) * 130;
          return (
            <g key={db}>
              <line x1={0} x2={1000} y1={y} y2={y}
                stroke={db === 0 ? "rgba(255,255,255,0.18)" : "rgba(255,255,255,0.06)"}
                strokeDasharray={db === 0 ? "0" : "3 5"} />
              <text x={8} y={y - 3} fontSize="10" fontFamily="ui-monospace, monospace" fill="rgba(255,255,255,0.35)">
                {db > 0 ? `+${db}` : db}
              </text>
            </g>
          );
        })}
        {/* freq ticks */}
        {ticks.map((f) => {
          const x = (freqToPct(f) / 100) * 1000;
          return (
            <g key={f}>
              <line x1={x} x2={x} y1={0} y2={290} stroke="rgba(255,255,255,0.04)" />
              <text x={x} y={310} textAnchor="middle" fontSize="10" fontFamily="ui-monospace, monospace" fill="rgba(255,255,255,0.4)">
                {f >= 1000 ? `${f / 1000}k` : f}
              </text>
            </g>
          );
        })}

        {/* Flat 0 dB line (accent) */}
        <line x1={0} x2={1000} y1={160} y2={160} stroke="var(--fq-acc)" strokeWidth="2" opacity={answered ? 0.35 : 0.9} />

        {/* Bell curve when revealed */}
        {answered && (
          <>
            <path d={`${bellPath} L1000,160 L0,160 Z`} fill="var(--fq-acc)" opacity="0.15" />
            <path d={bellPath} stroke="var(--fq-acc)" strokeWidth="2.5" fill="none" style={{ filter: "drop-shadow(0 0 8px var(--fq-acc))" }} />
          </>
        )}

        {/* Target marker (visible only after answer) */}
        {answered && target !== null && (
          <line x1={(targetPct / 100) * 1000} x2={(targetPct / 100) * 1000} y1={30} y2={290}
            stroke="var(--fq-acc)" strokeWidth="1" strokeDasharray="4 4" opacity="0.7" />
        )}
      </svg>

      {/* Live signal overlay — sits ON the graph, not below.
          Spectrum/spectrogram would reveal the boosted target band, so while
          the round is unanswered we force a time-domain view (wave/meter) and
          hide the frequency highlight. After the answer is submitted we
          restore the user's chosen visualization. */}
      <div className="pointer-events-none absolute inset-x-0 top-3 bottom-8 opacity-90">
        <SignalVisualizer
          active={playing || compare}
          mode={answered ? viz : (viz === "spectrum" || viz === "spectrogram" ? "wave" : viz)}
          transparent
          highlightHz={answered ? target : null}
          height={"100%" as unknown as number}
        />
      </div>

      {/* Guess marker (orange band) */}
      <div
        className="pointer-events-none absolute top-3 bottom-8"
        style={{
          left: `calc(${markerPct}% - 12px)`,
          width: "24px",
          borderLeft: "2px solid #ff8a3d",
          borderRight: "2px solid #ff8a3d",
          background: "linear-gradient(180deg, rgba(255,138,61,0.18), rgba(255,138,61,0.05))",
          borderRadius: "4px",
          boxShadow: "0 0 20px rgba(255,138,61,0.35)",
          transition: answered ? "left 260ms cubic-bezier(.2,.7,.2,1)" : "none",
        }}
      >
        {answered && (
          <div
            className="absolute -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md px-2 py-0.5 font-mono text-[11px] font-bold"
            style={{
              background: answered.correct ? "var(--fq-acc)" : "var(--fq-danger)",
              color: answered.correct ? "var(--fq-acc-ink)" : "#000",
            }}
          >
            {formatHz(target ?? 0)} {answered.correct ? "✓" : "✗"}
          </div>
        )}
      </div>

      {/* Snap ticks (visible while scrubbing on easy/medium) */}
      {snapPoints && !answered && (
        <div className="pointer-events-none absolute inset-x-0 top-3 bottom-8">
          {snapPoints.map((f) => (
            <div key={f} className="absolute h-2 w-px" style={{
              left: `${freqToPct(f)}%`, top: 0, background: "rgba(255,255,255,0.25)",
            }} />
          ))}
        </div>
      )}

      {/* Bottom hint */}
      <div className="pointer-events-none absolute bottom-1 left-3 font-mono text-[10px] uppercase tracking-widest" style={{ color: "var(--fq-muted)" }}>
        {answered ? " " : "ЛКМ — веди курсор · ПКМ — держать сигнал"}
      </div>
      <div className="pointer-events-none absolute bottom-1 right-3 font-mono text-[10px] font-bold" style={{ color: "var(--fq-acc)" }}>
        {playing ? "▲ Б · с бустом" : compare ? "◇ A · оригинал" : "тишина"}
      </div>
    </div>
  );
}

/* ------------- Summary ------------- */

function Summary({
  correct, rounds, avgAcc, mode, saved, signedIn, onAgain, onExit,
}: {
  correct: number; rounds: number; avgAcc: number; mode: Mode; saved: boolean; signedIn: boolean;
  onAgain: () => void; onExit: () => void;
}) {
  return (
    <div className="mx-auto mt-8 max-w-lg rounded-2xl border bg-black/50 p-8 text-center backdrop-blur" style={{ borderColor: "var(--fq-acc)" }}>
      <div className="font-mono text-[10px] uppercase tracking-[0.3em]" style={{ color: "var(--fq-acc)" }}>Session complete</div>
      <div className="mt-3 font-mono text-6xl font-black">
        {correct}<span className="text-slate-700">/{rounds}</span>
      </div>
      <div className="mt-2 font-mono text-sm" style={{ color: "var(--fq-muted)" }}>
        Средняя точность · <b style={{ color: "var(--fq-acc)" }}>{avgAcc}%</b>
      </div>
      <p className="mt-3 text-sm" style={{ color: "var(--fq-muted)" }}>
        {avgAcc >= 85 ? "Золотые уши. 🏆" : avgAcc >= 60 ? "Хороший результат — продолжай." : "Слух тренируется — попробуй ещё."}
      </p>
      {mode === "ranked" && signedIn && (
        <p className="mt-2 font-mono text-xs" style={{ color: "var(--fq-acc)" }}>{saved ? `+${Math.round(avgAcc * rounds / 10)} XP saved` : "Saving…"}</p>
      )}
      {mode === "ranked" && !signedIn && (
        <p className="mt-2 text-xs" style={{ color: "var(--fq-muted)" }}>
          <Link to="/auth" className="underline">Войдите</Link>, чтобы XP шло в рейтинг.
        </p>
      )}
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <button type="button" onClick={onAgain} className="inline-flex items-center gap-2 rounded-full px-6 py-2.5 text-sm font-bold" style={{ background: "var(--fq-acc)", color: "var(--fq-acc-ink)" }}>
          <RotateCcw className="h-3.5 w-3.5" /> Ещё раз
        </button>
        <button type="button" onClick={onExit} className="rounded-full border px-6 py-2.5 text-sm font-semibold" style={{ borderColor: "var(--fq-border)", color: "var(--fq-text)" }}>
          В меню
        </button>
      </div>
    </div>
  );
}

/* ------------- Settings Modal ------------- */

const SOURCE_OPTIONS: { id: NoiseSource; name: string; hint: string }[] = [
  { id: "pink",  name: "Розовый шум", hint: "Классика — равномерный по октавам" },
  { id: "white", name: "Белый шум",   hint: "Больше верха, жёстче на слух" },
  { id: "music", name: "Музыка",      hint: "Синт-пад — как в реальном миксе" },
  { id: "loop",  name: "Мой луп",     hint: "Твой загруженный аудио-фрагмент" },
];

function SettingsModal({ value, onChange, loops, onClose }: {
  value: Settings; onChange: (s: Settings) => void; loops: LoopRow[]; onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4 backdrop-blur">
      <div className="w-full max-w-md rounded-2xl border p-6 shadow-2xl max-h-[92vh] overflow-y-auto" style={{ borderColor: "var(--fq-border)", background: "var(--fq-bg)" }}>
        <div className="flex items-center justify-between">
          <div className="font-bold text-white">Настройки тренажёра</div>
          <button type="button" onClick={onClose} className="rounded-full p-1 hover:bg-white/10" aria-label="Закрыть">
            <X className="h-4 w-4" style={{ color: "var(--fq-muted)" }} />
          </button>
        </div>

        <div className="mt-5">
          <div className="mb-2 font-mono text-[10px] uppercase tracking-widest" style={{ color: "var(--fq-muted)" }}>Сложность · допуск ±%</div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {(Object.keys(DIFFICULTY) as Difficulty[]).map((d) => {
              const active = value.difficulty === d;
              return (
                <button
                  key={d} type="button"
                  onClick={() => onChange({ ...value, difficulty: d })}
                  className="rounded-xl border px-3 py-2 text-sm font-bold"
                  style={active
                    ? { borderColor: "var(--fq-acc)", background: "var(--fq-acc-soft)", color: "var(--fq-acc)" }
                    : { borderColor: "var(--fq-border)", background: "var(--fq-panel)", color: "var(--fq-text)" }}
                >
                  {DIFFICULTY[d].name}
                  <div className="mt-0.5 font-mono text-[9px] uppercase tracking-widest opacity-70">{DIFFICULTY[d].tier}</div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="mt-5">
          <div className="mb-2 font-mono text-[10px] uppercase tracking-widest" style={{ color: "var(--fq-muted)" }}>Источник сигнала</div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {SOURCE_OPTIONS.map((s) => {
              const active = value.source === s.id;
              const disabled = s.id === "loop" && loops.length === 0;
              return (
                <button
                  key={s.id} type="button"
                  disabled={disabled}
                  onClick={() => onChange({ ...value, source: s.id, loopId: s.id === "loop" ? (value.loopId ?? loops[0]?.id) : value.loopId })}
                  className="rounded-xl border px-2 py-2 text-xs font-bold disabled:opacity-40"
                  title={disabled ? "Загрузите луп в админке → Лупы" : s.hint}
                  style={active
                    ? { borderColor: "var(--fq-acc)", background: "var(--fq-acc-soft)", color: "var(--fq-acc)" }
                    : { borderColor: "var(--fq-border)", background: "var(--fq-panel)", color: "var(--fq-text)" }}
                >
                  {s.name}
                </button>
              );
            })}
          </div>

          {value.source === "loop" && (
            <div className="mt-3 space-y-2">
              {loops.length === 0 ? (
                <div className="rounded-xl border px-3 py-2 text-[11px]" style={{ borderColor: "var(--fq-border)", color: "var(--fq-muted)" }}>
                  Нет активных лупов. Загрузи файл в разделе <span className="font-mono">Админ → Лупы</span> — он появится здесь автоматически.
                </div>
              ) : (
                <>
                  <div className="font-mono text-[10px] uppercase tracking-widest" style={{ color: "var(--fq-muted)" }}>Выбрать луп</div>
                  <select
                    value={value.loopId ?? loops[0]?.id ?? ""}
                    onChange={(e) => onChange({ ...value, loopId: e.target.value })}
                    className="w-full rounded-xl border px-3 py-2 text-xs"
                    style={{ borderColor: "var(--fq-border)", background: "var(--fq-panel)", color: "var(--fq-text)" }}
                  >
                    {loops.map((l) => (
                      <option key={l.id} value={l.id}>
                        [{l.category}] {l.title}{l.bpm ? ` · ${l.bpm} BPM` : ""}{l.key ? ` · ${l.key}` : ""}
                      </option>
                    ))}
                  </select>
                  <div className="text-[11px]" style={{ color: "var(--fq-muted)" }}>
                    EQ-буст применится к твоему лупу — так тренируешь слух на реальном материале.
                  </div>
                </>
              )}
            </div>
          )}
        </div>


        <label className="mt-5 flex cursor-pointer items-center justify-between rounded-xl border px-3 py-2.5" style={{ borderColor: "var(--fq-border)", background: "var(--fq-panel)" }}>
          <div>
            <div className="text-sm font-bold text-white">Режим «телефон»</div>
            <div className="mt-0.5 text-[11px]" style={{ color: "var(--fq-muted)" }}>
              Полоса 300 Гц – 4 кГц. Тренирует слух «как из смартфона».
            </div>
          </div>
          <input
            type="checkbox"
            checked={value.phone}
            onChange={(e) => onChange({ ...value, phone: e.target.checked })}
            className="h-5 w-5 cursor-pointer"
            style={{ accentColor: "var(--fq-acc)" }}
          />
        </label>

        <div className="mt-5">
          <div className="mb-2 flex items-center justify-between font-mono text-[10px] uppercase tracking-widest" style={{ color: "var(--fq-muted)" }}>
            <span>Раундов в сессии</span>
            <span style={{ color: "var(--fq-acc)" }}>{value.rounds}</span>
          </div>
          <input
            type="range" min={4} max={20} step={1}
            value={value.rounds}
            onChange={(e) => onChange({ ...value, rounds: Number(e.target.value) })}
            className="h-1 w-full appearance-none rounded-full bg-white/15"
            style={{ accentColor: "var(--fq-acc)" }}
          />
        </div>

        <div className="mt-5">
          <div className="mb-2 flex items-center justify-between font-mono text-[10px] uppercase tracking-widest" style={{ color: "var(--fq-muted)" }}>
            <span>Величина буста, дБ</span>
            <span style={{ color: "var(--fq-acc)" }}>+{value.boostDb}</span>
          </div>
          <input
            type="range" min={3} max={24} step={1}
            value={value.boostDb}
            onChange={(e) => onChange({ ...value, boostDb: Number(e.target.value) })}
            className="h-1 w-full appearance-none rounded-full bg-white/15"
            style={{ accentColor: "var(--fq-acc)" }}
          />
          <div className="mt-1 text-[11px]" style={{ color: "var(--fq-muted)" }}>
            Чем меньше буст — тем труднее услышать поднятую полосу.
          </div>
        </div>

        <div className="mt-5">
          <div className="mb-2 flex items-center justify-between font-mono text-[10px] uppercase tracking-widest" style={{ color: "var(--fq-muted)" }}>
            <span>Q · ширина полосы</span>
            <span style={{ color: "var(--fq-acc)" }}>{value.q.toFixed(1)}</span>
          </div>
          <input
            type="range" min={0.5} max={8} step={0.1}
            value={value.q}
            onChange={(e) => onChange({ ...value, q: Number(e.target.value) })}
            className="h-1 w-full appearance-none rounded-full bg-white/15"
            style={{ accentColor: "var(--fq-acc)" }}
          />
          <div className="mt-1 text-[11px]" style={{ color: "var(--fq-muted)" }}>
            Меньше Q — шире, легче услышать. Больше Q — уже и точнее.
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-full px-5 py-2 text-sm font-bold" style={{ background: "var(--fq-acc)", color: "var(--fq-acc-ink)" }}>
            Готово
          </button>
        </div>
      </div>
    </div>
  );
}

/* ------------- Cheat Sheet Modal ------------- */

function CheatSheetModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/75 p-4 backdrop-blur" onClick={onClose}>
      <div
        className="w-full max-w-2xl rounded-2xl border p-6 shadow-2xl max-h-[92vh] overflow-y-auto"
        style={{ borderColor: "var(--fq-border)", background: "var(--fq-bg)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <div>
            <div className="font-mono text-[10px] uppercase tracking-[0.3em]" style={{ color: "var(--fq-acc)" }}>Reference</div>
            <div className="mt-1 text-lg font-bold text-white">Что живёт на этих частотах</div>
          </div>
          <button type="button" onClick={onClose} className="rounded-full p-1 hover:bg-white/10" aria-label="Закрыть">
            <X className="h-4 w-4" style={{ color: "var(--fq-muted)" }} />
          </button>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {CHEATSHEET.map((row) => (
            <div
              key={row.hz}
              className="rounded-xl border p-3"
              style={{ borderColor: "var(--fq-border)", background: "var(--fq-panel)" }}
            >
              <div className="font-mono text-sm font-black" style={{ color: "var(--fq-acc)" }}>{row.label}</div>
              <div className="mt-1 flex items-start gap-2 text-xs">
                <span className="mt-0.5" style={{ color: "var(--fq-acc)" }}>+</span>
                <span className="text-white">{row.positive}</span>
              </div>
              <div className="mt-1 flex items-start gap-2 text-xs">
                <span className="mt-0.5" style={{ color: "var(--fq-danger)" }}>−</span>
                <span style={{ color: "var(--fq-muted)" }}>{row.negative}</span>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-5">
          <div className="mb-2 font-mono text-[10px] uppercase tracking-widest" style={{ color: "var(--fq-muted)" }}>Якорные звуки — запомни их, чтобы «прицеливаться»</div>
          <ul className="space-y-1.5">
            {ANCHORS.map((a) => (
              <li key={a.hz} className="flex items-baseline gap-3 text-sm">
                <span className="font-mono font-black min-w-[64px]" style={{ color: "var(--fq-acc)" }}>{formatHz(a.hz)}</span>
                <span style={{ color: "var(--fq-text)" }}>{a.sound}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="mt-5 rounded-xl border p-3 text-[12px] leading-relaxed" style={{ borderColor: "var(--fq-border)", background: "rgba(0,0,0,0.25)", color: "var(--fq-muted)" }}>
          Совет: не пытайся угадать точку — «свипуй» ушами от низа к верху и лови, где сигнал «выпирает». В сомнении — удерживай <b style={{ color: "var(--fq-acc)" }}>A/Б</b>, чтобы сравнить с оригиналом.
        </div>

        <div className="mt-5 flex justify-end">
          <button type="button" onClick={onClose} className="rounded-full px-5 py-2 text-sm font-bold" style={{ background: "var(--fq-acc)", color: "var(--fq-acc-ink)" }}>
            Понятно
          </button>
        </div>
      </div>
    </div>
  );
}

/* ------------- Perfection Bonus Flash ------------- */

function PerfectionFlash({ trigger }: { trigger: number }) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    if (trigger <= 0) return;
    setShow(true);
    const t = window.setTimeout(() => setShow(false), 1600);
    return () => window.clearTimeout(t);
  }, [trigger]);
  if (!show) return null;
  return (
    <div className="pointer-events-none fixed inset-0 z-[60] grid place-items-center">
      <div
        className="flex items-center gap-3 rounded-2xl border px-8 py-5 font-black shadow-2xl"
        style={{
          borderColor: "var(--fq-acc)",
          background: "color-mix(in oklab, var(--fq-acc) 22%, black)",
          color: "var(--fq-acc-ink)",
          boxShadow: "0 0 60px var(--fq-acc)",
          animation: "peakmaster-perf-pop 1.6s cubic-bezier(.2,.7,.2,1)",
        }}
      >
        <Sparkles className="h-6 w-6" />
        <div className="flex flex-col leading-none">
          <span className="font-mono text-[10px] uppercase tracking-[0.3em] opacity-80">Perfection</span>
          <span className="mt-1 text-2xl">+{PERFECTION_BONUS} bonus</span>
        </div>
      </div>
      <style>{`
        @keyframes peakmaster-perf-pop {
          0%   { transform: scale(0.6) translateY(20px); opacity: 0; }
          15%  { transform: scale(1.05) translateY(0);   opacity: 1; }
          80%  { transform: scale(1);   opacity: 1; }
          100% { transform: scale(1) translateY(-30px);  opacity: 0; }
        }
      `}</style>
    </div>
  );
}
