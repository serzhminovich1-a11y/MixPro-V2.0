import type { Block } from "@/lib/course-blocks";
import { normalizeVideoEmbed } from "@/lib/course-blocks";
import { AudioAB } from "@/components/audio-ab";

/** Read-only renderer for a block list — used by the lesson viewer. */
export function BlockRenderer({ blocks }: { blocks: Block[] }) {
  return (
    <div className="space-y-6">
      {blocks.map((b) => (
        <RenderBlock key={b.id} block={b} />
      ))}
    </div>
  );
}

function RenderBlock({ block: b }: { block: Block }) {
  switch (b.type) {
    case "heading": {
      const styles: React.CSSProperties = {
        textAlign: b.align ?? "left",
        color: b.color || undefined,
        fontFamily: b.font || undefined,
      };
      const cls = b.level === 1 ? "text-3xl md:text-4xl font-bold" : b.level === 2 ? "text-2xl font-semibold mt-6" : "text-xl font-semibold mt-4";
      if (b.level === 1) return <h1 className={cls} style={styles}>{b.text}</h1>;
      if (b.level === 2) return <h2 className={cls} style={styles}>{b.text}</h2>;
      return <h3 className={cls} style={styles}>{b.text}</h3>;
    }
    case "paragraph":
      return (
        <p
          className="leading-relaxed text-foreground/90"
          style={{ textAlign: b.align, fontFamily: b.font, fontSize: b.size ? `${b.size}px` : undefined }}
          dangerouslySetInnerHTML={{ __html: b.html }}
        />
      );
    case "image": {
      const alignClass = b.align === "left" ? "mr-auto" : b.align === "right" ? "ml-auto" : "mx-auto";
      return (
        <figure className={`block ${alignClass}`} style={{ width: `${b.width ?? 100}%` }}>
          {b.url ? (
            <img src={b.url} alt={b.caption ?? ""} className="w-full rounded-xl border border-black/40" />
          ) : (
            <div className="rounded-xl border border-dashed border-black/40 p-8 text-center text-xs text-muted-foreground">Нет URL картинки</div>
          )}
          {b.caption && <figcaption className="mt-2 text-center text-xs text-muted-foreground">{b.caption}</figcaption>}
        </figure>
      );
    }
    case "video": {
      const embed = normalizeVideoEmbed(b.url);
      return (
        <figure>
          {embed ? (
            <div className="aspect-video overflow-hidden rounded-xl border border-black/40">
              <iframe src={embed} className="h-full w-full" allowFullScreen title={b.caption ?? "video"} allow="autoplay; encrypted-media; picture-in-picture" />
            </div>
          ) : b.url ? (
            <video src={b.url} controls className="w-full rounded-xl border border-black/40" />
          ) : (
            <div className="rounded-xl border border-dashed border-black/40 p-8 text-center text-xs text-muted-foreground">Нет URL видео</div>
          )}
          {b.caption && <figcaption className="mt-2 text-center text-xs text-muted-foreground">{b.caption}</figcaption>}
        </figure>
      );
    }
    case "audio":
      return (
        <div className="rounded-xl border border-black/40 bg-black/30 p-4">
          {b.url ? <audio src={b.url} controls className="w-full" /> : <span className="text-xs text-muted-foreground">Нет URL аудио</span>}
          {b.caption && <div className="mt-2 text-xs text-muted-foreground">{b.caption}</div>}
        </div>
      );
    case "audio_ab":
      return <AudioAB urlA={b.urlA} urlB={b.urlB} labelA={b.labelA} labelB={b.labelB} caption={b.caption} blind={b.blind} />;
    case "code":
      return (
        <pre className="overflow-x-auto rounded-xl border border-black/40 bg-black/60 p-4 text-sm text-cyan">
          <code>{b.code}</code>
        </pre>
      );
    case "callout": {
      const map: Record<string, string> = {
        info: "border-cyan/40 bg-cyan/10 text-cyan",
        warn: "border-amber-400/40 bg-amber-400/10 text-amber-200",
        success: "border-mint/40 bg-mint/10 text-mint",
        danger: "border-destructive/40 bg-destructive/10 text-destructive",
        tip: "border-violet/40 bg-violet/10 text-violet-200",
      };
      return (
        <aside className={`rounded-xl border p-4 text-sm ${map[b.variant] ?? map.info}`}>
          {b.title && <div className="mb-1 font-semibold uppercase tracking-wider text-xs">{b.title}</div>}
          <div className="text-foreground/90 whitespace-pre-wrap">{b.text}</div>
        </aside>
      );
    }
    case "divider":
      return <hr className="border-t border-black/40" />;
    case "list":
      return b.ordered ? (
        <ol className="list-decimal space-y-1 pl-6 text-foreground/90">{b.items.map((it, i) => <li key={i}>{it}</li>)}</ol>
      ) : (
        <ul className="list-disc space-y-1 pl-6 text-foreground/90">{b.items.map((it, i) => <li key={i}>{it}</li>)}</ul>
      );
    case "quote":
      return (
        <blockquote className="border-l-4 border-mint/60 pl-4 italic text-foreground/90">
          <p>{b.text}</p>
          {b.author && <footer className="mt-2 text-xs text-muted-foreground">— {b.author}</footer>}
        </blockquote>
      );
    case "embed":
      return <div className="rounded-xl border border-black/40 overflow-hidden" dangerouslySetInnerHTML={{ __html: b.html }} />;
  }
}
