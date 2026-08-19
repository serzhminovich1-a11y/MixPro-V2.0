import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const RANKS: Record<string, number> = { super_admin: 3, admin: 2, moderator: 1, user: 0 };

// Decided 2026-08-19 — see mixpro-pricing project memory. No payment
// processor connected yet; tiers are still assigned manually, so this is
// what the numbers are *worth*, not what actually got charged anywhere.
export const TIER_PRICE_RUB: Record<string, number> = {
  free: 0,
  trial: 0,
  pro: 1000, // per month
  lifetime: 14990, // one-time
};

type ProfileRow = { id: string; username: string | null; subscription_tier: string | null; subscription_until: string | null; created_at: string };

function isActive(tier: string | null, until: string | null): boolean {
  if (tier === "lifetime") return true;
  return !!until && new Date(until).getTime() > Date.now();
}

/** Subscription analytics for the super-admin dashboard: tier breakdown,
 * estimated revenue (see TIER_PRICE_RUB — no payment processor yet, this
 * is priced-out from current tiers, not real transactions), a weekly
 * growth series sourced from admin_action_log, and who's expiring soon.
 * Super-admin only — this is financial data, one rank tighter than the
 * regular admin panel. */
export const getSubscriptionAnalytics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: myRoles } = await context.supabase.from("user_roles").select("role").eq("user_id", context.userId);
    const myRank = (myRoles ?? []).reduce((m, r) => Math.max(m, RANKS[r.role] ?? 0), 0);
    if (myRank < 3) throw new Error("Только для супер-админа");

    const { data: profilesData, error: pErr } = await context.supabase
      .from("profiles")
      .select("id, username, subscription_tier, subscription_until, created_at");
    if (pErr) throw new Error(pErr.message);
    const profiles = (profilesData ?? []) as ProfileRow[];

    // --- Tier breakdown + revenue estimate ---
    const tierCounts: Record<string, number> = { free: 0, trial: 0, pro: 0, lifetime: 0 };
    let payingActive = 0;
    let mrr = 0;
    let lifetimeRevenue = 0;
    for (const p of profiles) {
      const tier = p.subscription_tier ?? "free";
      const active = isActive(tier, p.subscription_until);
      if (tier === "lifetime") {
        tierCounts.lifetime++;
        lifetimeRevenue += TIER_PRICE_RUB.lifetime;
        payingActive++;
      } else if (active && tier === "pro") {
        tierCounts.pro++;
        mrr += TIER_PRICE_RUB.pro;
        payingActive++;
      } else if (active && tier === "trial") {
        tierCounts.trial++;
      } else {
        tierCounts.free++;
      }
    }
    const totalUsers = profiles.length;
    const payingPct = totalUsers > 0 ? (payingActive / totalUsers) * 100 : 0;

    // --- Expiring soon (next 30 days, non-lifetime, still active) ---
    const now = Date.now();
    const in30d = now + 30 * 24 * 60 * 60 * 1000;
    const expiringSoon = profiles
      .filter((p) => {
        if (p.subscription_tier === "lifetime" || !p.subscription_until) return false;
        const t = new Date(p.subscription_until).getTime();
        return t > now && t <= in30d;
      })
      .map((p) => ({
        id: p.id,
        username: p.username ?? "?",
        tier: p.subscription_tier ?? "free",
        until: p.subscription_until as string,
      }))
      .sort((a, b) => new Date(a.until).getTime() - new Date(b.until).getTime())
      .slice(0, 50);

    // --- Weekly growth from admin_action_log (subscription grants) ---
    const since = new Date(now - 84 * 24 * 60 * 60 * 1000).toISOString(); // ~12 weeks back
    const { data: logRows } = await context.supabase
      .from("admin_action_log")
      .select("action, created_at")
      .in("action", ["subscription_set", "subscription_extend"])
      .gte("created_at", since)
      .order("created_at", { ascending: true });

    // Bucket into ISO week-start (Monday) keys.
    const weekBuckets = new Map<string, number>();
    for (const row of (logRows ?? []) as { action: string; created_at: string }[]) {
      const d = new Date(row.created_at);
      const day = (d.getUTCDay() + 6) % 7; // 0 = Monday
      const monday = new Date(d);
      monday.setUTCDate(d.getUTCDate() - day);
      monday.setUTCHours(0, 0, 0, 0);
      const key = monday.toISOString().slice(0, 10);
      weekBuckets.set(key, (weekBuckets.get(key) ?? 0) + 1);
    }
    // Fill in empty weeks so the chart doesn't skip gaps.
    const growth: { week: string; count: number }[] = [];
    const cursor = new Date(since);
    cursor.setUTCDate(cursor.getUTCDate() - ((cursor.getUTCDay() + 6) % 7));
    cursor.setUTCHours(0, 0, 0, 0);
    const end = new Date(now);
    while (cursor.getTime() <= end.getTime()) {
      const key = cursor.toISOString().slice(0, 10);
      growth.push({ week: key, count: weekBuckets.get(key) ?? 0 });
      cursor.setUTCDate(cursor.getUTCDate() + 7);
    }

    return {
      totalUsers,
      tierCounts,
      payingActive,
      payingPct,
      mrr,
      lifetimeRevenue,
      expiringSoon,
      growth,
      prices: TIER_PRICE_RUB,
    };
  });
