/**
 * Dry-loop source registry.
 * Fetches active loops from `game_loops`, signs URLs from the `game-loops`
 * bucket, decodes them into AudioBuffers, and exposes them as a source
 * for the game engine.
 */
import { supabase } from "@/integrations/supabase/client";
import { getAudioContext } from "@/lib/audio";

export type LoopRow = {
  id: string;
  title: string;
  storage_path: string;
  category: string;
  bpm: number | null;
  key: string | null;
  duration_seconds: number | null;
};

const bufferCache = new Map<string, AudioBuffer>();
let loopsPromise: Promise<LoopRow[]> | null = null;
let cachedLoops: LoopRow[] = [];

export async function listActiveLoops(force = false): Promise<LoopRow[]> {
  if (!force && loopsPromise) return loopsPromise;
  loopsPromise = (async () => {
    const { data, error } = await supabase
      .from("game_loops")
      .select("id,title,storage_path,category,bpm,key,duration_seconds")
      .eq("is_active", true)
      .order("created_at", { ascending: false });
    if (error) throw error;
    cachedLoops = (data ?? []) as LoopRow[];
    return cachedLoops;
  })();
  return loopsPromise;
}

export function getCachedLoops(): LoopRow[] {
  return cachedLoops;
}

export async function decodeLoop(row: LoopRow): Promise<AudioBuffer> {
  const cached = bufferCache.get(row.id);
  if (cached) return cached;
  const { data, error } = await supabase.storage
    .from("game-loops")
    .createSignedUrl(row.storage_path, 60 * 60);
  if (error || !data?.signedUrl) throw error ?? new Error("signed url failed");
  const res = await fetch(data.signedUrl);
  const arr = await res.arrayBuffer();
  const ac = getAudioContext();
  const buf = await ac.decodeAudioData(arr);
  bufferCache.set(row.id, buf);
  return buf;
}

/**
 * Session-scoped pinned loop. When set, `pickLoop` always returns it
 * regardless of category — that's how "Open this loop in trainer X"
 * from the admin Loops Library works across every game.
 */
const PIN_KEY = "mixpro.games.pinnedLoopId";

export function getPinnedLoopId(): string | null {
  if (typeof window === "undefined") return null;
  try { return window.sessionStorage.getItem(PIN_KEY); } catch { return null; }
}
export function setPinnedLoopId(id: string | null) {
  if (typeof window === "undefined") return;
  try {
    if (id) window.sessionStorage.setItem(PIN_KEY, id);
    else window.sessionStorage.removeItem(PIN_KEY);
  } catch { /* */ }
}

/** Pick a loop: pinned wins, then category match, then any active loop. */
export function pickLoop(category?: string): LoopRow | null {
  if (!cachedLoops.length) return null;
  const pinnedId = getPinnedLoopId();
  if (pinnedId) {
    const pinned = cachedLoops.find((l) => l.id === pinnedId);
    if (pinned) return pinned;
  }
  const pool = category
    ? cachedLoops.filter((l) => l.category === category)
    : cachedLoops;
  const use = pool.length ? pool : cachedLoops;
  return use[Math.floor(Math.random() * use.length)];
}

/** Preload metadata + decode a couple of loops so first play doesn't stall. */
export async function preloadLoops(max = 2): Promise<void> {
  try {
    const loops = await listActiveLoops();
    await Promise.all(loops.slice(0, max).map((l) => decodeLoop(l).catch(() => null)));
  } catch {
    /* offline or logged out — fall back to procedural */
  }
}
