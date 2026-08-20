import { useState } from "react";
import { Play, Trash2 } from "lucide-react";
import { youtubeId, youtubeThumbnail, youtubeEmbedUrl } from "@/lib/video-embed";

export type GalleryVideo = { id: string; title: string; url: string };

/** Video links (YouTube only — no upload/hosting infra exists). Clicking a
 * thumbnail swaps it for an inline iframe embed rather than navigating
 * away, matching how lightweight the rest of these profile sections are. */
export function VideoGrid({ videos, onDelete }: { videos: GalleryVideo[]; onDelete?: (id: string) => void }) {
  const [playing, setPlaying] = useState<string | null>(null);
  if (videos.length === 0) return null;
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {videos.map((v) => {
        const ytId = youtubeId(v.url);
        const isPlaying = playing === v.id;
        return (
          <div key={v.id} className="overflow-hidden rounded-xl border border-border/60 bg-secondary/30">
            <div className="group relative aspect-video bg-secondary">
              {isPlaying && ytId ? (
                <iframe
                  src={youtubeEmbedUrl(ytId)}
                  title={v.title}
                  className="h-full w-full"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                />
              ) : (
                <button
                  type="button"
                  onClick={() => ytId && setPlaying(v.id)}
                  className="relative block h-full w-full"
                  disabled={!ytId}
                >
                  {ytId && <img src={youtubeThumbnail(ytId)} alt="" className="h-full w-full object-cover" loading="lazy" />}
                  <span className="absolute inset-0 grid place-items-center bg-black/30 transition-colors group-hover:bg-black/50">
                    <span className="grid h-10 w-10 place-items-center rounded-full bg-white/90 text-black">
                      <Play className="h-4 w-4 fill-current" />
                    </span>
                  </span>
                </button>
              )}
            </div>
            <div className="flex items-center justify-between gap-2 px-3 py-2">
              <p className="min-w-0 truncate text-sm font-medium">{v.title}</p>
              {onDelete && (
                <button type="button" onClick={() => onDelete(v.id)} aria-label="Удалить видео" className="shrink-0 text-muted-foreground hover:text-destructive">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
