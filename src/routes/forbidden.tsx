import { createFileRoute, Link, useSearch } from "@tanstack/react-router";
import { ShieldAlert, Home, LogIn } from "lucide-react";
import { z } from "zod";

const searchSchema = z.object({
  from: z.string().optional(),
  reason: z.enum(["role", "auth", "banned"]).optional(),
});

export const Route = createFileRoute("/forbidden")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "Доступ запрещён — MixPro" },
      { name: "robots", content: "noindex" },
      { name: "description", content: "У вас нет прав на просмотр этой страницы." },
    ],
  }),
  component: ForbiddenPage,
});

const REASON_TITLE: Record<string, string> = {
  role: "Недостаточно прав",
  auth: "Требуется вход",
  banned: "Аккаунт ограничен",
};
const REASON_TEXT: Record<string, string> = {
  role: "Эта страница доступна только пользователям с определённой ролью. Если вам должен быть выдан доступ — свяжитесь с администратором.",
  auth: "Войдите в аккаунт, чтобы продолжить.",
  banned: "Ваш аккаунт ограничен модерацией. Обратитесь в поддержку.",
};

function ForbiddenPage() {
  const { from, reason } = useSearch({ from: "/forbidden" });
  const title = REASON_TITLE[reason ?? "role"] ?? "Доступ запрещён";
  const text = REASON_TEXT[reason ?? "role"] ?? REASON_TEXT.role;

  return (
    <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center px-4 py-16 text-center">
      <div className="grid h-16 w-16 place-items-center rounded-2xl border border-destructive/40 bg-destructive/10 text-destructive shadow-[0_0_30px_rgba(239,68,68,0.25)]">
        <ShieldAlert className="h-8 w-8" />
      </div>
      <div className="mt-4 font-mono text-[10px] uppercase tracking-[0.2em] text-destructive/80">
        403 · forbidden
      </div>
      <h1 className="mt-2 text-2xl font-bold">{title}</h1>
      <p className="mt-2 text-sm text-muted-foreground">{text}</p>
      {from && (
        <p className="mt-2 break-all font-mono text-[10px] text-muted-foreground/70">
          {from}
        </p>
      )}
      <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
        <Link
          to="/"
          className="inline-flex items-center gap-2 rounded-lg border border-border/60 bg-black/30 px-4 py-2 text-sm font-semibold hover:border-mint/40 hover:text-mint"
        >
          <Home className="h-4 w-4" /> На главную
        </Link>
        {reason === "auth" && (
          <Link
            to="/auth"
            className="inline-flex items-center gap-2 rounded-lg border border-mint/40 bg-mint/10 px-4 py-2 text-sm font-semibold text-mint hover:bg-mint/20"
          >
            <LogIn className="h-4 w-4" /> Войти
          </Link>
        )}
      </div>
    </div>
  );
}
