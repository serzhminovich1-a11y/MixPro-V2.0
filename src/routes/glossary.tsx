import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { BookMarked, Search, Sparkles, Play, ChevronRight, Trophy, X, Layers, ChevronLeft } from "lucide-react";
import { listGlossaryTerms, recordGlossaryQuiz, type GlossaryTerm, type TermMedia } from "@/lib/glossary.functions";
import { useAuth } from "@/hooks/use-auth";
import { AudioAB } from "@/components/audio-ab";
import { toast } from "sonner";
import { RouteError, RouteNotFound } from "@/components/route-fallbacks";


export const Route = createFileRoute("/glossary")({
  head: () => ({
    meta: [
      { title: "Библиотека терминов — синус, компрессия и всё остальное — MixPro" },
      { name: "description", content: "Аудио-словарь звукорежиссёра: синус, компрессия, EQ, реверб, LUFS. С квизом на слух и знание." },
      { property: "og:title", content: "Библиотека терминов — MixPro" },
      { property: "og:description", content: "Термины сведения и мастеринга + режим квиза с A/B-аудио." },
    ],
  }),
  component: GlossaryPage,
  errorComponent: RouteError,
  notFoundComponent: RouteNotFound,
});

const CAT_LABELS: Record<string, string> = {
  general: "Общее",
  synthesis: "Синтез",
  dynamics: "Динамика",
  frequency: "Частоты",
  space: "Пространство",
  loudness: "Громкость",
  harmonics: "Гармоники",
  routing: "Роутинг",
};

function GlossaryPage() {
  const load = useServerFn(listGlossaryTerms);
  const { session } = useAuth();
  const [terms, setTerms] = useState<GlossaryTerm[]>([]);
  const [mode, setMode] = useState<"library" | "cards" | "quiz">("library");
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<string>("all");
  const [selected, setSelected] = useState<GlossaryTerm | null>(null);

  useEffect(() => {
    if (!session) return;
    load().then((r) => setTerms(r.terms)).catch(() => {});
  }, [session, load]);

  const cats = useMemo(() => Array.from(new Set(terms.map((t) => t.category))), [terms]);
  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    return terms.filter((t) =>
      (cat === "all" || t.category === cat) &&
      (!qq || t.term.toLowerCase().includes(qq) || t.short_def.toLowerCase().includes(qq)),
    );
  }, [terms, q, cat]);

  if (!session) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-24 text-center">
        <BookMarked className="mx-auto h-10 w-10 text-mint" />
        <h1 className="mt-4 text-2xl font-bold">Библиотека терминов</h1>
        <p className="mt-2 text-sm text-muted-foreground">Войди, чтобы открыть словарь и квиз.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="grid h-9 w-9 place-items-center rounded-lg bg-cyan/10 text-cyan">
            <BookMarked className="h-4 w-4" />
          </div>
          <div>
            <h1 className="text-2xl font-bold md:text-3xl">Библиотека терминов</h1>
            <p className="text-xs uppercase tracking-wider text-muted-foreground">
              {terms.length} терминов · {cats.length} категорий
            </p>
          </div>
        </div>

        {/* Mode segment */}
        <div className="inline-flex rounded-lg border border-black/50 bg-black/40 p-1 text-xs font-semibold">
          <button
            onClick={() => setMode("library")}
            className={`rounded px-3 py-1.5 transition-colors ${mode === "library" ? "bg-cyan/20 text-cyan" : "text-muted-foreground hover:text-foreground"}`}
          >
            Библиотека
          </button>
          <button
            onClick={() => setMode("cards")}
            className={`rounded px-3 py-1.5 transition-colors ${mode === "cards" ? "bg-fuchsia-400/20 text-fuchsia-300" : "text-muted-foreground hover:text-foreground"}`}
          >
            <Layers className="mr-1 inline h-3 w-3" /> Карточки
          </button>
          <button
            onClick={() => setMode("quiz")}
            className={`rounded px-3 py-1.5 transition-colors ${mode === "quiz" ? "bg-mint/20 text-mint" : "text-muted-foreground hover:text-foreground"}`}
          >
            <Sparkles className="mr-1 inline h-3 w-3" /> Квиз
          </button>
        </div>
      </div>




      {mode === "library" ? (
        <>
          {/* Filters */}
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Поиск по термину или описанию…"
                className="w-full rounded-lg border border-black/50 bg-black/40 pl-9 pr-3 py-2 text-sm"
              />
            </div>
            <select value={cat} onChange={(e) => setCat(e.target.value)} className="rounded-lg border border-black/50 bg-black/40 px-3 py-2 text-sm">
              <option value="all">Все категории</option>
              {cats.map((c) => <option key={c} value={c}>{CAT_LABELS[c] ?? c}</option>)}
            </select>
          </div>

          {filtered.length === 0 ? (
            <div className="glass rounded-2xl p-10 text-center text-sm text-muted-foreground">Ничего не найдено.</div>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {filtered.map((t) => (
                <TermCard key={t.id} term={t} onOpen={() => setSelected(t)} />
              ))}
            </div>
          )}
        </>
      ) : mode === "cards" ? (
        <CardsMode terms={terms} cats={cats} />
      ) : (
        <QuizMode terms={terms} />
      )}

      {selected && <TermModal term={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}

function TermCard({ term, onOpen }: { term: GlossaryTerm; onOpen: () => void }) {
  const media = Array.isArray(term.media) ? term.media : [];
  const preview = media.find((m) => m.kind === "image" || m.kind === "gif") as
    | Extract<TermMedia, { kind: "image" | "gif" }>
    | undefined;
  const videoPreview = !preview
    ? (media.find((m) => m.kind === "video") as Extract<TermMedia, { kind: "video" }> | undefined)
    : undefined;
  return (
    <button
      onClick={onOpen}
      className="group relative flex flex-col overflow-hidden rounded-xl border border-black/50 bg-black/30 text-left transition-all hover:border-cyan/40 hover:bg-black/40"
    >
      {preview ? (
        <div className="relative aspect-video w-full overflow-hidden bg-black/60">
          <img
            src={preview.url}
            alt={preview.caption ?? term.term}
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        </div>
      ) : videoPreview ? (
        <div className="relative aspect-video w-full overflow-hidden bg-black/60">
          <video src={videoPreview.url} muted playsInline preload="metadata" className="h-full w-full object-cover" />
          <div className="absolute inset-0 grid place-items-center bg-black/30">
            <Play className="h-8 w-8 text-white/80" />
          </div>
        </div>
      ) : null}
      <div className="flex-1 p-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
              {CAT_LABELS[term.category] ?? term.category}
            </div>
            <div className="mt-1 text-base font-bold group-hover:text-cyan">{term.term}</div>
          </div>
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-cyan" />
        </div>
        <p className="mt-2 text-sm text-foreground/80 line-clamp-3">{term.short_def}</p>
        {media.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1">
            {media.slice(0, 4).map((m, i) => (
              <span key={i} className="rounded bg-black/40 px-1.5 py-0.5 text-[9px] font-mono uppercase text-muted-foreground">
                {m.kind}
              </span>
            ))}
          </div>
        )}
      </div>
    </button>
  );
}


function TermModal({ term, onClose }: { term: GlossaryTerm; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/80 p-4" onClick={onClose}>
      <div className="glass max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-2xl p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
              {CAT_LABELS[term.category] ?? term.category} · {term.difficulty}
            </div>
            <h2 className="mt-1 text-2xl font-bold">{term.term}</h2>
          </div>
          <button onClick={onClose} className="rounded-lg p-1 hover:bg-black/40"><X className="h-4 w-4" /></button>
        </div>
        <p className="mt-3 text-sm text-foreground/90">{term.short_def}</p>
        {term.long_def_md && (
          <div className="prose-custom mt-4 text-sm" dangerouslySetInnerHTML={{ __html: term.long_def_md }} />
        )}
        {Array.isArray(term.media) && term.media.length > 0 && (
          <div className="mt-5 space-y-3">
            {term.media.map((m, i) => <MediaRender key={i} m={m} />)}
          </div>
        )}
      </div>
    </div>
  );
}

function MediaRender({ m }: { m: TermMedia }) {
  if (m.kind === "image" || m.kind === "gif") {
    return (
      <figure>
        <img src={m.url} alt={m.caption ?? ""} className="w-full rounded-lg border border-black/40" />
        {m.caption && <figcaption className="mt-1 text-xs text-muted-foreground">{m.caption}</figcaption>}
      </figure>
    );
  }
  if (m.kind === "video") {
    return (
      <figure>
        <video src={m.url} controls className="w-full rounded-lg border border-black/40" />
        {m.caption && <figcaption className="mt-1 text-xs text-muted-foreground">{m.caption}</figcaption>}
      </figure>
    );
  }
  if (m.kind === "audio_ab") {
    return <AudioAB urlA={m.url_a} urlB={m.url_b} labelA={m.label_a} labelB={m.label_b} caption={m.caption} />;
  }
  return null;
}

/* ─────────── Quiz Mode ─────────── */

type QuizQuestion =
  | { kind: "definition"; term: GlossaryTerm; options: GlossaryTerm[]; correctIndex: number }
  | { kind: "term-from-desc"; term: GlossaryTerm; options: string[]; correctIndex: number }
  | { kind: "audio-ab"; term: GlossaryTerm; media: Extract<TermMedia, { kind: "audio_ab" }>; correct: "a" | "b" };

function pickQuestion(terms: GlossaryTerm[]): QuizQuestion | null {
  if (terms.length < 4) return null;
  const attempts = 8;
  for (let i = 0; i < attempts; i++) {
    const t = terms[Math.floor(Math.random() * terms.length)];
    const pool = terms.filter((x) => x.id !== t.id && x.category === t.category);
    const others = (pool.length >= 3 ? pool : terms.filter((x) => x.id !== t.id))
      .sort(() => Math.random() - 0.5)
      .slice(0, 3);
    if (others.length < 3) continue;
    const roll = Math.random();
    // audio-ab if available
    const ab = (t.media ?? []).find((m) => m.kind === "audio_ab") as Extract<TermMedia, { kind: "audio_ab" }> | undefined;
    if (ab && roll < 0.4) {
      return { kind: "audio-ab", term: t, media: ab, correct: Math.random() < 0.5 ? "a" : "b" };
    }
    if (roll < 0.7) {
      const opts = [t, ...others].sort(() => Math.random() - 0.5);
      return { kind: "definition", term: t, options: opts, correctIndex: opts.findIndex((x) => x.id === t.id) };
    }
    const opts = [t.term, ...others.map((o) => o.term)].sort(() => Math.random() - 0.5);
    return { kind: "term-from-desc", term: t, options: opts, correctIndex: opts.indexOf(t.term) };
  }
  return null;
}

function QuizMode({ terms }: { terms: GlossaryTerm[] }) {
  const record = useServerFn(recordGlossaryQuiz);
  const [q, setQ] = useState<QuizQuestion | null>(null);
  const [answered, setAnswered] = useState<number | "a" | "b" | null>(null);
  const [streak, setStreak] = useState(0);
  const [correctTotal, setCorrectTotal] = useState(0);
  const [wrongTotal, setWrongTotal] = useState(0);

  useEffect(() => {
    if (terms.length >= 4) setQ(pickQuestion(terms));
  }, [terms]);

  function next() {
    setAnswered(null);
    setQ(pickQuestion(terms));
  }

  async function submit(pick: number | "a" | "b", correct: boolean) {
    if (!q) return;
    setAnswered(pick);
    if (correct) {
      setStreak((s) => s + 1);
      setCorrectTotal((n) => n + 1);
      toast.success("Правильно! +5 XP");
    } else {
      setStreak(0);
      setWrongTotal((n) => n + 1);
    }
    try { await record({ data: { term_id: q.term.id, correct } }); } catch { /* noop */ }
  }

  if (terms.length < 4) {
    return <div className="glass rounded-2xl p-10 text-center text-sm text-muted-foreground">Нужно минимум 4 термина для квиза.</div>;
  }
  if (!q) return <div className="glass rounded-2xl p-10 text-center text-sm text-muted-foreground">Готовим вопрос…</div>;

  const qMedia = Array.isArray(q.term.media) ? q.term.media : [];
  const qPreview = qMedia.find((m) => m.kind === "image" || m.kind === "gif") as
    | Extract<TermMedia, { kind: "image" | "gif" }>
    | undefined;
  const qVideo = !qPreview
    ? (qMedia.find((m) => m.kind === "video") as Extract<TermMedia, { kind: "video" }> | undefined)
    : undefined;
  // Hide image for "term-from-desc" until answered — otherwise it can spoil the answer
  const showMediaNow = q.kind !== "term-from-desc" || answered !== null;
  const mediaBlock = (qPreview || qVideo) && showMediaNow ? (
    <div className="mt-4 overflow-hidden rounded-xl border border-black/50 bg-black/40">
      <div className="relative aspect-video w-full">
        {qPreview ? (
          <img src={qPreview.url} alt={q.term.term} className="absolute inset-0 h-full w-full object-cover" />
        ) : qVideo ? (
          <video src={qVideo.url} className="absolute inset-0 h-full w-full object-cover" muted playsInline preload="metadata" />
        ) : null}
      </div>
    </div>
  ) : null;

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-4 flex items-center justify-between text-xs uppercase tracking-wider text-muted-foreground">
        <span className="inline-flex items-center gap-2">
          <Trophy className="h-3.5 w-3.5 text-mint" /> Стрик: <span className="font-mono text-mint">{streak}</span>
        </span>
        <span>Верно: <span className="font-mono text-mint">{correctTotal}</span> · Мимо: <span className="font-mono text-destructive">{wrongTotal}</span></span>
      </div>

      <div className="glass rounded-2xl p-6">
        {q.kind === "definition" && (
          <>
            <div className="text-[10px] font-mono uppercase tracking-wider text-cyan">Что такое:</div>
            <h2 className="mt-1 text-2xl font-bold">{q.term.term}</h2>
            {mediaBlock}
            <div className="mt-4 space-y-2">
              {q.options.map((opt, i) => {
                const correct = i === q.correctIndex;
                const picked = answered === i;
                const cls = answered !== null
                  ? correct ? "border-mint/60 bg-mint/10 text-mint"
                    : picked ? "border-destructive/60 bg-destructive/10 text-destructive"
                    : "border-black/50 bg-black/30 opacity-60"
                  : "border-black/50 bg-black/30 hover:border-cyan/40";
                return (
                  <button
                    key={opt.id}
                    disabled={answered !== null}
                    onClick={() => submit(i, correct)}
                    className={`block w-full rounded-lg border px-4 py-3 text-left text-sm transition-colors ${cls}`}
                  >
                    {opt.short_def}
                  </button>
                );
              })}
            </div>
          </>
        )}

        {q.kind === "term-from-desc" && (
          <>
            <div className="text-[10px] font-mono uppercase tracking-wider text-cyan">Найди термин по описанию:</div>
            <p className="mt-2 text-lg font-semibold">{q.term.short_def}</p>
            {mediaBlock}
            <div className="mt-4 grid grid-cols-2 gap-2">
              {q.options.map((opt, i) => {
                const correct = i === q.correctIndex;
                const picked = answered === i;
                const cls = answered !== null
                  ? correct ? "border-mint/60 bg-mint/10 text-mint"
                    : picked ? "border-destructive/60 bg-destructive/10 text-destructive"
                    : "border-black/50 bg-black/30 opacity-60"
                  : "border-black/50 bg-black/30 hover:border-cyan/40";
                return (
                  <button
                    key={opt + i}
                    disabled={answered !== null}
                    onClick={() => submit(i, correct)}
                    className={`rounded-lg border px-4 py-3 text-sm font-semibold transition-colors ${cls}`}
                  >
                    {opt}
                  </button>
                );
              })}
            </div>
          </>
        )}

        {q.kind === "audio-ab" && (
          <>
            <div className="text-[10px] font-mono uppercase tracking-wider text-cyan">Услышь разницу:</div>
            <h2 className="mt-1 text-xl font-bold">Где {q.term.term.toLowerCase()}?</h2>
            <p className="mt-1 text-xs text-muted-foreground">Прослушай оба фрагмента и выбери правильный.</p>
            {mediaBlock}
            <div className="mt-4">
              <AudioAB urlA={q.media.url_a} urlB={q.media.url_b} blind />
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2">
              {(["a", "b"] as const).map((k) => {
                const correct = k === q.correct;
                const picked = answered === k;
                const cls = answered !== null
                  ? correct ? "border-mint/60 bg-mint/10 text-mint"
                    : picked ? "border-destructive/60 bg-destructive/10 text-destructive"
                    : "border-black/50 bg-black/30 opacity-60"
                  : "border-black/50 bg-black/30 hover:border-cyan/40";
                return (
                  <button
                    key={k}
                    disabled={answered !== null}
                    onClick={() => submit(k, correct)}
                    className={`rounded-lg border px-4 py-3 text-sm font-semibold uppercase tracking-wider transition-colors ${cls}`}
                  >
                    <Play className="mr-2 inline h-3 w-3" /> Фрагмент {k === "a" ? "1" : "2"}
                  </button>
                );
              })}
            </div>
          </>
        )}

        {answered !== null && (
          <button onClick={next} className="mt-5 w-full rounded-xl bg-mint py-2.5 text-sm font-bold text-black hover:bg-mint/90">
            Следующий вопрос →
          </button>
        )}
      </div>
    </div>
  );
}

/* ─────────── Cards Mode (swipeable) ─────────── */

function CardsMode({ terms, cats }: { terms: GlossaryTerm[]; cats: string[] }) {
  const [cat, setCat] = useState<string>("all");
  const [seed, setSeed] = useState(0);
  const [idx, setIdx] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [drag, setDrag] = useState<{ x: number; y: number; dragging: boolean }>({ x: 0, y: 0, dragging: false });
  const startRef = { current: { x: 0, y: 0 } } as { current: { x: 0; y: 0 } };

  const deck = useMemo(() => {
    const pool = cat === "all" ? terms : terms.filter((t) => t.category === cat);
    // shuffle deterministically by seed
    const arr = [...pool];
    let s = seed || 1;
    for (let i = arr.length - 1; i > 0; i--) {
      s = (s * 9301 + 49297) % 233280;
      const j = Math.floor((s / 233280) * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }, [terms, cat, seed]);

  useEffect(() => { setIdx(0); setFlipped(false); }, [cat, seed]);

  function advance(dir: 1 | -1) {
    setFlipped(false);
    setIdx((i) => Math.max(0, Math.min(deck.length - 1, i + dir)));
  }

  function onPointerDown(e: React.PointerEvent) {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    startRef.current = { x: e.clientX, y: e.clientY } as any;
    setDrag({ x: 0, y: 0, dragging: true });
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!drag.dragging) return;
    setDrag({ x: e.clientX - (startRef.current as any).x, y: e.clientY - (startRef.current as any).y, dragging: true });
  }
  function onPointerUp() {
    const dx = drag.x;
    setDrag({ x: 0, y: 0, dragging: false });
    if (Math.abs(dx) > 90) {
      if (dx < 0 && idx < deck.length - 1) advance(1);
      else if (dx > 0 && idx > 0) advance(-1);
    }
  }

  // keyboard nav
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "ArrowLeft") advance(-1);
      if (e.key === "ArrowRight") advance(1);
      if (e.key === " " || e.key === "Enter") { e.preventDefault(); setFlipped((f) => !f); }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx, deck.length]);

  if (deck.length === 0) {
    return <div className="glass rounded-2xl p-10 text-center text-sm text-muted-foreground">В этой категории пусто.</div>;
  }

  const cur = deck[idx];
  const nxt = deck[idx + 1];
  const rot = drag.x / 20;
  const opacityHint = Math.min(1, Math.abs(drag.x) / 120);

  return (
    <div className="mx-auto max-w-xl">
      {/* Controls */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <select value={cat} onChange={(e) => setCat(e.target.value)} className="rounded-lg border border-black/50 bg-black/40 px-3 py-2 text-xs">
          <option value="all">Все категории</option>
          {cats.map((c) => <option key={c} value={c}>{CAT_LABELS[c] ?? c}</option>)}
        </select>
        <div className="text-xs text-muted-foreground">
          <span className="font-mono text-fuchsia-300">{idx + 1}</span> / {deck.length}
        </div>
        <button onClick={() => setSeed(Date.now())} className="rounded-lg border border-black/50 bg-black/40 px-3 py-2 text-xs hover:border-fuchsia-400/40">
          Перемешать
        </button>
      </div>

      {/* Card stack */}
      <div className="relative h-[420px] select-none">
        {nxt && (
          <div className="absolute inset-0 scale-95 opacity-60">
            <CardFace term={nxt} flipped={false} />
          </div>
        )}
        <div
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onClick={() => { if (Math.abs(drag.x) < 6) setFlipped((f) => !f); }}
          className="absolute inset-0 cursor-grab touch-none active:cursor-grabbing"
          style={{
            transform: `translate(${drag.x}px, ${drag.y * 0.15}px) rotate(${rot}deg)`,
            transition: drag.dragging ? "none" : "transform 220ms cubic-bezier(.2,.9,.3,1)",
          }}
        >
          <CardFace term={cur} flipped={flipped} />
          {/* swipe hints */}
          <div
            className="pointer-events-none absolute left-4 top-4 rounded-md border border-mint/60 bg-mint/10 px-2 py-1 text-[10px] font-bold uppercase tracking-widest text-mint"
            style={{ opacity: drag.x > 20 ? opacityHint : 0 }}
          >
            ← Назад
          </div>
          <div
            className="pointer-events-none absolute right-4 top-4 rounded-md border border-fuchsia-400/60 bg-fuchsia-400/10 px-2 py-1 text-[10px] font-bold uppercase tracking-widest text-fuchsia-300"
            style={{ opacity: drag.x < -20 ? opacityHint : 0 }}
          >
            Дальше →
          </div>
        </div>
      </div>

      {/* Nav buttons */}
      <div className="mt-4 flex items-center justify-between gap-2">
        <button
          onClick={() => advance(-1)}
          disabled={idx === 0}
          className="inline-flex items-center gap-1 rounded-lg border border-black/50 bg-black/40 px-4 py-2 text-xs font-semibold disabled:opacity-40 hover:border-mint/40"
        >
          <ChevronLeft className="h-4 w-4" /> Назад
        </button>
        <button
          onClick={() => setFlipped((f) => !f)}
          className="rounded-lg border border-fuchsia-400/40 bg-fuchsia-400/10 px-4 py-2 text-xs font-semibold text-fuchsia-300 hover:bg-fuchsia-400/20"
        >
          {flipped ? "Скрыть" : "Показать ответ"}
        </button>
        <button
          onClick={() => advance(1)}
          disabled={idx >= deck.length - 1}
          className="inline-flex items-center gap-1 rounded-lg border border-black/50 bg-black/40 px-4 py-2 text-xs font-semibold disabled:opacity-40 hover:border-fuchsia-400/40"
        >
          Дальше <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      <p className="mt-3 text-center text-[11px] text-muted-foreground">
        Свайп ← → · тап по карточке чтобы перевернуть · ← / → и Space на клавиатуре
      </p>
    </div>
  );
}

function CardFace({ term, flipped }: { term: GlossaryTerm; flipped: boolean }) {
  return (
    <div className="glass relative h-full w-full overflow-hidden rounded-2xl border border-black/50 p-6">
      <div className="flex items-center justify-between">
        <span className="rounded-md bg-black/40 px-2 py-1 text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
          {CAT_LABELS[term.category] ?? term.category}
        </span>
        <span className="rounded-md bg-black/40 px-2 py-1 text-[10px] font-mono uppercase tracking-wider text-fuchsia-300">
          {term.difficulty}
        </span>
      </div>

      {!flipped ? (
        <div className="flex h-[calc(100%-2.5rem)] flex-col items-center justify-center text-center">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Термин</div>
          <h2 className="mt-2 text-4xl font-black leading-tight md:text-5xl">{term.term}</h2>
          <p className="mt-6 text-xs text-muted-foreground">Тапни, чтобы увидеть определение</p>
        </div>
      ) : (
        <div className="h-[calc(100%-2.5rem)] overflow-y-auto pt-4">
          <p className="text-base leading-relaxed text-foreground/90">{term.short_def}</p>
          {term.long_def_md && (
            <div className="prose-custom mt-3 text-sm" dangerouslySetInnerHTML={{ __html: term.long_def_md }} />
          )}
          {Array.isArray(term.media) && term.media.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-1">
              {term.media.map((m, i) => (
                <span key={i} className="rounded bg-black/40 px-1.5 py-0.5 text-[9px] font-mono uppercase text-muted-foreground">
                  {m.kind}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
