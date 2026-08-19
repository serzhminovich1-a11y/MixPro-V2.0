import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const RANKS: Record<string, number> = { super_admin: 3, admin: 2, moderator: 1, user: 0 };

type CourseAccess = { rank: number; isTeacher: boolean; canManageAll: boolean };

/** Who's allowed to touch course content, and how wide their reach is.
 * Moderator+ (rank >= 1) already manage every course — untouched from
 * before. A plain "teacher" role only manages rows they created
 * themselves (created_by = them), UNLESS a super-admin also granted them
 * the can_manage_courses staff_permissions flag, in which case they act
 * like a moderator for course content specifically. Mirrors the RLS in
 * 20260819120000 exactly, so a caller who fails this check would also be
 * rejected by the database — this just gives a clearer error message
 * instead of a confusing "0 rows updated". */
async function getCourseAccess(supabase: any, userId: string): Promise<CourseAccess> {
  const [{ data: roleRows }, { data: perms }] = await Promise.all([
    supabase.from("user_roles").select("role").eq("user_id", userId),
    supabase.from("staff_permissions").select("can_manage_courses").eq("user_id", userId).maybeSingle(),
  ]);
  const roles = (roleRows ?? []).map((r: any) => r.role as string);
  const rank = roles.reduce((m: number, r: string) => Math.max(m, RANKS[r] ?? 0), 0);
  const isTeacher = roles.includes("teacher");
  const canManageAll = rank >= 1 || !!perms?.can_manage_courses;
  if (rank < 1 && !isTeacher) throw new Error("Только для модераторов, админов и преподавателей");
  return { rank, isTeacher, canManageAll };
}

/** Admin course tree with drafts. Teachers without the course-wide flag
 * only see modules/lessons they created. */
export const listCourseTree = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const access = await getCourseAccess(context.supabase, context.userId);
    let modQuery = context.supabase.from("course_modules").select("*").order("order_index");
    let lessonQuery = context.supabase
      .from("lessons")
      .select("id, slug, title, category, difficulty, duration_min, module_id, order_index, xp_reward, is_published, updated_at, cover_url, created_by")
      .order("order_index");
    if (!access.canManageAll) {
      modQuery = modQuery.eq("created_by", context.userId);
      lessonQuery = lessonQuery.eq("created_by", context.userId);
    }
    const [mods, lessons] = await Promise.all([modQuery, lessonQuery]);
    return { modules: mods.data ?? [], lessons: lessons.data ?? [], scopedToOwn: !access.canManageAll };
  });

/** Load a full lesson (including content_blocks) for editing. */
export const getLessonAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { id: string }) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const access = await getCourseAccess(context.supabase, context.userId);
    const { data: lesson, error } = await context.supabase.from("lessons").select("*").eq("id", data.id).maybeSingle();
    if (error) throw new Error(error.message);
    if (lesson && !access.canManageAll && lesson.created_by !== context.userId) {
      throw new Error("Можно редактировать только свои уроки");
    }
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
    const access = await getCourseAccess(context.supabase, context.userId);
    const payload: any = { ...data };
    if (!data.id) {
      payload.created_by = context.userId;
    } else if (!access.canManageAll) {
      const { data: existing } = await context.supabase.from("course_modules").select("created_by").eq("id", data.id).maybeSingle();
      if (!existing || existing.created_by !== context.userId) throw new Error("Можно редактировать только свои модули");
    }
    const { data: out, error } = data.id
      ? await context.supabase.from("course_modules").update(payload).eq("id", data.id).select().maybeSingle()
      : await context.supabase.from("course_modules").insert(payload).select().maybeSingle();
    if (error) throw new Error(error.message);
    if (!out) throw new Error("Не удалось сохранить — нет доступа к этой записи");
    return { module: out };
  });

export const deleteModule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { id: string }) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const access = await getCourseAccess(context.supabase, context.userId);
    if (!access.canManageAll) {
      const { data: existing } = await context.supabase.from("course_modules").select("created_by").eq("id", data.id).maybeSingle();
      if (!existing || existing.created_by !== context.userId) throw new Error("Можно удалять только свои модули");
    }
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
    const access = await getCourseAccess(context.supabase, context.userId);
    const payload: any = { ...data };
    if (!data.id) {
      payload.created_by = context.userId;
    } else if (!access.canManageAll) {
      const { data: existing } = await context.supabase.from("lessons").select("created_by").eq("id", data.id).maybeSingle();
      if (!existing || existing.created_by !== context.userId) throw new Error("Можно редактировать только свои уроки");
    }
    const { data: out, error } = data.id
      ? await context.supabase.from("lessons").update(payload).eq("id", data.id).select().maybeSingle()
      : await context.supabase.from("lessons").insert(payload).select().maybeSingle();
    if (error) throw new Error(error.message);
    if (!out) throw new Error("Не удалось сохранить — нет доступа к этой записи");
    return { lesson: out };
  });

export const deleteLesson = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { id: string }) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const access = await getCourseAccess(context.supabase, context.userId);
    if (!access.canManageAll) {
      const { data: existing } = await context.supabase.from("lessons").select("created_by").eq("id", data.id).maybeSingle();
      if (!existing || existing.created_by !== context.userId) throw new Error("Можно удалять только свои уроки");
    }
    const { error } = await context.supabase.from("lessons").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// File uploads for lesson-assets moved to the shared Yandex Object Storage
// helpers (src/lib/storage.functions.ts createUploadUrl + src/lib/
// upload-progress.ts uploadWithProgress) — this file used to have its own
// uploadLessonAsset/createLessonUploadUrl/finalizeLessonUpload trio doing
// the same thing against Supabase Storage.
