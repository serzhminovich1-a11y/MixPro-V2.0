import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";

function pub() {
  return createClient<Database>(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_PUBLISHABLE_KEY!,
    { auth: { storage: undefined, persistSession: false, autoRefreshToken: false } },
  );
}

/** Public list of courses (published only) with lesson counts for the skill-tree. */
export const listCoursesTree = createServerFn({ method: "GET" }).handler(async () => {
  const s = pub();
  const [mods, lessons] = await Promise.all([
    (s as any).from("course_modules").select("*").eq("is_published", true).order("order_index"),
    (s as any).from("lessons").select("id, module_id, is_published, order_index").eq("is_published", true).order("order_index"),
  ]);
  if (mods.error) return { courses: [], error: mods.error.message };
  if (lessons.error) return { courses: [], error: lessons.error.message };
  const counts = new Map<string, number>();
  for (const l of (lessons.data ?? []) as Array<{ module_id: string | null }>) {
    if (!l.module_id) continue;
    counts.set(l.module_id, (counts.get(l.module_id) ?? 0) + 1);
  }
  const courses = (mods.data ?? []).map((m: any) => ({
    id: m.id,
    slug: m.slug,
    title: m.title,
    description: m.description as string | null,
    cover_url: m.cover_url as string | null,
    level: (m.level ?? "beginner") as "beginner" | "intermediate" | "pro",
    prerequisite_id: (m.prerequisite_id ?? null) as string | null,
    position_x: (m.position_x ?? 0) as number,
    position_y: (m.position_y ?? 0) as number,
    certification_id: (m.certification_id ?? null) as string | null,
    lesson_count: counts.get(m.id) ?? 0,
  }));
  return { courses, error: null };
});

/** Load a course with its lessons and (optional) certification info. */
export const getCourseBySlug = createServerFn({ method: "POST" })
  .validator((input: { slug: string }) => z.object({ slug: z.string() }).parse(input))
  .handler(async ({ data }) => {
    const s = pub();
    const { data: course, error } = await (s as any)
      .from("course_modules")
      .select("*")
      .eq("slug", data.slug)
      .eq("is_published", true)
      .maybeSingle();
    if (error) return { course: null, lessons: [], cert: null, error: error.message };
    if (!course) return { course: null, lessons: [], cert: null, error: "not_found" };
    const [lessonsRes, certRes] = await Promise.all([
      (s as any).from("lessons")
        .select("id, slug, title, category, difficulty, duration_min, order_index, xp_reward, is_premium")
        .eq("module_id", course.id)
        .eq("is_published", true)
        .order("order_index"),
      course.certification_id
        ? s.from("certifications").select("*").eq("id", course.certification_id).maybeSingle()
        : Promise.resolve({ data: null, error: null } as any),
    ]);
    return { course, lessons: lessonsRes.data ?? [], cert: certRes.data ?? null, error: null };
  });

/** Current user's progress for all courses. */
export const getMyCourseProgress = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await (context.supabase as any)
      .from("user_course_progress")
      .select("*")
      .eq("user_id", context.userId);
    if (error) return { progress: [] as any[], error: error.message };
    return { progress: data ?? [], error: null };
  });

/** Save skill-tree node positions (moderator+). */
export const saveCoursePositions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { positions: Array<{ id: string; x: number; y: number }> }) =>
    z.object({ positions: z.array(z.object({ id: z.string().uuid(), x: z.number().int(), y: z.number().int() })).max(500) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: roles } = await context.supabase.from("user_roles").select("role").eq("user_id", context.userId);
    const has = (roles ?? []).some((r: any) => ["admin", "super_admin", "moderator"].includes(r.role));
    if (!has) throw new Error("Только для модераторов и админов");
    const failed: string[] = [];
    for (const p of data.positions) {
      const { error } = await (context.supabase as any).from("course_modules").update({ position_x: p.x, position_y: p.y }).eq("id", p.id);
      if (error) failed.push(p.id);
    }
    if (failed.length > 0) throw new Error(`Не удалось сохранить позиции: ${failed.length} из ${data.positions.length}`);
    return { ok: true };
  });
