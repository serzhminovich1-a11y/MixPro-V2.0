import { useEffect, useRef } from "react";
import { getAnalyser } from "@/lib/audio";

export type VizMode = "spectrum" | "wave" | "spectrogram" | "meter";

/** Realtime visualizer wired to the shared analyser. Supports overlay use. */
export function SignalVisualizer({
  active,
  mode = "spectrum",
  color = "#34d399",
  dimColor = "rgba(52,211,153,0.15)",
  highlightHz = null,
  compare = false,
  height = 120,
  transparent = false,
  className,
}: {
  active: boolean;
  mode?: VizMode;
  color?: string;
  dimColor?: string;
  highlightHz?: number | null;
  compare?: boolean;
  height?: number | string;
  transparent?: boolean;
  className?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number | null>(null);
  const spectroRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx2d = canvas.getContext("2d");
    if (!ctx2d) return;

    const analyser = getAnalyser();
    const freqBuf = new Uint8Array(analyser.frequencyBinCount);
    const timeBuf = new Uint8Array(analyser.fftSize);

    let w = 0, h = 0;
    const resize = () => {
      const dpr = Math.max(1, window.devicePixelRatio || 1);
      const rect = canvas.getBoundingClientRect();
      w = rect.width;
      h = rect.height;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      ctx2d.setTransform(dpr, 0, 0, dpr, 0, 0);
      // (re)create offscreen for spectrogram at CSS px
      const off = document.createElement("canvas");
      off.width = Math.max(1, Math.floor(w));
      off.height = Math.max(1, Math.floor(h));
      spectroRef.current = off;
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const sampleRate = analyser.context.sampleRate;
    const nyquist = sampleRate / 2;
    const minHz = 30;
    const maxHz = 20000;
    const logMin = Math.log10(minHz);
    const logMax = Math.log10(maxHz);
    const hzToX = (hz: number) => ((Math.log10(hz) - logMin) / (logMax - logMin)) * w;

    // Warm colormap for spectrogram
    const heat = (v: number) => {
      // v: 0..1 → dark → magenta → orange → yellow → white
      const stops: [number, [number, number, number]][] = [
        [0.0, [8, 8, 20]],
        [0.25, [60, 10, 90]],
        [0.5, [200, 40, 80]],
        [0.75, [255, 140, 40]],
        [1.0, [255, 245, 220]],
      ];
      for (let i = 1; i < stops.length; i++) {
        if (v <= stops[i][0]) {
          const [p0, c0] = stops[i - 1];
          const [p1, c1] = stops[i];
          const t = (v - p0) / (p1 - p0);
          const r = c0[0] + (c1[0] - c0[0]) * t;
          const g = c0[1] + (c1[1] - c0[1]) * t;
          const b = c0[2] + (c1[2] - c0[2]) * t;
          return `rgb(${r | 0},${g | 0},${b | 0})`;
        }
      }
      return "#fff";
    };

    // Meter state
    let peak = 0;
    const draw = () => {
      rafRef.current = requestAnimationFrame(draw);
      ctx2d.clearRect(0, 0, w, h);

      if (mode === "spectrum") {
        analyser.getByteFrequencyData(freqBuf);
        // faint grid
        ctx2d.strokeStyle = "rgba(255,255,255,0.05)";
        ctx2d.lineWidth = 1;
        [100, 1000, 10000].forEach((hz) => {
          const x = hzToX(hz);
          ctx2d.beginPath(); ctx2d.moveTo(x, 0); ctx2d.lineTo(x, h); ctx2d.stroke();
        });

        // Filled mountain-shape spectrum from real FFT data — a continuous
        // silhouette (reference: Mastering The Mix's EQ Academy) instead of
        // discrete EQ-style bars.
        const samples = 160;
        const pts: [number, number][] = new Array(samples + 1);
        for (let i = 0; i <= samples; i++) {
          const t = i / samples;
          const hz = Math.pow(10, logMin + t * (logMax - logMin));
          const bin = Math.min(freqBuf.length - 1, Math.max(0, Math.round((hz / nyquist) * freqBuf.length)));
          let sum = 0, count = 0;
          for (let k = -1; k <= 1; k++) {
            const b = bin + k;
            if (b >= 0 && b < freqBuf.length) { sum += freqBuf[b]; count++; }
          }
          const v = count ? sum / count / 255 : 0;
          pts[i] = [t * w, h - Math.max(0, v * h * 0.92)];
        }

        if (active) {
          ctx2d.beginPath();
          ctx2d.moveTo(pts[0][0], h);
          for (const [x, y] of pts) ctx2d.lineTo(x, y);
          ctx2d.lineTo(pts[pts.length - 1][0], h);
          ctx2d.closePath();
          ctx2d.fillStyle = dimColor;
          ctx2d.fill();

          ctx2d.beginPath();
          pts.forEach(([x, y], i) => { if (i === 0) ctx2d.moveTo(x, y); else ctx2d.lineTo(x, y); });
          ctx2d.strokeStyle = "rgba(255,255,255,0.28)";
          ctx2d.lineWidth = 1;
          ctx2d.stroke();

          // Soft highlight glow over the target-frequency region (drawn as
          // a second, clipped-by-shape fill so it doesn't spill outside
          // the silhouette).
          if (highlightHz != null) {
            const hx = hzToX(highlightHz);
            ctx2d.save();
            ctx2d.beginPath();
            ctx2d.moveTo(pts[0][0], h);
            for (const [x, y] of pts) ctx2d.lineTo(x, y);
            ctx2d.lineTo(pts[pts.length - 1][0], h);
            ctx2d.closePath();
            ctx2d.clip();
            const grad = ctx2d.createRadialGradient(hx, h, 0, hx, h, w * 0.2);
            grad.addColorStop(0, color);
            grad.addColorStop(1, "rgba(0,0,0,0)");
            ctx2d.globalAlpha = 0.4;
            ctx2d.fillStyle = grad;
            ctx2d.fillRect(0, 0, w, h);
            ctx2d.restore();
          }
        } else {
          ctx2d.beginPath();
          ctx2d.moveTo(0, h - 1);
          ctx2d.lineTo(w, h - 1);
          ctx2d.strokeStyle = "rgba(255,255,255,0.06)";
          ctx2d.stroke();
        }

        if (active && highlightHz != null && !compare) {
          const x = hzToX(highlightHz);
          ctx2d.strokeStyle = color;
          ctx2d.globalAlpha = 0.9;
          ctx2d.lineWidth = 1.5;
          ctx2d.beginPath(); ctx2d.moveTo(x, 0); ctx2d.lineTo(x, h); ctx2d.stroke();
          ctx2d.globalAlpha = 1;
        }
      } else if (mode === "wave") {
        analyser.getByteTimeDomainData(timeBuf);
        ctx2d.strokeStyle = active ? color : "rgba(255,255,255,0.15)";
        ctx2d.lineWidth = 1.6;
        ctx2d.beginPath();
        const step = w / timeBuf.length;
        for (let i = 0; i < timeBuf.length; i++) {
          const v = timeBuf[i] / 128 - 1;
          const y = h / 2 + v * (h / 2) * 0.85;
          const x = i * step;
          if (i === 0) ctx2d.moveTo(x, y);
          else ctx2d.lineTo(x, y);
        }
        ctx2d.stroke();
      } else if (mode === "spectrogram") {
        // Scroll left by 1px then draw a new column on the right
        const off = spectroRef.current;
        if (off) {
          const octx = off.getContext("2d");
          if (octx) {
            // shift existing
            octx.globalCompositeOperation = "copy";
            octx.drawImage(off, -1, 0);
            octx.globalCompositeOperation = "source-over";
            if (active) {
              analyser.getByteFrequencyData(freqBuf);
              const colX = Math.max(0, off.width - 1);
              for (let y = 0; y < h; y++) {
                // log-freq mapping (top=high, bottom=low)
                const t = 1 - y / h;
                const hz = Math.pow(10, logMin + t * (logMax - logMin));
                const bin = Math.min(freqBuf.length - 1, Math.max(0, Math.round((hz / nyquist) * freqBuf.length)));
                const v = freqBuf[bin] / 255;
                octx.fillStyle = heat(Math.pow(v, 0.9));
                octx.fillRect(colX, y, 1, 1);
              }
            } else {
              // fade-out column
              const colX = Math.max(0, off.width - 1);
              octx.fillStyle = "rgba(0,0,0,0.15)";
              octx.fillRect(colX, 0, 1, h);
            }
            ctx2d.drawImage(off, 0, 0, w, h);
          }
        }
      } else if (mode === "meter") {
        analyser.getByteTimeDomainData(timeBuf);
        let sumSq = 0, mx = 0;
        for (let i = 0; i < timeBuf.length; i++) {
          const v = timeBuf[i] / 128 - 1;
          sumSq += v * v;
          const a = Math.abs(v);
          if (a > mx) mx = a;
        }
        const rms = Math.sqrt(sumSq / timeBuf.length);
        peak = Math.max(peak * 0.92, mx);
        const toDb = (x: number) => 20 * Math.log10(Math.max(1e-4, x));
        const rmsDb = Math.max(-60, toDb(rms));
        const pkDb = Math.max(-60, toDb(peak));
        const norm = (db: number) => (db + 60) / 60; // 0..1

        const barH = Math.max(10, h * 0.35);
        const top1 = h * 0.15;
        const top2 = top1 + barH + 8;

        // RMS bar
        ctx2d.fillStyle = "rgba(255,255,255,0.06)";
        ctx2d.fillRect(0, top1, w, barH);
        const grad = ctx2d.createLinearGradient(0, 0, w, 0);
        grad.addColorStop(0, "#34d399");
        grad.addColorStop(0.7, "#eab308");
        grad.addColorStop(1, "#ef4444");
        ctx2d.fillStyle = active ? grad : "rgba(255,255,255,0.1)";
        ctx2d.fillRect(0, top1, w * norm(rmsDb), barH);
        // Peak bar
        ctx2d.fillStyle = "rgba(255,255,255,0.06)";
        ctx2d.fillRect(0, top2, w, barH);
        ctx2d.fillStyle = active ? grad : "rgba(255,255,255,0.1)";
        ctx2d.fillRect(0, top2, w * norm(pkDb), barH);
        // labels
        ctx2d.fillStyle = "rgba(255,255,255,0.6)";
        ctx2d.font = "10px ui-monospace, monospace";
        ctx2d.fillText(`RMS ${rmsDb.toFixed(1)} dB`, 6, top1 - 2);
        ctx2d.fillText(`PEAK ${pkDb.toFixed(1)} dB`, 6, top2 - 2);
      }
    };

    draw();
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      ro.disconnect();
    };
  }, [active, mode, color, dimColor, highlightHz, compare]);

  return (
    <canvas
      ref={canvasRef}
      className={className ?? "block w-full rounded-xl border border-white/10 bg-black/60"}
      style={{
        height,
        background: transparent ? "transparent" : undefined,
        border: transparent ? "none" : undefined,
      }}
      aria-hidden
    />
  );
}
