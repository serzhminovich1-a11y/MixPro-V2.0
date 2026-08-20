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
    const s = pub();
    // subscription_tier is deliberately not selected here — anon/authenticated
    // were never granted column-level SELECT on it (unlike the rest of this
    // list), so including it makes the whole query fail with "permission
    // denied for table profiles" (Postgres column grants: any ungranted
    // column in the list fails the entire SELECT, not just that field).
    // This silently 404'd every public profile page before this fix.
    const { data, error } = await s
      .from("profiles")
      .select("id, username, avatar_url, banner_url, accent_color, display_font, xp, level, verified, created_at, bio, full_name, socials, status_text")
      .ilike("username", input.username)
      .maybeSingle();
    const empty = { profile: null, error: null as string | null, followerCount: 0, followingCount: 0, certs: [] as Cert[], presets: [] as PublicPreset[], screenshots: [] as PublicScreenshot[], reviews: [] as PublicReview[], isPremium: false };
    if (error) return { ...empty, error: error.message };
    if (!data) return empty;
    const [followers, following, userCertsRes, allCertsRes, presetsRes, screenshotsRes, reviewsRes, premiumRes] = await Promise.all([
      s.from("user_follows").select("follower_id", { count: "exact", head: true }).eq("followed_id", data.id),
      s.from("user_follows").select("followed_id", { count: "exact", head: true }).eq("follower_id", data.id),
      // Badges — earned certifications. Both tables are publicly readable
      // by RLS (same as everywhere else this is fetched), so this works
      // for any visitor, not just the profile owner.
      s.from("user_certifications").select("certification_id, awarded_at").eq("user_id", data.id),
      s.from("certifications").select("id, slug, name, color, icon"),
      s.from("presets").select("id, title, daw, genre, downloads, is_premium").eq("author_id", data.id).order("created_at", { ascending: false }).limit(6),
      // is_hidden=false filter — RLS already enforces it, but explicit
      // here too (same belt-and-suspenders convention as getPosts).
      s.from("screenshots").select("id, image_url, caption, created_at").eq("author_id", data.id).eq("is_hidden", false).order("created_at", { ascending: false }).limit(12),
      s.from("preset_reviews").select("id, preset_id, rating, content, created_at").eq("author_id", data.id).eq("is_hidden", false).order("created_at", { ascending: false }).limit(6),
      // Gates the full-page background perk — a boolean-only RPC (no raw
      // tier/expiry exposed) rather than selecting subscription_tier
      // directly, which has never been safe to expose (see the comment
      // above on why it's excluded from the main select).
      s.rpc("has_active_subscription", { _user_id: data.id }),
    ]);
    const certMap = new Map((allCertsRes.data ?? []).map((c) => [c.id, c]));
    const certs = (userCertsRes.data ?? [])
      .map((uc) => {
        const c = certMap.get(uc.certification_id);
        return c ? { ...c, awarded_at: uc.awarded_at } : null;
      })
      .filter((c): c is NonNullable<typeof c> => !!c);
    const reviewedPresetIds = [...new Set((reviewsRes.data ?? []).map((r) => r.preset_id))];
    const reviewedPresetsRes = reviewedPresetIds.length
      ? await s.from("presets").select("id, title, daw").in("id", reviewedPresetIds)
      : { data: [] as { id: string; title: string; daw: string }[] };
    const presetTitleMap = new Map((reviewedPresetsRes.data ?? []).map((p) => [p.id, p]));
    const reviews: PublicReview[] = (reviewsRes.data ?? []).map((r) => ({
      id: r.id, rating: r.rating, content: r.content, createdAt: r.created_at,
      preset: presetTitleMap.get(r.preset_id) ?? null,
    }));
    return {
      profile: data, error: null, followerCount: followers.count ?? 0, followingCount: following.count ?? 0,
      certs, presets: presetsRes.data ?? [], screenshots: screenshotsRes.data ?? [], reviews, isPremium: premiumRes.data === true,
    };
  });

type Cert = { id: string; slug: string; name: string; color: string; icon: string | null; awarded_at?: string };
type PublicPreset = { id: string; title: string; daw: string; genre: string | null; downloads: number; is_premium: boolean };
type PublicScreenshot = { id: string; image_url: string; caption: string | null; created_at: string };
type PublicReview = { id: string; rating: number; content: string | null; createdAt: string; preset: { id: string; title: string; daw: string } | null };

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
  const presetIds = (presetsRes.data ?? []).map((p) => p.id);
  const [profilesRes, reviewsRes] = await Promise.all([
    (async () => {
      const authorIds = [...new Set((presetsRes.data ?? []).map((p) => p.author_id))];
      return authorIds.length
        ? s.from("profiles").select("id, username, avatar_url").in("id", authorIds)
        : { data: [] as { id: string; username: string; avatar_url: string | null }[] };
    })(),
    presetIds.length
      ? s.from("preset_reviews").select("preset_id, rating").eq("is_hidden", false).in("preset_id", presetIds)
      : Promise.resolve({ data: [] as { preset_id: string; rating: number }[] }),
  ]);
  const map = new Map((profilesRes.data ?? []).map((p) => [p.id, p]));
  const ratingsByPreset = new Map<string, number[]>();
  for (const r of reviewsRes.data ?? []) {
    const arr = ratingsByPreset.get(r.preset_id) ?? [];
    arr.push(r.rating);
    ratingsByPreset.set(r.preset_id, arr);
  }
  return {
    presets: (presetsRes.data ?? []).map((p) => {
      const ratings = ratingsByPreset.get(p.id) ?? [];
      const avgRating = ratings.length ? ratings.reduce((a, b) => a + b, 0) / ratings.length : null;
      return { ...p, author: map.get(p.author_id) ?? null, avgRating, reviewCount: ratings.length };
    }),
    error: null,
  };
});

// Merch shop — catalog only (see admin.merch.tsx / shop.tsx). RLS already
// restricts this SELECT to is_active=true for anon/non-moderators, so no
// extra filter needed here.
export const getMerch = createServerFn({ method: "GET" }).handler(async () => {
  const { data, error } = await pub()
    .from("merch_items")
    .select("id, name, description, image_url, price_label, category")
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: false });
  if (error) return { items: [], error: error.message };
  return { items: data ?? [], error: null };
});

export const getPosts = createServerFn({ method: "GET" }).handler(async () => {
  const s = pub();
  const postsRes = await s.from("posts").select("id, author_id, content, created_at, repost_of").eq("is_hidden", false).order("created_at", { ascending: false }).limit(50);
  if (postsRes.error) return { posts: [], error: postsRes.error.message };
  const postIds = (postsRes.data ?? []).map((p) => p.id);
  const [likesRes, commentsRes] = postIds.length
    ? await Promise.all([
        s.from("post_likes").select("post_id, user_id").in("post_id", postIds),
        s.from("post_comments").select("id, post_id, author_id, content, created_at").eq("is_hidden", false).in("post_id", postIds).order("created_at", { ascending: true }),
      ])
    : [{ data: [] as { post_id: string; user_id: string }[] }, { data: [] as { id: string; post_id: string; author_id: string; content: string; created_at: string }[] }];
  // Reposts point at another `posts` row — fetch those originals in one
  // extra batched query (not per-row) and join client-side, same pattern
  // as everywhere else in this file. Not filtered by is_hidden here: a
  // hidden original still needs to resolve so the repost can show "оригинал
  // скрыт" instead of leaking its content or silently breaking.
  const repostIds = [...new Set((postsRes.data ?? []).map((p) => p.repost_of).filter((id): id is string => !!id))];
  const originalsRes = repostIds.length
    ? await s.from("posts").select("id, author_id, content, title, is_hidden").in("id", repostIds)
    : { data: [] as { id: string; author_id: string; content: string; title: string | null; is_hidden: boolean }[] };
  const authorIds = [...new Set([
    ...(postsRes.data ?? []).map((p) => p.author_id),
    ...(commentsRes.data ?? []).map((c) => c.author_id),
    ...(originalsRes.data ?? []).map((o) => o.author_id),
  ])];
  const profilesRes = authorIds.length
    ? await s.from("profiles").select("id, username, avatar_url, level").in("id", authorIds)
    : { data: [] as { id: string; username: string; avatar_url: string | null; level: number }[] };
  const map = new Map((profilesRes.data ?? []).map((p) => [p.id, p]));
  const originalMap = new Map((originalsRes.data ?? []).map((o) => [o.id, o]));
  const posts = (postsRes.data ?? []).map((post) => {
    const original = post.repost_of ? originalMap.get(post.repost_of) : undefined;
    return {
      ...post,
      author: map.get(post.author_id) ?? null,
      likes: (likesRes.data ?? []).filter((l) => l.post_id === post.id).map((l) => l.user_id),
      comments: (commentsRes.data ?? []).filter((c) => c.post_id === post.id).map((c) => ({ ...c, author: map.get(c.author_id) ?? null })),
      original: original
        ? { id: original.id, title: original.title, content: original.is_hidden ? null : original.content, author: map.get(original.author_id) ?? null, hidden: original.is_hidden }
        : post.repost_of
          ? { id: post.repost_of, title: null, content: null, author: null, hidden: true } // original was deleted (repost_of survives as null via FK, but the id can still be in-flight momentarily) or not found
          : null,
    };
  });
  return { posts, error: null };
});

/** Category index for the classic forum homepage: a flat list with
 * parent_id (client builds the tree), per-category topic/post counts, and
 * the single latest thread ("last post") each — the info classic forum
 * software always shows per (sub)forum row. */
export const getForumCategories = createServerFn({ method: "GET" }).handler(async () => {
  const s = pub();
  const [catsRes, threadsRes] = await Promise.all([
    s.from("forum_categories").select("*").order("order_index", { ascending: true }),
    s.from("forum_threads").select("id, category_id, title, author_id, last_activity_at").eq("is_hidden", false),
  ]);
  if (catsRes.error) return { categories: [], error: catsRes.error.message };
  const threadIds = (threadsRes.data ?? []).map((t) => t.id);
  const repliesRes = threadIds.length
    ? await s.from("forum_replies").select("thread_id").eq("is_hidden", false).in("thread_id", threadIds)
    : { data: [] as { thread_id: string }[] };
  const replyCountByThread = new Map<string, number>();
  for (const r of repliesRes.data ?? []) replyCountByThread.set(r.thread_id, (replyCountByThread.get(r.thread_id) ?? 0) + 1);

  const threadCount = new Map<string, number>();
  const postCount = new Map<string, number>();
  const lastThread = new Map<string, { id: string; title: string; author_id: string; last_activity_at: string }>();
  for (const t of threadsRes.data ?? []) {
    threadCount.set(t.category_id, (threadCount.get(t.category_id) ?? 0) + 1);
    postCount.set(t.category_id, (postCount.get(t.category_id) ?? 0) + 1 + (replyCountByThread.get(t.id) ?? 0));
    const cur = lastThread.get(t.category_id);
    if (!cur || t.last_activity_at > cur.last_activity_at) lastThread.set(t.category_id, t);
  }

  const authorIds = [...new Set([...lastThread.values()].map((t) => t.author_id))];
  const profilesRes = authorIds.length
    ? await s.from("profiles").select("id, username, avatar_url").in("id", authorIds)
    : { data: [] as { id: string; username: string; avatar_url: string | null }[] };
  const profileMap = new Map((profilesRes.data ?? []).map((p) => [p.id, p]));

  return {
    categories: (catsRes.data ?? []).map((c) => {
      const last = lastThread.get(c.id);
      return {
        ...c,
        thread_count: threadCount.get(c.id) ?? 0,
        post_count: postCount.get(c.id) ?? 0,
        last_activity_at: last?.last_activity_at ?? null,
        last_thread: last ? { id: last.id, title: last.title, author: profileMap.get(last.author_id) ?? null, at: last.last_activity_at } : null,
      };
    }),
    error: null,
  };
});

/** Sidebar widgets for the forum homepage — a site-wide "latest posts"
 * feed (not per-category) plus overall counters. The single thing a dense,
 * many-category forum needs that a plain category list doesn't give you:
 * one place to see everything new without opening each section. */
export const getForumActivity = createServerFn({ method: "GET" }).handler(async () => {
  const s = pub();
  const [threadsRes, usersRes] = await Promise.all([
    s
      .from("forum_threads")
      .select("id, title, category_id, author_id, is_pinned, last_activity_at")
      .eq("is_hidden", false)
      .order("last_activity_at", { ascending: false })
      .limit(8),
    s.from("profiles").select("id", { count: "exact", head: true }),
  ]);
  const threads = threadsRes.data ?? [];
  const catIds = [...new Set(threads.map((t) => t.category_id))];
  const authorIds = [...new Set(threads.map((t) => t.author_id))];
  const [catsRes, profilesRes, allThreadsRes] = await Promise.all([
    catIds.length ? s.from("forum_categories").select("id, slug, name").in("id", catIds) : Promise.resolve({ data: [] as { id: string; slug: string; name: string }[] }),
    authorIds.length ? s.from("profiles").select("id, username, avatar_url").in("id", authorIds) : Promise.resolve({ data: [] as { id: string; username: string; avatar_url: string | null }[] }),
    s.from("forum_threads").select("id", { count: "exact", head: true }).eq("is_hidden", false),
  ]);
  const catMap = new Map((catsRes.data ?? []).map((c) => [c.id, c]));
  const profileMap = new Map((profilesRes.data ?? []).map((p) => [p.id, p]));
  const repliesRes = await s.from("forum_replies").select("id", { count: "exact", head: true }).eq("is_hidden", false);
  const threadTotal = allThreadsRes.count ?? 0;
  const replyTotal = repliesRes.count ?? 0;

  return {
    recent: threads.map((t) => ({
      ...t,
      category: catMap.get(t.category_id) ?? null,
      author: profileMap.get(t.author_id) ?? null,
    })),
    // "Posts" = every original topic post + every reply, same convention
    // as the per-category post_count in getForumCategories.
    stats: { threads: threadTotal, posts: threadTotal + replyTotal, members: usersRes.count ?? 0 },
    error: null,
  };
});

export const getForumCategoryBySlug = createServerFn({ method: "GET" })
  .validator((input: { slug: string }) => input)
  .handler(async ({ data: input }) => {
    const s = pub();
    const catRes = await s.from("forum_categories").select("*").eq("slug", input.slug).maybeSingle();
    if (catRes.error || !catRes.data) return { category: null, parent: null, subforums: [], threads: [], error: catRes.error?.message ?? "not_found" };
    const cat = catRes.data;
    const [threadsRes, subforumsRes, parentRes] = await Promise.all([
      s
        .from("forum_threads")
        .select("id, title, author_id, is_pinned, is_locked, is_hidden, last_activity_at, created_at, views")
        .eq("category_id", cat.id)
        .eq("is_hidden", false)
        .order("is_pinned", { ascending: false })
        .order("last_activity_at", { ascending: false })
        .limit(100),
      // Subforums nested directly under this category — same "classic forum"
      // tree as the homepage, one level deep from wherever we are.
      s.from("forum_categories").select("*").eq("parent_id", cat.id).order("order_index", { ascending: true }),
      cat.parent_id ? s.from("forum_categories").select("id, slug, name").eq("id", cat.parent_id).maybeSingle() : Promise.resolve({ data: null }),
    ]);
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
    return { category: cat, parent: parentRes.data ?? null, subforums: subforumsRes.data ?? [], threads, error: null };
  });

export const getForumThread = createServerFn({ method: "GET" })
  .validator((input: { id: string }) => input)
  .handler(async ({ data: input }) => {
    const s = pub();
    const threadRes = await s.from("forum_threads").select("*").eq("id", input.id).eq("is_hidden", false).maybeSingle();
    if (threadRes.error || !threadRes.data) return { thread: null, replies: [], error: threadRes.error?.message ?? "not_found" };
    const repliesRes = await s.from("forum_replies").select("*").eq("thread_id", input.id).eq("is_hidden", false).order("created_at", { ascending: true });
    const authorIds = [...new Set([threadRes.data.author_id, ...(repliesRes.data ?? []).map((r) => r.author_id)])];
    const [profilesRes, catRes, threadPostsRes, replyPostsRes, rolesRes] = await Promise.all([
      s.from("profiles").select("id, username, avatar_url, level, verified, created_at").in("id", authorIds),
      s.from("forum_categories").select("*").eq("id", threadRes.data.category_id).maybeSingle(),
      // Total post count per author, site-wide — the "Сообщений: N" line
      // classic forum software shows under a poster's name. Small
      // scale for now (id-only columns), fine to compute on every load.
      s.from("forum_threads").select("author_id").eq("is_hidden", false).in("author_id", authorIds),
      s.from("forum_replies").select("author_id").eq("is_hidden", false).in("author_id", authorIds),
      // Staff badge (Модератор/Админ/...) — roles_select_public_staff only
      // ever returns rows for elevated roles, nothing about regular users.
      s.from("user_roles").select("user_id, role").in("user_id", authorIds),
    ]);
    const map = new Map((profilesRes.data ?? []).map((p) => [p.id, p]));
    const postCount = new Map<string, number>();
    for (const row of [...(threadPostsRes.data ?? []), ...(replyPostsRes.data ?? [])]) {
      postCount.set(row.author_id, (postCount.get(row.author_id) ?? 0) + 1);
    }
    const RANK: Record<string, number> = { super_admin: 4, admin: 3, moderator: 2, teacher: 1 };
    const topRole = new Map<string, string>();
    for (const r of rolesRes.data ?? []) {
      const cur = topRole.get(r.user_id);
      if (!cur || (RANK[r.role] ?? 0) > (RANK[cur] ?? 0)) topRole.set(r.user_id, r.role);
    }
    const withAuthor = (authorId: string) => ({
      ...(map.get(authorId) ?? null),
      post_count: postCount.get(authorId) ?? 0,
      role: topRole.get(authorId) ?? null,
    });
    return {
      thread: { ...threadRes.data, author: map.get(threadRes.data.author_id) ? withAuthor(threadRes.data.author_id) : null, category: catRes.data ?? null },
      replies: (repliesRes.data ?? []).map((r) => ({ ...r, author: map.get(r.author_id) ? withAuthor(r.author_id) : null })),
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
