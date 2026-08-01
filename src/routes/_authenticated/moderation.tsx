import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Shield, Check, X, EyeOff } from "lucide-react";
import { listReports, resolveReport, moderateHide } from "@/lib/community.functions";
import { RouteError, RouteNotFound } from "@/components/route-fallbacks";
import { RoleGate } from "@/components/role-gate";

export const Route = createFileRoute("/_authenticated/moderation")({
  head: () => ({ meta: [{ title: "Модерация — MixPro" }, { name: "robots", content: "noindex" }] }),
  component: () => (
    <RoleGate role="moderator">
      <ModPage />
    </RoleGate>
  ),
  errorComponent: RouteError,
  notFoundComponent: RouteNotFound,
});

type Report = {
  id: string;
  reporter_id: string;
  target_type: "thread" | "reply" | "message" | "post" | "comment";
  target_id: string;
  reason: string;
  status: string;
  created_at: string;
};

function ModPage() {
  const [reports, setReports] = useState<Report[]>([]);
  const [canMod, setCanMod] = useState<boolean | null>(null);
  const list = useServerFn(listReports);
  const resolve = useServerFn(resolveReport);
  const hide = useServerFn(moderateHide);

  async function reload() {
    const r = await list({});
    setCanMod(r.canModerate);
    setReports(r.reports as Report[]);
  }

  useEffect(() => {
    reload().catch(() => setCanMod(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function act(id: string, status: "resolved" | "rejected") {
    try {
      await resolve({ data: { id, status } });
      toast.success(status === "resolved" ? "Решено" : "Отклонено");
      reload();
    } catch (e) { toast.error((e as Error).message); }
  }

  async function doHide(r: Report) {
    if (r.target_type === "post" || r.target_type === "comment") { toast("Скрытие постов/комментов ленты пока недоступно"); return; }
    try {
      await hide({ data: { targetType: r.target_type as "thread" | "reply" | "message", targetId: r.target_id, hide: true } });
      toast.success("Скрыто");
      await act(r.id, "resolved");
    } catch (e) { toast.error((e as Error).message); }
  }

  if (canMod === null) return <div className="mx-auto max-w-3xl p-8 text-sm text-muted-foreground">Загрузка...</div>;
  if (!canMod) return <div className="mx-auto max-w-3xl p-8 text-center text-sm text-muted-foreground">Доступ только для модераторов.</div>;

  return (
    <div className="mx-auto max-w-3xl px-4 py-14">
      <div className="flex items-center gap-3">
        <div className="grid h-9 w-9 place-items-center rounded-lg bg-destructive/10 text-destructive">
          <Shield className="h-4 w-4" />
        </div>
        <span className="label-mono">Модерация // {reports.length} открытых жалоб</span>
      </div>
      <h1 className="mt-4 text-3xl font-bold">Жалобы</h1>

      <div className="mt-6 space-y-3">
        {reports.length === 0 && <p className="text-sm text-muted-foreground">Всё чисто ✓</p>}
        {reports.map((r) => (
          <article key={r.id} className="panel rounded-xl p-4">
            <div className="flex items-center gap-2 text-xs">
              <span className="rounded bg-secondary px-2 py-0.5 font-mono uppercase tracking-wider">{r.target_type}</span>
              <span className="font-mono text-muted-foreground">{r.target_id.slice(0, 8)}</span>
              <span className="ml-auto text-muted-foreground">{new Date(r.created_at).toLocaleString("ru-RU")}</span>
            </div>
            <p className="mt-2 text-sm">{r.reason}</p>
            <div className="mt-3 flex gap-2">
              <button onClick={() => doHide(r)} className="inline-flex items-center gap-1 rounded bg-destructive/20 px-3 py-1.5 text-xs text-destructive hover:bg-destructive/30">
                <EyeOff className="h-3 w-3" /> Скрыть и решить
              </button>
              <button onClick={() => act(r.id, "resolved")} className="inline-flex items-center gap-1 rounded bg-mint/20 px-3 py-1.5 text-xs text-mint hover:bg-mint/30">
                <Check className="h-3 w-3" /> Решено
              </button>
              <button onClick={() => act(r.id, "rejected")} className="inline-flex items-center gap-1 rounded bg-secondary px-3 py-1.5 text-xs hover:bg-black/40">
                <X className="h-3 w-3" /> Отклонить
              </button>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
