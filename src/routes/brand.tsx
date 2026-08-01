import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { MixproLogo, type LogoVariant } from "@/components/mixpro-logo";

const VARIANTS: { id: LogoVariant; name: string; note: string }[] = [
  { id: "inline", name: "Inline", note: "MIX + мятный PRO. Самый компактный и читаемый в навигации." },
  { id: "dot", name: "Pulse Dot", note: "Мятная точка-индикатор рядом с вордмарком. Минимально и живо." },
  { id: "badge", name: "MX Badge", note: "Квадратный бейдж MX + вордмарк. Работает как favicon." },
  { id: "bracket", name: "Bracket", note: "[ MIXPRO ] — техничный, DAW-стиль." },
  { id: "slash", name: "Slash Tag", note: "MIXPRO / audio — как заголовок модуля в интерфейсе." },
  { id: "chip", name: "Chip", note: "Пилюля с мятной рейкой. Отдельный акцент в шапке." },
  { id: "underline", name: "Underline", note: "Вордмарк с мятной подчёркиванием точно по ширине." },
  { id: "mono", name: "Console", note: ">_ mixpro — терминальный, для гиковской подачи." },
  { id: "waveform", name: "Waveform", note: "Мини-волна из полосок + вордмарк. Аудио-идентичность." },
  { id: "outline", name: "Outline", note: "Тонкий контурный вордмарк. Легко и по-архитектурному." },
];

const LOGO_KEY = "mixpro:logo-variant";

export const Route = createFileRoute("/brand")({
  head: () => ({
    meta: [
      { title: "MIXPRO — Brand / Logo" },
      { name: "description", content: "Варианты логотипа MIXPRO в стиле Neumann." },
    ],
  }),
  component: BrandPage,
});

function BrandPage() {
  const [current, setCurrent] = useState<LogoVariant>(() => {
    if (typeof window === "undefined") return "inline";
    return (window.localStorage.getItem(LOGO_KEY) as LogoVariant) ?? "inline";
  });
  useEffect(() => {
    const sync = () => {
      const v = (localStorage.getItem(LOGO_KEY) as LogoVariant) ?? "inline";
      setCurrent(v);
    };
    sync();
    window.addEventListener("mixpro:logo-variant", sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("mixpro:logo-variant", sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const apply = (v: LogoVariant) => {
    try {
      localStorage.setItem(LOGO_KEY, v);
    } catch (e) {
      console.error("[brand] failed to save logo variant", e);
    }
    setCurrent(v);
    window.dispatchEvent(new Event("mixpro:logo-variant"));
  };

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <div className="mb-8">
        <div className="text-[11px] uppercase tracking-[0.4em] text-foreground/50">Brand / logo</div>
        <h1 className="mt-2 text-3xl font-bold text-foreground">Логотип MIXPRO — варианты</h1>
        <p className="mt-2 max-w-2xl text-sm text-foreground/60">
          Все варианты в стиле Neumann: жирный гротеск, тонкая линия, разряжённый подзаголовок ENGINEERING.
          Кликни «Использовать», чтобы применить логотип во всём интерфейсе.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {VARIANTS.map((v) => {
          const active = current === v.id;
          return (
            <div
              key={v.id}
              className={`flex flex-col border ${active ? "border-mint" : "border-black/60"} bg-[var(--panel)]`}
            >
              <div className="flex items-center justify-between border-b border-black/60 bg-[var(--panel-deep)] px-3 py-2 text-[11px] uppercase tracking-[0.32em] text-foreground/60">
                <span>{v.name}</span>
                {active && <span className="text-mint">● активен</span>}
              </div>
              <div className="grid min-h-[180px] place-items-center bg-black/40 px-6 py-10">
                <MixproLogo variant={v.id} size="lg" />
              </div>
              <div className="flex items-center justify-between gap-4 border-t border-black/60 px-3 py-2.5">
                <p className="text-xs text-foreground/60">{v.note}</p>
                <button
                  onClick={() => apply(v.id)}
                  disabled={active}
                  className="shrink-0 border border-mint/60 bg-mint/15 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.24em] text-mint hover:bg-mint/25 disabled:opacity-40"
                >
                  {active ? "Используется" : "Использовать"}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
