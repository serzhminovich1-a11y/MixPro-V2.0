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
    const { data: thread, error: tErr } = await context.supabase
      .from("forum_threads")
      .select("is_locked")
      .eq("id", data.threadId)
      .maybeSingle();
    if (tErr || !thread) throw new Error("Тред не найден");
    if (thread.is_locked) throw new Error("Тред закрыт для ответов");

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

const HIDEABLE_TABLES = {
  thread: "forum_threads",
  reply: "forum_replies",
  message: "chat_messages",
  post: "posts",
  comment: "post_comments",
} as const;

/** Moderator action: hide a piece of content. */
export const moderateHide = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { targetType: "thread" | "reply" | "message" | "post" | "comment"; targetId: string; hide: boolean }) =>
    z.object({
      targetType: z.enum(["thread", "reply", "message", "post", "comment"]),
      targetId: z.string().uuid(),
      hide: z.boolean(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: ok } = await context.supabase.rpc("can_moderate", { _user_id: context.userId });
    if (!ok) throw new Error("Недостаточно прав");
    const table = HIDEABLE_TABLES[data.targetType];
    const { error } = await context.supabase.from(table).update({ is_hidden: data.hide }).eq("id", data.targetId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Moderator: pin/unpin a thread. */
export const togglePinThread = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { threadId: string; pinned: boolean }) =>
    z.object({ threadId: z.string().uuid(), pinned: z.boolean() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: ok } = await context.supabase.rpc("can_moderate", { _user_id: context.userId });
    if (!ok) throw new Error("Недостаточно прав");
    const { error } = await context.supabase.from("forum_threads").update({ is_pinned: data.pinned }).eq("id", data.threadId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Moderator: lock/unlock a thread for new replies. */
export const toggleLockThread = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { threadId: string; locked: boolean }) =>
    z.object({ threadId: z.string().uuid(), locked: z.boolean() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: ok } = await context.supabase.rpc("can_moderate", { _user_id: context.userId });
    if (!ok) throw new Error("Недостаточно прав");
    const { error } = await context.supabase.from("forum_threads").update({ is_locked: data.locked }).eq("id", data.threadId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Edit own thread (or a moderator's, via RLS). */
export const updateThread = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { threadId: string; title: string; content: string }) =>
    z.object({
      threadId: z.string().uuid(),
      title: z.string().trim().min(4).max(140),
      content: z.string().trim().min(4).max(8000),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("forum_threads")
      .update({ title: data.title, content: data.content })
      .eq("id", data.threadId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Delete own thread (or a moderator's, via RLS). Replies cascade. */
export const deleteThread = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { threadId: string }) => z.object({ threadId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("forum_threads").delete().eq("id", data.threadId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Edit own reply (or a moderator's, via RLS). */
export const updateReply = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { replyId: string; content: string }) =>
    z.object({ replyId: z.string().uuid(), content: z.string().trim().min(1).max(4000) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("forum_replies").update({ content: data.content }).eq("id", data.replyId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Delete own reply (or a moderator's, via RLS). */
export const deleteReply = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { replyId: string }) => z.object({ replyId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("forum_replies").delete().eq("id", data.replyId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Moderator: create/update a forum category. */
export const upsertCategory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { id?: string; slug: string; name: string; description?: string; icon?: string; orderIndex?: number }) =>
    z.object({
      id: z.string().uuid().optional(),
      slug: z.string().trim().min(1).max(60).regex(/^[a-z0-9-]+$/, "только латиница, цифры и -"),
      name: z.string().trim().min(1).max(80),
      description: z.string().trim().max(300).optional(),
      icon: z.string().trim().max(8).optional(),
      orderIndex: z.number().int().min(0).max(999).optional(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: ok } = await context.supabase.rpc("can_moderate", { _user_id: context.userId });
    if (!ok) throw new Error("Недостаточно прав");
    const payload = {
      slug: data.slug,
      name: data.name,
      description: data.description ?? null,
      icon: data.icon ?? null,
      order_index: data.orderIndex ?? 0,
    };
    const { error } = data.id
      ? await context.supabase.from("forum_categories").update(payload).eq("id", data.id)
      : await context.supabase.from("forum_categories").insert(payload);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Moderator: delete a forum category (and its threads, via cascade). */
export const deleteCategory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { id: string }) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: ok } = await context.supabase.rpc("can_moderate", { _user_id: context.userId });
    if (!ok) throw new Error("Недостаточно прав");
    const { error } = await context.supabase.from("forum_categories").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Moderator: view open reports, enriched with a preview of the reported content. */
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
    const reports = data ?? [];

    const idsByType: Record<string, string[]> = {};
    for (const r of reports) (idsByType[r.target_type] ??= []).push(r.target_id);

    const [threadsRes, repliesRes, messagesRes, postsRes, commentsRes] = await Promise.all([
      idsByType.thread?.length
        ? context.supabase.from("forum_threads").select("id, title, content, author_id").in("id", idsByType.thread)
        : Promise.resolve({ data: [] as { id: string; title: string; content: string; author_id: string }[] }),
      idsByType.reply?.length
        ? context.supabase.from("forum_replies").select("id, content, author_id, thread_id").in("id", idsByType.reply)
        : Promise.resolve({ data: [] as { id: string; content: string; author_id: string; thread_id: string }[] }),
      idsByType.message?.length
        ? context.supabase.from("chat_messages").select("id, content, author_id").in("id", idsByType.message)
        : Promise.resolve({ data: [] as { id: string; content: string; author_id: string }[] }),
      idsByType.post?.length
        ? context.supabase.from("posts").select("id, content, author_id").in("id", idsByType.post)
        : Promise.resolve({ data: [] as { id: string; content: string; author_id: string }[] }),
      idsByType.comment?.length
        ? context.supabase.from("post_comments").select("id, content, author_id, post_id").in("id", idsByType.comment)
        : Promise.resolve({ data: [] as { id: string; content: string; author_id: string; post_id: string }[] }),
    ]);

    const threads = threadsRes.data ?? [];
    const replies = repliesRes.data ?? [];
    const messages = messagesRes.data ?? [];
    const posts = postsRes.data ?? [];
    const comments = commentsRes.data ?? [];

    const threadMap = new Map(threads.map((t) => [t.id, t]));
    const replyMap = new Map(replies.map((r) => [r.id, r]));
    const messageMap = new Map(messages.map((m) => [m.id, m]));
    const postMap = new Map(posts.map((p) => [p.id, p]));
    const commentMap = new Map(comments.map((c) => [c.id, c]));

    const authorIds = [
      ...threads.map((t) => t.author_id),
      ...replies.map((r) => r.author_id),
      ...messages.map((m) => m.author_id),
      ...posts.map((p) => p.author_id),
      ...comments.map((c) => c.author_id),
      ...reports.map((r) => r.reporter_id),
    ];
    const uniqueAuthorIds = [...new Set(authorIds)];
    const { data: profiles } = uniqueAuthorIds.length
      ? await context.supabase.from("profiles").select("id, username").in("id", uniqueAuthorIds)
      : { data: [] as { id: string; username: string }[] };
    const usernameOf = new Map((profiles ?? []).map((p) => [p.id, p.username]));

    const enriched = reports.map((r) => {
      let title: string | null = null;
      let content: string | null = null;
      let authorUsername: string | null = null;
      let threadId: string | null = null;
      if (r.target_type === "thread") {
        const t = threadMap.get(r.target_id);
        if (t) { title = t.title; content = t.content; authorUsername = usernameOf.get(t.author_id) ?? null; threadId = t.id; }
      } else if (r.target_type === "reply") {
        const rep = replyMap.get(r.target_id);
        if (rep) { content = rep.content; authorUsername = usernameOf.get(rep.author_id) ?? null; threadId = rep.thread_id; }
      } else if (r.target_type === "message") {
        const m = messageMap.get(r.target_id);
        if (m) { content = m.content; authorUsername = usernameOf.get(m.author_id) ?? null; }
      } else if (r.target_type === "post") {
        const p = postMap.get(r.target_id);
        if (p) { content = p.content; authorUsername = usernameOf.get(p.author_id) ?? null; }
      } else if (r.target_type === "comment") {
        const c = commentMap.get(r.target_id);
        if (c) { content = c.content; authorUsername = usernameOf.get(c.author_id) ?? null; }
      }
      return {
        ...r,
        reporter_username: usernameOf.get(r.reporter_id) ?? null,
        preview: content !== null ? { title, content, authorUsername, threadId } : null,
      };
    });

    return { reports: enriched, canModerate: true };
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
