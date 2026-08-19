import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import {
  Play, Pause, Volume2, VolumeX, Music4, AlertTriangle,
  Heart, Repeat2, Share2, Link2, MoreHorizontal, Gift, MessageSquare,
  ListPlus, Copy, Send, Flag, X,
} from "lucide-react";
import { toast } from "sonner";
import { formatDb, formatTime, type TrackAnalysis } from "@/lib/audio-analysis";
import { supabase } from "@/integrations/supabase/client";


export type PlayerTrack = {
  url: string;
  label: string;
  format: string;
  size?: number;
  analysis?: TrackAnalysis;
  warnings?: string[];
};

export type TrackPlayerHandle = {
  seekMs: (ms: number) => void;
  getCurrentMs: () => number;
  getDurationMs: () => number;
  getActiveIndex: () => number;
};

export type TrackPin = {
  ms: number;
  color?: string;
  title?: string;
  username?: string;
  avatar?: string | null;
  content?: string;
};

type ChannelMode = "stereo" | "mono" | "left" | "right" | "sides";

const CHANNEL_MODES: { id: ChannelMode; label: string; hint: string }[] = [
  { id: "stereo", label: "Stereo", hint: "Обычный стерео-выход L/R" },
  { id: "mono",   label: "Mono",   hint: "Mid: (L+R)/2 в оба уха" },
  { id: "left",   label: "L",      hint: "Только левый канал" },
  { id: "right",  label: "R",      hint: "Только правый канал" },
  { id: "sides",  label: "Sides",  hint: "Side: (L−R)/2 — только стерео-разница" },
];

type Props = {
  postId?: string;
  tracks: PlayerTrack[];
  cover?: string | null;
  title?: string;
  artist?: string;
  currentUserId?: string | null;
  currentUserAvatar?: string | null;
  currentUserName?: string | null;
  createdAt?: string | null;
  genre?: string | null;
  playCount?: number;
  commentCount?: number;
  likeCount?: number;
  likedByMe?: boolean;
  pins?: TrackPin[];
  initialTrackIndex?: number;
  initialSeekMs?: number;
  onLike?: () => void;
  onActiveChange?: (idx: number) => void;
  onTimeChange?: (ms: number, durMs: number) => void;
  onAddCommentAtCurrent?: () => void;
};

const LOSSLESS = new Set(["wav", "flac", "aiff", "aif"]);
const FORMAT_STYLE: Record<string, string> = {
  wav:  "bg-emerald-500/20 text-emerald-300 border-emerald-500/50",
  flac: "bg-cyan-500/20 text-cyan-300 border-cyan-500/50",
  aiff: "bg-emerald-500/20 text-emerald-300 border-emerald-500/50",
  aif:  "bg-emerald-500/20 text-emerald-300 border-emerald-500/50",
  mp3:  "bg-amber-500/20 text-amber-300 border-amber-500/50",
  aac:  "bg-amber-500/20 text-amber-300 border-amber-500/50",
  m4a:  "bg-amber-500/20 text-amber-300 border-amber-500/50",
  ogg:  "bg-orange-500/20 text-orange-300 border-orange-500/50",
  opus: "bg-orange-500/20 text-orange-300 border-orange-500/50",
};

function compactCount(value?: number) {
  const n = Math.max(0, value ?? 0);
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(n >= 10_000 ? 0 : 1)}K`;
  return String(n);
}

function relativeRu(value?: string | null) {
  if (!value) return "недавно";
  const diff = Date.now() - new Date(value).getTime();
  const minute = 60_000;
  const hour = minute * 60;
  const day = hour * 24;
  const month = day * 30;
  if (diff < hour) return `${Math.max(1, Math.floor(diff / minute))} мин. назад`;
  if (diff < day) return `${Math.floor(diff / hour)} ч. назад`;
  if (diff < month) return `${Math.floor(diff / day)} дн. назад`;
  return `${Math.floor(diff / month)} мес. назад`;
}

export const TrackPlayer = forwardRef<TrackPlayerHandle, Props>(function TrackPlayer(
  {
    postId, tracks, cover, title, artist, currentUserId, currentUserAvatar, currentUserName, createdAt, genre,
    playCount, commentCount, likeCount, likedByMe, pins, initialTrackIndex, initialSeekMs, onLike,
    onActiveChange, onTimeChange, onAddCommentAtCurrent,
  },
  ref,
) {
  const [idx, setIdx] = useState(initialTrackIndex ?? 0);
  const pendingSeekRef = useRef<number | null>(initialSeekMs ?? null);

  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [dur, setDur] = useState(0);
  const [vol, setVol] = useState(0.8);
  const [muted, setMuted] = useState(false);
  const [channelMode, setChannelMode] = useState<ChannelMode>("stereo");
  const [saved, setSaved] = useState(false);
  const [savingRef, setSavingRef] = useState(false);
  const [copied, setCopied] = useState(false);
  const [reposted, setReposted] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [donateOpen, setDonateOpen] = useState(false);
  const [donateAmount, setDonateAmount] = useState<number>(300);
  const [donateNote, setDonateNote] = useState("");
  const [inlineText, setInlineText] = useState("");
  const [inlineBusy, setInlineBusy] = useState(false);
  const [localPlayCount, setLocalPlayCount] = useState(playCount ?? 0);
  const countedPlayRef = useRef(false);


  // Canvas meter (mixer-style horizontal LED)
  const meterCanvasRef = useRef<HTMLCanvasElement>(null);


  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserLRef = useRef<AnalyserNode | null>(null);
  const analyserRRef = useRef<AnalyserNode | null>(null);
  // Channel routing gain matrix
  const gainRef = useRef<{ lL: GainNode; lR: GainNode; rL: GainNode; rR: GainNode } | null>(null);
  const rafRef = useRef<number | null>(null);
  // (per-frame ballistics live inside the canvas RAF closure)

  const active = tracks[idx];
  const isLossless = LOSSLESS.has(active?.format?.toLowerCase() ?? "");
  const sortedPins = useMemo(() => (pins ?? []).slice().sort((a, b) => a.ms - b.ms), [pins]);

  useImperativeHandle(ref, () => ({
    seekMs(ms: number) {
      const a = audioRef.current;
      if (!a || !isFinite(ms)) return;
      const target = Math.max(0, Math.min((a.duration || dur), ms / 1000));
      a.currentTime = target;
      setTime(target);
      a.play().then(() => setPlaying(true)).catch(() => {});
    },
    getCurrentMs: () => time * 1000,
    getDurationMs: () => dur * 1000,
    getActiveIndex: () => idx,
  }), [dur, time, idx]);

  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    a.volume = vol;
    a.muted = muted;
  }, [vol, muted, idx]);

  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    a.load();
    countedPlayRef.current = false;
    onActiveChange?.(idx);
    if (playing) a.play().catch(() => setPlaying(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx]);

  useEffect(() => setLocalPlayCount(playCount ?? 0), [playCount]);

  useEffect(() => {
    let alive = true;
    if (!postId || !currentUserId) { setSaved(false); return; }
    (async () => {
      const { data } = await supabase
        .from("post_saves")
        .select("id")
        .eq("post_id", postId)
        .eq("user_id", currentUserId)
        .maybeSingle();
      if (alive) setSaved(Boolean(data));
    })();
    return () => { alive = false; };
  }, [postId, currentUserId]);

  // Set up Web Audio graph: src → splitter → 4× gains → merger → analysers/destination
  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    function ensureCtx() {
      if (audioCtxRef.current) return;
      try {
        const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        const ctx = new Ctor();
        const src = ctx.createMediaElementSource(a!);
        const splitter = ctx.createChannelSplitter(2);
        const merger = ctx.createChannelMerger(2);

        const lL = ctx.createGain(); const lR = ctx.createGain();
        const rL = ctx.createGain(); const rR = ctx.createGain();
        // default stereo
        lL.gain.value = 1; lR.gain.value = 0; rL.gain.value = 0; rR.gain.value = 1;

        src.connect(splitter);
        splitter.connect(lL, 0); splitter.connect(lR, 0);
        splitter.connect(rL, 1); splitter.connect(rR, 1);
        lL.connect(merger, 0, 0); rL.connect(merger, 0, 0);
        lR.connect(merger, 0, 1); rR.connect(merger, 0, 1);

        // per-channel analysers off the merger
        const outSplit = ctx.createChannelSplitter(2);
        merger.connect(outSplit);
        const aL = ctx.createAnalyser(); const aR = ctx.createAnalyser();
        aL.fftSize = 1024; aR.fftSize = 1024;
        aL.smoothingTimeConstant = 0.15; aR.smoothingTimeConstant = 0.15;
        outSplit.connect(aL, 0); outSplit.connect(aR, 1);
        merger.connect(ctx.destination);

        audioCtxRef.current = ctx;
        analyserLRef.current = aL;
        analyserRRef.current = aR;
        gainRef.current = { lL, lR, rL, rR };
      } catch { /* browsers block until user gesture; retry on play */ }
    }
    const onPlay = () => {
      ensureCtx();
      audioCtxRef.current?.resume().catch(() => {});
    };
    a.addEventListener("play", onPlay);
    return () => {
      a.removeEventListener("play", onPlay);
      audioCtxRef.current?.close().catch(() => {});
      audioCtxRef.current = null;
    };
  }, []);

  // Apply channel routing when mode or graph changes
  useEffect(() => {
    const g = gainRef.current;
    if (!g) return;
    const t = audioCtxRef.current?.currentTime ?? 0;
    const ramp = (n: GainNode, v: number) => {
      n.gain.cancelScheduledValues(t);
      n.gain.setTargetAtTime(v, t, 0.02);
    };
    switch (channelMode) {
      case "stereo": ramp(g.lL, 1); ramp(g.lR, 0); ramp(g.rL, 0); ramp(g.rR, 1); break;
      case "mono":   ramp(g.lL, 0.5); ramp(g.lR, 0.5); ramp(g.rL, 0.5); ramp(g.rR, 0.5); break;
      case "left":   ramp(g.lL, 1); ramp(g.lR, 1); ramp(g.rL, 0); ramp(g.rR, 0); break;
      case "right":  ramp(g.lL, 0); ramp(g.lR, 0); ramp(g.rL, 1); ramp(g.rR, 1); break;
      case "sides":  ramp(g.lL, 0.5); ramp(g.lR, -0.5); ramp(g.rL, -0.5); ramp(g.rR, 0.5); break;
    }
  }, [channelMode, playing]);

  // Horizontal LED meter (mixer-style): two rows L/R, animated with fast attack / slow release
  useEffect(() => {
    const canvas = meterCanvasRef.current;
    if (!canvas) return;
    const dpr = Math.max(1, window.devicePixelRatio || 1);

    function resize() {
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      canvas.width = Math.max(1, Math.round(rect.width * dpr));
      canvas.height = Math.max(1, Math.round(rect.height * dpr));
    }
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const bufL = new Float32Array(2048);
    const bufR = new Float32Array(2048);

    const state = {
      peakL: -60, peakR: -60,
      rmsL: -60,  rmsR: -60,
      holdL: -60, holdR: -60,
      holdLt: 0,  holdRt: 0,
    };
    const FLOOR = -60;
    const dbToX = (db: number) => {
      const t = Math.max(0, Math.min(1, (db - FLOOR) / (0 - FLOOR)));
      return Math.pow(t, 0.85);
    };

    function drawRow(
      ctx: CanvasRenderingContext2D,
      x: number, y: number, w: number, h: number,
      peakDb: number, rmsDb: number, holdDb: number,
    ) {
      const cells = 96;
      const cellGap = Math.max(1, Math.floor((w / cells) / 6));
      const cellW = Math.max(1, (w - cellGap * (cells - 1)) / cells);
      const peakT = dbToX(peakDb);
      const rmsT  = dbToX(rmsDb);
      const holdT = dbToX(holdDb);

      for (let i = 0; i < cells; i++) {
        const t = (i + 0.5) / cells;
        const cx = x + i * (cellW + cellGap);
        let color: string;
        if (t < 0.60)      color = "hsl(150 80% 50%)";
        else if (t < 0.80) color = "hsl(90 85% 55%)";
        else if (t < 0.92) color = "hsl(45 95% 55%)";
        else               color = "hsl(0 90% 58%)";

        // dim background
        ctx.fillStyle = "rgba(255,255,255,0.06)";
        ctx.fillRect(cx, y, cellW, h);
        if (t <= peakT) {
          ctx.globalAlpha = t <= rmsT ? 1 : 0.55;
          ctx.fillStyle = color;
          ctx.fillRect(cx, y, cellW, h);
          ctx.globalAlpha = 1;
        }
      }

      // Peak-hold marker
      if (holdT > 0) {
        const hx = x + holdT * w - dpr;
        ctx.fillStyle = holdDb > -1 ? "hsl(0 90% 62%)" : "rgba(255,255,255,0.95)";
        ctx.fillRect(hx, y - dpr, 2 * dpr, h + 2 * dpr);
      }

      // clip dot
      if (peakDb >= -0.1) {
        ctx.fillStyle = "hsl(0 90% 58%)";
        ctx.beginPath();
        ctx.arc(x + w + 5 * dpr, y + h / 2, 3 * dpr, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    function drawScale(ctx: CanvasRenderingContext2D, x: number, y: number, w: number) {
      ctx.font = `${9 * dpr}px ui-monospace, monospace`;
      ctx.fillStyle = "rgba(255,255,255,0.4)";
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      const marks = [-48, -24, -12, -6, -3, 0];
      for (const db of marks) {
        const px = x + dbToX(db) * w;
        ctx.fillRect(px, y, 1 * dpr, 3 * dpr);
        ctx.fillText(`${db}`, px, y + 5 * dpr);
      }
    }

    function frame() {
      const ctx = canvas!.getContext("2d");
      if (!ctx) { rafRef.current = requestAnimationFrame(frame); return; }
      const W = canvas!.width, H = canvas!.height;

      const aL = analyserLRef.current;
      const aR = analyserRRef.current;

      let peakL = 0, peakR = 0, sqL = 0, sqR = 0;
      if (aL && aR) {
        aL.getFloatTimeDomainData(bufL);
        aR.getFloatTimeDomainData(bufR);
        for (let i = 0; i < bufL.length; i++) {
          const l = bufL[i]; const al = l < 0 ? -l : l;
          if (al > peakL) peakL = al; sqL += l * l;
          const r = bufR[i]; const ar = r < 0 ? -r : r;
          if (ar > peakR) peakR = ar; sqR += r * r;
        }
      }
      const rmsL = Math.sqrt(sqL / bufL.length);
      const rmsR = Math.sqrt(sqR / bufR.length);
      const toDb = (v: number) => 20 * Math.log10(Math.max(1e-6, v));
      const dbPL = toDb(peakL), dbPR = toDb(peakR);
      const dbRL = toDb(rmsL),  dbRR = toDb(rmsR);

      const attack = 1, release = 0.7;
      const bal = (cur: number, next: number) => (next > cur ? cur + attack * (next - cur) : Math.max(FLOOR, cur - release));
      state.peakL = bal(state.peakL, dbPL);
      state.peakR = bal(state.peakR, dbPR);
      state.rmsL  = bal(state.rmsL,  dbRL);
      state.rmsR  = bal(state.rmsR,  dbRR);

      const now = performance.now();
      if (state.peakL >= state.holdL) { state.holdL = state.peakL; state.holdLt = now; }
      else if (now - state.holdLt > 1200) state.holdL = Math.max(FLOOR, state.holdL - 0.5);
      if (state.peakR >= state.holdR) { state.holdR = state.peakR; state.holdRt = now; }
      else if (now - state.holdRt > 1200) state.holdR = Math.max(FLOOR, state.holdR - 0.5);

      ctx.clearRect(0, 0, W, H);

      const padX = 6 * dpr;
      const labelW = 14 * dpr;
      const valueW = 44 * dpr;
      const gap = 6 * dpr;
      const barX = padX + labelW + gap;
      const barW = W - barX - gap - valueW - padX;
      const rowH = Math.floor((H - 14 * dpr) / 2) - 3 * dpr;
      const yL = 2 * dpr;
      const yR = yL + rowH + 4 * dpr;

      ctx.font = `${10 * dpr}px ui-monospace, monospace`;
      ctx.fillStyle = "rgba(255,255,255,0.55)";
      ctx.textBaseline = "middle";
      ctx.textAlign = "left";
      ctx.fillText("L", padX, yL + rowH / 2);
      ctx.fillText("R", padX, yR + rowH / 2);

      drawRow(ctx, barX, yL, barW, rowH, state.peakL, state.rmsL, state.holdL);
      drawRow(ctx, barX, yR, barW, rowH, state.peakR, state.rmsR, state.holdR);

      const fmt = (db: number) => (isFinite(db) && db > FLOOR + 0.5 ? (db >= 0 ? "+" : "") + db.toFixed(1) : "-∞");
      ctx.textAlign = "right";
      ctx.fillStyle = state.peakL >= -1 ? "hsl(0 90% 65%)" : "hsl(150 70% 65%)";
      ctx.fillText(fmt(state.peakL), W - padX, yL + rowH / 2);
      ctx.fillStyle = state.peakR >= -1 ? "hsl(0 90% 65%)" : "hsl(150 70% 65%)";
      ctx.fillText(fmt(state.peakR), W - padX, yR + rowH / 2);

      drawScale(ctx, barX, yR + rowH + 2 * dpr, barW);

      rafRef.current = requestAnimationFrame(frame);
    }
    rafRef.current = requestAnimationFrame(frame);
    return () => {
      ro.disconnect();
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);


  const rawPeaks = active?.analysis?.peaks;
  const rawRmsPeaks = active?.analysis?.rmsPeaks;
  // SoundCloud-style normalization: rescale to local dB min/max so
  // even a mastered/limited track shows dynamics instead of a brick.
  const peaks = useMemo(() => {
    const source = rawRmsPeaks && rawRmsPeaks.length > 0 ? rawRmsPeaks : rawPeaks;
    if (!source || source.length === 0) return source;
    const dbs = source.map((v, i) => {
      const peak = rawPeaks?.[i] ?? v;
      const crest = Math.max(0, peak - v);
      return 20 * Math.log10(Math.max(1e-4, v + crest * 0.18));
    });
    let lo = Infinity, hi = -Infinity;
    for (const d of dbs) { if (d < lo) lo = d; if (d > hi) hi = d; }
    // Guarantee a visible range even if the file is uniformly loud
    const range = Math.max(11, hi - lo); // dB
    const floor = hi - range;
    return dbs.map((d, i) => {
      const t = (d - floor) / range;         // 0..1
      const shaped = Math.pow(Math.max(0, Math.min(1, t)), 1.22);
      // tiny deterministic micro-contour prevents visually flat mastered files
      const contour = 0.88 + 0.12 * Math.sin(i * 1.73) * Math.sin(i * 0.31);
      return 0.12 + shaped * contour * 0.88;           // keep visible baseline ≥ 0.12
    });
  }, [rawPeaks, rawRmsPeaks]);

  const progress = dur > 0 ? time / dur : 0;

  function togglePlay() {
    const a = audioRef.current;
    if (!a) return;
    if (a.paused) { a.play().then(() => setPlaying(true)).catch(() => {}); }
    else { a.pause(); setPlaying(false); }
  }

  function seekFromClientX(e: React.MouseEvent<HTMLDivElement>) {
    const a = audioRef.current;
    if (!a || !dur) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const p = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    a.currentTime = p * dur;
    setTime(a.currentTime);
  }

  async function registerPlay() {
    if (!postId || countedPlayRef.current) return;
    countedPlayRef.current = true;
    setLocalPlayCount((n) => n + 1);
    const { data } = await supabase.rpc("increment_post_play", { _post_id: postId });
    if (typeof data === "number") setLocalPlayCount(data);
  }

  async function toggleSaveReference() {
    if (!postId || !currentUserId || savingRef) return;
    setSavingRef(true);
    if (saved) {
      const { error } = await supabase.from("post_saves").delete().eq("post_id", postId).eq("user_id", currentUserId);
      if (!error) setSaved(false);
    } else {
      const { error } = await supabase.from("post_saves").insert({ post_id: postId, user_id: currentUserId });
      if (!error) setSaved(true);
    }
    setSavingRef(false);
  }

  async function copyPostLink() {
    if (!postId || typeof window === "undefined") return;
    const url = `${window.location.origin}/post/${postId}?track=${idx}&t=${Math.floor(time * 1000)}`;
    await navigator.clipboard?.writeText(url).catch(() => {});
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  }

  async function sharePost() {
    if (!postId || typeof window === "undefined") return;
    const url = `${window.location.origin}/post/${postId}`;
    if (navigator.share) await navigator.share({ title: title || "MixPro track", text: artist || "MixPro", url }).catch(() => {});
    else await copyPostLink();
  }

  async function submitInlineComment() {
    if (!postId || !currentUserId || !inlineText.trim() || inlineBusy) return;
    setInlineBusy(true);
    const { error } = await supabase.from("track_comments").insert({
      post_id: postId,
      track_index: idx,
      author_id: currentUserId,
      parent_id: null,
      content: inlineText.trim(),
      timestamp_ms: Math.max(0, Math.floor(time * 1000)),
    });
    setInlineBusy(false);
    if (error) { toast.error("Не удалось отправить комментарий"); return; }
    setInlineText("");
    toast.success(`Комментарий прикреплён к ${formatTime(time)}`);
    onAddCommentAtCurrent?.();
  }

  function doRepost() {
    if (reposted) { setReposted(false); toast("Репост отменён"); return; }
    setReposted(true);
    toast.success(`Ты сделал репост «${title || "трека"}»`);
  }

  function sendDonation() {
    if (!donateAmount || donateAmount <= 0) return;
    toast.success(`Донат ${donateAmount} ₽ отправлен ${artist ? "@" + artist : "автору"}. Спасибо!`);
    setDonateOpen(false);
    setDonateNote("");
    setDonateAmount(300);
  }


  const anAnalysis = active?.analysis;
  const chips = useMemo(() => {
    if (!anAnalysis) return [];
    return [
      { label: "LUFS", value: isFinite(anAnalysis.lufsIntegrated) ? anAnalysis.lufsIntegrated.toFixed(1) : "—", hint: "Integrated loudness (BS.1770)" },
      { label: "TP",   value: formatDb(anAnalysis.truePeakDb, 1) + " dB", hint: "True peak (approx, 4×)" },
      { label: "PEAK", value: formatDb(anAnalysis.peakDb, 1) + " dB", hint: "Sample peak" },
      { label: "RMS",  value: formatDb(anAnalysis.rmsDb, 1) + " dB", hint: "Overall RMS" },
      { label: "DR",   value: anAnalysis.crestDb.toFixed(1) + " dB", hint: "Crest factor (Peak − RMS)" },
      { label: "LRA",  value: anAnalysis.lra.toFixed(1) + " LU", hint: "Loudness Range" },
      { label: "COR",  value: anAnalysis.stereoCorr.toFixed(2), hint: "Stereo correlation (1=mono)" },
      { label: "WIDE", value: Math.round(anAnalysis.stereoWidth * 100) + "%", hint: "Stereo width" },
      { label: "SR",   value: (anAnalysis.sampleRate / 1000).toFixed(1) + "k", hint: "Sample rate" },
      { label: "CH",   value: anAnalysis.channels === 1 ? "MONO" : anAnalysis.channels === 2 ? "STEREO" : String(anAnalysis.channels), hint: "Channels" },
    ];
  }, [anAnalysis]);

  if (!active) return null;

  const fmt = active.format.toLowerCase();
  const fmtStyle = FORMAT_STYLE[fmt] ?? "bg-secondary text-foreground/80 border-border";

  return (
    <div className="overflow-hidden rounded-md border border-border bg-card text-foreground shadow-xl">
      <div className="flex flex-col gap-3 p-3 md:flex-row md:gap-5 md:p-5">
        <div className="relative grid h-[180px] w-full shrink-0 place-items-center overflow-hidden rounded-sm bg-secondary md:h-[180px] md:w-[180px]">
          {cover ? <img src={cover} alt={title ? `Обложка ${title}` : "Обложка трека"} className="h-full w-full object-cover" /> : <Music4 className="h-14 w-14 opacity-60" />}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex min-h-[43px] items-start gap-3">
            <button
              onClick={togglePlay}
              className="grid h-[40px] w-[40px] shrink-0 place-items-center rounded-full bg-primary text-primary-foreground shadow-lg transition hover:scale-105"
              aria-label={playing ? "Пауза" : "Играть"}
            >
              {playing ? <Pause className="h-5 w-5" fill="currentColor" /> : <Play className="h-5 w-5 translate-x-[1px]" fill="currentColor" />}
            </button>
            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 space-y-1">
                  {artist && <p className="w-fit max-w-full truncate rounded-sm bg-background/85 px-2 py-0.5 text-sm leading-tight text-muted-foreground">{artist}</p>}
                  <h3 className="w-fit max-w-full truncate rounded-sm bg-background/95 px-2 py-1 text-[16px] font-medium leading-tight md:text-[17px]">
                    {title || "Без названия"}
                  </h3>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className={`rounded-sm border px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase ${fmtStyle}`}>
                      {fmt}{isLossless ? " · LOSSLESS" : ""}
                    </span>
                    {anAnalysis?.sampleRate && (
                      <span className="rounded-sm border border-border bg-background/70 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                        {(anAnalysis.sampleRate / 1000).toFixed(1)}k · {anAnalysis.channels === 1 ? "MONO" : "STEREO"}
                      </span>
                    )}
                  </div>
                </div>
                <div className="shrink-0 text-right text-[11px] leading-tight text-muted-foreground">
                  <p>{relativeRu(createdAt)}</p>
                  {genre && <p className="mt-1 text-primary">#{genre}</p>}
                </div>
              </div>
            </div>
          </div>

          {/* SoundCloud-style waveform (mirrored) */}
          <div className="mt-3">
            <div
              className="group relative h-[110px] cursor-pointer select-none"
              onClick={seekFromClientX}
            >
              {peaks && peaks.length > 0 ? (
                <div className="flex h-full items-center gap-[2px]">
                  {peaks.map((v, i) => {
                    const played = i / peaks.length < progress;
                    const topH = Math.max(2, v * 70);
                    const botH = Math.max(1, v * 25);
                    const top = played ? "var(--primary)" : "color-mix(in oklab, var(--foreground) 38%, transparent)";
                    const bot = played ? "color-mix(in oklab, var(--primary) 68%, transparent)" : "color-mix(in oklab, var(--foreground) 20%, transparent)";
                    return (
                      <span key={i} className="flex h-full flex-1 flex-col items-center justify-center">
                        <span style={{ height: `${topH}%`, background: top }} className="w-full" />
                        <span style={{ height: "1px", background: top }} className="w-full opacity-70" />
                        <span style={{ height: `${botH}%`, background: bot }} className="w-full" />
                      </span>
                    );
                  })}
                </div>
              ) : (
                <div className="absolute inset-0 flex items-center">
                  <div className="h-1 w-full bg-muted">
                    <div className="h-full bg-primary" style={{ width: `${progress * 100}%` }} />
                  </div>
                </div>
              )}
              {dur > 0 && sortedPins.map((p, i) => {
                const pct = (p.ms / (dur * 1000)) * 100;
                return (
                  <div key={i}
                    className="pointer-events-none absolute top-0 h-full w-[1px] bg-foreground/35"
                    style={{ left: `${Math.max(0, Math.min(100, pct))}%` }}
                  />
                );
              })}
              <div className="pointer-events-none absolute inset-y-0" style={{ left: `${progress * 100}%` }}>
                <div className="h-full w-[1px] bg-foreground" />
              </div>
              <div className="pointer-events-none absolute left-0 top-0 rounded-sm bg-background/85 px-1.5 py-0.5 font-mono text-[11px] text-primary">
                {formatTime(time)}
              </div>
              <div className="pointer-events-none absolute right-0 bottom-0 rounded-sm bg-background/85 px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
                {formatTime(dur)}
              </div>
            </div>

            <div className="relative h-10">
              {dur > 0 && sortedPins.map((p, i) => {
                const pct = (p.ms / (dur * 1000)) * 100;
                const initials = (p.username ?? "?")[0]?.toUpperCase() ?? "?";
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => {
                      const a = audioRef.current;
                      if (a && dur) { a.currentTime = p.ms / 1000; setTime(a.currentTime); }
                    }}
                    className="absolute top-1 grid h-6 w-6 -translate-x-1/2 place-items-center overflow-hidden rounded-full border-2 border-card bg-secondary text-[9px] font-bold text-foreground shadow-md transition hover:z-30 hover:scale-125"
                    style={{ left: `${Math.max(0, Math.min(100, pct))}%`, zIndex: 10 + (i % 5) }}
                    aria-label={`Комментарий в ${Math.floor(p.ms / 1000)}s`}
                    title={p.content}
                  >
                    {p.avatar ? <img src={p.avatar} alt="" className="h-full w-full object-cover" loading="lazy" /> : initials}
                  </button>
                );
              })}
              {sortedPins[0]?.content && (
                <div className="absolute left-0 top-8 flex max-w-[520px] items-center gap-2 rounded-sm bg-background/90 px-2 py-1 text-[11px] shadow-lg">
                  <span className="font-semibold">{sortedPins[0].username ?? "user"}</span>
                  <span className="truncate text-muted-foreground">{sortedPins[0].content}</span>
                  <button type="button" className="text-primary hover:underline">Reply</button>
                  <button type="button" className="text-primary hover:underline">Like</button>
                </div>
              )}
            </div>
          </div>

          <div className="mt-2 flex items-start gap-2">
            <div className="mt-1 grid h-8 w-8 shrink-0 place-items-center overflow-hidden rounded-full bg-secondary text-xs font-bold text-primary">
              {currentUserAvatar ? <img src={currentUserAvatar} alt="" className="h-full w-full object-cover" /> : (currentUserName ?? artist ?? "?")[0]?.toUpperCase()}
            </div>
            {currentUserId ? (
              <>
                <textarea
                  value={inlineText}
                  onChange={(e) => setInlineText(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submitInlineComment(); } }}
                  placeholder={`Написать комментарий в ${formatTime(time)}...`}
                  rows={1}
                  maxLength={1000}
                  className="min-w-0 flex-1 resize-none rounded-sm border border-input bg-background px-3 py-1.5 text-sm outline-none focus:ring-1 focus:ring-ring"
                />
                <button
                  type="button"
                  onClick={submitInlineComment}
                  disabled={inlineBusy || !inlineText.trim()}
                  className="grid h-8 w-8 place-items-center rounded-sm bg-primary text-primary-foreground disabled:opacity-50"
                  aria-label="Отправить комментарий"
                  title="Enter — отправить"
                >
                  <Send className="h-3.5 w-3.5" />
                </button>
              </>
            ) : (
              <div className="flex-1 rounded-sm border border-input bg-background px-3 py-1.5 text-sm text-muted-foreground">
                Войди, чтобы оставить комментарий
              </div>
            )}
          </div>

        </div>
      </div>

      {/* Channel routing toolbar (Metric AB style) */}
      <div className="mx-3 mb-2 flex flex-wrap items-center gap-1 rounded-sm border border-border bg-background p-1 md:mx-5">
        <span className="px-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Routing</span>
        {CHANNEL_MODES.map((m) => (
          <button
            key={m.id}
            type="button"
            onClick={() => setChannelMode(m.id)}
            title={m.hint}
            className={`rounded-md px-2.5 py-1 font-mono text-[11px] uppercase tracking-wider transition ${
              channelMode === m.id
                ? "bg-mint/20 text-mint shadow-[inset_0_0_0_1px] shadow-mint/60"
                : "text-muted-foreground hover:bg-secondary hover:text-foreground"
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>

      {/* Mixer-style horizontal LED meter — animated peak+RMS with dB scale */}
      <div className="mx-3 mt-3 rounded-sm border border-border bg-background p-2 md:mx-5">
        <div className="mb-1 flex items-center justify-between font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
          <span className="flex items-center gap-2">
            Output · Peak / RMS
            <span
              className={`inline-flex items-center gap-1 rounded-sm px-1.5 py-[1px] text-[9px] ${
                playing ? "bg-mint/20 text-mint" : "bg-white/5 text-muted-foreground"
              }`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${playing ? "bg-mint animate-pulse" : "bg-muted-foreground/60"}`} />
              {playing ? "LIVE" : "IDLE"}
            </span>
          </span>
          <span>dBFS</span>
        </div>
        <canvas ref={meterCanvasRef} className="block h-14 w-full" />
      </div>
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-3 md:px-5">
        <button onClick={onLike} className={`inline-flex h-7 items-center gap-1 rounded-sm border px-2 text-xs transition ${likedByMe ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground"}`}>
          <Heart className={`h-3.5 w-3.5 ${likedByMe ? "fill-current" : ""}`} /> {compactCount(likeCount)}
        </button>
        <button onClick={doRepost} className={`inline-flex h-7 items-center gap-1 rounded-sm border px-2 text-xs transition ${reposted ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground"}`}>
          <Repeat2 className="h-3.5 w-3.5" /> {reposted ? "Reposted" : "Repost"}
        </button>
        <button onClick={sharePost} className="inline-flex h-7 items-center gap-1 rounded-sm border border-border px-2 text-xs text-muted-foreground transition hover:text-foreground">
          <Share2 className="h-3.5 w-3.5" /> Share
        </button>
        <button onClick={copyPostLink} className="inline-flex h-7 items-center gap-1 rounded-sm border border-border px-2 text-xs text-muted-foreground transition hover:text-foreground">
          {copied ? <Copy className="h-3.5 w-3.5 text-primary" /> : <Link2 className="h-3.5 w-3.5" />} {copied ? "Copied" : "Copy link"}
        </button>
        <button onClick={toggleSaveReference} disabled={savingRef || !currentUserId} className={`inline-flex h-7 items-center gap-1 rounded-sm border px-2 text-xs transition ${saved ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground"}`}>
          <ListPlus className="h-3.5 w-3.5" /> {saved ? "Saved" : "Reference"}
        </button>
        <button
          onClick={() => setDonateOpen(true)}
          className="inline-flex h-7 items-center gap-1 rounded-sm border border-amber-500/40 bg-amber-500/10 px-2 text-xs text-amber-300 transition hover:bg-amber-500/20"
          aria-label="Скинуть донат автору"
          title="Скинуть донат автору"
        >
          <Gift className="h-3.5 w-3.5" /> Донат
        </button>
        <div className="relative">
          <button
            onClick={() => setMoreOpen((v) => !v)}
            className="grid h-7 w-7 place-items-center rounded-sm border border-border text-muted-foreground transition hover:text-foreground"
            aria-label="Больше"
          >
            <MoreHorizontal className="h-3.5 w-3.5" />
          </button>
          {moreOpen && (
            <>
              <button type="button" onClick={() => setMoreOpen(false)} className="fixed inset-0 z-30 cursor-default" aria-label="Закрыть меню" />
              <div className="absolute right-0 top-8 z-40 w-44 overflow-hidden rounded-sm border border-border bg-popover text-xs shadow-xl">
                <button
                  type="button"
                  onClick={() => { setMoreOpen(false); copyPostLink(); }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-secondary"
                >
                  <Link2 className="h-3.5 w-3.5" /> Скопировать ссылку
                </button>
                <button
                  type="button"
                  onClick={() => { setMoreOpen(false); toast("Жалоба отправлена модерации"); }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-destructive hover:bg-secondary"
                >
                  <Flag className="h-3.5 w-3.5" /> Пожаловаться
                </button>
              </div>
            </>
          )}
        </div>
        <div className="ml-auto flex items-center gap-4 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1"><Play className="h-3.5 w-3.5" fill="currentColor" /> {compactCount(localPlayCount)}</span>
          <span className="inline-flex items-center gap-1"><MessageSquare className="h-3.5 w-3.5" /> {compactCount(commentCount ?? sortedPins.length)}</span>
          <button onClick={() => setMuted((v) => !v)} className="hover:text-foreground" aria-label="Mute">
            {muted || vol === 0 ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
          </button>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={muted ? 0 : vol}
            onChange={(e) => { setVol(Number(e.target.value)); setMuted(false); }}
            className="w-20 accent-primary"
            aria-label="Громкость"
          />
        </div>

      </div>

      {/* Warnings */}
      {(active.warnings ?? []).length > 0 && (
        <div className="mx-3 mb-3 mt-3 flex items-start gap-2 rounded-sm border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-200 md:mx-5">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <div className="space-y-0.5">
            {active.warnings!.map((w, i) => <p key={i}>{w}</p>)}
          </div>
        </div>
      )}
      {!isLossless && (active.warnings ?? []).length === 0 && (
        <div className="mx-3 mb-3 mt-3 rounded-sm border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-[11px] text-amber-200/90 md:mx-5">
          Формат {active.format.toUpperCase()} — уже сжатый. Для точных LUFS / True Peak лучше загружать WAV или FLAC.
        </div>
      )}

      {/* Analysis chips */}
      {chips.length > 0 && (
        <div className="grid grid-cols-2 gap-px border-t border-border bg-border/40 md:grid-cols-5">
          {chips.map((c) => (
            <div key={c.label} title={c.hint} className="flex flex-col items-start bg-[hsl(0_0%_7%)] px-3 py-2">
              <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">{c.label}</span>
              <span className="text-sm font-mono font-semibold text-foreground">{c.value}</span>
            </div>
          ))}
        </div>
      )}

      <audio
        ref={audioRef}
        src={active.url}
        preload="metadata"
        crossOrigin="anonymous"
        onTimeUpdate={(e) => { setTime(e.currentTarget.currentTime); onTimeChange?.(e.currentTarget.currentTime * 1000, e.currentTarget.duration * 1000); }}
        onLoadedMetadata={(e) => {
          const el = e.currentTarget;
          setDur(el.duration);
          if (pendingSeekRef.current != null && isFinite(el.duration) && el.duration > 0) {
            const target = Math.max(0, Math.min(el.duration, pendingSeekRef.current / 1000));
            el.currentTime = target;
            setTime(target);
            pendingSeekRef.current = null;
          }
          onTimeChange?.(el.currentTime * 1000, el.duration * 1000);
        }}
        onPlay={() => { setPlaying(true); registerPlay(); }}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
      />

      {donateOpen && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4" onClick={() => setDonateOpen(false)}>
          <div className="w-full max-w-sm rounded-md border border-border bg-card p-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center gap-2">
              <Gift className="h-5 w-5 text-amber-400" />
              <h4 className="flex-1 font-semibold">Донат {artist ? `@${artist}` : "автору"}</h4>
              <button onClick={() => setDonateOpen(false)} className="text-muted-foreground hover:text-foreground" aria-label="Закрыть"><X className="h-4 w-4" /></button>
            </div>
            <p className="mb-3 text-xs text-muted-foreground">Скажи спасибо за микс — выбери сумму или укажи свою.</p>
            <div className="mb-2 grid grid-cols-4 gap-1.5">
              {[100, 300, 500, 1000].map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setDonateAmount(v)}
                  className={`rounded-sm border px-2 py-1.5 text-sm font-semibold transition ${donateAmount === v ? "border-amber-400 bg-amber-400/15 text-amber-300" : "border-border text-muted-foreground hover:text-foreground"}`}
                >
                  {v} ₽
                </button>
              ))}
            </div>
            <input
              type="number"
              min={1}
              value={donateAmount}
              onChange={(e) => setDonateAmount(Math.max(0, Number(e.target.value) || 0))}
              className="mb-2 w-full rounded-sm border border-input bg-background px-2 py-1.5 text-sm outline-none focus:ring-1 focus:ring-ring"
              placeholder="Своя сумма, ₽"
            />
            <textarea
              value={donateNote}
              onChange={(e) => setDonateNote(e.target.value)}
              rows={2}
              maxLength={200}
              placeholder="Сообщение автору (необязательно)"
              className="mb-3 w-full resize-none rounded-sm border border-input bg-background px-2 py-1.5 text-sm outline-none focus:ring-1 focus:ring-ring"
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setDonateOpen(false)}
                className="flex-1 rounded-sm border border-border px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground"
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={sendDonation}
                disabled={!donateAmount || donateAmount <= 0}
                className="flex-1 rounded-sm bg-amber-500 px-3 py-1.5 text-sm font-semibold text-black transition hover:bg-amber-400 disabled:opacity-50"
              >
                Скинуть {donateAmount ? `${donateAmount} ₽` : ""}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});
