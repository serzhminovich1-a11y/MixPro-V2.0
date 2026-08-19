import { useEffect, useMemo, useState } from "react";
import { resolveStorageUrl, publicStorageUrl, STORAGE_PREFIX } from "@/lib/storage-url";

/** Same shape as AvatarImage's fast path (see avatar-image.tsx) — a path
 * already uploaded post-Yandex-migration resolves synchronously with no
 * network call, so this only awaits anything for a genuinely legacy path. */
function fastBannerUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  if (path.startsWith("http") || path.startsWith("data:") || path.startsWith("blob:")) return path;
  if (path.startsWith(`${STORAGE_PREFIX.banners}/`)) return publicStorageUrl(path);
  return null;
}

type Props = { path: string | null | undefined; className?: string };

/** Renders a profile banner image if one's set; renders nothing (parent
 * supplies the fallback gradient) otherwise. */
export function BannerImage({ path, className }: Props) {
  const fast = useMemo(() => fastBannerUrl(path), [path]);
  const [resolved, setResolved] = useState<string | null>(null);

  useEffect(() => {
    if (fast || !path) return;
    let alive = true;
    resolveStorageUrl("banners", path, "banners").then((u) => {
      if (alive) setResolved(u);
    });
    return () => {
      alive = false;
    };
  }, [path, fast]);

  const src = fast ?? resolved;
  if (!src) return null;
  return <img src={src} alt="" className={className} loading="lazy" />;
}
