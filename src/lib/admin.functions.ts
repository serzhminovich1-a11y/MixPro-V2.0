import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Bootstrap: if no super_admin exists, current user becomes super_admin. */
export const claimSuperAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { count } = await supabaseAdmin
      .from("user_roles")
      .select("id", { count: "exact", head: true })
      .eq("role", "super_admin");
    if ((count ?? 0) > 0) throw new Error("Супер-админ уже назначен");
    const { error } = await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: context.userId, role: "super_admin" });
    if (error) throw new Error(error.message);
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
    const ranks: Record<string, number> = { super_admin: 3, admin: 2, moderator: 1, user: 0 };
    const list = (roles ?? []).map((r) => r.role as string);
    const rank = list.reduce((m, r) => Math.max(m, ranks[r] ?? 0), 0);
    return {
      userId: context.userId,
      roles: list,
      isSuperAdmin: list.includes("super_admin"),
      isAdmin: rank >= 2,
      canModerate: rank >= 1,
    };
  });

/** List users with search, roles, bans, XP, certs. Admin+ only. */
export const listUsers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { search?: string; limit?: number }) =>
    z.object({ search: z.string().max(80).optional(), limit: z.number().int().min(1).max(200).optional() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: myRoles } = await context.supabase.from("user_roles").select("role").eq("user_id", context.userId);
    const ranks: Record<string, number> = { super_admin: 3, admin: 2, moderator: 1, user: 0 };
    const myRank = (myRoles ?? []).reduce((m, r) => Math.max(m, ranks[r.role] ?? 0), 0);
    if (myRank < 2) throw new Error("Только для админов");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let q = supabaseAdmin
      .from("profiles")
      .select("id, username, avatar_url, xp, level, created_at, subscription_tier, subscription_until")
      .order("xp", { ascending: false })
      .limit(data.limit ?? 50);
    if (data.search && data.search.trim()) q = q.ilike("username", `%${data.search.trim()}%`);
    const { data: profiles, error } = await q;
    if (error) throw new Error(error.message);
    const ids = (profiles ?? []).map((p) => p.id);
    if (ids.length === 0) return { users: [], myRank };

    const [rolesRes, bansRes, certsRes, certsListRes] = await Promise.all([
      supabaseAdmin.from("user_roles").select("user_id, role").in("user_id", ids),
      supabaseAdmin.from("user_bans").select("user_id, reason, expires_at, created_at").in("user_id", ids),
      supabaseAdmin.from("user_certifications").select("user_id, certification_id, awarded_at").in("user_id", ids),
      supabaseAdmin.from("certifications").select("id, slug, name, color, icon"),
    ]);
    const certMap = new Map((certsListRes.data ?? []).map((c) => [c.id, c]));
    const users = (profiles ?? []).map((p) => {
      const roles = (rolesRes.data ?? []).filter((r) => r.user_id === p.id).map((r) => r.role as string);
      const targetRank = roles.reduce((m, r) => Math.max(m, ranks[r] ?? 0), 0);
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
    return { users, myRank };
  });

export const listCertifications = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin.from("certifications").select("*").order("name");
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
    return { ok: true };
  });

export const unbanUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { targetId: string }) => z.object({ targetId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("user_bans").delete().eq("user_id", data.targetId);
    if (error) throw new Error(error.message);
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
    return { ok: true, until: newUntil as string };
  });
