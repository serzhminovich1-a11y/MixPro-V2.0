import { supabase } from "@/integrations/supabase/client";

// Client-safe: no secrets here, just URL construction + the legacy
// fallback lookup. The bucket is public-read, so a public object URL is a
// pure string template — no signing, no network round-trip, never expires.
const YANDEX_BUCKET = "mixpro-files";

export function publicStorageUrl(path: string): string {
  return `https://${YANDEX_BUCKET}.storage.yandexcloud.net/${path}`;
}

/** Storage "folders" — plain key prefixes within the one shared bucket. */
export const STORAGE_PREFIX = {
  avatars: "avatars",
  wall: "wall",
  presets: "presets",
  lessonAssets: "lesson-assets",
  gameLoops: "game-loops",
} as const;
type PrefixKey = keyof typeof STORAGE_PREFIX;

/**
 * Resolve a stored path to a displayable URL. Anything uploaded from this
 * migration onward lives in the shared Yandex bucket (path starts with
 * its prefix, e.g. "avatars/...") and resolves instantly to a permanent
 * public URL, no network call. Anything uploaded *before* this migration
 * is still sitting in the old per-purpose Supabase bucket — falls back to
 * a short-lived signed URL there instead of needing every existing file
 * physically copied over on day one.
 */
export async function resolveStorageUrl(
  prefixKey: PrefixKey,
  path: string | null | undefined,
  legacySupabaseBucket: string,
  legacyTtlSeconds = 3600,
): Promise<string | null> {
  if (!path) return null;
  if (path.startsWith("http")) return path;
  if (path.startsWith(`${STORAGE_PREFIX[prefixKey]}/`)) return publicStorageUrl(path);
  const { data } = await supabase.storage.from(legacySupabaseBucket).createSignedUrl(path, legacyTtlSeconds);
  return data?.signedUrl ?? null;
}
