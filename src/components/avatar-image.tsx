import { useEffect, useMemo, useState } from "react";
import { resolveStorageUrl, publicStorageUrl, STORAGE_PREFIX } from "@/lib/storage-url";

const cache = new Map<string, string>();

/** The common case — already a plain URL, or uploaded post-Yandex-migration
 * — resolves to a pure string template with zero network call (see
 * resolveStorageUrl's own comment). Only a genuinely legacy (pre-migration)
 * path needs the async signed-URL round trip below. Splitting this out lets
 * <AvatarImage> skip a render+effect cycle (and the "flash of the fallback
 * initial") for every avatar that's already on the fast path — which by now
 * is most of them. */
function fastAvatarUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  if (path.startsWith("http") || path.startsWith("data:") || path.startsWith("blob:")) return path;
  if (path.startsWith(`${STORAGE_PREFIX.avatars}/`)) return publicStorageUrl(path);
  return null;
}

export async function resolveAvatarUrl(path: string | null | undefined): Promise<string | null> {
  const fast = fastAvatarUrl(path);
  if (fast) return fast;
  if (!path) return null;
  const cached = cache.get(path);
  if (cached) return cached;
  const url = await resolveStorageUrl("avatars", path, "avatars");
  if (url) cache.set(path, url);
  return url;
}

type Props = {
  path: string | null | undefined;
  fallback: string;
  className?: string;
  alt?: string;
};

/** Renders an avatar image, signing Supabase storage paths on the fly.
 * Resolves synchronously — no loading flash — for anything already a plain
 * URL or uploaded post-migration; only a legacy path falls through to an
 * async signed-URL fetch. */
export function AvatarImage({ path, fallback, className, alt = "" }: Props) {
  const fast = useMemo(() => fastAvatarUrl(path), [path]);
  const [resolved, setResolved] = useState<string | null>(null);

  useEffect(() => {
    if (fast) return; // already resolved synchronously — nothing to fetch
    let alive = true;
    resolveAvatarUrl(path).then((u) => {
      if (alive) setResolved(u);
    });
    return () => {
      alive = false;
    };
  }, [path, fast]);

  const src = fast ?? resolved;
  if (!src) {
    return <span className={className}>{fallback}</span>;
  }
  return <img src={src} alt={alt} className={className} loading="lazy" />;
}
