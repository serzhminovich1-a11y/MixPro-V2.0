import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

const cache = new Map<string, string>();

export async function resolveAvatarUrl(path: string | null | undefined): Promise<string | null> {
  if (!path) return null;
  if (path.startsWith("http") || path.startsWith("data:") || path.startsWith("blob:")) return path;
  const cached = cache.get(path);
  if (cached) return cached;
  const { data } = await supabase.storage.from("avatars").createSignedUrl(path, 3600);
  const url = data?.signedUrl ?? null;
  if (url) cache.set(path, url);
  return url;
}

type Props = {
  path: string | null | undefined;
  fallback: string;
  className?: string;
  alt?: string;
};

/** Renders an avatar image, signing Supabase storage paths on the fly. */
export function AvatarImage({ path, fallback, className, alt = "" }: Props) {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    resolveAvatarUrl(path).then((u) => {
      if (alive) setSrc(u);
    });
    return () => {
      alive = false;
    };
  }, [path]);

  if (!src) {
    return <span className={className}>{fallback}</span>;
  }
  return <img src={src} alt={alt} className={className} />;
}
