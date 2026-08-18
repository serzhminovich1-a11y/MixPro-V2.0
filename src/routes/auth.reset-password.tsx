import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/auth/reset-password")({
  head: () => ({
    meta: [{ title: "Новый пароль — MixPro" }],
  }),
  component: ResetPasswordPage,
});

/**
 * Landing page for the link sent by resetPasswordForEmail (see auth.tsx).
 * Supabase's client auto-detects the recovery token in the URL hash and
 * turns it into a real (temporary) session — useAuth picks that up like
 * any other session, we just need to wait for it before rendering the form.
 */
function ResetPasswordPage() {
  const { session, loading: sessionLoading } = useAuth();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 6) {
      setError("Пароль должен быть не короче 6 символов.");
      return;
    }
    if (password !== confirm) {
      setError("Пароли не совпадают.");
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setDone(true);
      setTimeout(() => navigate({ to: "/profile" }), 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-[80vh] items-center justify-center px-4 py-16">
      <div className="glass w-full max-w-md rounded-2xl p-8">
        <h1 className="text-2xl font-bold">Новый пароль</h1>

        {sessionLoading ? (
          <p className="mt-4 text-sm text-muted-foreground">Проверяем ссылку...</p>
        ) : !session ? (
          <div className="mt-4 space-y-3">
            <p className="text-sm text-destructive">
              Ссылка недействительна или устарела. Запросите новую на странице входа.
            </p>
            <a href="/auth" className="inline-block text-sm font-semibold text-primary hover:underline">
              Вернуться ко входу
            </a>
          </div>
        ) : done ? (
          <p className="mt-4 text-sm text-mint">Пароль обновлён. Переходим в профиль...</p>
        ) : (
          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <input
              type="password"
              required
              minLength={6}
              placeholder="Новый пароль"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-xl border border-input bg-background px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
            <input
              type="password"
              required
              minLength={6}
              placeholder="Повторите пароль"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className="w-full rounded-xl border border-input bg-background px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
            {error && <p className="text-sm text-destructive">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground transition-transform hover:scale-[1.02] disabled:opacity-50"
            >
              {loading ? "Секунду..." : "Сохранить пароль"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
