import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type TermMedia =
  | { kind: "image"; url: string; caption?: string }
  | { kind: "gif"; url: string; caption?: string }
  | { kind: "video"; url: string; caption?: string }
  | { kind: "audio_ab"; url_a: string; url_b: string; label_a?: string; label_b?: string; caption?: string };

export type GlossaryTerm = {
  id: string;
  slug: string;
  term: string;
  category: string;
  short_def: string;
  long_def_md: string | null;
  media: TermMedia[];
  difficulty: string;
  tags: string[];
  updated_at: string;
};

/** Public list — anyone signed in can read the glossary. */
export const listGlossaryTerms = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await (context.supabase as any)
      .from("glossary_terms")
      .select("*")
      .order("term", { ascending: true });
    if (error) return { terms: [] as GlossaryTerm[], error: error.message };
    return { terms: (data ?? []) as GlossaryTerm[], error: null };
  });

const MediaSchema = z.array(z.any()).max(20);
const TermInput = z.object({
  id: z.string().uuid().optional(),
  slug: z.string().min(1).max(80).regex(/^[a-z0-9-]+$/, "только латиница, цифры и -"),
  term: z.string().min(1).max(120),
  category: z.string().min(1).max(60),
  short_def: z.string().min(1).max(400),
  long_def_md: z.string().max(20000).optional().nullable(),
  media: MediaSchema.default([]),
  difficulty: z.enum(["basic", "intermediate", "advanced"]).default("basic"),
  tags: z.array(z.string().max(40)).max(20).default([]),
});

export const upsertGlossaryTerm = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: z.infer<typeof TermInput>) => TermInput.parse(input))
  .handler(async ({ data, context }) => {
    const { data: roles } = await context.supabase.from("user_roles").select("role").eq("user_id", context.userId);
    const has = (roles ?? []).some((r: any) => ["admin", "super_admin", "moderator"].includes(r.role));
    if (!has) throw new Error("Только для модераторов и админов");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const payload: any = { ...data, created_by: context.userId };
    const { data: out, error } = data.id
      ? await (supabaseAdmin as any).from("glossary_terms").update(payload).eq("id", data.id).select().maybeSingle()
      : await (supabaseAdmin as any).from("glossary_terms").insert(payload).select().maybeSingle();
    if (error) throw new Error(error.message);
    return { term: out };
  });

export const deleteGlossaryTerm = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { id: string }) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: roles } = await context.supabase.from("user_roles").select("role").eq("user_id", context.userId);
    const has = (roles ?? []).some((r: any) => ["admin", "super_admin", "moderator"].includes(r.role));
    if (!has) throw new Error("Только для модераторов и админов");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await (supabaseAdmin as any).from("glossary_terms").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Record quiz answer and award XP for correct ones. */
export const recordGlossaryQuiz = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { term_id: string; correct: boolean }) =>
    z.object({ term_id: z.string().uuid(), correct: z.boolean() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: existing } = await (supabaseAdmin as any)
      .from("glossary_quiz_progress")
      .select("*")
      .eq("user_id", context.userId)
      .eq("term_id", data.term_id)
      .maybeSingle();
    const patch = {
      user_id: context.userId,
      term_id: data.term_id,
      correct_count: (existing?.correct_count ?? 0) + (data.correct ? 1 : 0),
      wrong_count: (existing?.wrong_count ?? 0) + (data.correct ? 0 : 1),
      last_seen_at: new Date().toISOString(),
    };
    if (existing) {
      await (supabaseAdmin as any).from("glossary_quiz_progress").update(patch).eq("id", existing.id);
    } else {
      await (supabaseAdmin as any).from("glossary_quiz_progress").insert(patch);
    }
    if (data.correct) {
      // small XP bump
      const { data: prof } = await (supabaseAdmin as any).from("profiles").select("xp").eq("id", context.userId).maybeSingle();
      const nextXp = (prof?.xp ?? 0) + 5;
      await (supabaseAdmin as any)
        .from("profiles")
        .update({ xp: nextXp, level: 1 + Math.floor(Math.sqrt(nextXp / 100)) })
        .eq("id", context.userId);
    }
    return { ok: true };
  });
