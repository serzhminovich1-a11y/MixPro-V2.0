import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Flag } from "lucide-react";
import { submitReport } from "@/lib/community.functions";
import { useAuth } from "@/hooks/use-auth";

export function ReportButton({
  targetType,
  targetId,
  compact,
}: {
  targetType: "thread" | "reply" | "message" | "post" | "comment";
  targetId: string;
  compact?: boolean;
}) {
  const { session } = useAuth();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const report = useServerFn(submitReport);

  if (!session) return null;

  async function send() {
    if (reason.trim().length < 3) return;
    setBusy(true);
    try {
      await report({ data: { targetType, targetId, reason: reason.trim() } });
      toast.success("Жалоба отправлена модераторам");
      setOpen(false);
      setReason("");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={`inline-flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground hover:text-destructive ${compact ? "" : "px-2 py-1"}`}
        title="Пожаловаться"
      >
        <Flag className="h-3 w-3" />
        {!compact && <span>Жалоба</span>}
      </button>
      {open && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 px-4" onClick={() => setOpen(false)}>
          <div className="w-full max-w-md rounded-lg border border-black/70 bg-[var(--panel)] p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-bold uppercase tracking-wider">Отправить жалобу</h3>
            <p className="mt-2 text-xs text-muted-foreground">Опиши, что нарушено: спам, оскорбления, флуд, реклама.</p>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={4}
              maxLength={500}
              placeholder="Причина..."
              className="mt-3 w-full resize-none rounded border border-input bg-background px-3 py-2 text-sm"
            />
            <div className="mt-3 flex justify-end gap-2">
              <button onClick={() => setOpen(false)} className="rounded border border-black/60 bg-secondary px-3 py-1.5 text-xs">Отмена</button>
              <button
                onClick={send}
                disabled={busy || reason.trim().length < 3}
                className="rounded bg-destructive px-3 py-1.5 text-xs font-semibold text-destructive-foreground disabled:opacity-50"
              >
                {busy ? "..." : "Отправить"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
