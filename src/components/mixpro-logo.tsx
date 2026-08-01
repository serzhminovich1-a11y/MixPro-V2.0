import { cn } from "@/lib/utils";

export type LogoVariant =
  | "inline"
  | "dot"
  | "badge"
  | "bracket"
  | "slash"
  | "chip"
  | "underline"
  | "mono"
  | "waveform"
  | "outline";

interface Props {
  variant?: LogoVariant;
  size?: "sm" | "md" | "lg";
  className?: string;
}

/**
 * Compact wordmarks for MIXPRO. All variants are optically sized to sit
 * comfortably in a navigation bar at `sm`, and scale up cleanly to `lg`
 * for the brand picker. Uses only tokenized colors + system fonts.
 */
export function MixproLogo({ variant = "inline", size = "sm", className }: Props) {
  // Base font sizes tuned so `sm` reads at ~14px in the nav.
  const s =
    size === "sm"
      ? { text: "text-[13px]", sub: "text-[8px]", pad: "px-1.5 py-0.5", dot: "h-1.5 w-1.5", gap: "gap-1.5" }
      : size === "lg"
      ? { text: "text-3xl", sub: "text-[11px]", pad: "px-3 py-1.5", dot: "h-2.5 w-2.5", gap: "gap-2.5" }
      : { text: "text-lg", sub: "text-[9px]", pad: "px-2 py-1", dot: "h-2 w-2", gap: "gap-2" };

  const heavy = { fontFamily: "'Archivo Black','Helvetica Neue',sans-serif" } as const;
  const mono = { fontFamily: "'JetBrains Mono',ui-monospace,monospace" } as const;
  const thin = { fontFamily: "'Michroma','Helvetica Neue',sans-serif" } as const;

  // 1 — inline: MIXPRO with PRO as accent. Cleanest for nav.
  if (variant === "inline") {
    return (
      <span
        className={cn("inline-flex items-baseline leading-none tracking-tight text-foreground", s.text, className)}
        style={heavy}
      >
        <span>MIX</span>
        <span className="text-mint">PRO</span>
      </span>
    );
  }

  // 2 — dot: pulse dot + wordmark
  if (variant === "dot") {
    return (
      <span className={cn("inline-flex items-center leading-none text-foreground", s.gap, s.text, className)} style={heavy}>
        <span className={cn("shrink-0 rounded-full bg-mint shadow-[0_0_8px_var(--mint)]", s.dot)} />
        <span className="tracking-tight">MIXPRO</span>
      </span>
    );
  }

  // 3 — badge: MX square + wordmark
  if (variant === "badge") {
    return (
      <span className={cn("inline-flex items-center leading-none text-foreground", s.gap, className)}>
        <span
          className={cn(
            "grid aspect-square place-items-center border border-mint/70 bg-mint/10 text-mint",
            size === "sm" ? "h-5 text-[9px]" : size === "lg" ? "h-9 text-[13px]" : "h-6 text-[10px]",
          )}
          style={heavy}
        >
          MX
        </span>
        <span className={cn("tracking-tight", s.text)} style={heavy}>
          MIXPRO
        </span>
      </span>
    );
  }

  // 4 — bracket: [ MIXPRO ]
  if (variant === "bracket") {
    return (
      <span className={cn("inline-flex items-baseline text-foreground", s.text, className)} style={heavy}>
        <span className="text-mint/70">[</span>
        <span className="mx-1 tracking-tight">MIXPRO</span>
        <span className="text-mint/70">]</span>
      </span>
    );
  }

  // 5 — slash: MIXPRO / audio
  if (variant === "slash") {
    return (
      <span className={cn("inline-flex items-baseline leading-none", s.gap, className)}>
        <span className={cn("tracking-tight text-foreground", s.text)} style={heavy}>
          MIXPRO
        </span>
        <span className="text-foreground/40" style={mono}>
          /
        </span>
        <span className={cn("uppercase text-foreground/55 tracking-[0.3em]", s.sub)} style={thin}>
          audio
        </span>
      </span>
    );
  }

  // 6 — chip: pill with mint left rail
  if (variant === "chip") {
    return (
      <span
        className={cn(
          "inline-flex items-center border border-foreground/15 bg-[var(--panel-deep,rgba(0,0,0,.35))] leading-none text-foreground",
          s.pad,
          s.gap,
          className,
        )}
      >
        <span className="h-[1em] w-[2px] bg-mint shadow-[0_0_6px_var(--mint)]" />
        <span className={cn("tracking-tight", s.text)} style={heavy}>
          MIXPRO
        </span>
      </span>
    );
  }

  // 7 — underline: wordmark with mint underline sized to text
  if (variant === "underline") {
    return (
      <span className={cn("inline-flex flex-col items-start leading-none", className)}>
        <span className={cn("tracking-tight text-foreground", s.text)} style={heavy}>
          MIXPRO
        </span>
        <span className="mt-0.5 h-[2px] w-full bg-mint shadow-[0_0_6px_var(--mint)]" />
      </span>
    );
  }

  // 8 — mono: technical monospace tag
  if (variant === "mono") {
    return (
      <span className={cn("inline-flex items-baseline leading-none text-foreground", s.text, className)} style={mono}>
        <span className="text-foreground/50">&gt;_</span>
        <span className="ml-1 tracking-tight">mixpro</span>
      </span>
    );
  }

  // 9 — waveform: mini bars + wordmark
  if (variant === "waveform") {
    const bars = size === "sm" ? [3, 6, 4, 8, 5] : size === "lg" ? [5, 10, 7, 14, 9, 6] : [4, 8, 5, 11, 7];
    return (
      <span className={cn("inline-flex items-center leading-none text-foreground", s.gap, className)}>
        <span className="flex items-end gap-[2px]">
          {bars.map((h, i) => (
            <span key={i} className="w-[2px] bg-mint" style={{ height: h, boxShadow: "0 0 4px var(--mint)" }} />
          ))}
        </span>
        <span className={cn("tracking-tight", s.text)} style={heavy}>
          MIXPRO
        </span>
      </span>
    );
  }

  // 10 — outline: thin ghost/outline wordmark
  return (
    <span
      className={cn("inline-flex leading-none tracking-[0.12em] text-foreground", s.text, className)}
      style={{
        ...heavy,
        WebkitTextStroke: "1px currentColor",
        color: "transparent",
      }}
    >
      MIXPRO
    </span>
  );
}
