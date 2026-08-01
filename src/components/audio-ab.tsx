import { useEffect, useRef, useState } from "react";
import { Play, Pause } from "lucide-react";

type Props = {
  urlA: string;
  urlB: string;
  labelA?: string;
  labelB?: string;
  caption?: string;
  /** Hide labels — used inside quiz "hear the difference" mode. */
  blind?: boolean;
};

/** Two-track compare with volume-match trim and hot-swap between A / B. */
export function AudioAB({ urlA, urlB, labelA = "A", labelB = "B", caption, blind = false }: Props) {
  const aRef = useRef<HTMLAudioElement>(null);
  const bRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState<"a" | "b" | null>(null);
  const [trim, setTrim] = useState(0); // dB, applies to B

  useEffect(() => {
    if (bRef.current) bRef.current.volume = Math.min(1, Math.max(0, Math.pow(10, trim / 20)));
  }, [trim]);

  function play(which: "a" | "b") {
    const a = aRef.current, b = bRef.current;
    if (!a || !b) return;
    if (which === "a") {
      b.pause();
      // sync position so switching is truly A/B
      a.currentTime = b.currentTime && b.currentTime < a.duration ? b.currentTime : a.currentTime;
      a.play().catch(() => {});
    } else {
      a.pause();
      b.currentTime = a.currentTime && a.currentTime < b.duration ? a.currentTime : b.currentTime;
      b.play().catch(() => {});
    }
    setPlaying(which);
  }
  function stop() {
    aRef.current?.pause();
    bRef.current?.pause();
    setPlaying(null);
  }

  return (
    <div className="rounded-xl border border-black/40 bg-black/30 p-3">
      <div className="flex items-center gap-2">
        <button
          onClick={() => (playing === "a" ? stop() : play("a"))}
          className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold transition-colors ${
            playing === "a" ? "border-mint/60 bg-mint/20 text-mint" : "border-black/50 bg-black/40 hover:border-mint/40"
          }`}
        >
          {playing === "a" ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
          {blind ? "Play 1" : labelA}
        </button>
        <button
          onClick={() => (playing === "b" ? stop() : play("b"))}
          className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold transition-colors ${
            playing === "b" ? "border-cyan/60 bg-cyan/20 text-cyan" : "border-black/50 bg-black/40 hover:border-cyan/40"
          }`}
        >
          {playing === "b" ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
          {blind ? "Play 2" : labelB}
        </button>
        {!blind && (
          <label className="ml-auto flex items-center gap-2 text-[10px] uppercase tracking-wider text-muted-foreground">
            Trim B
            <input type="range" min={-12} max={12} step={0.5} value={trim} onChange={(e) => setTrim(+e.target.value)} className="w-24" />
            <span className="font-mono text-mint">{trim > 0 ? `+${trim.toFixed(1)}` : trim.toFixed(1)} dB</span>
          </label>
        )}
      </div>
      {caption && <div className="mt-2 text-xs text-muted-foreground">{caption}</div>}
      <audio ref={aRef} src={urlA} preload="metadata" onEnded={() => setPlaying(null)} />
      <audio ref={bRef} src={urlB} preload="metadata" onEnded={() => setPlaying(null)} />
    </div>
  );
}
