import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { Palette, GripVertical, ArrowUp, ArrowDown, RotateCcw, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { RouteError, RouteNotFound } from "@/components/route-fallbacks";
import { RoleGate } from "@/components/role-gate";
import { ACCENT_COLORS } from "@/lib/profile-customization";
import { tools } from "@/components/site-nav";

export const Route = createFileRoute("/_authenticated/admin/site-settings")({
  head: () => ({ meta: [{ title: "Настройки сайта — MixPro" }, { name: "robots", content: "noindex" }] }),
  component: () => (
    <RoleGate role="super_admin">
      <SiteSettingsPage />
    </RoleGate>
  ),
  errorComponent: RouteError,
  notFoundComponent: RouteNotFound,
});

const DEFAULT_ACCENT = "#6EE7B7"; // --mint's own default (oklch(0.78 0.19 145) ≈ this hex)

function SiteSettingsPage() {
  const [loading, setLoading] = useState(true);
  const [accentColor, setAccentColor] = useState<string | null>(null);
  const [navOrder, setNavOrder] = useState<string[]>(tools.map((t) => t.to));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("site_settings").select("accent_color, nav_order").eq("id", true).maybeSingle();
      if (data) {
        setAccentColor(data.accent_color);
        if (data.nav_order?.length) {
          const byPath = new Map<string, (typeof tools)[number]>(tools.map((t) => [t.to, t]));
          const ordered = data.nav_order.filter((to) => byPath.has(to));
          const remaining = tools.map((t) => t.to).filter((to) => !data.nav_order!.includes(to));
          setNavOrder([...ordered, ...remaining]);
        }
      }
      setLoading(false);
    })();
  }, []);

  // Live preview — same mechanism useSiteSettings uses site-wide, applied
  // here immediately so the swatch choice is visible before saving.
  useEffect(() => {
    const root = document.documentElement;
    if (accentColor) root.style.setProperty("--mint", accentColor);
    else root.style.removeProperty("--mint");
    return () => { root.style.removeProperty("--mint"); };
  }, [accentColor]);

  function move(index: number, dir: -1 | 1) {
    setNavOrder((prev) => {
      const next = [...prev];
      const j = index + dir;
      if (j < 0 || j >= next.length) return prev;
      [next[index], next[j]] = [next[j], next[index]];
      return next;
    });
  }

  async function save() {
    setSaving(true);
    const { error } = await supabase
      .from("site_settings")
      .update({ accent_color: accentColor, nav_order: navOrder, updated_at: new Date().toISOString() })
      .eq("id", true);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Настройки сохранены — применились для всех посетителей");
  }

  function reset() {
    setAccentColor(null);
    setNavOrder(tools.map((t) => t.to));
  }

  const labelByPath = new Map<string, (typeof tools)[number]>(tools.map((t) => [t.to, t]));

  if (loading) return <div className="mx-auto max-w-2xl px-4 py-10 text-sm text-muted-foreground">Загрузка…</div>;

  return (
    <div className="mx-auto max-w-2xl space-y-4 px-4 py-6">
      <div className="flex items-center gap-3">
        <div className="grid h-10 w-10 place-items-center rounded-md border border-mint/40 bg-mint/10 text-mint">
          <Palette className="h-5 w-5" />
        </div>
        <div className="flex-1">
          <h1 className="text-lg font-semibold">Настройки сайта</h1>
          <p className="text-xs text-muted-foreground">Применяется сразу для всех посетителей — не для тебя одного.</p>
        </div>
        <button onClick={reset} className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-secondary">
          <RotateCcw className="h-3.5 w-3.5" /> Сбросить
        </button>
      </div>

      <div className="rounded-md border border-border bg-panel p-4">
        <p className="text-sm font-semibold">Акцентный цвет сайта</p>
        <p className="mt-0.5 text-xs text-muted-foreground">Заменяет мятный цвет (кнопки, ссылки, акценты) везде на сайте.</p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {ACCENT_COLORS.map((c) => (
            <button
              key={c.id}
              type="button"
              title={c.label}
              onClick={() => setAccentColor(c.hex)}
              className="grid h-8 w-8 place-items-center rounded-full border-2 transition"
              style={{ background: c.hex, borderColor: accentColor === c.hex ? c.hex : "transparent", boxShadow: accentColor === c.hex ? `0 0 0 2px var(--panel), 0 0 0 3px ${c.hex}` : undefined }}
            >
              {accentColor === c.hex && <Check className="h-4 w-4 text-black/70" />}
            </button>
          ))}
          <label className="ml-2 flex items-center gap-2 text-xs text-muted-foreground">
            Свой цвет
            <input
              type="color"
              value={accentColor ?? DEFAULT_ACCENT}
              onChange={(e) => setAccentColor(e.target.value)}
              className="h-8 w-10 cursor-pointer rounded border border-border bg-transparent p-0.5"
            />
          </label>
          {!accentColor && <span className="text-xs text-muted-foreground">(сейчас: по умолчанию)</span>}
        </div>
      </div>

      <div className="rounded-md border border-border bg-panel p-4">
        <p className="text-sm font-semibold">Порядок пунктов меню</p>
        <p className="mt-0.5 text-xs text-muted-foreground">Верхняя панель сайта, слева направо.</p>
        <div className="mt-3 space-y-1.5">
          {navOrder.map((to, i) => {
            const t = labelByPath.get(to);
            if (!t) return null;
            return (
              <div key={to} className="flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2">
                <GripVertical className="h-4 w-4 shrink-0 text-muted-foreground" />
                <t.icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="flex-1 text-sm">
                  {t.label}
                  {"disabled" in t && <span className="ml-1.5 text-[10px] text-muted-foreground">(скоро)</span>}
                </span>
                <button type="button" onClick={() => move(i, -1)} disabled={i === 0} className="grid h-6 w-6 place-items-center rounded text-muted-foreground hover:bg-secondary disabled:opacity-30">
                  <ArrowUp className="h-3.5 w-3.5" />
                </button>
                <button type="button" onClick={() => move(i, 1)} disabled={i === navOrder.length - 1} className="grid h-6 w-6 place-items-center rounded text-muted-foreground hover:bg-secondary disabled:opacity-30">
                  <ArrowDown className="h-3.5 w-3.5" />
                </button>
              </div>
            );
          })}
        </div>
      </div>

      <button
        onClick={save}
        disabled={saving}
        className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50"
      >
        {saving ? "Сохраняем…" : "Сохранить для всех посетителей"}
      </button>
    </div>
  );
}
