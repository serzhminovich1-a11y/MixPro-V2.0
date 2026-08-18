import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertModerator(supabase: any, userId: string) {
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  const roles = (data ?? []).map((r: any) => r.role as string);
  const ranks: Record<string, number> = { super_admin: 3, admin: 2, moderator: 1, user: 0 };
  const rank = roles.reduce((m: number, r: string) => Math.max(m, ranks[r] ?? 0), 0);
  if (rank < 1) throw new Error("Только для модераторов и админов");
  return rank;
}

/** Full admin course tree with drafts. */
export const listCourseTree = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertModerator(context.supabase, context.userId);
    const [mods, lessons] = await Promise.all([
      context.supabase.from("course_modules").select("*").order("order_index"),
      context.supabase
        .from("lessons")
        .select("id, slug, title, category, difficulty, duration_min, module_id, order_index, xp_reward, is_published, updated_at, cover_url")
        .order("order_index"),
    ]);
    return { modules: mods.data ?? [], lessons: lessons.data ?? [] };
  });

/** Load a full lesson (including content_blocks) for editing. */
export const getLessonAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { id: string }) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertModerator(context.supabase, context.userId);
    const { data: lesson, error } = await context.supabase.from("lessons").select("*").eq("id", data.id).maybeSingle();
    if (error) throw new Error(error.message);
    return { lesson };
  });

const ModuleInput = z.object({
  id: z.string().uuid().optional(),
  slug: z.string().min(1).max(80),
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional().nullable(),
  cover_url: z.string().max(600).optional().nullable(),
  order_index: z.number().int().min(0).max(9999),
  is_published: z.boolean().optional(),
  level: z.enum(["beginner", "intermediate", "pro"]).optional(),
  prerequisite_id: z.string().uuid().nullable().optional(),
  position_x: z.number().int().min(0).max(10000).optional(),
  position_y: z.number().int().min(0).max(10000).optional(),
  certification_id: z.string().uuid().nullable().optional(),
});

export const upsertModule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: z.infer<typeof ModuleInput>) => ModuleInput.parse(input))
  .handler(async ({ data, context }) => {
    await assertModerator(context.supabase, context.userId);
    const payload = { ...data };
    const { data: out, error } = data.id
      ? await context.supabase.from("course_modules").update(payload).eq("id", data.id).select().maybeSingle()
      : await context.supabase.from("course_modules").insert(payload).select().maybeSingle();
    if (error) throw new Error(error.message);
    return { module: out };
  });

export const deleteModule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { id: string }) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertModerator(context.supabase, context.userId);
    // Unlink lessons instead of cascading
    await context.supabase.from("lessons").update({ module_id: null }).eq("module_id", data.id);
    const { error } = await context.supabase.from("course_modules").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const BlockSchema = z.any(); // schema validated on client; store as JSON
const LessonInput = z.object({
  id: z.string().uuid().optional(),
  module_id: z.string().uuid().nullable().optional(),
  slug: z.string().min(1).max(120),
  title: z.string().min(1).max(200),
  category: z.string().max(80).default("general"),
  difficulty: z.enum(["beginner", "intermediate", "advanced"]).default("beginner"),
  duration_min: z.number().int().min(1).max(600).default(10),
  order_index: z.number().int().min(0).max(9999).default(0),
  xp_reward: z.number().int().min(0).max(10000).default(50),
  pass_score: z.number().int().min(0).max(100).default(70),
  cover_url: z.string().max(600).nullable().optional(),
  content_md: z.string().max(200000).optional().default(""),
  content_blocks: z.array(BlockSchema).max(500).default([]),
  quiz: z.array(z.object({ q: z.string().max(500), options: z.array(z.string().max(300)).min(2).max(6), correct: z.number().int().min(0).max(5) })).max(30).default([]),
  is_published: z.boolean().default(true),
});

export const upsertLesson = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: z.infer<typeof LessonInput>) => LessonInput.parse(input))
  .handler(async ({ data, context }) => {
    await assertModerator(context.supabase, context.userId);
    const payload: any = { ...data };
    const { data: out, error } = data.id
      ? await context.supabase.from("lessons").update(payload).eq("id", data.id).select().maybeSingle()
      : await context.supabase.from("lessons").insert(payload).select().maybeSingle();
    if (error) throw new Error(error.message);
    return { lesson: out };
  });

export const deleteLesson = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { id: string }) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertModerator(context.supabase, context.userId);
    const { error } = await context.supabase.from("lessons").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Upload a base64-encoded file to lesson-assets and return a 10-year signed URL. */
export const uploadLessonAsset = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { filename: string; contentType: string; base64: string }) =>
    z.object({
      filename: z.string().min(1).max(200),
      contentType: z.string().min(1).max(120),
      base64: z.string().min(1).max(60_000_000), // ~45 MB decoded
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertModerator(context.supabase, context.userId);
    // storage.objects has lesson_assets_write (FOR ALL, can_moderate()) and
    // lesson_assets_read_published (moderators always pass) — no
    // service-role client needed, which also means this works outside
    // Lovable Cloud's own hosting.
    const safeName = data.filename.replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `${context.userId}/${Date.now()}-${safeName}`;
    const buffer = Buffer.from(data.base64, "base64");
    const { error: upErr } = await context.supabase.storage
      .from("lesson-assets")
      .upload(path, buffer, { contentType: data.contentType, upsert: false });
    if (upErr) throw new Error(upErr.message);
    const { data: signed, error: sErr } = await context.supabase.storage
      .from("lesson-assets")
      .createSignedUrl(path, 60 * 60 * 24 * 365 * 10); // 10 years
    if (sErr || !signed) throw new Error(sErr?.message ?? "Не удалось получить ссылку");
    return { url: signed.signedUrl, path };
  });

/** Create a signed upload URL so the browser can PUT the file directly (with real progress). */
export const createLessonUploadUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { filename: string }) =>
    z.object({ filename: z.string().min(1).max(200) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertModerator(context.supabase, context.userId);
    const safeName = data.filename.replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `${context.userId}/${Date.now()}-${safeName}`;
    const { data: signed, error } = await context.supabase.storage
      .from("lesson-assets")
      .createSignedUploadUrl(path);
    if (error || !signed) throw new Error(error?.message ?? "Не удалось создать ссылку для загрузки");
    return { path, token: signed.token, signedUrl: signed.signedUrl };
  });

/** After a direct PUT succeeds, get a long-lived signed download URL. */
export const finalizeLessonUpload = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { path: string }) =>
    z.object({ path: z.string().min(1).max(400) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertModerator(context.supabase, context.userId);
    const { data: signed, error } = await context.supabase.storage
      .from("lesson-assets")
      .createSignedUrl(data.path, 60 * 60 * 24 * 365 * 10);
    if (error || !signed) throw new Error(error?.message ?? "Не удалось получить ссылку");
    return { url: signed.signedUrl };
  });
