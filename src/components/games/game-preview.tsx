/**
 * Animated SVG mini-previews for each ear-training game.
 * Pure CSS/SMIL — no runtime cost, no images to ship.
 * Rendered inside a card header on /games; hover intensifies motion.
 */

type Kind =
  | "frequency" | "eq-cut" | "ear-eq" | "filter-type"
  | "db-quiz" | "db-pro" | "pan"
  | "compressor-ratio" | "compressor-attack" | "compressor-release" | "compression"
  | "distortion" | "delay-time" | "reverb";

export function GamePreview({ kind }: { kind: Kind }) {
  return (
    <div className="preview-wrap">
      <div className="preview-grid" aria-hidden />
      <div className="preview-glow" aria-hidden />
      <svg viewBox="0 0 200 88" className="preview-svg" preserveAspectRatio="none" aria-hidden>
        {renderScene(kind)}
      </svg>
      <div className="preview-scan" aria-hidden />
    </div>
  );
}

function renderScene(kind: Kind) {
  switch (kind) {
    case "frequency":
      // EQ boost bell riding across the spectrum
      return (
        <>
          <path d="M0 60 L200 60" stroke="rgba(255,255,255,.08)" />
          <g className="anim-slide-x">
            <path
              d="M-30 60 Q-15 20 0 60 Z"
              fill="url(#g-mint)"
              opacity="0.55"
            />
            <path d="M-30 60 Q-15 20 0 60" stroke="var(--mint)" strokeWidth="1.4" fill="none" />
          </g>
          <path d="M0 60 Q50 58 100 60 T200 60" stroke="var(--mint)" strokeWidth="1" fill="none" opacity="0.35" />
          {defsMint()}
        </>
      );
    case "eq-cut":
      return (
        <>
          <path d="M0 40 L200 40" stroke="rgba(255,255,255,.08)" />
          <g className="anim-slide-x">
            <path d="M-30 40 Q-15 82 0 40 Z" fill="url(#g-red)" opacity="0.5" />
            <path d="M-30 40 Q-15 82 0 40" stroke="#f87171" strokeWidth="1.4" fill="none" />
          </g>
          <defs>
            <linearGradient id="g-red" x1="0" y1="1" x2="0" y2="0">
              <stop offset="0" stopColor="#f87171" stopOpacity="0" />
              <stop offset="1" stopColor="#f87171" stopOpacity="0.7" />
            </linearGradient>
          </defs>
        </>
      );
    case "ear-eq":
      return (
        <>
          {[20, 60, 100, 140, 180].map((x, i) => (
            <circle key={i} cx={x} cy="44" r="3" fill="var(--mint)"
              className="anim-pulse" style={{ animationDelay: `${i * 0.15}s` }} />
          ))}
          <path d="M10 44 L190 44" stroke="rgba(255,255,255,.1)" />
          <path d="M20 44 L60 44 L60 20 L100 20 L100 44 L140 44 L140 66 L180 66"
            stroke="var(--mint)" strokeWidth="1.4" fill="none" className="anim-dash" strokeDasharray="4 4" />
        </>
      );
    case "filter-type":
      return (
        <>
          <path d="M0 20 Q60 20 90 40 T200 80" stroke="var(--mint)" strokeWidth="1.6" fill="none" className="anim-morph" />
          <path d="M0 20 L200 20" stroke="rgba(255,255,255,.08)" />
          <text x="8" y="80" fill="rgba(255,255,255,.35)" fontSize="8" fontFamily="ui-monospace">LP · HP · BP · NOTCH</text>
        </>
      );
    case "db-quiz":
    case "db-pro":
      return (
        <>
          {[10, 30, 50, 70, 90, 110, 130, 150, 170, 190].map((x, i) => (
            <rect key={i} x={x - 4} y="20" width="8" height="60" rx="1"
              fill={i < 6 ? "var(--mint)" : "rgba(255,255,255,.15)"} className="anim-vu" style={{ animationDelay: `${i * 0.08}s` }} />
          ))}
        </>
      );
    case "pan":
      return (
        <>
          <line x1="20" y1="44" x2="180" y2="44" stroke="rgba(255,255,255,.15)" />
          <circle cx="100" cy="44" r="1.5" fill="rgba(255,255,255,.4)" />
          <text x="16" y="70" fill="rgba(255,255,255,.35)" fontSize="8" fontFamily="ui-monospace">L</text>
          <text x="178" y="70" fill="rgba(255,255,255,.35)" fontSize="8" fontFamily="ui-monospace">R</text>
          <circle cx="20" cy="44" r="6" fill="var(--mint)" className="anim-pan">
            <animate attributeName="cx" values="30;170;30" dur="4s" repeatCount="indefinite" />
          </circle>
        </>
      );
    case "compressor-ratio":
    case "compression":
      return (
        <>
          <path d="M10 78 L80 20 L190 20" stroke="rgba(255,255,255,.15)" strokeWidth="1" fill="none" strokeDasharray="2 3" />
          <path d="M10 78 L80 40 L190 30" stroke="var(--mint)" strokeWidth="1.6" fill="none" className="anim-dash" />
          <circle cx="80" cy="40" r="3" fill="var(--mint)" className="anim-pulse" />
        </>
      );
    case "compressor-attack":
      return (
        <>
          <path d="M0 60 L60 60 L62 20 L110 30 L180 40 L200 42"
            stroke="var(--mint)" strokeWidth="1.6" fill="none" className="anim-dash" />
          <path d="M60 10 L60 78" stroke="rgba(255,255,255,.15)" strokeDasharray="2 2" />
          <text x="66" y="16" fill="rgba(255,255,255,.4)" fontSize="7" fontFamily="ui-monospace">ATTACK</text>
        </>
      );
    case "compressor-release":
      return (
        <>
          <path d="M0 20 L40 20 L60 60 L200 62"
            stroke="var(--mint)" strokeWidth="1.6" fill="none" className="anim-dash" />
          <text x="70" y="76" fill="rgba(255,255,255,.4)" fontSize="7" fontFamily="ui-monospace">RELEASE →</text>
        </>
      );
    case "distortion":
      return (
        <>
          <path
            d="M0 44 Q10 20 20 44 T40 44 T60 44 T80 44 T100 44 T120 44 T140 44 T160 44 T180 44 T200 44"
            stroke="var(--mint)" strokeWidth="1.6" fill="none" className="anim-morph" />
          <path
            d="M0 44 Q10 30 20 44 T40 44 T60 44 T80 44 T100 44 T120 44 T140 44 T160 44 T180 44 T200 44"
            stroke="var(--mint)" strokeWidth="1" fill="none" opacity=".3" />
        </>
      );
    case "delay-time":
      return (
        <>
          {[0, 1, 2, 3, 4].map((i) => (
            <rect key={i} x={20 + i * 36} y={40 - i * 4} width="4" height={16 + i * 4}
              fill="var(--mint)" opacity={1 - i * 0.18} className="anim-tap" style={{ animationDelay: `${i * 0.12}s` }} />
          ))}
        </>
      );
    case "reverb":
      return (
        <>
          <circle cx="100" cy="44" r="6" fill="var(--mint)" />
          {[14, 24, 34, 44].map((r, i) => (
            <circle key={i} cx="100" cy="44" r={r} fill="none" stroke="var(--mint)"
              strokeOpacity={0.5 - i * 0.1} className="anim-ripple" style={{ animationDelay: `${i * 0.4}s` }} />
          ))}
        </>
      );
  }
}

function defsMint() {
  return (
    <defs>
      <linearGradient id="g-mint" x1="0" y1="1" x2="0" y2="0">
        <stop offset="0" stopColor="var(--mint)" stopOpacity="0" />
        <stop offset="1" stopColor="var(--mint)" stopOpacity="0.65" />
      </linearGradient>
    </defs>
  );
}

export type { Kind as GamePreviewKind };
