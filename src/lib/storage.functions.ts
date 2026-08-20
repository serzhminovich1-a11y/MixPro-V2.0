import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const PREFIXES = ["avatars", "banners", "wall", "presets", "lesson-assets", "game-loops", "merch", "screenshots", "guides"] as const;
type Prefix = (typeof PREFIXES)[number];
// lesson-assets/game-loops/merch are admin-authored content (lesson media,
// ear-training loops, shop item photos) — only moderators write there. The
// rest are self-service (a user's own avatar/portfolio/preset).
const MODERATOR_ONLY: ReadonlySet<Prefix> = new Set(["lesson-assets", "game-loops", "merch"]);

async function isModerator(supabase: any, userId: string): Promise<boolean> {
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  return (data ?? []).some((r: any) => ["admin", "super_admin", "moderator"].includes(r.role));
}

/** Presigned PUT URL for a direct browser→Yandex upload (no request body size limit). */
export const createUploadUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { prefix: Prefix; filename: string }) =>
    z.object({
      prefix: z.enum(PREFIXES),
      filename: z.string().min(1).max(200),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    if (MODERATOR_ONLY.has(data.prefix) && !(await isModerator(context.supabase, context.userId))) {
      throw new Error("Только для модераторов и админов");
    }
    const { yandexS3, yandexBucket } = await import("@/integrations/yandex/client.server");
    const { PutObjectCommand } = await import("@aws-sdk/client-s3");
    const { getSignedUrl } = await import("@aws-sdk/s3-request-presigner");
    const safeName = data.filename.replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `${data.prefix}/${context.userId}/${Date.now()}-${safeName}`;
    const cmd = new PutObjectCommand({ Bucket: yandexBucket(), Key: path });
    const uploadUrl = await getSignedUrl(yandexS3(), cmd, { expiresIn: 600 });
    return { path, uploadUrl };
  });

// Prefixes that only ever carry small, already-compressed images (avatar/
// banner/cover crops all go through ImageEditor's maxOutput cap first) —
// safe to proxy through a server function's request body. Audio/preset
// files stay direct-upload-only; those can be tens of MB and would blow
// straight through Vercel's ~4.5MB serverless body limit.
const PROXY_UPLOAD_PREFIXES = new Set<Prefix>(["avatars", "banners", "merch", "screenshots", "guides"]);

/**
 * Fallback for when a browser can't reach Yandex Object Storage directly
 * (seen in the wild: some ISPs/routers/DNS filters block *.yandexcloud.net
 * outright, unrelated to anything this app controls — createUploadUrl's
 * presigned PUT works fine everywhere it's actually reachable, verified
 * directly against the bucket). Routes the file through this server
 * instead, which reaches Yandex over its own network path. Base64 in the
 * request body — small images only, see PROXY_UPLOAD_PREFIXES.
 */
export const uploadImageViaServer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { prefix: Prefix; filename: string; contentType: string; dataBase64: string }) =>
    z.object({
      prefix: z.enum(PREFIXES),
      filename: z.string().min(1).max(200),
      contentType: z.string().min(1).max(100),
      dataBase64: z.string().min(1).max(8_000_000), // ~6MB decoded ceiling
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    if (!PROXY_UPLOAD_PREFIXES.has(data.prefix)) throw new Error("Этот тип файла нельзя загрузить через сервер — попробуйте ещё раз напрямую.");
    if (MODERATOR_ONLY.has(data.prefix) && !(await isModerator(context.supabase, context.userId))) {
      throw new Error("Только для модераторов и админов");
    }
    const { yandexS3, yandexBucket } = await import("@/integrations/yandex/client.server");
    const { PutObjectCommand } = await import("@aws-sdk/client-s3");
    const safeName = data.filename.replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `${data.prefix}/${context.userId}/${Date.now()}-${safeName}`;
    const body = Buffer.from(data.dataBase64, "base64");
    if (body.byteLength > 6 * 1024 * 1024) throw new Error("Файл слишком большой для загрузки через сервер (максимум 6 МБ).");
    await yandexS3().send(new PutObjectCommand({ Bucket: yandexBucket(), Key: path, Body: body, ContentType: data.contentType }));
    return { path };
  });

/** Delete an object — the caller must own it (path starts with prefix/their own id) or moderate. */
export const deleteStorageObject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { path: string }) => z.object({ path: z.string().min(1).max(500) }).parse(input))
  .handler(async ({ data, context }) => {
    const ownPrefixes = PREFIXES.map((p) => `${p}/${context.userId}/`);
    const isOwn = ownPrefixes.some((p) => data.path.startsWith(p));
    if (!isOwn && !(await isModerator(context.supabase, context.userId))) {
      throw new Error("Недостаточно прав");
    }
    const { yandexS3, yandexBucket } = await import("@/integrations/yandex/client.server");
    const { DeleteObjectCommand } = await import("@aws-sdk/client-s3");
    await yandexS3().send(new DeleteObjectCommand({ Bucket: yandexBucket(), Key: data.path }));
    return { ok: true };
  });
