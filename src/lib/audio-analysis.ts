// Client-side audio analysis for uploaded tracks.
// Rough EBU R128 / BS.1770 approximation. Enough for a "sound-engineer" wall.

export type TrackAnalysis = {
  durationSec: number;
  sampleRate: number;
  channels: number;
  peakDb: number;         // sample peak, dBFS
  truePeakDb: number;     // approx true peak via 4x linear oversampling, dBTP
  rmsDb: number;          // overall RMS, dBFS
  lufsIntegrated: number; // LUFS (K-weighted, gated) — approximate
  lra: number;            // Loudness Range in LU
  crestDb: number;        // peak − rms
  stereoCorr: number;     // -1..1 (mono→1)
  stereoWidth: number;    // 0..1  (0=mono, ~0.5 wide, 1=hard-panned)
  peaks: number[];        // waveform buckets (max abs, 0..1)
  rmsPeaks?: number[];    // waveform buckets (RMS energy, 0..1) for non-brick SoundCloud-style drawing
};

const LOSSY_EXT = new Set(["mp3", "aac", "m4a", "ogg", "opus", "webm"]);
const LOSSLESS_EXT = new Set(["wav", "flac", "aiff", "aif"]);

export function fileExt(name: string) {
  return (name.split(".").pop() || "").toLowerCase();
}
export function isLossless(name: string) { return LOSSLESS_EXT.has(fileExt(name)); }
export function isLossy(name: string) { return LOSSY_EXT.has(fileExt(name)); }

function db(x: number) { return x <= 1e-12 ? -120 : 20 * Math.log10(x); }

// Two-stage K-weighting biquads (coefficients for 48kHz, per EBU R128).
// Applied as-is to other rates — introduces small error but stays close.
function kWeight(input: Float32Array): Float32Array {
  const out = new Float32Array(input.length);
  // Stage 1 — pre-filter (high-shelf boost ~ +4 dB @ 1.5 kHz)
  const b0a = 1.53512485958697, b1a = -2.69169618940638, b2a = 1.19839281085285;
  const a1a = -1.69065929318241, a2a = 0.73248077421585;
  // Stage 2 — RLB high-pass (~60 Hz)
  const b0b = 1.0, b1b = -2.0, b2b = 1.0;
  const a1b = -1.99004745483398, a2b = 0.99007225036621;
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  let u1 = 0, u2 = 0, v1 = 0, v2 = 0;
  for (let i = 0; i < input.length; i++) {
    const x = input[i];
    const y = b0a * x + b1a * x1 + b2a * x2 - a1a * y1 - a2a * y2;
    x2 = x1; x1 = x; y2 = y1; y1 = y;
    const w = b0b * y + b1b * u1 + b2b * u2 - a1b * v1 - a2b * v2;
    u2 = u1; u1 = y; v2 = v1; v1 = w;
    out[i] = w;
  }
  return out;
}

export async function analyzeAudioFile(file: File): Promise<TrackAnalysis> {
  const arr = await file.arrayBuffer();
  const AC: typeof AudioContext =
    (window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext);
  const ctx = new AC();
  const buf = await ctx.decodeAudioData(arr.slice(0));
  try { ctx.close(); } catch { /* noop */ }

  const sr = buf.sampleRate;
  const ch = buf.numberOfChannels;
  const dur = buf.duration;
  const L = buf.getChannelData(0);
  const R = ch > 1 ? buf.getChannelData(1) : L;
  const N = L.length;

  // Sample peak + RMS + peaks buckets + oversampled true peak.
  const buckets = 240;
  const peaks = new Array(buckets).fill(0);
  const rmsPeaks = new Array(buckets).fill(0);
  const rmsCounts = new Array(buckets).fill(0);
  const perBucket = Math.max(1, Math.floor(N / buckets));
  let peak = 0;
  let truePeak = 0;
  let sumSq = 0;
  let dot = 0, sumL2 = 0, sumR2 = 0;
  let midSq = 0, sideSq = 0;
  let prevL = 0, prevR = 0;
  for (let i = 0; i < N; i++) {
    const l = L[i], r = R[i];
    const aL = Math.abs(l), aR = Math.abs(r);
    if (aL > peak) peak = aL;
    if (aR > peak) peak = aR;
    sumSq += l * l + r * r;
    dot += l * r;
    sumL2 += l * l;
    sumR2 += r * r;
    const m = (l + r) * 0.5, s = (l - r) * 0.5;
    midSq += m * m;
    sideSq += s * s;
    // 4x linear oversample between prev and current — approximate ITU-R BS.1770 true peak
    for (let k = 1; k < 4; k++) {
      const t = k / 4;
      const iL = prevL + (l - prevL) * t;
      const iR = prevR + (r - prevR) * t;
      const a = Math.max(Math.abs(iL), Math.abs(iR));
      if (a > truePeak) truePeak = a;
    }
    prevL = l; prevR = r;
    const bIdx = Math.min(buckets - 1, Math.floor(i / perBucket));
    if (aL > peaks[bIdx]) peaks[bIdx] = aL;
    if (aR > peaks[bIdx]) peaks[bIdx] = aR;
    rmsPeaks[bIdx] += (l * l + r * r) * 0.5;
    rmsCounts[bIdx]++;
  }
  if (truePeak < peak) truePeak = peak;
  const rms = Math.sqrt(sumSq / (2 * N));
  const stereoCorr = sumL2 > 0 && sumR2 > 0 ? dot / Math.sqrt(sumL2 * sumR2) : 1;
  const stereoWidth = midSq + sideSq > 0 ? Math.min(1, sideSq / (midSq + sideSq) * 2) : 0;

  // K-weighted loudness (mono-sum L+R with channel weights = 1.0 each).
  const kL = kWeight(L);
  const kR = ch > 1 ? kWeight(R) : kL;
  const blockSamples = Math.floor(sr * 0.4);       // 400 ms
  const hop = Math.floor(sr * 0.1);                // 75% overlap
  const blockLoudness: number[] = [];
  for (let start = 0; start + blockSamples <= N; start += hop) {
    let mean = 0;
    for (let i = 0; i < blockSamples; i++) {
      const l = kL[start + i], r = kR[start + i];
      mean += l * l + r * r;
    }
    mean /= blockSamples;
    if (mean <= 0) continue;
    const lufs = -0.691 + 10 * Math.log10(mean);
    blockLoudness.push(lufs);
  }
  // Absolute gate at −70 LUFS
  const above70 = blockLoudness.filter((v) => v > -70);
  let integrated = -Infinity;
  let lra = 0;
  if (above70.length) {
    const meanEnergy = above70.reduce((s, v) => s + Math.pow(10, (v + 0.691) / 10), 0) / above70.length;
    const absGated = -0.691 + 10 * Math.log10(meanEnergy);
    // Relative gate at −10 LU below absGated
    const relGate = absGated - 10;
    const gated = above70.filter((v) => v > relGate);
    if (gated.length) {
      const m2 = gated.reduce((s, v) => s + Math.pow(10, (v + 0.691) / 10), 0) / gated.length;
      integrated = -0.691 + 10 * Math.log10(m2);
      // LRA: 10th / 95th percentile of gated blocks
      const sorted = [...gated].sort((a, b) => a - b);
      const p = (q: number) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor(q * sorted.length)))];
      lra = p(0.95) - p(0.10);
    }
  }

  const peakDb = db(peak);
  const truePeakDb = db(truePeak);
  const rmsDb = db(rms);

  return {
    durationSec: dur,
    sampleRate: sr,
    channels: ch,
    peakDb,
    truePeakDb,
    rmsDb,
    lufsIntegrated: isFinite(integrated) ? integrated : -Infinity,
    lra,
    crestDb: peakDb - rmsDb,
    stereoCorr,
    stereoWidth,
    peaks: peaks.map((v) => Math.min(1, v)),
    rmsPeaks: rmsPeaks.map((v, i) => Math.min(1, Math.sqrt(v / Math.max(1, rmsCounts[i])))),
  };
}

export function formatDb(v: number, digits = 1) {
  if (!isFinite(v) || v <= -120) return "−∞";
  return `${v >= 0 ? "+" : ""}${v.toFixed(digits)}`;
}
export function formatTime(s: number) {
  if (!isFinite(s) || s < 0) return "0:00";
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}
