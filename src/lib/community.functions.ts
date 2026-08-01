import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Submit a lesson quiz. Marks lesson as passed & awards XP via DB trigger when score >= pass_score. */
export const submitQuiz = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { lessonId: string; answers: number[] }) =>
    z.object({
      lessonId: z.string().uuid(),
      answers: z.array(z.number().int().min(0).max(10)).max(20),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: lesson, error: lErr } = await supabase
      .from("lessons")
      .select("id, quiz, pass_score")
      .eq("id", data.lessonId)
      .maybeSingle();
    if (lErr || !lesson) throw new Error("Урок не найден");

    const questions = (lesson.quiz as Array<{ correct: number }> | null) ?? [];
    let correct = 0;
    for (let i = 0; i < questions.length; i++) {
      if (data.answers[i] === questions[i].correct) correct++;
    }
    const score = questions.length === 0 ? 100 : Math.round((correct / questions.length) * 100);
    const passed = score >= (lesson.pass_score ?? 70);

    const { error: upErr } = await supabase
      .from("lesson_progress")
      .upsert(
        { user_id: userId, lesson_id: data.lessonId, quiz_score: score, passed, ...(passed ? { completed_at: new Date().toISOString() } : {}) },
        { onConflict: "user_id,lesson_id" },
      );
    if (upErr) throw new Error(upErr.message);
    return { score, passed, total: questions.length, correct };
  });

export const getMyProgress = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("lesson_progress")
      .select("lesson_id, quiz_score, passed, completed_at")
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { progress: data ?? [] };
  });

/** Create a forum thread. */
export const createThread = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { categoryId: string; title: string; content: string }) =>
    z.object({
      categoryId: z.string().uuid(),
      title: z.string().trim().min(4).max(140),
      content: z.string().trim().min(4).max(8000),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("forum_threads")
      .insert({ category_id: data.categoryId, author_id: context.userId, title: data.title, content: data.content })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id };
  });

export const createReply = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { threadId: string; content: string }) =>
    z.object({
      threadId: z.string().uuid(),
      content: z.string().trim().min(1).max(4000),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("forum_replies")
      .insert({ thread_id: data.threadId, author_id: context.userId, content: data.content })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id };
  });

/** Report content for moderation. */
export const submitReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { targetType: "thread" | "reply" | "message" | "post" | "comment"; targetId: string; reason: string }) =>
    z.object({
      targetType: z.enum(["thread", "reply", "message", "post", "comment"]),
      targetId: z.string().uuid(),
      reason: z.string().trim().min(3).max(500),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("reports").insert({
      reporter_id: context.userId,
      target_type: data.targetType,
      target_id: data.targetId,
      reason: data.reason,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Moderator action: hide a piece of content. */
export const moderateHide = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { targetType: "thread" | "reply" | "message"; targetId: string; hide: boolean }) =>
    z.object({
      targetType: z.enum(["thread", "reply", "message"]),
      targetId: z.string().uuid(),
      hide: z.boolean(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: ok } = await context.supabase.rpc("can_moderate", { _user_id: context.userId });
    if (!ok) throw new Error("Недостаточно прав");
    const table = data.targetType === "thread" ? "forum_threads" : data.targetType === "reply" ? "forum_replies" : "chat_messages";
    const { error } = await context.supabase.from(table).update({ is_hidden: data.hide }).eq("id", data.targetId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Moderator: view open reports. */
export const listReports = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: ok } = await context.supabase.rpc("can_moderate", { _user_id: context.userId });
    if (!ok) return { reports: [], canModerate: false };
    const { data, error } = await context.supabase
      .from("reports")
      .select("*")
      .eq("status", "open")
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    return { reports: data ?? [], canModerate: true };
  });

export const resolveReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { id: string; status: "resolved" | "rejected" }) =>
    z.object({ id: z.string().uuid(), status: z.enum(["resolved", "rejected"]) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: ok } = await context.supabase.rpc("can_moderate", { _user_id: context.userId });
    if (!ok) throw new Error("Недостаточно прав");
    const { error } = await context.supabase
      .from("reports")
      .update({ status: data.status, resolved_by: context.userId, resolved_at: new Date().toISOString() })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
