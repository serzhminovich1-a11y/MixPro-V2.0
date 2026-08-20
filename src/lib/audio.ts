/** Web Audio helpers for ear-training games. */

let ctx: AudioContext | null = null;
let analyser: AnalyserNode | null = null;
let masterGain: GainNode | null = null;
let masterVolume = 0.2; // 0..1, default 20%

export function getAudioContext(): AudioContext {
  if (!ctx) ctx = new AudioContext();
  if (ctx.state === "suspended") ctx.resume();
  return ctx;
}

/** Master gain sits between analyser and destination. */
function getMasterGain(): GainNode {
  const ac = getAudioContext();
  if (!masterGain) {
    masterGain = ac.createGain();
    masterGain.gain.value = masterVolume;
    masterGain.connect(ac.destination);
  }
  return masterGain;
}

/** Set master output volume (0..1). Applied immediately with a short ramp. */
export function setMasterVolume(v: number) {
  masterVolume = Math.max(0, Math.min(1, v));
  const g = getMasterGain();
  const ac = getAudioContext();
  g.gain.cancelScheduledValues(ac.currentTime);
  g.gain.linearRampToValueAtTime(masterVolume, ac.currentTime + 0.05);
}

/** Shared analyser sitting in front of master gain. */
export function getAnalyser(): AnalyserNode {
  const ac = getAudioContext();
  if (!analyser) {
    analyser = ac.createAnalyser();
    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = 0.82;
    analyser.connect(getMasterGain());
  }
  return analyser;
}


/** Create a pink-noise buffer (Paul Kellet approximation). */
function createPinkNoiseBuffer(ac: AudioContext, seconds = 2): AudioBuffer {
  const buffer = ac.createBuffer(1, ac.sampleRate * seconds, ac.sampleRate);
  const data = buffer.getChannelData(0);
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
  for (let i = 0; i < data.length; i++) {
    const white = Math.random() * 2 - 1;
    b0 = 0.99886 * b0 + white * 0.0555179;
    b1 = 0.99332 * b1 + white * 0.0750759;
    b2 = 0.969 * b2 + white * 0.153852;
    b3 = 0.8665 * b3 + white * 0.3104856;
    b4 = 0.55 * b4 + white * 0.5329522;
    b5 = -0.7616 * b5 - white * 0.016898;
    data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
    b6 = white * 0.115926;
  }
  return buffer;
}

/** White noise buffer. */
function createWhiteNoiseBuffer(ac: AudioContext, seconds = 2): AudioBuffer {
  const buffer = ac.createBuffer(1, ac.sampleRate * seconds, ac.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * 0.6;
  return buffer;
}

export type NoiseSource = "pink" | "white" | "music" | "loop";

export type SignalOptions = {
  source?: NoiseSource;
  q?: number;
  phone?: boolean;
  /** Required when source === "loop". Pre-decoded user loop. */
  loopBuffer?: AudioBuffer;
};

/** Build a musical pad (detuned sawtooth chord → lowpass). Returns start node
 * to connect further, plus stop() and a "gain input" for fade control. */
function buildMusicPad(ac: AudioContext) {
  const notes = [130.81, 164.81, 196.0, 261.63]; // C3 E3 G3 C4
  const mix = ac.createGain(); mix.gain.value = 1;
  const lpf = ac.createBiquadFilter();
  lpf.type = "lowpass";
  lpf.frequency.value = 3500;
  lpf.Q.value = 0.7;
  mix.connect(lpf);
  const oscs: OscillatorNode[] = [];
  notes.forEach((f) => {
    for (let d = -1; d <= 1; d++) {
      const o = ac.createOscillator();
      o.type = "sawtooth";
      o.frequency.value = f * Math.pow(2, (d * 4) / 1200); // ±4 cents
      const g = ac.createGain();
      g.gain.value = 0.055;
      o.connect(g); g.connect(mix);
      oscs.push(o);
    }
  });
  return {
    node: lpf as AudioNode,
    start(t: number) { oscs.forEach((o) => o.start(t)); },
    stop(t: number) { oscs.forEach((o) => { try { o.stop(t); } catch { /* */ } }); },
  };
}

/** Build a noise buffer source. */
function buildNoiseSource(ac: AudioContext, source: NoiseSource, seconds = 2) {
  const src = ac.createBufferSource();
  src.buffer = source === "white"
    ? createWhiteNoiseBuffer(ac, seconds)
    : createPinkNoiseBuffer(ac, seconds);
  src.loop = true;
  return src;
}

/** Insert phone-speaker mode filters (HPF 300 + LPF 4000). Returns first/last. */
function buildPhoneFilters(ac: AudioContext) {
  const hpf = ac.createBiquadFilter();
  hpf.type = "highpass"; hpf.frequency.value = 300; hpf.Q.value = 0.7;
  const lpf = ac.createBiquadFilter();
  lpf.type = "lowpass"; lpf.frequency.value = 4000; lpf.Q.value = 0.7;
  hpf.connect(lpf);
  return { input: hpf as AudioNode, output: lpf as AudioNode };
}

/** Play a signal (pink/white/music) with an optional EQ peak boost. */
export function playNoiseWithBoost(
  freq: number | null,
  duration = 2,
  gainDb = 12,
  opts: SignalOptions = {},
) {
  const ac = getAudioContext();
  const source: NoiseSource = opts.source ?? "pink";
  const q = opts.q ?? 2.5;

  const out = ac.createGain();
  out.gain.value = 0;

  const peak = ac.createBiquadFilter();
  peak.type = "peaking";
  peak.frequency.value = freq ?? 1000;
  peak.Q.value = q;
  peak.gain.value = freq ? gainDb : 0;

  let headNode: AudioNode = peak;
  let tail: () => void = () => { /* */ };

  if (source === "music") {
    const pad = buildMusicPad(ac);
    pad.node.connect(peak);
    pad.start(ac.currentTime);
    pad.stop(ac.currentTime + duration + 0.1);
    tail = () => { /* music stops itself */ };
    headNode = peak;
  } else {
    const src = buildNoiseSource(ac, source, duration + 0.2);
    src.connect(peak);
    src.start(ac.currentTime);
    src.stop(ac.currentTime + duration + 0.1);
    tail = () => { try { src.stop(); } catch { /* */ } };
    headNode = peak;
  }

  if (opts.phone) {
    const ph = buildPhoneFilters(ac);
    peak.connect(ph.input);
    ph.output.connect(out);
  } else {
    peak.connect(out);
  }

  out.connect(getAnalyser());
  const now = ac.currentTime;
  out.gain.setValueAtTime(0, now);
  out.gain.linearRampToValueAtTime(0.35, now + 0.05);
  out.gain.setValueAtTime(0.35, now + duration - 0.08);
  out.gain.linearRampToValueAtTime(0, now + duration);
  void headNode; void tail;
}

/**
 * Start a looped signal with a peaking EQ boost. Returns a handle you can
 * flip between boosted / flat (A/B) and stop when the user releases.
 */
export function startSustainedNoise(
  freq: number,
  boostDb: number,
  boosted = true,
  opts: SignalOptions = {},
) {
  const ac = getAudioContext();
  const source: NoiseSource = opts.source ?? "pink";
  const q = opts.q ?? 2.5;

  const peak = ac.createBiquadFilter();
  peak.type = "peaking";
  peak.frequency.value = freq;
  peak.Q.value = q;
  peak.gain.value = boosted ? boostDb : 0;

  const out = ac.createGain();
  out.gain.value = 0;

  // Wire source → peak
  let stopSource: (t: number) => void;
  if (source === "loop" && opts.loopBuffer) {
    const src = ac.createBufferSource();
    src.buffer = opts.loopBuffer;
    src.loop = true;
    src.connect(peak);
    src.start(ac.currentTime);
    stopSource = (t) => { try { src.stop(t); } catch { /* */ } };
  } else if (source === "music") {
    const pad = buildMusicPad(ac);
    pad.node.connect(peak);
    pad.start(ac.currentTime);
    stopSource = (t) => pad.stop(t);
  } else {
    const noiseKind: NoiseSource = source === "loop" ? "pink" : source;
    const src = buildNoiseSource(ac, noiseKind, 2);
    src.connect(peak);
    src.start(ac.currentTime);
    stopSource = (t) => { try { src.stop(t); } catch { /* */ } };
  }

  // peak → [phone?] → out
  if (opts.phone) {
    const ph = buildPhoneFilters(ac);
    peak.connect(ph.input);
    ph.output.connect(out);
  } else {
    peak.connect(out);
  }
  out.connect(getAnalyser());

  const now = ac.currentTime;
  out.gain.linearRampToValueAtTime(0.35, now + 0.05);

  let stopped = false;
  return {
    setBoost(on: boolean) {
      const t = ac.currentTime;
      peak.gain.cancelScheduledValues(t);
      peak.gain.linearRampToValueAtTime(on ? boostDb : 0, t + 0.03);
    },
    setFreq(f: number) {
      const t = ac.currentTime;
      peak.frequency.cancelScheduledValues(t);
      peak.frequency.linearRampToValueAtTime(f, t + 0.03);
    },
    stop() {
      if (stopped) return;
      stopped = true;
      const t = ac.currentTime;
      out.gain.cancelScheduledValues(t);
      out.gain.linearRampToValueAtTime(0, t + 0.08);
      stopSource(t + 0.12);
    },
  };
}
export type SustainedNoise = ReturnType<typeof startSustainedNoise>;

/** One independently-tunable peaking-EQ point (frequency-trainer multi-band
 * matching mode — the EQ Academy-style "drag N points to match a hidden
 * curve" mechanic). */
export type EqPoint = { freq: number; gainDb: number };

function buildPeakingChain(ac: AudioContext, points: EqPoint[], q: number) {
  const filters = points.map((p) => {
    const f = ac.createBiquadFilter();
    f.type = "peaking";
    f.frequency.value = p.freq;
    f.Q.value = q;
    f.gain.value = p.gainDb;
    return f;
  });
  for (let i = 0; i < filters.length - 1; i++) filters[i].connect(filters[i + 1]);
  const head: AudioNode = filters[0] ?? ac.createGain();
  const tail: AudioNode = filters[filters.length - 1] ?? head;
  return { filters, head, tail };
}

/**
 * Start a looped signal shaped by N serial peaking filters, one per point.
 * Unlike startSustainedNoise (a single fixed band), setPoints() can retune
 * every band's frequency AND gain continuously — this is what makes
 * dragging a point feel live: call it on every pointermove and the loop
 * already playing updates in real time.
 */
export function startSustainedMultiBand(points: EqPoint[], opts: SignalOptions = {}) {
  const ac = getAudioContext();
  const source: NoiseSource = opts.source ?? "pink";
  const q = opts.q ?? 2.5;

  const { filters, head, tail } = buildPeakingChain(ac, points, q);

  const out = ac.createGain();
  out.gain.value = 0;

  let stopSource: (t: number) => void;
  if (source === "loop" && opts.loopBuffer) {
    const src = ac.createBufferSource();
    src.buffer = opts.loopBuffer;
    src.loop = true;
    src.connect(head);
    src.start(ac.currentTime);
    stopSource = (t) => { try { src.stop(t); } catch { /* */ } };
  } else if (source === "music") {
    const pad = buildMusicPad(ac);
    pad.node.connect(head);
    pad.start(ac.currentTime);
    stopSource = (t) => pad.stop(t);
  } else {
    const noiseKind: NoiseSource = source === "loop" ? "pink" : source;
    const src = buildNoiseSource(ac, noiseKind, 2);
    src.connect(head);
    src.start(ac.currentTime);
    stopSource = (t) => { try { src.stop(t); } catch { /* */ } };
  }

  if (opts.phone) {
    const ph = buildPhoneFilters(ac);
    tail.connect(ph.input);
    ph.output.connect(out);
  } else {
    tail.connect(out);
  }
  out.connect(getAnalyser());

  const now = ac.currentTime;
  out.gain.linearRampToValueAtTime(0.35, now + 0.05);

  let stopped = false;
  return {
    setPoints(next: EqPoint[]) {
      const t = ac.currentTime;
      next.forEach((p, i) => {
        const f = filters[i];
        if (!f) return;
        f.frequency.cancelScheduledValues(t);
        f.frequency.linearRampToValueAtTime(p.freq, t + 0.03);
        f.gain.cancelScheduledValues(t);
        f.gain.linearRampToValueAtTime(p.gainDb, t + 0.03);
      });
    },
    stop() {
      if (stopped) return;
      stopped = true;
      const t = ac.currentTime;
      out.gain.cancelScheduledValues(t);
      out.gain.linearRampToValueAtTime(0, t + 0.08);
      stopSource(t + 0.12);
    },
  };
}
export type SustainedMultiBand = ReturnType<typeof startSustainedMultiBand>;

/** One-shot multi-band preview (e.g. "hear my current curve" ▶ button). */
export function playMultiBandPreview(points: EqPoint[], duration = 1.6, opts: SignalOptions = {}) {
  const ac = getAudioContext();
  const source: NoiseSource = opts.source ?? "pink";
  const q = opts.q ?? 2.5;

  const { head, tail } = buildPeakingChain(ac, points, q);
  const out = ac.createGain();
  out.gain.value = 0;

  if (source === "music") {
    const pad = buildMusicPad(ac);
    pad.node.connect(head);
    pad.start(ac.currentTime);
    pad.stop(ac.currentTime + duration + 0.1);
  } else {
    const src = buildNoiseSource(ac, source, duration + 0.2);
    src.connect(head);
    src.start(ac.currentTime);
    src.stop(ac.currentTime + duration + 0.1);
  }

  if (opts.phone) {
    const ph = buildPhoneFilters(ac);
    tail.connect(ph.input);
    ph.output.connect(out);
  } else {
    tail.connect(out);
  }
  out.connect(getAnalyser());

  const now = ac.currentTime;
  out.gain.setValueAtTime(0, now);
  out.gain.linearRampToValueAtTime(0.35, now + 0.05);
  out.gain.setValueAtTime(0.35, now + duration - 0.08);
  out.gain.linearRampToValueAtTime(0, now + duration);
}

/** Play a sine tone at given frequency and gain (linear 0..1). */
export function playTone(freq: number, duration = 1.2, gain = 0.25) {
  const ac = getAudioContext();
  const osc = ac.createOscillator();
  osc.type = "sine";
  osc.frequency.value = freq;
  const g = ac.createGain();
  const now = ac.currentTime;
  g.gain.setValueAtTime(0, now);
  g.gain.linearRampToValueAtTime(gain, now + 0.03);
  g.gain.setValueAtTime(gain, now + duration - 0.08);
  g.gain.linearRampToValueAtTime(0, now + duration);
  osc.connect(g);
  g.connect(getAnalyser());

  osc.start(now);
  osc.stop(now + duration);
}

/** Short two-note success chime (major third arpeggio). */
export function playSuccessChime(gain = 0.18) {
  const ac = getAudioContext();
  const now = ac.currentTime;
  const notes = [880, 1108.73, 1318.51]; // A5, C#6, E6
  notes.forEach((f, i) => {
    const osc = ac.createOscillator();
    osc.type = "triangle";
    osc.frequency.value = f;
    const g = ac.createGain();
    const t = now + i * 0.09;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
    osc.connect(g);
    g.connect(getAnalyser());
    osc.start(t);
    osc.stop(t + 0.4);
  });
}

/** Short descending "wrong" cue. */
export function playFailCue(gain = 0.15) {
  const ac = getAudioContext();
  const now = ac.currentTime;
  const osc = ac.createOscillator();
  osc.type = "sawtooth";
  osc.frequency.setValueAtTime(320, now);
  osc.frequency.exponentialRampToValueAtTime(140, now + 0.3);
  const g = ac.createGain();
  g.gain.setValueAtTime(0, now);
  g.gain.linearRampToValueAtTime(gain, now + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, now + 0.35);
  osc.connect(g);
  g.connect(getAnalyser());
  osc.start(now);
  osc.stop(now + 0.4);
}

export const FREQ_BANDS = [
  { label: "60 Гц", freq: 60, desc: "Саб-бас" },
  { label: "150 Гц", freq: 150, desc: "Бас" },
  { label: "400 Гц", freq: 400, desc: "Ниж. середина" },
  { label: "1 кГц", freq: 1000, desc: "Середина" },
  { label: "2.5 кГц", freq: 2500, desc: "Верх. середина" },
  { label: "5 кГц", freq: 5000, desc: "Презенс" },
  { label: "10 кГц", freq: 10000, desc: "Воздух" },
] as const;
