import { supabase } from "@/integrations/supabase/client";

export type UploadProgress = {
  loaded: number;
  total: number;
  percent: number;
};

export type UploadOptions = {
  contentType?: string;
  upsert?: boolean;
  cacheControl?: string;
  onProgress?: (p: UploadProgress) => void;
};

/**
 * Upload a file to Supabase Storage with real progress events.
 * Uses createSignedUploadUrl + XMLHttpRequest so we get `progress` events
 * (the JS SDK `.upload()` doesn't expose progress).
 */
export async function uploadWithProgress(
  bucket: string,
  path: string,
  file: Blob,
  opts: UploadOptions = {},
): Promise<{ error: Error | null }> {
  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUploadUrl(path, { upsert: opts.upsert ?? false });
  if (error || !data) {
    return { error: error ?? new Error("createSignedUploadUrl failed") };
  }

  return await new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", data.signedUrl, true);
    if (opts.contentType) xhr.setRequestHeader("Content-Type", opts.contentType);
    if (opts.cacheControl) xhr.setRequestHeader("Cache-Control", opts.cacheControl);
    if (opts.upsert) xhr.setRequestHeader("x-upsert", "true");

    xhr.upload.onprogress = (e) => {
      if (!e.lengthComputable) return;
      opts.onProgress?.({
        loaded: e.loaded,
        total: e.total,
        percent: Math.round((e.loaded / e.total) * 100),
      });
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        opts.onProgress?.({ loaded: file.size, total: file.size, percent: 100 });
        resolve({ error: null });
      } else {
        resolve({ error: new Error(`Upload failed: ${xhr.status} ${xhr.responseText}`) });
      }
    };
    xhr.onerror = () => resolve({ error: new Error("Network error during upload") });
    xhr.send(file);
  });
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} Б`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} КБ`;
  return `${(n / 1024 / 1024).toFixed(2)} МБ`;
}
