import { createUploadUrl, deleteStorageObject, uploadImageViaServer } from "@/lib/storage.functions";
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

export type StoragePrefix = "avatars" | "banners" | "wall" | "presets" | "lesson-assets" | "game-loops" | "merch" | "screenshots" | "guides";

// Mirrors PROXY_UPLOAD_PREFIXES in storage.functions.ts — small,
// already-compressed images only. Used purely to skip a doomed round trip
// for prefixes the server would reject anyway (audio/preset files).
const PROXYABLE: ReadonlySet<StoragePrefix> = new Set(["avatars", "banners", "merch", "screenshots", "guides"]);
const MAX_PROXY_BYTES = 6 * 1024 * 1024;

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // strip the "data:<mime>;base64," prefix — server only wants the payload
      resolve(result.slice(result.indexOf(",") + 1));
    };
    reader.onerror = () => reject(reader.error ?? new Error("Не удалось прочитать файл"));
    reader.readAsDataURL(blob);
  });
}

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

  const direct = await new Promise<{ error: Error | null; path?: string; url?: string }>((resolve) => {
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

  if (!direct.error) return direct;

  // The direct browser→Yandex PUT failed at the network level (seen in the
  // wild: some ISPs/routers/DNS filters block *.yandexcloud.net entirely,
  // unrelated to anything this app controls). Retry once through this
  // server as a proxy — small already-compressed images only.
  const canProxy = direct.error.message === "Network error during upload" && PROXYABLE.has(prefix) && file.size <= MAX_PROXY_BYTES;
  if (!canProxy) return direct;

  try {
    const dataBase64 = await blobToBase64(file);
    const res = await uploadImageViaServer({ data: { prefix, filename, contentType: opts.contentType ?? "application/octet-stream", dataBase64 } });
    opts.onProgress?.({ loaded: file.size, total: file.size, percent: 100 });
    return { error: null, path: res.path, url: publicStorageUrl(res.path) };
  } catch (e) {
    return direct; // surface the original network error, not the fallback's
  }
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
