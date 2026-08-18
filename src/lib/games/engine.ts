/**
 * Unified audio engine for MixPro ear-training games.
 * Wraps existing `@/lib/audio` primitives with per-game processors:
 * gain (dB), stereo panner, filter, dynamics compressor, waveshaper, delay, convolver.
 *
 * All sources return { node, stop } — you connect `.node` to the processor
 * chain and call `.stop()` on cleanup.
 */
import { getAnalyser, getAudioContext } from "@/lib/audio";
import { pickLoop, decodeLoop, preloadLoops } from "@/lib/games/loops";

export { getAnalyser, getAudioContext } from "@/lib/audio";

export type SourceKind =
  | "pink"
  | "white"
  | "pad"
  | "drums"
  | "mix"
  | "bass"
  | "chords"
  | "vocals"
  | "fx";

/** Preferred loop categories (in order) per source kind. */
const LOOP_CATEGORY_MAP: Record<SourceKind, string[]> = {
  pink:   [],                          // must stay flat noise
  white:  [],                          // must stay flat noise
  pad:    ["chords", "vocals", "mix"], // harmonic bed
  drums:  ["drums", "mix"],
  mix:    ["mix", "drums"],
  bass:   ["bass", "mix"],
  chords: ["chords", "vocals", "mix"],
  vocals: ["vocals", "chords", "mix"],
  fx:     ["fx", "mix"],
};

/* ============================================================
   Buffers
   ============================================================ */

function pinkBuffer(ac: AudioContext, seconds = 4): AudioBuffer {
  const buf = ac.createBuffer(1, ac.sampleRate * seconds, ac.sampleRate);
  const d = buf.getChannelData(0);
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
  for (let i = 0; i < d.length; i++) {
    const w = Math.random() * 2 - 1;
    b0 = 0.99886 * b0 + w * 0.0555179;
    b1 = 0.99332 * b1 + w * 0.0750759;
    b2 = 0.969 * b2 + w * 0.153852;
    b3 = 0.8665 * b3 + w * 0.3104856;
    b4 = 0.55 * b4 + w * 0.5329522;
    b5 = -0.7616 * b5 - w * 0.016898;
    d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
    b6 = w * 0.115926;
  }
  return buf;
}

function whiteBuffer(ac: AudioContext, seconds = 4): AudioBuffer {
  const buf = ac.createBuffer(1, ac.sampleRate * seconds, ac.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * 0.6;
  return buf;
}

/** Offline-rendered 2-bar drum loop @ 100 BPM. */
async function drumBuffer(ac: AudioContext, bpm = 100): Promise<AudioBuffer> {
  const beat = 60 / bpm;
  const bars = 2;
  const seconds = beat * 4 * bars;
  const oc = new OfflineAudioContext(2, Math.ceil(ac.sampleRate * seconds), ac.sampleRate);

  const master = oc.createGain(); master.gain.value = 0.9;
  master.connect(oc.destination);

  function kick(t: number) {
    const o = oc.createOscillator();
    const g = oc.createGain();
    o.frequency.setValueAtTime(120, t);
    o.frequency.exponentialRampToValueAtTime(45, t + 0.12);
    g.gain.setValueAtTime(0.85, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
    o.connect(g); g.connect(master);
    o.start(t); o.stop(t + 0.2);
  }
  function snare(t: number) {
    const src = oc.createBufferSource();
    src.buffer = whiteBuffer(oc as unknown as AudioContext, 0.2);
    const bp = oc.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 1800; bp.Q.value = 1.2;
    const g = oc.createGain();
    g.gain.setValueAtTime(0.55, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
    src.connect(bp); bp.connect(g); g.connect(master);
    src.start(t); src.stop(t + 0.2);
  }
  function hat(t: number, open = false) {
    const src = oc.createBufferSource();
    src.buffer = whiteBuffer(oc as unknown as AudioContext, 0.1);
    const hp = oc.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 7000;
    const g = oc.createGain();
    const dur = open ? 0.18 : 0.045;
    g.gain.setValueAtTime(0.28, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(hp); hp.connect(g); g.connect(master);
    src.start(t); src.stop(t + dur + 0.02);
  }

  for (let bar = 0; bar < bars; bar++) {
    const b0 = bar * 4 * beat;
    for (let step = 0; step < 8; step++) {
      const t = b0 + step * (beat / 2);
      hat(t, step === 7 && bar === bars - 1);
    }
    kick(b0);
    kick(b0 + 2 * beat);
    snare(b0 + 1 * beat);
    snare(b0 + 3 * beat);
  }

  return oc.startRendering();
}

/** Musical pad chord (C minor 7 held). Returns a stoppable node. */
function makePad(ac: AudioContext) {
  const notes = [130.81, 155.56, 196.0, 233.08]; // C3 Eb3 G3 Bb3
  const mix = ac.createGain(); mix.gain.value = 1;
  const lpf = ac.createBiquadFilter();
  lpf.type = "lowpass"; lpf.frequency.value = 3200; lpf.Q.value = 0.7;
  mix.connect(lpf);
  const oscs: OscillatorNode[] = [];
  notes.forEach((f) => {
    for (let d = -1; d <= 1; d++) {
      const o = ac.createOscillator();
      o.type = "sawtooth";
      o.frequency.value = f * Math.pow(2, (d * 4) / 1200);
      const g = ac.createGain(); g.gain.value = 0.055;
      o.connect(g); g.connect(mix);
      oscs.push(o);
    }
  });
  const t0 = ac.currentTime;
  oscs.forEach((o) => o.start(t0));
  return {
    node: lpf as AudioNode,
    stop() { const t = ac.currentTime; oscs.forEach((o) => { try { o.stop(t + 0.05); } catch { /* */ } }); },
  };
}

/* ============================================================
   Cache buffers
   ============================================================ */

let cachedPink: AudioBuffer | null = null;
let cachedWhite: AudioBuffer | null = null;
let cachedDrums: AudioBuffer | null = null;
let drumsPromise: Promise<AudioBuffer> | null = null;

function getPink(ac: AudioContext) { return (cachedPink ??= pinkBuffer(ac, 4)); }
function getWhite(ac: AudioContext) { return (cachedWhite ??= whiteBuffer(ac, 4)); }
async function getDrums(ac: AudioContext) {
  if (cachedDrums) return cachedDrums;
  if (!drumsPromise) drumsPromise = drumBuffer(ac).then((b) => (cachedDrums = b));
  return drumsPromise;
}

/** Warm up drum buffer in advance so first play doesn't stall. */
export function preloadSources() {
  const ac = getAudioContext();
  void getDrums(ac);
  void preloadLoops();
}

/* ============================================================
   Unified source
   ============================================================ */

export type StartedSource = { node: AudioNode; stop: () => void };

/**
 * Start a looped source. Synchronous — for "drums"/"mix" we return
 * silence-then-fade-in until the offline drum render resolves. Cache
 * warms after first call.
 */
export function startSource(kind: SourceKind): StartedSource {
  const ac = getAudioContext();

  // Try user-uploaded dry loop first for any kind with a category mapping.
  const categories = LOOP_CATEGORY_MAP[kind] ?? [];
  let loop = null as ReturnType<typeof pickLoop>;
  for (const cat of categories) {
    loop = pickLoop(cat);
    if (loop) break;
  }

  if (loop) {
    const proxy = ac.createGain(); proxy.gain.value = 1;
    const bs = ac.createBufferSource();
    let started = false;
    let cancelled = false;
    decodeLoop(loop).then((buf) => {
      if (cancelled) return;
      bs.buffer = buf; bs.loop = true;
      bs.connect(proxy);
      try { bs.start(); started = true; } catch { /* */ }
    }).catch(() => {
      if (cancelled) return;
      // Decode failed — fall back to procedural drums into the same proxy.
      getDrums(ac).then((buf) => {
        if (cancelled) return;
        bs.buffer = buf; bs.loop = true;
        bs.connect(proxy);
        try { bs.start(); started = true; } catch { /* */ }
      });
    });
    return {
      node: proxy as AudioNode,
      stop() { cancelled = true; if (started) { try { bs.stop(); } catch { /* */ } } },
    };
  }

  // No matching loop — procedural fallbacks.
  if (kind === "pad" || kind === "chords" || kind === "vocals") {
    const p = makePad(ac);
    return { node: p.node, stop: p.stop };
  }

  if (kind === "pink" || kind === "white") {
    const buf = kind === "pink" ? getPink(ac) : getWhite(ac);
    const src = ac.createBufferSource();
    src.buffer = buf; src.loop = true;
    src.start(ac.currentTime);
    return {
      node: src as unknown as AudioNode,
      stop() { try { src.stop(); } catch { /* */ } },
    };
  }

  // drums / mix / bass / fx — procedural drums (optionally + pad for "mix").
  const proxy = ac.createGain(); proxy.gain.value = 1;
  const bs = ac.createBufferSource();
  let padHandle: { node: AudioNode; stop(): void } | null = null;
  let drumsStarted = false;
  let drumsCancelled = false;
  if (kind === "mix") {
    padHandle = makePad(ac);
    const padGain = ac.createGain(); padGain.gain.value = 0.6;
    padHandle.node.connect(padGain);
    padGain.connect(proxy);
  }
  getDrums(ac).then((buf) => {
    if (drumsCancelled) return;
    bs.buffer = buf; bs.loop = true;
    bs.connect(proxy);
    try { bs.start(); drumsStarted = true; } catch { /* */ }
  });
  return {
    node: proxy as AudioNode,
    stop() {
      drumsCancelled = true;
      if (drumsStarted) { try { bs.stop(); } catch { /* */ } }
      padHandle?.stop();
    },
  };
}

/* ============================================================
   Processor helpers
   ============================================================ */

export function dbToGain(db: number) { return Math.pow(10, db / 20); }

/** Soft-clip distortion curve. amount 0..100. */
export function makeDistortionCurve(amount: number, samples = 8192): Float32Array<ArrayBuffer> {
  const k = Math.max(0, Math.min(100, amount)) * 3;
  const curve = new Float32Array(new ArrayBuffer(samples * 4));
  const deg = Math.PI / 180;
  for (let i = 0; i < samples; i++) {
    const x = (i * 2) / samples - 1;
    curve[i] = ((3 + k) * x * 20 * deg) / (Math.PI + k * Math.abs(x));
  }
  return curve;
}

/** Procedural impulse response. */
export function makeReverbIR(ac: BaseAudioContext, seconds = 2.5, decay = 3): AudioBuffer {
  const rate = ac.sampleRate;
  const len = Math.max(1, Math.floor(rate * seconds));
  const ir = ac.createBuffer(2, len, rate);
  for (let c = 0; c < 2; c++) {
    const ch = ir.getChannelData(c);
    for (let i = 0; i < len; i++) {
      ch[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
  }
  return ir;
}

export type ReverbPreset = "room" | "hall" | "plate" | "chamber";

export const REVERB_PRESETS: Record<ReverbPreset, { label: string; seconds: number; decay: number; predelayMs: number }> = {
  room:    { label: "Small Room", seconds: 0.9, decay: 2.5, predelayMs: 5 },
  chamber: { label: "Chamber",    seconds: 1.6, decay: 2.5, predelayMs: 12 },
  hall:    { label: "Hall",       seconds: 3.2, decay: 3.0, predelayMs: 25 },
  plate:   { label: "Plate",      seconds: 2.1, decay: 4.5, predelayMs: 4 },
};

export type FilterKind = "lowpass" | "highpass" | "bandpass" | "notch";
export const FILTER_LABELS: Record<FilterKind, string> = {
  lowpass:  "Low Pass",
  highpass: "High Pass",
  bandpass: "Band Pass",
  notch:    "Notch",
};

/** Utility: pick random element. */
export function pick<T>(arr: readonly T[]): T { return arr[Math.floor(Math.random() * arr.length)]; }
export function randRange(min: number, max: number) { return min + Math.random() * (max - min); }
