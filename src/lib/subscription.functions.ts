import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Returns current user's subscription state. */
export const getMySubscription = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("profiles")
      .select("subscription_tier, subscription_until")
      .eq("id", context.userId)
      .maybeSingle();
    const tier = (data?.subscription_tier ?? "free") as string;
    const until = data?.subscription_until as string | null;
    const active =
      tier === "lifetime" || (until != null && new Date(until).getTime() > Date.now());
    return { tier, until, active };
  });
