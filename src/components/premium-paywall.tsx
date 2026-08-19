import { Link } from "@tanstack/react-router";
import { Lock, Sparkles } from "lucide-react";

/** Full-width paywall card shown in place of premium content. */
export function PremiumPaywall({ title, description }: { title?: string; description?: string }) {
  return (
    <div className="glass relative overflow-hidden rounded-2xl border border-amber-400/30 bg-gradient-to-br from-amber-500/10 via-transparent to-violet/10 p-8 text-center">
      <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-amber-400/15 text-amber-300">
        <Lock className="h-5 w-5" />
      </div>
      <h3 className="mt-4 text-xl font-bold">{title ?? "Только по подписке"}</h3>
      <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
        {description ?? "Этот материал доступен пользователям с активной подпиской PRO. Оформи её и получи полный доступ к платным урокам и пресетам."}
      </p>
      <Link
        to="/profile"
        hash="subscription"
        className="mt-5 inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-amber-400 to-amber-500 px-5 py-2.5 text-sm font-semibold text-black transition-transform hover:scale-105"
      >
        <Sparkles className="h-4 w-4" /> Оформить подписку
      </Link>
    </div>
  );
}

/** Small "PRO" chip for cards. */
export function PremiumBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-amber-400/15 px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-widest text-amber-300">
      <Sparkles className="h-3 w-3" /> PRO
    </span>
  );
}
