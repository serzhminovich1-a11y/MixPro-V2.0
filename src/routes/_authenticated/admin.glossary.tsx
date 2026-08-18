import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Plus, Trash2, Save, BookMarked, Image as ImageIcon, Film, Music, X, Pencil, Search, Upload } from "lucide-react";
import { listGlossaryTerms, upsertGlossaryTerm, deleteGlossaryTerm, type GlossaryTerm, type TermMedia } from "@/lib/glossary.functions";
import { uploadLessonAsset } from "@/lib/course-editor.functions";
import { AdminTabs } from "@/components/admin-tabs";
import { RoleGate } from "@/components/role-gate";

export const Route = createFileRoute("/_authenticated/admin/glossary")({
  head: () => ({ meta: [{ title: "Библиотека терминов — админ — MixPro" }, { name: "robots", content: "noindex" }] }),
  component: () => (
    <RoleGate role="admin">
      <AdminGlossaryPage />
    </RoleGate>
  ),
});

const EMPTY: Partial<GlossaryTerm> = { slug: "", term: "", category: "general", short_def: "", long_def_md: "", media: [], difficulty: "basic", tags: [] };

function AdminGlossaryPage() {
  const list = useServerFn(listGlossaryTerms);
  const save = useServerFn(upsertGlossaryTerm);
  const drop = useServerFn(deleteGlossaryTerm);
  const [terms, setTerms] = useState<GlossaryTerm[]>([]);
  const [editing, setEditing] = useState<Partial<GlossaryTerm> | null>(null);
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState("");

  async function refresh() {
    const r = await list();
    setTerms(r.terms);
  }
  useEffect(() => { refresh(); }, []); // eslint-disable-line

  async function submit() {
    if (!editing) return;
    setBusy(true);
    try {
      await save({
        data: {
          id: editing.id,
          slug: editing.slug!,
          term: editing.term!,
          category: editing.category ?? "general",
          short_def: editing.short_def!,
          long_def_md: editing.long_def_md ?? null,
          media: (editing.media ?? []) as any,
          difficulty: (editing.difficulty as any) ?? "basic",
          tags: editing.tags ?? [],
        },
      });
      toast.success("Сохранено");
      setEditing(null);
      refresh();
    } catch (e: any) {
      toast.error(e.message ?? "Не удалось сохранить");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    if (!confirm("Удалить термин?")) return;
    await drop({ data: { id } });
    toast.success("Удалено");
    refresh();
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <AdminTabs active="glossary" />
      <div className="mb-4 mt-4 flex items-center justify-between">

        <div className="flex items-center gap-2">
          <BookMarked className="h-5 w-5 text-cyan" />
          <h1 className="text-2xl font-bold">Библиотека терминов</h1>
          <span className="text-xs text-muted-foreground">· {terms.length}</span>
        </div>
        <div className="flex gap-2 text-xs">
          <button

            onClick={() => setEditing({ ...EMPTY })}
            className="inline-flex items-center gap-1 rounded-lg bg-mint px-3 py-2 font-semibold text-black hover:bg-mint/90"
          >
            <Plus className="h-3.5 w-3.5" /> Новый термин
          </button>
        </div>
      </div>

      <div className="mb-3 relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Поиск по термину, категории, тегу…"
          className="w-full rounded-lg border border-black/60 bg-black/30 pl-9 pr-3 py-2 text-sm"
        />
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
        {terms
          .filter((t) => {
            if (!query.trim()) return true;
            const q = query.toLowerCase();
            return (
              t.term.toLowerCase().includes(q) ||
              t.slug.toLowerCase().includes(q) ||
              t.category.toLowerCase().includes(q) ||
              (t.tags ?? []).some((tag) => tag.toLowerCase().includes(q))
            );
          })
          .map((t) => (
          <div
            key={t.id}
            onClick={() => setEditing(t)}
            className="group cursor-pointer rounded-xl border border-black/50 bg-black/30 p-3 transition hover:border-mint/60 hover:bg-black/40"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">{t.category} · {t.difficulty}</div>
                <div className="text-sm font-bold truncate">{t.term}</div>
                <div className="text-[10px] font-mono text-muted-foreground truncate">/{t.slug}</div>
              </div>
              <div className="flex flex-col gap-1 opacity-70 group-hover:opacity-100">
                <button
                  onClick={(e) => { e.stopPropagation(); setEditing(t); }}
                  title="Редактировать"
                  className="inline-flex items-center gap-1 rounded bg-mint/20 px-2 py-1 text-[10px] font-semibold text-mint hover:bg-mint/30"
                >
                  <Pencil className="h-3 w-3" /> Правка
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); remove(t.id); }}
                  title="Удалить"
                  className="inline-flex items-center gap-1 rounded bg-destructive/20 px-2 py-1 text-[10px] font-semibold text-destructive hover:bg-destructive/30"
                >
                  <Trash2 className="h-3 w-3" /> Удалить
                </button>
              </div>
            </div>
            <p className="mt-2 text-xs text-foreground/80 line-clamp-3">{t.short_def}</p>
            {(t.media ?? []).length > 0 && (
              <div className="mt-2 flex gap-1">
                {(t.media ?? []).map((m, i) => (
                  <span key={i} className="rounded bg-black/40 px-1.5 py-0.5 text-[9px] font-mono uppercase text-muted-foreground">{m.kind}</span>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {terms.length === 0 && (
        <div className="mt-8 rounded-xl border border-dashed border-black/60 bg-black/20 p-8 text-center text-sm text-muted-foreground">
          Пока нет терминов. Нажмите «Новый термин», чтобы добавить первый.
        </div>
      )}

      {editing && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/80 p-4" onClick={() => setEditing(null)}>
          <div className="glass max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold">{editing.id ? "Редактирование" : "Новый термин"}</h2>
              <button onClick={() => setEditing(null)} className="rounded p-1 hover:bg-black/40"><X className="h-4 w-4" /></button>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3">
              <Field label="Термин"><input value={editing.term ?? ""} onChange={(e) => setEditing({ ...editing, term: e.target.value })} className="w-full rounded bg-black/40 px-3 py-2 text-sm" /></Field>
              <Field label="Slug (URL)"><input value={editing.slug ?? ""} onChange={(e) => setEditing({ ...editing, slug: e.target.value.toLowerCase() })} placeholder="compression" className="w-full rounded bg-black/40 px-3 py-2 text-sm font-mono" /></Field>
              <Field label="Категория">
                <input value={editing.category ?? ""} onChange={(e) => setEditing({ ...editing, category: e.target.value })} placeholder="dynamics / frequency / space…" className="w-full rounded bg-black/40 px-3 py-2 text-sm" />
              </Field>
              <Field label="Сложность">
                <select value={editing.difficulty ?? "basic"} onChange={(e) => setEditing({ ...editing, difficulty: e.target.value })} className="w-full rounded bg-black/40 px-3 py-2 text-sm">
                  <option value="basic">Базовая</option>
                  <option value="intermediate">Средняя</option>
                  <option value="advanced">Продвинутая</option>
                </select>
              </Field>
            </div>

            <Field label="Короткое определение (одно предложение)">
              <textarea value={editing.short_def ?? ""} onChange={(e) => setEditing({ ...editing, short_def: e.target.value })} rows={2} className="w-full rounded bg-black/40 px-3 py-2 text-sm" />
            </Field>
            <Field label="Полное описание (Markdown)">
              <textarea value={editing.long_def_md ?? ""} onChange={(e) => setEditing({ ...editing, long_def_md: e.target.value })} rows={5} className="w-full rounded bg-black/40 px-3 py-2 text-sm font-mono" />
            </Field>

            <MediaEditor
              media={(editing.media ?? []) as TermMedia[]}
              setMedia={(m) => setEditing({ ...editing, media: m as any })}
            />

            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => setEditing(null)} className="rounded-lg border border-black/60 bg-black/30 px-4 py-2 text-sm">Отмена</button>
              <button onClick={submit} disabled={busy} className="inline-flex items-center gap-1 rounded-lg bg-mint px-4 py-2 text-sm font-semibold text-black disabled:opacity-50">
                <Save className="h-4 w-4" /> {busy ? "Сохранение…" : "Сохранить"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="mt-3 block">
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

function MediaEditor({ media, setMedia }: { media: TermMedia[]; setMedia: (m: TermMedia[]) => void }) {
  function add(kind: TermMedia["kind"]) {
    if (kind === "audio_ab") setMedia([...media, { kind, url_a: "", url_b: "", label_a: "A", label_b: "B" }]);
    else setMedia([...media, { kind, url: "" }]);
  }
  function update(i: number, patch: Partial<TermMedia>) {
    setMedia(media.map((m, idx) => (idx === i ? ({ ...m, ...patch } as TermMedia) : m)));
  }
  function remove(i: number) {
    setMedia(media.filter((_, idx) => idx !== i));
  }
  return (
    <div className="mt-4 rounded-xl border border-black/40 bg-black/20 p-3">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Медиа</span>
        <div className="flex gap-1 text-[10px]">
          <button onClick={() => add("image")} className="inline-flex items-center gap-1 rounded border border-black/50 bg-black/40 px-2 py-1 hover:bg-black/60"><ImageIcon className="h-3 w-3" /> Картинка</button>
          <button onClick={() => add("gif")} className="inline-flex items-center gap-1 rounded border border-black/50 bg-black/40 px-2 py-1 hover:bg-black/60"><ImageIcon className="h-3 w-3" /> GIF</button>
          <button onClick={() => add("video")} className="inline-flex items-center gap-1 rounded border border-black/50 bg-black/40 px-2 py-1 hover:bg-black/60"><Film className="h-3 w-3" /> Видео</button>
          <button onClick={() => add("audio_ab")} className="inline-flex items-center gap-1 rounded border border-black/50 bg-black/40 px-2 py-1 hover:bg-black/60"><Music className="h-3 w-3" /> A/B аудио</button>
        </div>
      </div>
      {media.length === 0 ? (
        <div className="mt-2 text-[11px] text-muted-foreground">Медиа не добавлено.</div>
      ) : (
        <ul className="mt-2 space-y-2">
          {media.map((m, i) => (
            <li key={i} className="rounded-lg border border-black/50 bg-black/30 p-2">
              <div className="mb-1 flex items-center justify-between">
                <span className="text-[10px] font-mono uppercase text-mint">{m.kind}</span>
                <button onClick={() => remove(i)} className="text-destructive"><Trash2 className="h-3.5 w-3.5" /></button>
              </div>
              {m.kind === "audio_ab" ? (
                <div className="grid grid-cols-2 gap-2">
                  <FileOrUrlInput value={m.url_a} onChange={(u) => update(i, { url_a: u })} accept="audio/*" placeholder="URL аудио A" />
                  <FileOrUrlInput value={m.url_b} onChange={(u) => update(i, { url_b: u })} accept="audio/*" placeholder="URL аудио B" />
                  <input value={m.label_a ?? "A"} onChange={(e) => update(i, { label_a: e.target.value })} placeholder="Подпись A" className="rounded bg-black/40 px-2 py-1 text-xs" />
                  <input value={m.label_b ?? "B"} onChange={(e) => update(i, { label_b: e.target.value })} placeholder="Подпись B" className="rounded bg-black/40 px-2 py-1 text-xs" />
                  <input value={m.caption ?? ""} onChange={(e) => update(i, { caption: e.target.value })} placeholder="Общая подпись" className="col-span-2 rounded bg-black/40 px-2 py-1 text-xs" />
                </div>
              ) : (
                <div className="space-y-1">
                  <FileOrUrlInput
                    value={(m as any).url}
                    onChange={(u) => update(i, { url: u } as any)}
                    accept={m.kind === "video" ? "video/*" : m.kind === "gif" ? "image/gif" : "image/*"}
                    placeholder={`URL ${m.kind}`}
                  />
                  <input value={(m as any).caption ?? ""} onChange={(e) => update(i, { caption: e.target.value } as any)} placeholder="Подпись" className="w-full rounded bg-black/40 px-2 py-1 text-xs" />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function FileOrUrlInput({ value, onChange, accept, placeholder }: { value: string; onChange: (u: string) => void; accept: string; placeholder: string }) {
  const upload = useServerFn(uploadLessonAsset);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);

  async function handleFile(file: File) {
    if (file.size > 40 * 1024 * 1024) {
      toast.error("Файл больше 40 МБ. Загрузите на внешний хост и вставьте URL.");
      return;
    }
    setBusy(true);
    setProgress(0);
    try {
      const buffer = await file.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      let bin = "";
      const chunk = 0x8000;
      for (let i = 0; i < bytes.length; i += chunk) {
        bin += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)));
        setProgress(Math.round((i / bytes.length) * 50));
      }
      const base64 = btoa(bin);
      setProgress(70);
      const r = await upload({ data: { filename: file.name, contentType: file.type || "application/octet-stream", base64 } });
      setProgress(100);
      onChange(r.url);
      toast.success("Загружено");
    } catch (e: any) {
      toast.error(e.message ?? "Ошибка загрузки");
    } finally {
      setBusy(false);
      setTimeout(() => setProgress(0), 500);
    }
  }

  return (
    <div className="space-y-1">
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="w-full rounded bg-black/40 px-2 py-1 text-xs font-mono" />
      <div className="flex items-center gap-2">
        <label className="inline-flex cursor-pointer items-center gap-1 rounded border border-mint/40 bg-mint/10 px-2 py-1 text-[10px] text-mint hover:bg-mint/20">
          <Upload className="h-3 w-3" /> {busy ? `Загрузка ${progress}%` : "С компьютера"}
          <input type="file" accept={accept} className="hidden" disabled={busy}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }} />
        </label>
        {busy && (
          <div className="h-1 flex-1 overflow-hidden rounded bg-black/50">
            <div className="h-full bg-mint transition-all" style={{ width: `${progress}%` }} />
          </div>
        )}
      </div>
    </div>
  );
}
