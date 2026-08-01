import { useEffect } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { useAdmin } from "@/hooks/use-admin";

type RequiredRole = "moderator" | "admin" | "super_admin";

/**
 * Client-side role gate. While the admin context loads, shows a spinner.
 * If the user lacks the required role, redirects to /forbidden and renders nothing.
 * Placed inside routes that already live under /_authenticated so the user is signed-in.
 */
export function RoleGate({
  role,
  children,
}: {
  role: RequiredRole;
  children: React.ReactNode;
}) {
  const { ready, isAdmin, isSuperAdmin, canModerate } = useAdmin();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const allowed =
    role === "super_admin"
      ? isSuperAdmin
      : role === "admin"
        ? isAdmin
        : canModerate;

  useEffect(() => {
    if (!ready) return;
    if (allowed) return;
    navigate({
      to: "/forbidden",
      search: { from: pathname, reason: "role" },
      replace: true,
    });
  }, [ready, allowed, navigate, pathname]);

  if (!ready) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-sm text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Проверяем доступ…
      </div>
    );
  }
  if (!allowed) return null;
  return <>{children}</>;
}
