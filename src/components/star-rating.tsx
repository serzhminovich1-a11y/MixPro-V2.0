import { Star } from "lucide-react";

/** Read-only star display — half-filled via a clipped overlay star, not a
 * font glyph, so it renders identically everywhere (see leaderboard.tsx's
 * emoji-medal fix for why bare glyphs were dropped elsewhere in this pass). */
export function StarRating({ value, size = 14 }: { value: number; size?: number }) {
  return (
    <span className="inline-flex items-center" aria-label={`${value.toFixed(1)} из 5`}>
      {[1, 2, 3, 4, 5].map((n) => {
        const fill = Math.max(0, Math.min(1, value - (n - 1)));
        return (
          <span key={n} className="relative inline-block" style={{ width: size, height: size }}>
            <Star className="absolute inset-0 text-muted-foreground/40" style={{ width: size, height: size }} />
            <span className="absolute inset-0 overflow-hidden" style={{ width: `${fill * 100}%` }}>
              <Star className="fill-amber-300 text-amber-300" style={{ width: size, height: size }} />
            </span>
          </span>
        );
      })}
    </span>
  );
}

/** Interactive 1–5 picker for leaving a review. */
export function StarPicker({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <span className="inline-flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(n)}
          aria-label={`${n} из 5`}
          className="p-0.5"
        >
          <Star className={`h-5 w-5 transition-colors ${n <= value ? "fill-amber-300 text-amber-300" : "text-muted-foreground/40 hover:text-amber-300/60"}`} />
        </button>
      ))}
    </span>
  );
}
