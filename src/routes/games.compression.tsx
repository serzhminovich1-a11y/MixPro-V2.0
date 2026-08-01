import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { TutorialLauncher } from "@/components/games/tutorial-launcher";
import { Play, RotateCcw, Target, Volume2, Gauge } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { getAudioContext, getAnalyser } from "@/lib/audio";

export const Route = createFileRoute("/games/compression")({
  head: () => ({
    meta: [
      { title: "Тренажёр компрессии — MixPro" },
      { name: "description", content: "Угадай ratio и attack на слух и по форме волны. Тренажёр компрессии для звукорежиссёров." },
      { property: "og:title", content: "Тренажёр компрессии — MixPro" },
      { property: "og:description", content: "Мини-игра: подбери параметры компрессора и следи за формой волны в реальном времени." },
    ],
  }),
  component: CompressionGame,
});

const SR = 22050; // internal render rate — light for browser
const DURATION = 2.5;
const N = Math.floor(SR * DURATION);

type Params = {
  threshold: number; // dB
  ratio: number;     // :1
  attackMs: number;
  releaseMs: number;
};

const TARGET_POOL: Params[] = [
  { threshold: -18, ratio: 4,  attackMs: 3,   releaseMs: 120 },
  { threshold: -14, ratio: 8,  attackMs: 1,   releaseMs: 80  },
  { threshold: -20, ratio: 2,  attackMs: 20,  releaseMs: 200 },
  { threshold: -16, ratio: 6,  attackMs: 10,  releaseMs: 150 },
  { threshold: -22, ratio: 3,  attackMs: 30,  releaseMs: 250 },
];

/** Build a drum-loop-ish signal: 8 exponentially-decaying transients + soft pad. */
function buildSource(): Float32Array {
  const out = new Float32Array(N);
  const hits = 8;
  const hitEvery = Math.floor(N / hits);
  for (let h = 0; h < hits; h++) {
    const start = h * hitEvery;
    const decay = 0.08 * SR; // ~80ms transient tail
    for (let i = 0; i < decay && start + i < N; i++) {
      const t = i / SR;
      // sharp transient (click) + body sine
      const click = Math.exp(-i / (0.0015 * SR)) * (Math.random() * 2 - 1) * 0.9;
      const body = Math.exp(-i / (0.03 * SR)) * Math.sin(2 * Math.PI * 90 * t) * 0.8;
      out[start + i] += click + body;
    }
  }
  // Soft pad underneath so ratio changes are audible between hits
  for (let i = 0; i < N; i++) {
    const t = i / SR;
    out[i] += Math.sin(2 * Math.PI * 220 * t) * 0.12 + Math.sin(2 * Math.PI * 330 * t) * 0.08;
  }
  // Normalize to ~0.9
  let peak = 0;
  for (let i = 0; i < N; i++) if (Math.abs(out[i]) > peak) peak = Math.abs(out[i]);
  const g = peak > 0 ? 0.9 / peak : 1;
  for (let i = 0; i < N; i++) out[i] *= g;
  return out;
}

/** Simple feedforward peak compressor with attack/release envelope. */
function compress(input: Float32Array, p: Params): { out: Float32Array; gr: Float32Array } {
  const out = new Float32Array(input.length);
  const gr = new Float32Array(input.length);
  const attackCoef = Math.exp(-1 / (SR * (p.attackMs / 1000)));
  const releaseCoef = Math.exp(-1 / (SR * (p.releaseMs / 1000)));
  let env = 0; // envelope in dB of gain reduction (positive number = dB of reduction)
  const slope = 1 - 1 / p.ratio;
  for (let i = 0; i < input.length; i++) {
    const absX = Math.abs(input[i]) + 1e-9;
    const dB = 20 * Math.log10(absX);
    const over = dB - p.threshold;
    const target = over > 0 ? over * slope : 0;
    // Attack when demand rises, release when it falls
    const coef = target > env ? attackCoef : releaseCoef;
    env = target + (env - target) * coef;
    gr[i] = env;
    const gain = Math.pow(10, -env / 20);
    out[i] = input[i] * gain;
  }
  // Makeup gain — normalize RMS back to the input's RMS so loudness doesn't fool the eye.
  let inSq = 0, outSq = 0;
  for (let i = 0; i < input.length; i++) { inSq += input[i] * input[i]; outSq += out[i] * out[i]; }
  const inRms = Math.sqrt(inSq / input.length);
  const outRms = Math.sqrt(outSq / input.length) + 1e-9;
  const makeup = Math.min(4, inRms / outRms);
  for (let i = 0; i < out.length; i++) out[i] *= makeup;
  return { out, gr };
}

function bucketize(arr: Float32Array, buckets: number): { peak: number[]; rms: number[] } {
  const per = Math.floor(arr.length / buckets);
  const peak: number[] = new Array(buckets).fill(0);
  const rms: number[] = new Array(buckets).fill(0);
  for (let b = 0; b < buckets; b++) {
    let p = 0, s = 0;
    for (let i = 0; i < per; i++) {
      const v = arr[b * per + i];
      const a = Math.abs(v);
      if (a > p) p = a;
      s += v * v;
    }
    peak[b] = p;
    rms[b] = Math.sqrt(s / per);
  }
  return { peak, rms };
}

function scoreParams(user: Params, target: Params): { score: number; hints: string[] } {
  const hints: string[] = [];
  const ratioErr = Math.abs(Math.log2(user.ratio) - Math.log2(target.ratio)); // octaves of ratio
  const attackErr = Math.abs(Math.log2(user.attackMs) - Math.log2(target.attackMs));
  const ratioScore = Math.max(0, 1 - ratioErr / 2);      // full credit within ~ octave
  const attackScore = Math.max(0, 1 - attackErr / 1.5);
  const total = Math.round((ratioScore * 0.5 + attackScore * 0.5) * 100);

  if (user.ratio < target.ratio * 0.7) hints.push("Ratio слишком мягкий — компрессор почти не работает.");
  else if (user.ratio > target.ratio * 1.5) hints.push("Ratio слишком агрессивный — динамика убита в кирпич.");
  else hints.push("Ratio почти в цель ✓");

  if (user.attackMs < target.attackMs * 0.5) hints.push("Attack слишком быстрый — транзиенты (щелчки) съедены.");
  else if (user.attackMs > target.attackMs * 2) hints.push("Attack слишком медленный — пики проскакивают мимо компрессора.");
  else hints.push("Attack в допуске ✓");

  return { score: total, hints };
}

function CompressionGame() {
  const { session } = useAuth();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const source = useMemo(() => buildSource(), []);
  const [target, setTarget] = useState<Params>(() => TARGET_POOL[Math.floor(Math.random() * TARGET_POOL.length)]);
  const [user, setUser] = useState<Params>({ threshold: -18, ratio: 2, attackMs: 10, releaseMs: 150 });

  const targetOut = useMemo(() => compress(source, target), [source, target]);
  const userOut = useMemo(() => compress(source, user), [source, user]);

  const [revealed, setRevealed] = useState(false);
  const [savedScore, setSavedScore] = useState<number | null>(null);

  const result = useMemo(() => scoreParams(user, target), [user, target]);

  // Draw waveforms
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const W = canvas.offsetWidth * dpr;
    const H = canvas.offsetHeight * dpr;
    canvas.width = W; canvas.height = H;
    const buckets = Math.min(600, Math.floor(canvas.offsetWidth));

    const src = bucketize(source, buckets);
    const tgt = bucketize(targetOut.out, buckets);
    const usr = bucketize(userOut.out, buckets);

    ctx.clearRect(0, 0, W, H);
    // Bg grid
    ctx.strokeStyle = "rgba(255,255,255,0.05)";
    ctx.lineWidth = 1;
    for (let g = 0; g < 5; g++) {
      const y = (g / 4) * H;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    }

    const bw = W / buckets;
    const mid = H / 2;

    // Source ghost
    ctx.fillStyle = "rgba(255,255,255,0.08)";
    for (let i = 0; i < buckets; i++) {
      const h = src.peak[i] * (H * 0.48);
      ctx.fillRect(i * bw, mid - h, Math.max(1, bw - 0.5), h * 2);
    }

    // Target (dashed outline via bars)
    ctx.fillStyle = "rgba(103,232,249,0.35)"; // cyan
    for (let i = 0; i < buckets; i++) {
      const h = tgt.peak[i] * (H * 0.48);
      ctx.fillRect(i * bw, mid - h, Math.max(1, bw - 0.5), h * 2);
    }

    // User (solid mint on top)
    ctx.fillStyle = "rgba(74,222,128,0.85)";
    for (let i = 0; i < buckets; i++) {
      const h = usr.peak[i] * (H * 0.36);
      ctx.fillRect(i * bw, mid - h, Math.max(1, bw - 0.5), h * 2);
    }

    // GR meter on right edge — average gain reduction over last chunk
    let grSum = 0;
    for (let i = 0; i < userOut.gr.length; i++) grSum += userOut.gr[i];
    const avgGr = grSum / userOut.gr.length;
    ctx.fillStyle = "rgba(239,68,68,0.6)";
    const grH = Math.min(H, (avgGr / 20) * H);
    ctx.fillRect(W - 8 * dpr, 0, 8 * dpr, grH);
  }, [source, targetOut, userOut]);

  function play(buf: Float32Array) {
    const ac = getAudioContext();
    const b = ac.createBuffer(1, buf.length, SR);
    b.getChannelData(0).set(buf);
    const src = ac.createBufferSource();
    src.buffer = b;
    const g = ac.createGain();
    g.gain.value = 0.5;
    src.connect(g);
    g.connect(getAnalyser());
    src.start();
  }

  async function submit() {
    setRevealed(true);
    if (session && savedScore === null) {
      const { error } = await supabase.from("game_scores").insert({
        user_id: session.user.id,
        game_type: "compression",
        score: Math.round(result.score / 10),
        accuracy: result.score,
      });
      if (!error) setSavedScore(result.score);
    }
  }

  function nextRound() {
    setTarget(TARGET_POOL[Math.floor(Math.random() * TARGET_POOL.length)]);
    setUser({ threshold: -18, ratio: 2, attackMs: 10, releaseMs: 150 });
    setRevealed(false);
    setSavedScore(null);
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-14">
      <TutorialLauncher gameId="compression" />
      <Link to="/games" className="text-sm text-muted-foreground hover:text-foreground">← Все игры</Link>
      <div className="mt-3 flex items-center gap-3">
        <div className="grid h-9 w-9 place-items-center rounded-lg bg-mint/10 text-mint">
          <Gauge className="h-4 w-4" />
        </div>
        <span className="label-mono">COMPRESSION TRAINER</span>
      </div>
      <h1 className="mt-3 text-3xl font-bold tracking-tight md:text-4xl">Подбери ratio и attack</h1>
      <p className="mt-2 max-w-xl text-sm text-muted-foreground">
        Целевая форма волны — <span className="text-cyan">циан</span>. Твоя — <span className="text-mint">мятная</span>. Двигай слайдеры, слушай оба варианта, попадай в цель.
      </p>

      <div className="mt-6 panel rounded-2xl p-4">
        <canvas ref={canvasRef} className="h-64 w-full rounded-lg bg-black/40" />
        <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] font-mono uppercase tracking-widest text-muted-foreground">
          <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-white/25" />исходник</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-cyan/60" />цель</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-mint" />твой</span>
          <span className="ml-auto inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-red-500/70" />GR</span>
        </div>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <Slider label="Ratio" value={user.ratio} min={1} max={20} step={0.5} unit=":1"
          onChange={(v) => setUser({ ...user, ratio: v })} />
        <Slider label="Attack" value={user.attackMs} min={0.5} max={80} step={0.5} unit=" мс" log
          onChange={(v) => setUser({ ...user, attackMs: v })} />
        <Slider label="Threshold" value={user.threshold} min={-40} max={0} step={1} unit=" дБ"
          onChange={(v) => setUser({ ...user, threshold: v })} />
        <Slider label="Release" value={user.releaseMs} min={20} max={500} step={10} unit=" мс"
          onChange={(v) => setUser({ ...user, releaseMs: v })} />
      </div>

      <div className="mt-6 flex flex-wrap gap-2">
        <button onClick={() => play(source)} className="btn-ghost inline-flex items-center gap-2">
          <Play className="h-3.5 w-3.5" /> Исходник
        </button>
        <button onClick={() => play(targetOut.out)} className="btn-ghost inline-flex items-center gap-2">
          <Volume2 className="h-3.5 w-3.5 text-cyan" /> Цель
        </button>
        <button onClick={() => play(userOut.out)} className="btn-ghost inline-flex items-center gap-2">
          <Volume2 className="h-3.5 w-3.5 text-mint" /> Твой
        </button>
        <div className="ml-auto flex gap-2">
          {!revealed ? (
            <button onClick={submit} className="btn-primary inline-flex items-center gap-2">
              <Target className="h-3.5 w-3.5" /> Проверить
            </button>
          ) : (
            <button onClick={nextRound} className="btn-primary inline-flex items-center gap-2">
              <RotateCcw className="h-3.5 w-3.5" /> Ещё раунд
            </button>
          )}
        </div>
      </div>

      {revealed && (
        <div className="mt-6 panel rounded-2xl p-5">
          <div className="flex items-baseline gap-3">
            <div className="font-mono text-4xl font-bold text-mint">{result.score}</div>
            <div className="text-sm text-muted-foreground">/ 100</div>
            {savedScore !== null && <span className="ml-auto label-mono text-mint">Сохранено ✓</span>}
          </div>
          <div className="mt-4 grid gap-2 text-sm md:grid-cols-2">
            <Reveal label="Ratio" user={`${user.ratio}:1`} target={`${target.ratio}:1`} />
            <Reveal label="Attack" user={`${user.attackMs} мс`} target={`${target.attackMs} мс`} />
            <Reveal label="Threshold" user={`${user.threshold} дБ`} target={`${target.threshold} дБ`} />
            <Reveal label="Release" user={`${user.releaseMs} мс`} target={`${target.releaseMs} мс`} />
          </div>
          <ul className="mt-4 space-y-1.5 text-sm text-muted-foreground">
            {result.hints.map((h, i) => <li key={i}>• {h}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
}

function Slider({
  label, value, min, max, step, unit, log, onChange,
}: {
  label: string; value: number; min: number; max: number; step: number; unit: string; log?: boolean;
  onChange: (v: number) => void;
}) {
  // For log-scaled sliders (attack), map value <-> position 0..1
  const toPos = (v: number) => log ? (Math.log(v) - Math.log(min)) / (Math.log(max) - Math.log(min)) : (v - min) / (max - min);
  const fromPos = (p: number) => log ? Math.exp(Math.log(min) + p * (Math.log(max) - Math.log(min))) : min + p * (max - min);
  return (
    <label className="panel block rounded-xl p-4">
      <div className="flex items-baseline justify-between">
        <span className="label-mono">{label}</span>
        <span className="font-mono text-sm font-bold">{value % 1 === 0 ? value : value.toFixed(1)}{unit}</span>
      </div>
      <input
        type="range" min={0} max={1000} step={1}
        value={Math.round(toPos(value) * 1000)}
        onChange={(e) => {
          const p = Number(e.target.value) / 1000;
          const v = fromPos(p);
          onChange(Math.round(v / step) * step);
        }}
        className="mt-3 w-full accent-mint"
      />
    </label>
  );
}

function Reveal({ label, user, target }: { label: string; user: string; target: string }) {
  return (
    <div className="flex items-center justify-between rounded-lg bg-black/30 px-3 py-2">
      <span className="label-mono">{label}</span>
      <span className="font-mono text-xs">
        <span className="text-mint">{user}</span>
        <span className="mx-2 text-muted-foreground">→</span>
        <span className="text-cyan">{target}</span>
      </span>
    </div>
  );
}
