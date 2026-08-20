import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { getSiteSettings } from "@/lib/public.functions";

/**
 * Site-wide appearance settings, admin-configurable (see
 * admin.site-settings.tsx) — a custom accent color and nav item order.
 * Non-blocking: renders with the current theme's default --mint until this
 * resolves, same tradeoff useSiteTheme already makes (no SSR flash-guard
 * script here either), then re-colors live once the override (if any) loads.
 */
export function useSiteSettings() {
  const { data } = useQuery({
    queryKey: ["site-settings"],
    queryFn: () => getSiteSettings(),
    staleTime: 5 * 60 * 1000,
  });

  useEffect(() => {
    const root = document.documentElement;
    if (data?.accentColor) {
      root.style.setProperty("--mint", data.accentColor);
    } else {
      root.style.removeProperty("--mint");
    }
  }, [data?.accentColor]);

  return { navOrder: data?.navOrder ?? null };
}
