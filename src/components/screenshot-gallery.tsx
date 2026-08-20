import { Trash2 } from "lucide-react";
import { BannerImage } from "@/components/banner-image";

export type GalleryScreenshot = { id: string; image_url: string; caption: string | null };

/** Personal image gallery on a profile ("Скриншоты" in the Steam
 * reference). Read-only when onDelete is omitted (public view); the
 * owner's own view passes it in for a hover-reveal remove button. */
export function ScreenshotGallery({ screenshots, onDelete }: { screenshots: GalleryScreenshot[]; onDelete?: (id: string) => void }) {
  if (screenshots.length === 0) return null;
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
      {screenshots.map((s) => (
        <div key={s.id} className="group relative aspect-video overflow-hidden rounded-lg bg-secondary">
          <BannerImage path={s.image_url} className="h-full w-full object-cover" />
          {s.caption && (
            <div className="pointer-events-none absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-black/70 to-transparent px-2 py-1.5 text-[11px] text-white opacity-0 transition-opacity group-hover:opacity-100">
              {s.caption}
            </div>
          )}
          {onDelete && (
            <button
              type="button"
              onClick={() => onDelete(s.id)}
              aria-label="Удалить скриншот"
              className="absolute right-1.5 top-1.5 hidden rounded-md bg-black/60 p-1.5 text-white backdrop-blur hover:bg-black/80 group-hover:block"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
