import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getMyAdminContext } from "@/lib/admin.functions";
import { useAuth } from "@/hooks/use-auth";

export type AdminCtx = {
  userId: string;
  roles: string[];
  isSuperAdmin: boolean;
  isAdmin: boolean;
  canModerate: boolean;
};

/** Fetches the current user's admin context once per session. */
export function useAdmin() {
  const { session, loading } = useAuth();
  const fn = useServerFn(getMyAdminContext);
  const [ctx, setCtx] = useState<AdminCtx | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!session) {
      setCtx(null);
      setReady(true);
      return;
    }
    let cancelled = false;
    fn()
      .then((c) => {
        if (!cancelled) setCtx(c);
      })
      .catch(() => {
        if (!cancelled) setCtx(null);
      })
      .finally(() => {
        if (!cancelled) setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, [session, loading, fn]);

  return {
    ctx,
    ready,
    isAdmin: !!ctx?.isAdmin,
    isSuperAdmin: !!ctx?.isSuperAdmin,
    canModerate: !!ctx?.canModerate,
  };
}
