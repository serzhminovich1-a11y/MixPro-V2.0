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
