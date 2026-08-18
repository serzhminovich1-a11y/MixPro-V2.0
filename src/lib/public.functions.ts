import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

function pub() {
  return createClient<Database>(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_PUBLISHABLE_KEY!,
    { auth: { storage: undefined, persistSession: false, autoRefreshToken: false } },
  );
}

export const getLeaderboard = createServerFn({ method: "GET" }).handler(async () => {
  const { data, error } = await pub()
    .from("profiles")
    .select("id, username, avatar_url, xp, level, created_at")
    .order("xp", { ascending: false })
    .limit(50);
  if (error) return { profiles: [], error: error.message };
  return { profiles: data ?? [], error: null };
});

export const getProfileByUsername = createServerFn({ method: "GET" })
  .validator((input: { username: string }) => input)
  .handler(async ({ data: input }) => {
    const { data, error } = await pub()
      .from("profiles")
      .select("id, username, avatar_url, xp, level, verified, subscription_tier, created_at, bio, full_name, socials")
      .ilike("username", input.username)
      .maybeSingle();
    if (error) return { profile: null, error: error.message };
    return { profile: data, error: null };
  });

export const searchUsernames = createServerFn({ method: "GET" })
  .validator((input: { q: string }) => input)
  .handler(async ({ data: input }) => {
    const q = (input.q ?? "").trim();
    if (!q) return { users: [] as { id: string; username: string; avatar_url: string | null }[] };
    const { data } = await pub()
      .from("profiles")
      .select("id, username, avatar_url")
      .ilike("username", `${q}%`)
      .order("xp", { ascending: false })
      .limit(8);
    return { users: data ?? [] };
  });

export const getLessons = createServerFn({ method: "GET" }).handler(async () => {
  const { data, error } = await pub()
    .from("lessons")
    .select("id, slug, title, category, difficulty, duration_min, cover_url, module_id, order_index, xp_reward, is_premium")
    .order("order_index", { ascending: true });
  if (error) return { lessons: [], error: error.message };
  return { lessons: data ?? [], error: null };
});


export const getCourseModules = createServerFn({ method: "GET" }).handler(async () => {
  const s = pub();
  const [modulesRes, lessonsRes] = await Promise.all([
    s.from("course_modules").select("*").order("order_index", { ascending: true }),
    s.from("lessons").select("id, slug, title, category, difficulty, duration_min, module_id, order_index, xp_reward, is_premium").order("order_index", { ascending: true }),
  ]);

  if (modulesRes.error) return { modules: [], error: modulesRes.error.message };
  const lessonsByModule = new Map<string, typeof lessonsRes.data>();
  for (const l of lessonsRes.data ?? []) {
    if (!l.module_id) continue;
    const arr = lessonsByModule.get(l.module_id) ?? [];
    arr.push(l);
    lessonsByModule.set(l.module_id, arr);
  }
  const modules = (modulesRes.data ?? []).map((m) => ({ ...m, lessons: lessonsByModule.get(m.id) ?? [] }));
  const orphans = (lessonsRes.data ?? []).filter((l) => !l.module_id);
  return { modules, orphans, error: null };
});

export const getLessonBySlug = createServerFn({ method: "GET" })
  .validator((input: { slug: string }) => input)
  .handler(async ({ data: input }) => {
    const { data, error } = await pub().from("lessons").select("*").eq("slug", input.slug).maybeSingle();
    if (error) return { lesson: null, error: error.message };
    return { lesson: data, error: null };
  });

export const getPresets = createServerFn({ method: "GET" }).handler(async () => {
  const s = pub();
  const presetsRes = await s.from("presets").select("id, author_id, title, description, daw, genre, file_url, downloads, created_at, is_premium").order("created_at", { ascending: false }).limit(100);
  if (presetsRes.error) return { presets: [], error: presetsRes.error.message };
  const authorIds = [...new Set((presetsRes.data ?? []).map((p) => p.author_id))];
  const profilesRes = authorIds.length
    ? await s.from("profiles").select("id, username, avatar_url").in("id", authorIds)
    : { data: [] as { id: string; username: string; avatar_url: string | null }[] };
  const map = new Map((profilesRes.data ?? []).map((p) => [p.id, p]));
  return { presets: (presetsRes.data ?? []).map((p) => ({ ...p, author: map.get(p.author_id) ?? null })), error: null };
});

export const getPosts = createServerFn({ method: "GET" }).handler(async () => {
  const s = pub();
  const postsRes = await s.from("posts").select("id, author_id, content, created_at").eq("is_hidden", false).order("created_at", { ascending: false }).limit(50);
  if (postsRes.error) return { posts: [], error: postsRes.error.message };
  const postIds = (postsRes.data ?? []).map((p) => p.id);
  const [likesRes, commentsRes] = postIds.length
    ? await Promise.all([
        s.from("post_likes").select("post_id, user_id").in("post_id", postIds),
        s.from("post_comments").select("id, post_id, author_id, content, created_at").eq("is_hidden", false).in("post_id", postIds).order("created_at", { ascending: true }),
      ])
    : [{ data: [] as { post_id: string; user_id: string }[] }, { data: [] as { id: string; post_id: string; author_id: string; content: string; created_at: string }[] }];
  const authorIds = [...new Set([
    ...(postsRes.data ?? []).map((p) => p.author_id),
    ...(commentsRes.data ?? []).map((c) => c.author_id),
  ])];
  const profilesRes = authorIds.length
    ? await s.from("profiles").select("id, username, avatar_url, level").in("id", authorIds)
    : { data: [] as { id: string; username: string; avatar_url: string | null; level: number }[] };
  const map = new Map((profilesRes.data ?? []).map((p) => [p.id, p]));
  const posts = (postsRes.data ?? []).map((post) => ({
    ...post,
    author: map.get(post.author_id) ?? null,
    likes: (likesRes.data ?? []).filter((l) => l.post_id === post.id).map((l) => l.user_id),
    comments: (commentsRes.data ?? []).filter((c) => c.post_id === post.id).map((c) => ({ ...c, author: map.get(c.author_id) ?? null })),
  }));
  return { posts, error: null };
});

export const getForumCategories = createServerFn({ method: "GET" }).handler(async () => {
  const s = pub();
  const [catsRes, threadsRes] = await Promise.all([
    s.from("forum_categories").select("*").order("order_index", { ascending: true }),
    s.from("forum_threads").select("id, category_id, last_activity_at").eq("is_hidden", false),
  ]);
  if (catsRes.error) return { categories: [], error: catsRes.error.message };
  const counts = new Map<string, number>();
  const latest = new Map<string, string>();
  for (const t of threadsRes.data ?? []) {
    counts.set(t.category_id, (counts.get(t.category_id) ?? 0) + 1);
    const cur = latest.get(t.category_id);
    if (!cur || t.last_activity_at > cur) latest.set(t.category_id, t.last_activity_at);
  }
  return {
    categories: (catsRes.data ?? []).map((c) => ({ ...c, thread_count: counts.get(c.id) ?? 0, last_activity_at: latest.get(c.id) ?? null })),
    error: null,
  };
});

export const getForumCategoryBySlug = createServerFn({ method: "GET" })
  .validator((input: { slug: string }) => input)
  .handler(async ({ data: input }) => {
    const s = pub();
    const catRes = await s.from("forum_categories").select("*").eq("slug", input.slug).maybeSingle();
    if (catRes.error || !catRes.data) return { category: null, threads: [], error: catRes.error?.message ?? "not_found" };
    const threadsRes = await s
      .from("forum_threads")
      .select("id, title, author_id, is_pinned, is_locked, is_hidden, last_activity_at, created_at")
      .eq("category_id", catRes.data.id)
      .eq("is_hidden", false)
      .order("is_pinned", { ascending: false })
      .order("last_activity_at", { ascending: false })
      .limit(100);
    const threadIds = (threadsRes.data ?? []).map((t) => t.id);
    const authorIds = [...new Set((threadsRes.data ?? []).map((t) => t.author_id))];
    const [profilesRes, repliesRes] = await Promise.all([
      authorIds.length
        ? s.from("profiles").select("id, username, avatar_url").in("id", authorIds)
        : Promise.resolve({ data: [] as { id: string; username: string; avatar_url: string | null }[] }),
      threadIds.length
        ? s.from("forum_replies").select("thread_id").eq("is_hidden", false).in("thread_id", threadIds)
        : Promise.resolve({ data: [] as { thread_id: string }[] }),
    ]);
    const map = new Map((profilesRes.data ?? []).map((p) => [p.id, p]));
    const counts = new Map<string, number>();
    for (const r of repliesRes.data ?? []) counts.set(r.thread_id, (counts.get(r.thread_id) ?? 0) + 1);
    const threads = (threadsRes.data ?? []).map((t) => ({
      ...t,
      author: map.get(t.author_id) ?? null,
      reply_count: counts.get(t.id) ?? 0,
    }));
    return { category: catRes.data, threads, error: null };
  });

export const getForumThread = createServerFn({ method: "GET" })
  .validator((input: { id: string }) => input)
  .handler(async ({ data: input }) => {
    const s = pub();
    const threadRes = await s.from("forum_threads").select("*").eq("id", input.id).eq("is_hidden", false).maybeSingle();
    if (threadRes.error || !threadRes.data) return { thread: null, replies: [], error: threadRes.error?.message ?? "not_found" };
    const repliesRes = await s.from("forum_replies").select("*").eq("thread_id", input.id).eq("is_hidden", false).order("created_at", { ascending: true });
    const authorIds = [...new Set([threadRes.data.author_id, ...(repliesRes.data ?? []).map((r) => r.author_id)])];
    const [profilesRes, catRes] = await Promise.all([
      s.from("profiles").select("id, username, avatar_url, level").in("id", authorIds),
      s.from("forum_categories").select("*").eq("id", threadRes.data.category_id).maybeSingle(),
    ]);
    const map = new Map((profilesRes.data ?? []).map((p) => [p.id, p]));
    return {
      thread: { ...threadRes.data, author: map.get(threadRes.data.author_id) ?? null, category: catRes.data ?? null },
      replies: (repliesRes.data ?? []).map((r) => ({ ...r, author: map.get(r.author_id) ?? null })),
      error: null,
    };
  });

export const getSiteStats = createServerFn({ method: "GET" }).handler(async () => {
  const s = pub();
  const [profiles, scores, presets, lessons] = await Promise.all([
    s.from("profiles").select("id", { count: "exact", head: true }),
    s.from("game_scores").select("id", { count: "exact", head: true }),
    s.from("presets").select("id", { count: "exact", head: true }),
    s.from("lessons").select("id", { count: "exact", head: true }),
  ]);
  return {
    users: profiles.count ?? 0,
    games: scores.count ?? 0,
    presets: presets.count ?? 0,
    lessons: lessons.count ?? 0,
  };
});
