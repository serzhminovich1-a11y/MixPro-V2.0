import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Export a full users dump as an XLSX workbook (base64-encoded).
 * Admin+ only. One workbook, many sheets — one row per user in the main sheet,
 * plus per-domain sheets keyed by user_id for related data.
 */
export const exportUsersXlsx = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    // Verify admin+
    const { data: myRoles } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId);
    const ranks: Record<string, number> = { super_admin: 3, admin: 2, moderator: 1, user: 0 };
    const myRank = (myRoles ?? []).reduce((m, r) => Math.max(m, ranks[r.role] ?? 0), 0);
    if (myRank < 2) throw new Error("Только для админов");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const XLSX = await import("xlsx");

    // Fetch all datasets in parallel. Wrap each to tolerate missing tables.
    const safe = async <T,>(p: PromiseLike<{ data: T[] | null }>): Promise<T[]> => {
      try {
        const { data } = await p;
        return (data ?? []) as T[];
      } catch {
        return [];
      }
    };

    const [
      profiles, roles, bans, certs, userCerts,
      courseProgress, lessonProgress, posts, presets,
      gameScores, threads, replies,
    ] = await Promise.all([
      safe(supabaseAdmin.from("profiles").select("*").order("created_at", { ascending: true })),
      safe(supabaseAdmin.from("user_roles").select("*")),
      safe(supabaseAdmin.from("user_bans").select("*")),
      safe(supabaseAdmin.from("certifications").select("*")),
      safe(supabaseAdmin.from("user_certifications").select("*")),
      safe(supabaseAdmin.from("user_course_progress").select("*")),
      safe(supabaseAdmin.from("lesson_progress").select("*")),
      safe(supabaseAdmin.from("posts").select("*")),
      safe(supabaseAdmin.from("presets").select("*")),
      safe(supabaseAdmin.from("game_scores").select("*")),
      safe(supabaseAdmin.from("forum_threads").select("*")),
      safe(supabaseAdmin.from("forum_replies").select("*")),
    ]);

    // Auth emails via admin API (batched pages).
    const emailByUser = new Map<string, string>();
    try {
      let page = 1;
      // Fetch up to 5000 users (50 per page × 100 pages max, cap at 100 pages)
      for (let i = 0; i < 100; i++) {
        const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 200 });
        if (error || !data?.users?.length) break;
        for (const u of data.users) {
          if (u.email) emailByUser.set(u.id, u.email);
        }
        if (data.users.length < 200) break;
        page++;
      }
    } catch {
      // ignore
    }

    // Build role/cert lookups
    const rolesByUser = new Map<string, string[]>();
    for (const r of roles as { user_id: string; role: string }[]) {
      const arr = rolesByUser.get(r.user_id) ?? [];
      arr.push(r.role);
      rolesByUser.set(r.user_id, arr);
    }
    const certById = new Map<string, { name: string; slug: string }>();
    for (const c of certs as { id: string; name: string; slug: string }[]) {
      certById.set(c.id, { name: c.name, slug: c.slug });
    }
    const banByUser = new Map<string, { reason: string; expires_at: string | null; created_at: string }>();
    for (const b of bans as { user_id: string; reason: string; expires_at: string | null; created_at: string; }[]) {
      banByUser.set(b.user_id, b);
    }

    // Counts by user_id
    const countBy = <T extends { user_id?: string; author_id?: string }>(rows: T[], key: "user_id" | "author_id" = "user_id") => {
      const m = new Map<string, number>();
      for (const r of rows) {
        const id = (r as Record<string, unknown>)[key] as string | undefined;
        if (!id) continue;
        m.set(id, (m.get(id) ?? 0) + 1);
      }
      return m;
    };
    const postCount = countBy(posts as { author_id: string }[], "author_id");
    const presetCount = countBy(presets as { author_id?: string; user_id?: string }[], (presets[0] as any)?.author_id !== undefined ? "author_id" : "user_id");
    const scoreCount = countBy(gameScores as { user_id: string }[]);
    const threadCount = countBy(threads as { author_id?: string; user_id?: string }[], (threads[0] as any)?.author_id !== undefined ? "author_id" : "user_id");
    const replyCount = countBy(replies as { author_id?: string; user_id?: string }[], (replies[0] as any)?.author_id !== undefined ? "author_id" : "user_id");
    const lessonsDone = new Map<string, number>();
    for (const lp of lessonProgress as { user_id: string; passed?: boolean }[]) {
      if (lp.passed) lessonsDone.set(lp.user_id, (lessonsDone.get(lp.user_id) ?? 0) + 1);
    }
    const coursesDone = new Map<string, number>();
    for (const cp of courseProgress as { user_id: string; completed_at?: string | null }[]) {
      if (cp.completed_at) coursesDone.set(cp.user_id, (coursesDone.get(cp.user_id) ?? 0) + 1);
    }
    const certsByUserList = new Map<string, string[]>();
    for (const uc of userCerts as { user_id: string; certification_id: string }[]) {
      const c = certById.get(uc.certification_id);
      if (!c) continue;
      const arr = certsByUserList.get(uc.user_id) ?? [];
      arr.push(c.name);
      certsByUserList.set(uc.user_id, arr);
    }

    // Main "Users" sheet
    const usersRows = (profiles as any[]).map((p) => {
      const ban = banByUser.get(p.id);
      const banned = ban && (!ban.expires_at || new Date(ban.expires_at) > new Date());
      return {
        user_id: p.id,
        username: p.username ?? "",
        email: emailByUser.get(p.id) ?? "",
        roles: (rolesByUser.get(p.id) ?? ["user"]).join(", "),
        xp: p.xp ?? 0,
        level: p.level ?? 1,
        verified: p.verified ?? false,
        subscription_tier: p.subscription_tier ?? "free",
        subscription_until: p.subscription_until ?? "",
        subscription_active:
          p.subscription_tier === "lifetime" ||
          (p.subscription_until && new Date(p.subscription_until) > new Date()) || false,
        banned: !!banned,
        ban_reason: ban?.reason ?? "",
        ban_expires_at: ban?.expires_at ?? "",
        certifications: (certsByUserList.get(p.id) ?? []).join(", "),
        posts_count: postCount.get(p.id) ?? 0,
        presets_count: presetCount.get(p.id) ?? 0,
        game_scores_count: scoreCount.get(p.id) ?? 0,
        forum_threads: threadCount.get(p.id) ?? 0,
        forum_replies: replyCount.get(p.id) ?? 0,
        lessons_passed: lessonsDone.get(p.id) ?? 0,
        courses_completed: coursesDone.get(p.id) ?? 0,
        bio: p.bio ?? "",
        avatar_url: p.avatar_url ?? "",
        created_at: p.created_at ?? "",
        updated_at: p.updated_at ?? "",
      };
    });

    const wb = XLSX.utils.book_new();
    const addSheet = (name: string, rows: unknown[]) => {
      const ws = XLSX.utils.json_to_sheet(rows.length ? (rows as any[]) : [{}]);
      XLSX.utils.book_append_sheet(wb, ws, name.slice(0, 31));
    };

    addSheet("Users", usersRows);
    addSheet("Roles", roles);
    addSheet("Bans", bans);
    addSheet("Certifications", userCerts);
    addSheet("CourseProgress", courseProgress);
    addSheet("LessonProgress", lessonProgress);
    addSheet("Posts", posts);
    addSheet("Presets", presets);
    addSheet("GameScores", gameScores);
    addSheet("ForumThreads", threads);
    addSheet("ForumReplies", replies);

    const buf = XLSX.write(wb, { type: "base64", bookType: "xlsx" }) as string;
    return {
      base64: buf,
      filename: `mixpro-users-${new Date().toISOString().slice(0, 10)}.xlsx`,
      users_count: usersRows.length,
    };
  });
