import { useEffect, useRef } from "react";

/** Animated neon waveform on canvas — MixPro hero background. */
export function Waveform({ className }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    let t = 0;

    function resize() {
      if (!canvas) return;
      canvas.width = canvas.offsetWidth * devicePixelRatio;
      canvas.height = canvas.offsetHeight * devicePixelRatio;
    }
    resize();
    window.addEventListener("resize", resize);

    const colors = ["rgba(74,222,128,0.55)", "rgba(103,232,249,0.4)", "rgba(167,139,250,0.35)"];

    function draw() {
      if (!canvas || !ctx) return;
      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);
      colors.forEach((color, ci) => {
        ctx.beginPath();
        ctx.strokeStyle = color;
        ctx.lineWidth = 2 * devicePixelRatio;
        for (let x = 0; x <= w; x += 4) {
          const p = x / w;
          const env = Math.sin(p * Math.PI);
          const y =
            h / 2 +
            env *
              (Math.sin(p * 14 + t * (1.2 + ci * 0.3) + ci * 2) * h * 0.16 +
                Math.sin(p * 34 - t * 1.8 + ci) * h * 0.06);
          if (x === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      });
      t += 0.016;
      raf = requestAnimationFrame(draw);
    }
    raf = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return <canvas ref={canvasRef} className={className} aria-hidden="true" />;
}
