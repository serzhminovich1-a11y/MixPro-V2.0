import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getMySubscription } from "@/lib/subscription.functions";
import { useAuth } from "@/hooks/use-auth";

export function useSubscription() {
  const { session } = useAuth();
  const fetchSub = useServerFn(getMySubscription);
  const [state, setState] = useState<{ tier: string; until: string | null; active: boolean; loading: boolean }>({
    tier: "free",
    until: null,
    active: false,
    loading: true,
  });

  useEffect(() => {
    if (!session) {
      setState({ tier: "free", until: null, active: false, loading: false });
      return;
    }
    let cancelled = false;
    fetchSub()
      .then((r) => {
        if (!cancelled) setState({ tier: r.tier, until: r.until, active: r.active, loading: false });
      })
      .catch(() => {
        if (!cancelled) setState({ tier: "free", until: null, active: false, loading: false });
      });
    return () => {
      cancelled = true;
    };
  }, [session, fetchSub]);

  return state;
}
