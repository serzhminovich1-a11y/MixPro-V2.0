import { createUploadUrl, deleteStorageObject } from "@/lib/storage.functions";
import { publicStorageUrl } from "@/lib/storage-url";

export type UploadProgress = {
  loaded: number;
  total: number;
  percent: number;
};

export type UploadOptions = {
  contentType?: string;
  onProgress?: (p: UploadProgress) => void;
};

export type StoragePrefix = "avatars" | "banners" | "wall" | "presets" | "lesson-assets" | "game-loops" | "merch" | "screenshots";

/**
 * Upload a file straight from the browser to Yandex Object Storage, with
 * real progress events — asks the server for a short-lived presigned PUT
 * URL (createUploadUrl, which also decides + returns the actual object
 * path, since it embeds the caller's own id for ownership), then PUTs
 * directly to Yandex via XMLHttpRequest so we get `progress` events (the
 * fetch API doesn't expose upload progress). Never touches a server
 * function's request body, so there's no platform body-size ceiling.
 */
export async function uploadWithProgress(
  prefix: StoragePrefix,
  filename: string,
  file: Blob,
  opts: UploadOptions = {},
): Promise<{ error: Error | null; path?: string; url?: string }> {
  let created: { path: string; uploadUrl: string };
  try {
    created = await createUploadUrl({ data: { prefix, filename } });
  } catch (e) {
    return { error: e instanceof Error ? e : new Error(String(e)) };
  }

  return await new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", created.uploadUrl, true);
    if (opts.contentType) xhr.setRequestHeader("Content-Type", opts.contentType);

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
        resolve({ error: null, path: created.path, url: publicStorageUrl(created.path) });
      } else {
        resolve({ error: new Error(`Upload failed: ${xhr.status} ${xhr.responseText}`) });
      }
    };
    xhr.onerror = () => resolve({ error: new Error("Network error during upload") });
    xhr.send(file);
  });
}

/** Delete one or more objects (best-effort — caller must own the path or moderate). */
export async function removeStorageObjects(paths: string[]): Promise<void> {
  await Promise.all(paths.map((path) => deleteStorageObject({ data: { path } }).catch(() => {})));
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} Б`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} КБ`;
  return `${(n / 1024 / 1024).toFixed(2)} МБ`;
}
