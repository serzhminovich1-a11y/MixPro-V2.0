import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { TutorialLauncher } from "@/components/games/tutorial-launcher";
import {
  ArrowLeft, Volume2, VolumeX, Plus, Minus, Star, Flame, Target, Settings2, Play, RotateCcw,
  Palette, Lightbulb, Check, X, Sliders, HelpCircle, Sparkles, TrendingUp,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import {
  FREQ_BANDS, getAudioContext, setMasterVolume,
  playSuccessChime, playFailCue, startSustainedMultiBand, playMultiBandPreview,
  type SustainedMultiBand, type NoiseSource, type SignalOptions, type EqPoint,
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
// Was a picker of 4 visualization modes (spectrum/wave/spectrogram/meter).
// Reduced to spectrum-only by request — matches the reference (Mastering
// The Mix's "EQ Academy"): one FFT view with the EQ curve overlaid, no mode
// switcher. viz/onVizChange plumbing below is kept as-is (just never
// exercised anymore) rather than threading a bigger refactor through
// EqChart/SignalVisualizer for a UI-only removal.

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
  toleranceDb: number;    // ± dB tolerance for matching a point's gain
  snap: boolean;
  points: number;         // simultaneous EQ points to place, EQ-Academy-style
}> = {
  easy:   { name: "Легко",  tier: "±25%",  tolerancePct: 25, toleranceOct: Math.log2(1.25),  toleranceDb: 10,  snap: true,  points: 1 },
  medium: { name: "Средне", tier: "±15%",  tolerancePct: 15, toleranceOct: Math.log2(1.15),  toleranceDb: 6,   snap: true,  points: 2 },
  hard:   { name: "Сложно", tier: "±5%",   tolerancePct: 5,  toleranceOct: Math.log2(1.05),  toleranceDb: 3,   snap: false, points: 3 },
  god:    { name: "God",    tier: "±2%",   tolerancePct: 2,  toleranceOct: Math.log2(1.02),  toleranceDb: 1.5, snap: false, points: 3 },
};

const HARD_TARGETS = [60, 90, 150, 250, 400, 700, 1000, 1800, 3000, 5000, 8000, 12000];
const EASY_TARGETS = [80, 400, 1000, 4000, 10000];

// ─── Ranked level progression (EQ Academy-style) ───────────────────────────
// Ranked mode doesn't use the manual difficulty picker at all — a
// persistent, ever-growing level (see game_progress) drives an
// auto-scaling difficulty curve instead: wider tolerance/bigger, easier-
// to-hear boosts and a small snap-to-preset target pool at low levels,
// tightening toward exact-frequency, no-snap, near-inaudible boosts from
// a much larger target pool as the level climbs. Session average accuracy
// ≥ LEVEL_UP_THRESHOLD unlocks the next level; it never goes back down.
const LEVEL_UP_THRESHOLD = 70; // % avg accuracy needed to advance a level

type EffDifficulty = {
  name: string;
  tolerancePct: number;
  toleranceOct: number;
  toleranceDb: number;
  snap: boolean;
  boostDb: number;
  q: number;
  targets: number[];
  points: number; // simultaneous EQ points — 1 at low levels, up to 3 at high
};

function levelDifficulty(level: number): EffDifficulty {
  const tolerancePct = Math.round(3 + 22 * Math.exp(-(level - 1) / 12));
  const toleranceDb = Math.round((2 + 6 * Math.exp(-(level - 1) / 12)) * 10) / 10;
  const boostDb = Math.round((4 + 8 * Math.exp(-(level - 1) / 15)) * 10) / 10;
  const q = Math.round((1.5 + Math.min(6.5, (level - 1) * 0.18)) * 10) / 10;
  const targets = level <= 5 ? EASY_TARGETS : level <= 15 ? FREQ_BANDS.map((b) => b.freq) : HARD_TARGETS;
  // Mirrors EQ Academy's own progression — single-parameter adjustments at
  // the start, more simultaneous points introduced as levels climb.
  const points = level <= 5 ? 1 : level <= 15 ? 2 : 3;
  return {
    name: `Уровень ${level}`,
    tolerancePct,
    toleranceOct: Math.log2(1 + tolerancePct / 100),
    toleranceDb,
    snap: level <= 5,
    boostDb,
    q,
    targets,
    points,
  };
}

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

function gainAccuracyPct(guess: number, target: number, toleranceDb: number) {
  const err = Math.abs(guess - target);
  return Math.max(0, Math.min(100, Math.round((1 - err / toleranceDb) * 100)));
}

// Random target EQ points for a round — EQ-Academy-style multi-band
// matching. Picks `n` distinct frequencies from the difficulty's target
// pool, spaced at least ~0.6 octaves apart so the bumps stay visually and
// audibly distinguishable, each with its own randomized gain within the
// round's boost ceiling (never all the same height — otherwise only
// frequency would ever be tested, not gain).
function makeTargetBands(n: number, pool: number[], maxGainDb: number): EqPoint[] {
  const MIN_OCT_GAP = 0.6;
  const chosen: number[] = [];
  const shuffled = [...pool].sort(() => Math.random() - 0.5);
  for (const f of shuffled) {
    if (chosen.length >= n) break;
    const farEnough = chosen.every((c) => Math.abs(Math.log2(f / c)) >= MIN_OCT_GAP);
    if (farEnough) chosen.push(f);
  }
  // Pool too small / too clustered to fill n distinct well-spaced picks —
  // top up with whatever's left rather than shipping fewer points than
  // the difficulty calls for.
  for (const f of shuffled) {
    if (chosen.length >= n) break;
    if (!chosen.includes(f)) chosen.push(f);
  }
  return chosen
    .sort((a, b) => a - b)
    .map((freq) => ({ freq, gainDb: Math.round(randRange(maxGainDb * 0.5, maxGainDb) * 10) / 10 }));
}

function randRange(min: number, max: number) {
  return min + Math.random() * (max - min);
}

// Evenly-spread, low-gain starting points for the player's own curve —
// distinct default positions (not all stacked at 1kHz) so there's
// something visible to grab and drag from turn one.
function defaultGuessBands(n: number): EqPoint[] {
  const starts = [200, 1200, 6000];
  return Array.from({ length: n }, (_, i) => ({ freq: starts[i] ?? 1000 * (i + 1), gainDb: 3 }));
}

// Pairs guess points to target points by sorted frequency rank (simplest,
// matches how a player naturally thinks about "my leftmost dot vs the
// leftmost bump I heard") and averages freq+gain accuracy per pair.
function scoreBands(guessBands: EqPoint[], targetBands: EqPoint[], diff: EffDifficulty) {
  const gs = [...guessBands].sort((a, b) => a.freq - b.freq);
  const ts = [...targetBands].sort((a, b) => a.freq - b.freq);
  let sum = 0;
  let allWithinTolerance = true;
  let worstAcc = 101;
  let worstFreq = ts[0]?.freq ?? 1000;
  for (let i = 0; i < ts.length; i++) {
    const g = gs[i] ?? gs[gs.length - 1];
    const t = ts[i];
    const freqAcc = accuracyPct(g.freq, t.freq, diff.toleranceOct);
    const gainAcc = gainAccuracyPct(g.gainDb, t.gainDb, diff.toleranceDb);
    const bandAcc = (freqAcc + gainAcc) / 2;
    sum += bandAcc;
    if (bandAcc < worstAcc) { worstAcc = bandAcc; worstFreq = t.freq; }
    if (Math.abs(Math.log2(g.freq / t.freq)) > diff.toleranceOct || Math.abs(g.gainDb - t.gainDb) > diff.toleranceDb) {
      allWithinTolerance = false;
    }
  }
  return { accuracy: Math.round(sum / ts.length), correct: allWithinTolerance, worstFreq };
}

function FrequencyGame() {
  const { session } = useAuth();
  const search = Route.useSearch();

  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [mode, setMode] = useState<Mode | null>(null);
  const [targetBands, setTargetBands] = useState<EqPoint[] | null>(null);
  const [round, setRound] = useState(0);
  const [correct, setCorrect] = useState(0);
  const [accSum, setAccSum] = useState(0);
  const [streak, setStreak] = useState(0);
  const [guessBands, setGuessBands] = useState<EqPoint[]>(defaultGuessBands(1));
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
  const [progress, setProgress] = useState<{ level: number; mastery_score: number; sessions_played: number; best_streak: number }>({ level: 1, mastery_score: 0, sessions_played: 0, best_streak: 0 });
  const [peakStreak, setPeakStreak] = useState(0);
  const [leveledUp, setLeveledUp] = useState(false);

  useEffect(() => {
    if (!session) return;
    let alive = true;
    supabase
      .from("game_progress")
      .select("level, mastery_score, sessions_played, best_streak")
      .eq("user_id", session.user.id)
      .eq("game_type", "frequency")
      .maybeSingle()
      .then(({ data }) => {
        if (alive && data) setProgress(data);
      });
    return () => { alive = false; };
  }, [session]);

  const theme = useMemo<FrequencyTheme>(
    () => FREQUENCY_THEMES.find((t) => t.id === themeId) ?? FREQUENCY_THEMES[0],
    [themeId],
  );
  // Ranked mode ignores the manual difficulty picker entirely — driven by
  // the persistent level instead (see levelDifficulty above). Practice
  // mode keeps the existing manual picker untouched.
  const diff: EffDifficulty = useMemo(() => {
    if (mode === "ranked") return levelDifficulty(progress.level);
    const d = DIFFICULTY[settings.difficulty];
    return {
      name: d.name,
      tolerancePct: d.tolerancePct,
      toleranceOct: d.toleranceOct,
      toleranceDb: d.toleranceDb,
      snap: d.snap,
      boostDb: settings.boostDb,
      q: settings.q,
      targets: settings.difficulty === "easy" ? EASY_TARGETS : settings.difficulty === "medium" ? FREQ_BANDS.map((b) => b.freq) : HARD_TARGETS,
      points: d.points,
    };
  }, [mode, progress.level, settings.difficulty, settings.boostDb, settings.q]);
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
      // No more viz-mode restore from localStorage — always spectrum now,
      // and a stale saved choice from before this change (wave/spectrogram/
      // meter) shouldn't silently reappear with no UI left to change it back.
    }
  }, []);

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

  const noiseRef = useRef<SustainedMultiBand | null>(null);

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
      q: diff.q,
      phone: settings.phone,
      loopBuffer: settings.source === "loop" ? loopBuffer ?? undefined : undefined,
    }),
    [settings.source, diff.q, settings.phone, loopBuffer],
  );

  // Whether the ▶-toggled loop was on right before a target-reference hold
  // started, so releasing the hold can resume it — a ref (not state) since
  // it only needs to survive the duration of one hold gesture.
  const wasLoopingRef = useRef(false);

  /** ▶ button — toggles a sustained loop of the player's OWN current
   * guess points ("hear what I've set"). Dragging a point while this is on
   * updates the loop live (see handleGuessChange). */
  function toggleMyLoop() {
    if (answered !== null) return;
    getAudioContext();
    if (playing) {
      stopSustained();
      return;
    }
    stopSustained();
    noiseRef.current = startSustainedMultiBand(guessBands, signalOpts);
    setPlaying(true);
  }

  /** Hold-to-preview the TARGET reference curve (RMB on the chart, or the
   * dedicated hold-button for touch/no-right-click). Releasing resumes the
   * player's own loop if it was playing before the hold started. */
  function holdTarget() {
    if (!targetBands || answered !== null) return;
    getAudioContext();
    wasLoopingRef.current = playing;
    if (noiseRef.current) { noiseRef.current.stop(); noiseRef.current = null; }
    noiseRef.current = startSustainedMultiBand(targetBands, signalOpts);
    setCompare(true);
  }
  function holdTargetEnd() {
    if (noiseRef.current) { noiseRef.current.stop(); noiseRef.current = null; }
    setCompare(false);
    if (wasLoopingRef.current) {
      noiseRef.current = startSustainedMultiBand(guessBands, signalOpts);
      setPlaying(true);
    } else {
      setPlaying(false);
    }
  }

  /** Called on every point drag update — keeps state and (if the loop is
   * currently playing) the live audio in sync in one place. */
  function handleGuessChange(next: EqPoint[]) {
    setGuessBands(next);
    if (playing && !compare) noiseRef.current?.setPoints(next);
  }

  // Cleanup on unmount
  useEffect(() => () => { stopSustained(); }, []);

  function targetsForDifficulty(): number[] {
    return diff.targets;
  }

  function newRound() {
    setTargetBands(makeTargetBands(diff.points, diff.targets, diff.boostDb));
    setAnswered(null);
    setCompare(false);
    setGuessBands(defaultGuessBands(diff.points));
    // Don't auto-play — user starts the signal with the ▶ button.
  }

  function start(m: Mode) {
    setMode(m);
    setRound(1);
    setCorrect(0);
    setAccSum(0);
    setStreak(0);
    setPeakStreak(0);
    setFinished(false);
    setSaved(false);
    setLeveledUp(false);
    newRound();
  }

  function exit() {
    setMode(null);
    setRound(0);
    setFinished(false);
    setTargetBands(null);
    setAnswered(null);
  }

  async function submit() {
    if (targetBands === null || answered !== null) return;
    // Snap only applies at low levels/easy tier and only to frequency —
    // gain is never snapped, it's always freely placed.
    const finalGuess = diff.snap
      ? guessBands.map((g) => ({ ...g, freq: snapToNearest(g.freq, targetsForDifficulty()) }))
      : guessBands;
    const { accuracy: acc, correct: isCorrect, worstFreq } = scoreBands(finalGuess, targetBands, diff);
    const perfection = isCorrect && acc >= PERFECTION_THRESHOLD;
    const tip = tipFor(worstFreq);
    setAnswered({ correct: isCorrect, accuracy: acc, tip });
    setGuessBands(finalGuess);
    const bonus = perfection ? PERFECTION_BONUS : 0;
    const nextCorrect = correct + (isCorrect ? 1 : 0);
    const nextStreak = isCorrect ? streak + 1 : 0;
    const nextAccSum = accSum + acc + bonus;
    setCorrect(nextCorrect);
    setStreak(nextStreak);
    setPeakStreak((p) => Math.max(p, nextStreak));
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

          // Level progression (EQ Academy-style): hit the required average
          // accuracy for this session to unlock the next level. Never
          // resets — mastery_score is a running average across all
          // sessions ever played, same idea as EQ Academy's own metric.
          const didLevelUp = finalAcc >= LEVEL_UP_THRESHOLD;
          const nextLevel = didLevelUp ? progress.level + 1 : progress.level;
          const nextMastery = (progress.mastery_score * progress.sessions_played + finalAcc) / (progress.sessions_played + 1);
          const nextSessions = progress.sessions_played + 1;
          const nextBest = Math.max(progress.best_streak, peakStreak, nextStreak);
          const { data: savedProgress, error: progErr } = await supabase
            .from("game_progress")
            .upsert(
              { user_id: session.user.id, game_type: "frequency", level: nextLevel, mastery_score: nextMastery, sessions_played: nextSessions, best_streak: nextBest, updated_at: new Date().toISOString() },
              { onConflict: "user_id,game_type" },
            )
            .select()
            .single();
          if (!progErr && savedProgress) {
            setProgress(savedProgress);
            setLeveledUp(didLevelUp);
          }
        }
      } else {
        setRound((r) => r + 1);
        newRound();
      }
    }, 2600);
  }

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
            title={`Mastery Score: ${Math.round(progress.mastery_score)}%`}
          >
            Lv.{progress.level}
            <div className="mt-1 h-0.5 w-16 overflow-hidden rounded-full bg-white/10">
              <div className="h-full" style={{ width: `${Math.min(100, Math.round(progress.mastery_score))}%`, background: "var(--fq-acc)" }} />
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
          <Lobby
            theme={theme}
            diffName={diff.name}
            level={progress.level}
            masteryScore={progress.mastery_score}
            onPlay={() => start("ranked")}
            onPractice={() => start("practice")}
            onSettings={() => setSettingsOpen(true)}
          />
        )}
        {inGame && (
          <PlayScreen
            round={round}
            rounds={rounds}
            targetBands={targetBands}
            guessBands={guessBands}
            answered={answered}
            playing={playing}
            compare={compare}
            mode={mode!}
            diff={diff}
            viz={viz}
            onVizChange={setViz}
            allowedTargets={targetsForDifficulty()}
            onGuessChange={(bands) => answered === null && handleGuessChange(bands)}
            onSubmit={submit}
            onReplay={toggleMyLoop}
            onHoldStart={holdTarget}
            onHoldEnd={holdTargetEnd}
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
            leveledUp={leveledUp}
            level={progress.level}
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
  theme, diffName, level, masteryScore, onPlay, onPractice, onSettings,
}: { theme: FrequencyTheme; diffName: string; level: number; masteryScore: number; onPlay: () => void; onPractice: () => void; onSettings: () => void }) {
  return (
    <div className="mt-6 rounded-2xl border bg-black/40 p-8 backdrop-blur md:p-12" style={{ borderColor: "var(--fq-border)" }}>
      <div className="text-center">
        <div className="inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.35em]" style={{ color: "var(--fq-acc)" }}>
          <span>EQ тренажёр</span>
          <span style={{ color: "var(--fq-muted)" }}>·</span>
          <span style={{ color: "var(--fq-muted)" }}>{theme.tier}</span>
        </div>

        {/* Prominent persistent level, EQ Academy-style ("LEVEL 32") — the
            ever-growing ranked level, not a session-only counter. */}
        <div
          className="mx-auto mt-6 inline-flex items-center gap-5 rounded-full border px-7 py-3"
          style={{ borderColor: "var(--fq-acc)", background: "var(--fq-acc-soft)" }}
        >
          <div className="text-left">
            <div className="font-mono text-[9px] uppercase tracking-[0.3em]" style={{ color: "var(--fq-muted)" }}>Уровень</div>
            <div className="font-mono text-3xl font-black leading-none" style={{ color: "var(--fq-acc)" }}>{level}</div>
          </div>
          <div className="h-9 w-px" style={{ background: "var(--fq-border)" }} />
          <div className="text-left">
            <div className="font-mono text-[9px] uppercase tracking-[0.3em]" style={{ color: "var(--fq-muted)" }}>Mastery</div>
            <div className="font-mono text-3xl font-black leading-none text-white">{Math.round(masteryScore)}%</div>
          </div>
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
  round, rounds, targetBands, guessBands, answered, playing, compare, mode, diff, viz, onVizChange, allowedTargets,
  onGuessChange, onSubmit, onReplay, onHoldStart, onHoldEnd, onExit,
}: {
  round: number; rounds: number; targetBands: EqPoint[] | null; guessBands: EqPoint[];
  answered: null | { correct: boolean; accuracy: number; tip: FrequencyTip };
  playing: boolean; compare: boolean; mode: Mode; diff: EffDifficulty;
  viz: VizMode; onVizChange: (v: VizMode) => void;
  allowedTargets: number[];
  onGuessChange: (bands: EqPoint[]) => void; onSubmit: () => void; onReplay: () => void;
  onHoldStart: () => void; onHoldEnd: () => void; onExit: () => void;
}) {
  const n = guessBands.length;
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
          {n === 1
            ? <>Подбери <span style={{ color: "var(--fq-acc)" }}>поднятую</span> частоту на слух</>
            : <>Расставь <span style={{ color: "var(--fq-acc)" }}>{n} точки</span> эквалайзера так же, как в эталоне</>}
        </div>
        <div className="hidden font-mono text-[11px] uppercase tracking-widest md:block" style={{ color: "var(--fq-muted)" }}>
          зажми <b style={{ color: "var(--fq-acc)" }}>ПКМ</b> на графике — эталон, пока держишь
        </div>
      </div>

      {/* Signal status — the mode picker that used to live here (spectrum/
          wave/spectrogram/meter) was removed by request; spectrum is now
          the only view, matching the reference (Mastering The Mix's EQ
          Academy). */}
      <div className="mt-4 flex items-center justify-end">
        <span className="hidden font-mono text-[10px] uppercase tracking-widest md:inline" style={{ color: playing || compare ? "var(--fq-acc)" : "var(--fq-muted)" }}>
          {compare ? "эталон" : playing ? "моя кривая" : "тишина"}
        </span>
      </div>

      {/* EQ chart with overlaid visualizer */}
      <div className="mt-3">
        <EqChart
          targetBands={targetBands}
          guessBands={guessBands}
          answered={answered}
          compare={compare}
          playing={playing}
          viz={viz}
          onGuessChange={onGuessChange}
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
              background: playing ? "var(--fq-acc)" : "transparent",
              border: "2px solid var(--fq-acc)",
              color: playing ? "var(--fq-acc-ink)" : "var(--fq-acc)",
              boxShadow: playing ? "var(--fq-acc-glow)" : "none",
            }}
            aria-label={playing ? "Стоп" : "Слушать мою кривую"}
          >
            <Play className="h-5 w-5" fill="currentColor" />
          </button>
          <button
            type="button"
            onMouseDown={(e) => { if (e.button === 0) onHoldStart(); }}
            onMouseUp={onHoldEnd}
            onMouseLeave={onHoldEnd}
            onTouchStart={() => onHoldStart()}
            onTouchEnd={onHoldEnd}
            disabled={answered !== null}
            className="rounded-2xl border px-6 py-3 text-sm font-bold uppercase tracking-widest transition-all disabled:opacity-40"
            style={
              compare
                ? { borderColor: "var(--fq-acc)", background: "var(--fq-acc)", color: "var(--fq-acc-ink)" }
                : { borderColor: "var(--fq-border)", background: "var(--fq-panel)", color: "var(--fq-text)" }
            }
          >
            Эталон <span className="ml-2 font-normal normal-case tracking-normal opacity-70">удерживай, чтобы слушать</span>
          </button>
        </div>
        <div className="font-mono text-[11px] uppercase tracking-widest" style={{ color: "var(--fq-muted)" }}>
          {compare ? "Играет эталон" : playing ? "Играет моя кривая — двигай точки" : answered ? " " : "▶ — слушать мою кривую · ПКМ по графику — эталон"}
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
                Эталон: {(targetBands ?? []).slice().sort((a, b) => a.freq - b.freq).map((b) => formatHz(b.freq)).join(" · ")} · Точность: {answered.accuracy}%
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
            Ответить{n === 1 ? ` · ${formatHz(diff.snap ? snapToNearest(guessBands[0].freq, allowedTargets) : guessBands[0].freq)}` : ""}
          </button>
        </div>
      )}
    </div>
  );
}

/* ------------- EQ Chart ------------- */

// Peak width of every EQ point's contribution to the composite curve, in
// octaves — shared by both target and guess so overlapping points visually
// interact the same way on both curves.
const BELL_Q = 0.35;
const bellGaussAt = (f: number, center: number) => {
  const octDist = Math.log2(f / center);
  return Math.exp(-(octDist * octDist) / (2 * BELL_Q * BELL_Q));
};
/** Sum of every point's contribution at frequency f — an approximation of
 * a multi-band peaking EQ's composite response, good enough for a chart
 * (not a precision plugin: overlapping peaking filters don't sum exactly
 * like this in dB, but it reads correctly and matches what the ear hears
 * when bands are the ~0.6-octave-apart minimum this game enforces). */
const curveDbAt = (f: number, bands: EqPoint[]) =>
  bands.reduce((sum, b) => sum + b.gainDb * bellGaussAt(f, b.freq), 0);

function EqChart({
  targetBands, guessBands, answered, compare, playing, viz, onGuessChange, onHoldStart, onHoldEnd, snapPoints,
}: {
  targetBands: EqPoint[] | null; guessBands: EqPoint[];
  answered: null | { correct: boolean; accuracy: number; tip: FrequencyTip };
  compare: boolean;
  playing: boolean;
  viz: VizMode;
  onGuessChange: (bands: EqPoint[]) => void;
  onHoldStart: () => void;
  onHoldEnd: () => void;
  snapPoints: number[] | null;
}) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const draggingIdxRef = useRef<number | null>(null);
  const rmbRef = useRef(false);

  // Shared dB→y mapping, used by the grid lines, the flat 0 dB line, the
  // curve, and every point handle's height alike (single source of truth —
  // a previous version had the curve and the grid computing this
  // independently, which drifted out of sync by a few px). This game only
  // ever boosts (never cuts), so the scale is deliberately asymmetric —
  // most of the chart's height goes to the 0..+24 dB region that's
  // actually ever drawn, instead of splitting it evenly with an unused
  // negative half like a real console EQ display would.
  const ZERO_Y = 230; // y-coordinate of the 0 dB line, in the 1000×320 viewBox
  const PX_PER_DB = 8.75;
  const GAIN_MAX = 24; // drag ceiling, matches the top gridline
  const dbToY = useCallback((db: number) => ZERO_Y - db * PX_PER_DB, []);
  const yToDb = useCallback((y: number) => (ZERO_Y - y) / PX_PER_DB, []);

  const nearestGuessIdx = useCallback((clientX: number) => {
    const el = wrapRef.current;
    if (!el) return 0;
    const rect = el.getBoundingClientRect();
    const pct = Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100));
    const freq = pctToFreq(pct);
    let best = 0, bestD = Infinity;
    guessBands.forEach((b, i) => {
      const d = Math.abs(Math.log2(b.freq / freq));
      if (d < bestD) { bestD = d; best = i; }
    });
    return best;
  }, [guessBands]);

  const dragPointTo = useCallback((idx: number, clientX: number, clientY: number) => {
    const el = wrapRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const xPct = Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100));
    const yPct = Math.max(0, Math.min(100, ((clientY - rect.top) / rect.height) * 100));
    const freq = pctToFreq(xPct);
    const gainDb = Math.max(0, Math.min(GAIN_MAX, yToDb((yPct / 100) * 320)));
    onGuessChange(guessBands.map((b, i) => (i === idx ? { freq, gainDb } : b)));
  }, [guessBands, onGuessChange, yToDb]);

  const onPointerDown = (e: React.PointerEvent) => {
    if (answered) return;
    if (e.button === 2) {
      rmbRef.current = true;
      (e.target as Element).setPointerCapture?.(e.pointerId);
      onHoldStart(); // hold RMB → sustained target reference for A/B
      e.preventDefault();
      return;
    }
    const idx = nearestGuessIdx(e.clientX);
    draggingIdxRef.current = idx;
    (e.target as Element).setPointerCapture?.(e.pointerId);
    dragPointTo(idx, e.clientX, e.clientY);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (answered) return;
    const idx = draggingIdxRef.current;
    if (idx !== null) dragPointTo(idx, e.clientX, e.clientY);
  };
  const onPointerUp = (e: React.PointerEvent) => {
    if (rmbRef.current) { rmbRef.current = false; onHoldEnd(); }
    draggingIdxRef.current = null;
    (e.target as Element).releasePointerCapture?.(e.pointerId);
  };

  // For rendering: guess positions — snapped visually only after answer
  const displayGuess = answered && snapPoints
    ? guessBands.map((b) => ({ ...b, freq: snapToNearest(b.freq, snapPoints) }))
    : guessBands;

  const guessPath = useMemo(() => {
    const pts: string[] = [];
    for (let i = 0; i <= 200; i++) {
      const pct = (i / 200) * 100;
      const f = pctToFreq(pct);
      const x = (pct / 100) * 1000;
      const y = dbToY(curveDbAt(f, displayGuess));
      pts.push(`${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`);
    }
    return pts.join(" ");
  }, [displayGuess, dbToY]);

  const targetPath = useMemo(() => {
    if (!answered || !targetBands) return "";
    const pts: string[] = [];
    for (let i = 0; i <= 200; i++) {
      const pct = (i / 200) * 100;
      const f = pctToFreq(pct);
      const x = (pct / 100) * 1000;
      const y = dbToY(curveDbAt(f, targetBands));
      pts.push(`${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`);
    }
    return pts.join(" ");
  }, [answered, targetBands, dbToY]);

  const ticks = [20, 63, 125, 250, 500, 1000, 2000, 4000, 8000, 16000, 20000];
  const dbLines = [-6, 0, 4, 12, 24];
  const single = guessBands.length === 1;

  return (
    <div
      ref={wrapRef}
      className="relative w-full select-none touch-none"
      style={{
        // Taller than the original 1000/320 — the chart read as cramped
        // (curve + controls stacked into a short strip with dead space
        // around it on the page). preserveAspectRatio="none" on the SVG
        // below means every coordinate in it just stretches to fill this
        // box, so growing the box needs no other math to change.
        aspectRatio: "1000 / 460",
        borderRadius: "18px",
        border: "1px solid var(--fq-border)",
        background: "linear-gradient(180deg, rgba(255,255,255,0.02), rgba(0,0,0,0.35))",
        cursor: answered ? "default" : "grab",
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
          const y = dbToY(db);
          return (
            <g key={db}>
              <line x1={0} x2={1000} y1={y} y2={y}
                stroke={db === 0 ? "rgba(255,255,255,0.18)" : "rgba(255,255,255,0.06)"}
                strokeDasharray={db === 0 ? "0" : "3 5"} />
              <text x={992} y={y - 3} textAnchor="end" fontSize="10" fontFamily="ui-monospace, monospace" fill="rgba(255,255,255,0.35)">
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

        {/* Flat 0 dB line (accent) — recedes once there's a live curve on top of it */}
        <line x1={0} x2={1000} y1={ZERO_Y} y2={ZERO_Y} stroke="var(--fq-acc)" strokeWidth="2" opacity={0.35} />

        {/* Target curve — revealed only after answering, for comparison */}
        {answered && targetBands && (
          <path d={targetPath} stroke="var(--fq-acc)" strokeWidth="2.5" fill="none"
            style={{ filter: "drop-shadow(0 0 8px var(--fq-acc))" }} />
        )}

        {/* My curve — always visible and live: drag a point, the curve
            follows in real time. Orange while editing ("this is my
            guess"); once answered it's kept visible alongside the
            revealed target curve above, for a direct A/B on the shapes. */}
        <path d={`${guessPath} L1000,${ZERO_Y} L0,${ZERO_Y} Z`} fill={answered ? "var(--fq-acc)" : "#ff8a3d"} opacity="0.15" />
        <path d={guessPath} stroke={answered ? "rgba(255,138,61,0.65)" : "#ff8a3d"} strokeWidth="2.5" fill="none"
          style={{ filter: answered ? "none" : "drop-shadow(0 0 8px #ff8a3d)" }} />

        {/* Target point markers + guide lines (visible only after answer) */}
        {answered && targetBands && targetBands.map((b, i) => (
          <g key={`t${i}`}>
            <line x1={(freqToPct(b.freq) / 100) * 1000} x2={(freqToPct(b.freq) / 100) * 1000} y1={30} y2={290}
              stroke="var(--fq-acc)" strokeWidth="1" strokeDasharray="4 4" opacity="0.5" />
            <circle cx={(freqToPct(b.freq) / 100) * 1000} cy={dbToY(b.gainDb)} r="5" fill="var(--fq-acc)" opacity="0.9" />
          </g>
        ))}
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
          highlightHz={answered && single ? targetBands?.[0]?.freq ?? null : null}
          height={"100%" as unknown as number}
        />
      </div>

      {/* Guess point handles — draggable in both axes (frequency = x,
          gain = y), echoing the reference's draggable EQ control points.
          Grab the nearest one and drag; the composite curve above follows
          in real time. */}
      {displayGuess.map((b, i) => {
        const leftPct = freqToPct(b.freq);
        const topPct = (dbToY(b.gainDb) / 320) * 100;
        const isTarget = answered !== null;
        return (
          <div
            key={i}
            className="pointer-events-none absolute top-3 bottom-8"
            style={{ left: `${leftPct}%`, transition: isTarget ? "left 260ms cubic-bezier(.2,.7,.2,1)" : "none" }}
          >
            <div
              className="absolute inset-y-0"
              style={{ left: 0, width: "1.5px", background: "repeating-linear-gradient(to bottom, rgba(255,138,61,0.4) 0 4px, transparent 4px 8px)" }}
            />
            <div
              className="absolute rounded-full"
              style={{
                left: "-8px",
                top: `calc(${topPct}% - 8px)`,
                width: "16px",
                height: "16px",
                background: "#ff8a3d",
                border: "2px solid rgba(10,10,14,0.6)",
                boxShadow: "0 0 14px rgba(255,138,61,0.6)",
                transition: isTarget ? "top 260ms cubic-bezier(.2,.7,.2,1)" : "none",
              }}
            />
            {answered && (
              <div
                className="absolute whitespace-nowrap rounded-md px-2 py-0.5 font-mono text-[11px] font-bold"
                style={{
                  left: "50%",
                  top: `calc(${topPct}% - 34px)`,
                  transform: "translateX(-50%)",
                  background: answered.correct ? "var(--fq-acc)" : "var(--fq-danger)",
                  color: answered.correct ? "var(--fq-acc-ink)" : "#000",
                  transition: "top 260ms cubic-bezier(.2,.7,.2,1)",
                }}
              >
                {formatHz(b.freq)}
              </div>
            )}
          </div>
        );
      })}

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
        {answered ? " " : single ? "Тяни точку по графику · ПКМ — эталон" : "Тяни точки эквалайзера · ПКМ — эталон"}
      </div>
      <div className="pointer-events-none absolute bottom-1 right-3 font-mono text-[10px] font-bold" style={{ color: "var(--fq-acc)" }}>
        {playing ? "▲ моя кривая" : compare ? "◇ эталон" : "тишина"}
      </div>
    </div>
  );
}

/* ------------- Summary ------------- */

function Summary({
  correct, rounds, avgAcc, mode, saved, signedIn, leveledUp, level, onAgain, onExit,
}: {
  correct: number; rounds: number; avgAcc: number; mode: Mode; saved: boolean; signedIn: boolean;
  leveledUp: boolean; level: number;
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
      {mode === "ranked" && leveledUp && (
        <div
          className="mt-4 flex items-center justify-center gap-2 rounded-xl border px-4 py-3 font-mono text-sm font-bold uppercase tracking-widest"
          style={{ borderColor: "var(--fq-acc)", background: "var(--fq-acc-soft)", color: "var(--fq-acc)" }}
        >
          <TrendingUp className="h-4 w-4" /> Уровень повышен — Lv.{level}!
        </div>
      )}
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
