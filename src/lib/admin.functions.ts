import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Json } from "@/integrations/supabase/types";

const RANKS: Record<string, number> = { super_admin: 3, admin: 2, moderator: 1, user: 0 };

/** Fire-and-forget audit trail entry. Never blocks or fails the caller — a
 * logging hiccup shouldn't stop an admin action that already succeeded. */
async function logAction(actorId: string, action: string, targetId: string | null, meta: Record<string, unknown> = {}) {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("admin_action_log").insert({ actor_id: actorId, action, target_id: targetId, meta: meta as Json });
  } catch {
    /* audit log is best-effort */
  }
}

/** Bootstrap: if no super_admin exists, current user becomes super_admin. */
export const claimSuperAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    // Atomic check-and-insert (advisory-locked in the DB function) so two
    // concurrent bootstrap attempts can't both succeed — see claim_super_admin
    // in the migrations for why this used to be a two-call race.
    const { error } = await context.supabase.rpc("claim_super_admin", { _actor: context.userId });
    if (error) throw new Error(error.message);
    await logAction(context.userId, "claim_super_admin", null);
    return { ok: true };
  });

/** Get current caller admin context (max role + super flag). */
export const getMyAdminContext = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: roles } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId);
    const list = (roles ?? []).map((r) => r.role as string);
    const rank = list.reduce((m, r) => Math.max(m, RANKS[r] ?? 0), 0);
    return {
      userId: context.userId,
      roles: list,
      isSuperAdmin: list.includes("super_admin"),
      isAdmin: rank >= 2,
      canModerate: rank >= 1,
    };
  });

/** List users with search, roles, bans, XP, certs. Admin+ only. Paginated. */
export const listUsers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { search?: string; limit?: number; offset?: number; sort?: "xp" | "created_at" | "username" }) =>
    z.object({
      search: z.string().max(80).optional(),
      limit: z.number().int().min(1).max(200).optional(),
      offset: z.number().int().min(0).optional(),
      sort: z.enum(["xp", "created_at", "username"]).optional(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: myRoles } = await context.supabase.from("user_roles").select("role").eq("user_id", context.userId);
    const myRank = (myRoles ?? []).reduce((m, r) => Math.max(m, RANKS[r.role] ?? 0), 0);
    if (myRank < 2) throw new Error("Только для админов");

    // profiles/user_roles/user_bans/user_certifications/certifications are
    // all readable by the caller here anyway — profiles and the cert tables
    // are publicly readable by RLS, and user_roles/user_bans grant full read
    // to can_moderate() (myRank >= 2 already implies that). No service-role
    // client needed, which also means this works outside Lovable Cloud's
    // own hosting where that client isn't available at all.
    const limit = data.limit ?? 50;
    const offset = data.offset ?? 0;
    const sort = data.sort ?? "xp";
    let q = context.supabase
      .from("profiles")
      .select("id, username, avatar_url, xp, level, created_at, verified, subscription_tier, subscription_until", { count: "exact" })
      .order(sort, { ascending: sort === "username" })
      .range(offset, offset + limit - 1);
    if (data.search && data.search.trim()) q = q.ilike("username", `%${data.search.trim()}%`);
    const { data: profiles, count, error } = await q;
    if (error) throw new Error(error.message);
    const ids = (profiles ?? []).map((p) => p.id);
    if (ids.length === 0) return { users: [], myRank, total: count ?? 0 };

    const [rolesRes, bansRes, certsRes, certsListRes] = await Promise.all([
      context.supabase.from("user_roles").select("user_id, role").in("user_id", ids),
      context.supabase.from("user_bans").select("user_id, reason, expires_at, created_at").in("user_id", ids),
      context.supabase.from("user_certifications").select("user_id, certification_id, awarded_at").in("user_id", ids),
      context.supabase.from("certifications").select("id, slug, name, color, icon"),
    ]);
    const certMap = new Map((certsListRes.data ?? []).map((c) => [c.id, c]));
    const users = (profiles ?? []).map((p) => {
      const roles = (rolesRes.data ?? []).filter((r) => r.user_id === p.id).map((r) => r.role as string);
      const targetRank = roles.reduce((m, r) => Math.max(m, RANKS[r] ?? 0), 0);
      const activeBan = (bansRes.data ?? []).find(
        (b) => b.user_id === p.id && (!b.expires_at || new Date(b.expires_at) > new Date()),
      );
      const certs = (certsRes.data ?? [])
        .filter((c) => c.user_id === p.id)
        .map((c) => certMap.get(c.certification_id))
        .filter(Boolean);
      return {
        ...p,
        roles,
        targetRank,
        canAct: p.id !== context.userId && myRank > targetRank,
        ban: activeBan ?? null,
        certs,
      };
    });
    return { users, myRank, total: count ?? 0 };
  });

export const listCertifications = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    // certifications is publicly readable by RLS — plain client is enough.
    // (Only ever called from the authenticated admin page, so requiring
    // auth here changes nothing for actual callers.)
    const { data } = await context.supabase.from("certifications").select("*").order("name");
    return { certifications: data ?? [] };
  });

/** Grant a role (admin/moderator). Ranked hierarchy enforced. */
export const setRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { targetId: string; role: "admin" | "moderator" | "user" | "super_admin"; grant: boolean }) =>
    z.object({
      targetId: z.string().uuid(),
      role: z.enum(["admin", "moderator", "user", "super_admin"]),
      grant: z.boolean(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const supabase = context.supabase;
    if (data.grant) {
      const { error } = await supabase
        .from("user_roles")
        .insert({ user_id: data.targetId, role: data.role });
      if (error) throw new Error(error.message);
    } else {
      const { error } = await supabase
        .from("user_roles")
        .delete()
        .eq("user_id", data.targetId)
        .eq("role", data.role);
      if (error) throw new Error(error.message);
    }
    await logAction(context.userId, data.grant ? "role_grant" : "role_revoke", data.targetId, { role: data.role });
    return { ok: true };
  });

export const adjustXp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { targetId: string; delta: number }) =>
    z.object({ targetId: z.string().uuid(), delta: z.number().int().min(-100000).max(100000) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("admin_adjust_xp", {
      _actor: context.userId,
      _target: data.targetId,
      _delta: data.delta,
    });
    if (error) throw new Error(error.message);
    await logAction(context.userId, "xp_adjust", data.targetId, { delta: data.delta });
    return { ok: true };
  });

export const banUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { targetId: string; reason: string; days?: number }) =>
    z.object({
      targetId: z.string().uuid(),
      reason: z.string().trim().min(3).max(500),
      days: z.number().int().min(0).max(3650).optional(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const expires =
      data.days && data.days > 0 ? new Date(Date.now() + data.days * 86400_000).toISOString() : null;
    const { error } = await context.supabase.from("user_bans").insert({
      user_id: data.targetId,
      banned_by: context.userId,
      reason: data.reason,
      ...(expires ? { expires_at: expires } : {}),
    });
    if (error) throw new Error(error.message);
    await logAction(context.userId, "ban", data.targetId, { reason: data.reason, days: data.days ?? null });
    return { ok: true };
  });

export const unbanUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { targetId: string }) => z.object({ targetId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("user_bans").delete().eq("user_id", data.targetId);
    if (error) throw new Error(error.message);
    await logAction(context.userId, "unban", data.targetId);
    return { ok: true };
  });

export const awardCert = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { targetId: string; certificationId: string; grant: boolean }) =>
    z.object({
      targetId: z.string().uuid(),
      certificationId: z.string().uuid(),
      grant: z.boolean(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    if (data.grant) {
      const { error } = await context.supabase.from("user_certifications").insert({
        user_id: data.targetId,
        certification_id: data.certificationId,
        awarded_by: context.userId,
      });
      if (error && !error.message.toLowerCase().includes("duplicate")) throw new Error(error.message);
    } else {
      const { error } = await context.supabase
        .from("user_certifications")
        .delete()
        .eq("user_id", data.targetId)
        .eq("certification_id", data.certificationId);
      if (error) throw new Error(error.message);
    }
    await logAction(context.userId, data.grant ? "cert_grant" : "cert_revoke", data.targetId, { certificationId: data.certificationId });
    return { ok: true };
  });

/** Set subscription tier + expiry directly. */
export const setSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { targetId: string; tier: "free" | "trial" | "pro" | "lifetime"; until: string | null }) =>
    z.object({
      targetId: z.string().uuid(),
      tier: z.enum(["free", "trial", "pro", "lifetime"]),
      until: z.string().datetime().nullable(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("admin_set_subscription", {
      _actor: context.userId,
      _target: data.targetId,
      _tier: data.tier,
      _until: data.until as unknown as string,
    });
    if (error) throw new Error(error.message);
    await logAction(context.userId, "subscription_set", data.targetId, { tier: data.tier, until: data.until });
    return { ok: true };
  });

/** Extend subscription by N days (adds to current until or now()). */
export const extendSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { targetId: string; days: number; tier?: "trial" | "pro" }) =>
    z.object({
      targetId: z.string().uuid(),
      days: z.number().int().min(1).max(3650),
      tier: z.enum(["trial", "pro"]).optional(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: newUntil, error } = await context.supabase.rpc("admin_extend_subscription", {
      _actor: context.userId,
      _target: data.targetId,
      _days: data.days,
      _tier: data.tier ?? "pro",
    });
    if (error) throw new Error(error.message);
    await logAction(context.userId, "subscription_extend", data.targetId, { days: data.days, tier: data.tier ?? "pro" });
    return { ok: true, until: newUntil as string };
  });

/** Verify/unverify another user (blue checkmark). Rank-hierarchical via RPC. */
export const setVerified = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { targetId: string; verified: boolean }) =>
    z.object({ targetId: z.string().uuid(), verified: z.boolean() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("admin_set_verified", {
      _actor: context.userId,
      _target: data.targetId,
      _verified: data.verified,
    });
    if (error) throw new Error(error.message);
    await logAction(context.userId, data.verified ? "verify" : "unverify", data.targetId);
    return { ok: true };
  });

/** Super-admin boosts their own xp/level/verified. Self-only, checked in the RPC. */
export const selfBoost = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { deltaXp?: number; verified?: boolean; level?: number }) =>
    z.object({
      deltaXp: z.number().int().optional(),
      verified: z.boolean().optional(),
      level: z.number().int().min(1).max(999).optional(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("super_admin_self_boost", {
      _actor: context.userId,
      _delta_xp: data.deltaXp ?? 0,
      _verified: data.verified ?? false,
      _level: data.level,
    });
    if (error) throw new Error(error.message);
    await logAction(context.userId, "self_boost", context.userId, data as Record<string, unknown>);
    return { ok: true };
  });

/** Admin dashboard summary. Admin+ only. */
export const getAdminStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: myRoles } = await context.supabase.from("user_roles").select("role").eq("user_id", context.userId);
    const myRank = (myRoles ?? []).reduce((m, r) => Math.max(m, RANKS[r.role] ?? 0), 0);
    if (myRank < 2) throw new Error("Только для админов");

    // Every table here already grants the calling admin/moderator full read
    // via RLS (profiles is public; posts/forum_threads/chat_messages let
    // can_moderate() see hidden rows too; reports lets can_moderate() see
    // all of them) — myRank >= 2 above already implies can_moderate(), so
    // no service-role client needed for these counts.
    const supabase = context.supabase;
    const now = new Date();
    const dayAgo = new Date(now.getTime() - 86_400_000).toISOString();
    const weekAgo = new Date(now.getTime() - 7 * 86_400_000).toISOString();
    const [
      totalUsers, newUsers24h, newUsers7d, activeSubs,
      games24h, posts24h, threads24h, chat24h, openReports,
    ] = await Promise.all([
      supabase.from("profiles").select("id", { count: "exact", head: true }),
      supabase.from("profiles").select("id", { count: "exact", head: true }).gte("created_at", dayAgo),
      supabase.from("profiles").select("id", { count: "exact", head: true }).gte("created_at", weekAgo),
      supabase.from("profiles").select("id", { count: "exact", head: true }).or(`subscription_tier.eq.lifetime,subscription_until.gt.${now.toISOString()}`),
      supabase.from("game_scores").select("id", { count: "exact", head: true }).gte("created_at", dayAgo),
      supabase.from("posts").select("id", { count: "exact", head: true }).gte("created_at", dayAgo),
      supabase.from("forum_threads").select("id", { count: "exact", head: true }).gte("created_at", dayAgo),
      supabase.from("chat_messages").select("id", { count: "exact", head: true }).gte("created_at", dayAgo),
      supabase.from("reports").select("id", { count: "exact", head: true }).eq("status", "open"),
    ]);

    return {
      totalUsers: totalUsers.count ?? 0,
      newUsers24h: newUsers24h.count ?? 0,
      newUsers7d: newUsers7d.count ?? 0,
      activeSubs: activeSubs.count ?? 0,
      games24h: games24h.count ?? 0,
      posts24h: posts24h.count ?? 0,
      threads24h: threads24h.count ?? 0,
      chat24h: chat24h.count ?? 0,
      openReports: openReports.count ?? 0,
    };
  });

/** Paginated audit log of admin/super-admin actions. Moderator+ can view. */
export const listAdminActions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { limit?: number; before?: string }) =>
    z.object({
      limit: z.number().int().min(1).max(200).optional(),
      before: z.string().datetime().optional(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: myRoles } = await context.supabase.from("user_roles").select("role").eq("user_id", context.userId);
    const myRank = (myRoles ?? []).reduce((m, r) => Math.max(m, RANKS[r.role] ?? 0), 0);
    if (myRank < 1) throw new Error("Недостаточно прав");

    // admin_action_log_read_staff already grants can_moderate() full SELECT
    // (myRank >= 1 above implies that) — no service-role client needed.
    let q = context.supabase
      .from("admin_action_log")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(data.limit ?? 50);
    if (data.before) q = q.lt("created_at", data.before);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);

    const ids = [...new Set([
      ...(rows ?? []).map((r) => r.actor_id),
      ...(rows ?? []).map((r) => r.target_id).filter((id): id is string => !!id),
    ])];
    const { data: profiles } = ids.length
      ? await context.supabase.from("profiles").select("id, username").in("id", ids)
      : { data: [] as { id: string; username: string }[] };
    const map = new Map((profiles ?? []).map((p) => [p.id, p.username]));

    return {
      actions: (rows ?? []).map((r) => ({
        ...r,
        actor_username: map.get(r.actor_id) ?? null,
        target_username: r.target_id ? map.get(r.target_id) ?? null : null,
      })),
    };
  });
