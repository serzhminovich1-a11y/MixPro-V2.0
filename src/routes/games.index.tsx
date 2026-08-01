import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowRight, AudioWaveform, Clock3, Compass, Filter, FlameKindling, Gamepad2,
  Gauge, Radio, Scissors, Sliders, Speaker, Timer, Volume2, Waves,
} from "lucide-react";
import type { ComponentType } from "react";
import { GamePreview, type GamePreviewKind } from "@/components/games/game-preview";


export const Route = createFileRoute("/games/")({
  head: () => ({
    meta: [
      { title: "Игры для тренировки слуха — MixPro" },
      { name: "description", content: "12 тренажёров ear training для звукорежиссёров: частоты, компрессия, реверб, пан, дисторшн, дилей. Зарабатывай XP и расти в рейтинге." },
      { property: "og:title", content: "12 игр для тренировки слуха — MixPro" },
      { property: "og:description", content: "Ear training для звукорежиссёров: 12 тренажёров с XP и рейтингом." },
    ],
  }),
  component: GamesPage,
});

type Game = {
  to: string;
  icon: ComponentType<{ className?: string }>;
  title: string;
  tag: string;
  desc: string;
  xp: string;
  section: "eq" | "level" | "dyn" | "fx";
  preview: GamePreviewKind;
};


const GAMES: Game[] = [
  { to: "/games/frequency",      icon: AudioWaveform, title: "EQ Peak",           tag: "Freq boost",  desc: "Одна полоса поднята Bell-кривой. Угадай частоту.",           xp: "+10 XP", section: "eq",    preview: "frequency" },
  { to: "/games/eq-cut",         icon: Scissors,      title: "EQ Cut",            tag: "Freq cut",    desc: "Одна полоса вырезана на −12 дБ. Найди её.",                  xp: "+10 XP", section: "eq",    preview: "eq-cut" },
  { to: "/games/ear-eq",         icon: Waves,         title: "Найди изменение",   tag: "Pitch shift", desc: "Два тона — второй выше или ниже? Классический pitch drill.", xp: "+8 XP",  section: "eq",    preview: "ear-eq" },
  { to: "/games/filter-type",    icon: Filter,        title: "Filter Type",       tag: "Filter",      desc: "LP · HP · BP · Notch — определи фильтр на слух.",            xp: "+10 XP", section: "eq",    preview: "filter-type" },

  { to: "/games/db-quiz",        icon: Volume2,       title: "dB Quiz",           tag: "Level 4-ch",  desc: "Выбери из 4 вариантов, на сколько дБ изменена громкость.",   xp: "+8 XP",  section: "level", preview: "db-quiz" },
  { to: "/games/db-pro",         icon: Sliders,       title: "dB Pro",            tag: "Level exact", desc: "Точный ввод — на сколько дБ поднят/опущен уровень.",         xp: "+12 XP", section: "level", preview: "db-pro" },
  { to: "/games/pan",            icon: Compass,       title: "Pan",               tag: "Stereo",      desc: "Определи точное положение сигнала в стереополе.",            xp: "+10 XP", section: "level", preview: "pan" },

  { to: "/games/compressor-ratio",   icon: Gauge,        title: "Comp Ratio",   tag: "3-choice", desc: "Три компрессии — где сжатие самое агрессивное?",         xp: "+10 XP", section: "dyn", preview: "compressor-ratio" },
  { to: "/games/compressor-attack",  icon: Timer,        title: "Comp Attack",  tag: "3-choice", desc: "Три компрессии — где attack самый быстрый?",             xp: "+10 XP", section: "dyn", preview: "compressor-attack" },
  { to: "/games/compressor-release", icon: Clock3,       title: "Comp Release", tag: "3-choice", desc: "Три компрессии — где release самый медленный?",          xp: "+10 XP", section: "dyn", preview: "compressor-release" },
  { to: "/games/compression",        icon: FlameKindling, title: "Comp Sculpt", tag: "Sandbox",  desc: "Матчи форму волны — покрути ratio и attack сам.",       xp: "+10 XP", section: "dyn", preview: "compression" },

  { to: "/games/distortion",     icon: Radio,          title: "Distortion",   tag: "FX amount", desc: "Сколько процентов сатурации? Слайдер 0-100.",                  xp: "+10 XP", section: "fx", preview: "distortion" },
  { to: "/games/delay-time",     icon: Speaker,        title: "Delay Time",   tag: "FX time",   desc: "Определи точное время задержки в мс.",                          xp: "+10 XP", section: "fx", preview: "delay-time" },
  { to: "/games/reverb",         icon: Waves,          title: "Reverb",       tag: "FX space",  desc: "Room · Chamber · Hall · Plate — узнай тип по хвосту.",         xp: "+10 XP", section: "fx", preview: "reverb" },
];


const SECTIONS = [
  { id: "eq" as const,    label: "EQ · Частоты",        hint: "Слух на частоты и фильтры" },
  { id: "level" as const, label: "Level · Уровень и пан", hint: "Децибелы и стерео-панорама" },
  { id: "dyn" as const,   label: "Dynamics · Компрессия", hint: "Ratio, attack, release" },
  { id: "fx" as const,    label: "FX · Эффекты",         hint: "Дисторшн, дилей, реверб" },
];

function GamesPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-14">
      <div className="flex items-center gap-3">
        <div className="grid h-9 w-9 place-items-center rounded-lg bg-mint/10 text-mint">
          <Gamepad2 className="h-4 w-4" />
        </div>
        <span className="label-mono text-mint">EAR TRAINING · {GAMES.length} GAMES</span>
      </div>
      <h1 className="mt-4 text-3xl font-bold tracking-tight md:text-4xl">Тренажёры слуха</h1>
      <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
        Профессиональный слух — навык. Проходи короткие сессии каждый день, накапливай XP и поднимайся в рейтинге звукорежиссёров.
      </p>

      {SECTIONS.map((sec) => (
        <section key={sec.id} className="mt-12">
          <div className="flex items-baseline justify-between border-b border-border pb-3">
            <div>
              <h2 className="text-xl font-bold">{sec.label}</h2>
              <p className="mt-1 text-xs text-muted-foreground">{sec.hint}</p>
            </div>
            <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              {GAMES.filter(g => g.section === sec.id).length} игр
            </span>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {GAMES.filter(g => g.section === sec.id).map((g) => (
              <Link
                key={g.to} to={g.to}
                className="panel group flex flex-col gap-3 rounded-2xl p-5 transition-all hover:-translate-y-0.5 hover:border-mint/40"
              >
                <GamePreview kind={g.preview} />
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="grid h-8 w-8 place-items-center rounded-lg bg-mint/10 text-mint">
                      <g.icon className="h-4 w-4" />
                    </div>
                    <span className="label-mono">{g.tag}</span>
                  </div>
                  <ArrowRight className="h-4 w-4 text-mint opacity-0 transition-all group-hover:opacity-100 group-hover:translate-x-0.5" />
                </div>

                <div>
                  <h3 className="text-base font-bold">{g.title}</h3>
                  <p className="mt-1 text-xs text-muted-foreground">{g.desc}</p>
                </div>
                <div className="inline-flex w-fit rounded bg-mint/10 px-2 py-1 font-mono text-[10px] font-bold uppercase tracking-widest text-mint">
                  {g.xp}
                </div>
              </Link>
            ))}
          </div>
        </section>
      ))}

      <p className="mt-14 font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
        // Войди в аккаунт, чтобы результаты Ranked-режима шли в рейтинг.
      </p>
    </div>
  );
}
