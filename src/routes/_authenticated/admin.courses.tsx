import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { AdminTabs } from "@/components/admin-tabs";
import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  listCourseTree,
  getLessonAdmin,
  upsertModule,
  deleteModule as delModule,
  upsertLesson,
  deleteLesson as delLesson,
} from "@/lib/course-editor.functions";
import { createUploadUrl } from "@/lib/storage.functions";
import { publicStorageUrl } from "@/lib/storage-url";
import { useAuth } from "@/hooks/use-auth";
import { uploadWithProgress } from "@/lib/upload-progress";
import {
  BLOCK_LABELS,
  newBlock,
  sanitizeInlineHtml,
  type Block,
} from "@/lib/course-blocks";
import { BlockRenderer } from "@/components/block-renderer";
import { ImageEditor } from "@/components/image-editor";
import { toast } from "sonner";
import {
  Plus,
  Trash2,
  Save,
  Eye,
  ArrowUp,
  ArrowDown,
  Image as ImageIcon,
  Video,
  Heading1,
  Clock,
  Type,
  Code,
  Quote,
  List as ListIcon,
  ListOrdered,
  AlertTriangle,
  Minus,
  Upload,
  Music,
  FolderPlus,
  BookPlus,
  FileText,
  Bold,
  Italic,
  Underline,
  Search,
  Settings2,
  ChevronDown,
  ChevronRight,
  Undo2,
  Redo2,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Link as LinkIcon,
  Link2Off,
  ImagePlus,
  Sigma,
  Table as TableIcon,
  Terminal,
  Strikethrough,
  Highlighter,
  Palette,
  Eraser,
} from "lucide-react";

import { RoleGate } from "@/components/role-gate";

export const Route = createFileRoute("/_authenticated/admin/courses")({
  head: () => ({ meta: [{ title: "Редактор курсов — MixPro" }, { name: "robots", content: "noindex" }] }),
  validateSearch: (s: Record<string, unknown>): { module?: string } => ({
    ...(typeof s.module === "string" ? { module: s.module } : {}),
  }),
  component: () => (
    <RoleGate role="admin">
      <CourseEditorPage />
    </RoleGate>
  ),
});


type Module = {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  cover_url: string | null;
  order_index: number;
  is_published: boolean;
  level?: "beginner" | "intermediate" | "pro";
  prerequisite_id?: string | null;
  position_x?: number;
  position_y?: number;
};
type LessonRow = {
  id: string;
  slug: string;
  title: string;
  category: string;
  difficulty: string;
  duration_min: number;
  module_id: string | null;
  order_index: number;
  xp_reward: number;
  is_published: boolean;
  cover_url: string | null;
};
type LessonFull = LessonRow & {
  content_md: string;
  content_blocks: Block[];
  quiz: Array<{ q: string; options: string[]; correct: number }>;
  pass_score: number;
};

function CourseEditorPage() {
  const loadTree = useServerFn(listCourseTree);
  const loadLesson = useServerFn(getLessonAdmin);
  const router = useRouter();
  const queryClient = useQueryClient();
  const search = Route.useSearch();
  const [modules, setModules] = useState<Module[]>([]);
  const [lessons, setLessons] = useState<LessonRow[]>([]);
  const [selected, setSelected] = useState<LessonFull | null>(null);
  const [loading, setLoading] = useState(true);
  const [preview, setPreview] = useState(false);
  


  async function refresh() {
    setLoading(true);
    try {
      const r = await loadTree();
      const mods = r.modules as Module[];
      const les = r.lessons as LessonRow[];
      setModules(mods);
      setLessons(les);
      queryClient.invalidateQueries({ queryKey: ["course-modules"] });
      queryClient.invalidateQueries({ queryKey: ["lesson"] });
      queryClient.invalidateQueries({ queryKey: ["courses"] });
      router.invalidate();
      // Auto-open a lesson: prefer the module from ?module=, else first available
      if (!selected && les.length > 0) {
        const preferred = search.module
          ? [...les].filter((l) => l.module_id === search.module).sort((a, b) => a.order_index - b.order_index)[0]
          : undefined;
        const first = preferred ?? [...les].sort((a, b) => (a.module_id === b.module_id ? a.order_index - b.order_index : 0))[0];
        if (first) {
          const lr = await loadLesson({ data: { id: first.id } });
          const l = lr.lesson as any;
          if (l) {
            setSelected({
              ...l,
              content_blocks: Array.isArray(l.content_blocks) ? l.content_blocks : [],
              quiz: Array.isArray(l.quiz) ? l.quiz : [],
            });
          }
        }
      }

    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { refresh(); }, []); // eslint-disable-line


  async function openLesson(id: string) {
    const r = await loadLesson({ data: { id } });
    const l = r.lesson as any;
    if (!l) return;
    setSelected({
      ...l,
      content_blocks: Array.isArray(l.content_blocks) ? l.content_blocks : [],
      quiz: Array.isArray(l.quiz) ? l.quiz : [],
    });
    setPreview(false);
  }

  return (
    <div className="mx-auto max-w-[1800px] px-4 py-6">
      <AdminTabs active="courses" />

      <div className="mt-4">
        {/* Editor top bar — catalog style */}
        <header className="glass mb-4 flex items-center justify-between rounded-2xl px-5 py-3">
          <div className="flex items-center gap-3">
            <Link
              to="/learn"
              title="К каталогу обучения"
              className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition hover:text-foreground"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7"/></svg>
              К каталогу
            </Link>
            <div className="h-4 w-px bg-black/40" />
            <h1 className="text-base font-bold text-foreground">Редактор курса</h1>
          </div>
          <div className="hidden text-xs text-muted-foreground sm:block">
            {modules.length} модулей · {lessons.length} уроков
          </div>
        </header>

        <div className="grid min-h-[70vh] grid-cols-1 gap-4 lg:grid-cols-[288px_1fr]">
          <ModulesSidebar
            modules={modules}
            lessons={lessons}
            loading={loading}
            selectedId={selected?.id}
            onSelectLesson={openLesson}
            onChanged={refresh}
          />
          <div className="min-w-0">
            {selected ? (
              <LessonEditor
                key={selected.id}
                lesson={selected}
                modules={modules}
                onSaved={async (updated) => {
                  await refresh();
                  if (updated?.id) await openLesson(updated.id);
                }}
                onDeleted={async () => {
                  setSelected(null);
                  await refresh();
                }}
                preview={preview}
                setPreview={setPreview}
              />
            ) : (
              <div className="glass flex h-full flex-col items-center justify-center rounded-2xl p-12 text-center">
                <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-black/40 bg-black/30">
                  <FileText className="h-7 w-7 text-mint/70" />
                </div>
                <div className="text-base font-semibold">Выберите урок слева</div>
                <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                  Или создайте новый модуль и добавьте в него первый урок.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}



/* ─────────── Sidebar ─────────── */

function ModulesSidebar({
  modules, lessons, loading, selectedId, onSelectLesson, onChanged,
}: {
  modules: Module[]; lessons: LessonRow[]; loading: boolean;
  selectedId?: string; onSelectLesson: (id: string) => void; onChanged: () => void;
}) {
  const saveMod = useServerFn(upsertModule);
  const dropMod = useServerFn(delModule);
  const saveLesson = useServerFn(upsertLesson);
  const dropLesson = useServerFn(delLesson);

  const [editingMod, setEditingMod] = useState<Partial<Module> | null>(null);
  const [query, setQuery] = useState("");
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const q = query.trim().toLowerCase();
  const filteredLessons = useMemo(
    () => (q ? lessons.filter((l) => l.title.toLowerCase().includes(q) || l.slug.toLowerCase().includes(q)) : lessons),
    [lessons, q],
  );
  const orphans = useMemo(() => filteredLessons.filter((l) => !l.module_id), [filteredLessons]);
  const byModule = useMemo(() => {
    const m = new Map<string, LessonRow[]>();
    for (const l of filteredLessons) {
      if (!l.module_id) continue;
      const arr = m.get(l.module_id) ?? [];
      arr.push(l);
      m.set(l.module_id, arr);
    }
    return m;
  }, [filteredLessons]);

  async function createLessonIn(moduleId: string | null) {
    try {
      const slug = `lesson-${Math.random().toString(36).slice(2, 8)}`;
      const orderIndex = moduleId
        ? (byModule.get(moduleId)?.length ?? 0)
        : orphans.length;
      await saveLesson({
        data: {
          module_id: moduleId,
          slug,
          title: "Новый урок",
          category: "general",
          difficulty: "beginner",
          duration_min: 5,
          order_index: orderIndex,
          xp_reward: 50,
          pass_score: 70,
          cover_url: null,
          content_md: "",
          content_blocks: [],
          quiz: [],
          is_published: true,
        },
      });
      toast.success("Урок создан");
      onChanged();
    } catch (e: any) {
      toast.error(e.message ?? "Не удалось создать урок");
    }
  }

  async function submitModule() {
    if (!editingMod) return;
    try {
      await saveMod({
        data: {
          id: editingMod.id,
          slug: editingMod.slug || `mod-${Math.random().toString(36).slice(2, 8)}`,
          title: editingMod.title || "Модуль",
          description: editingMod.description ?? null,
          cover_url: editingMod.cover_url ?? null,
          order_index: editingMod.order_index ?? modules.length,
          is_published: editingMod.is_published ?? true,
          level: (editingMod.level as any) ?? "beginner",
          prerequisite_id: editingMod.prerequisite_id ?? null,
          position_x: editingMod.position_x ?? 0,
          position_y: editingMod.position_y ?? 0,
        },
      });
      toast.success("Сохранено");
      setEditingMod(null);
      onChanged();
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  async function removeModule(id: string) {
    if (!confirm("Удалить модуль? Уроки останутся, но отвяжутся.")) return;
    await dropMod({ data: { id } });
    onChanged();
  }
  async function removeLesson(id: string) {
    if (!confirm("Удалить урок?")) return;
    await dropLesson({ data: { id } });
    onChanged();
  }

  return (
    <aside className="flex flex-col gap-3 p-4">
      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={() => setEditingMod({ title: "Новый модуль", order_index: modules.length, is_published: true })}
          className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-mint py-2 text-xs font-semibold text-black transition hover:bg-mint/90"
        >
          <Plus className="h-3.5 w-3.5" strokeWidth={2.5} /> Модуль
        </button>
        <button
          onClick={() => createLessonIn(null)}
          className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-black/40 bg-black/20 py-2 text-xs font-semibold text-foreground transition hover:bg-black/30"
        >
          <Plus className="h-3.5 w-3.5" strokeWidth={2.5} /> Урок
        </button>
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Поиск по структуре"
          className="w-full rounded-lg border border-black/40 bg-black/30 py-2 pl-9 pr-3 text-sm outline-none focus:border-mint/40"
        />
      </div>

      {editingMod && (
        <div className="glass space-y-2 rounded-xl p-3">
          <Field label="Название">
            <input value={editingMod.title ?? ""} onChange={(e) => setEditingMod({ ...editingMod, title: e.target.value })}
              className="w-full rounded-lg border border-black/40 bg-black/30 px-2.5 py-1.5 text-sm outline-none focus:border-mint/40" />
          </Field>
          <Field label="Slug (URL)">
            <input value={editingMod.slug ?? ""} onChange={(e) => setEditingMod({ ...editingMod, slug: e.target.value })}
              placeholder="mixing-basics" className="w-full rounded-lg border border-black/40 bg-black/30 px-2.5 py-1.5 font-mono text-sm outline-none focus:border-mint/40" />
          </Field>
          <Field label="Описание">
            <textarea value={editingMod.description ?? ""} onChange={(e) => setEditingMod({ ...editingMod, description: e.target.value })}
              rows={2} className="w-full rounded-lg border border-black/40 bg-black/30 px-2.5 py-1.5 text-sm outline-none focus:border-mint/40" />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Уровень">
              <select value={editingMod.level ?? "beginner"} onChange={(e) => setEditingMod({ ...editingMod, level: e.target.value as any })}
                className="w-full rounded-lg border border-black/40 bg-black/30 px-2.5 py-1.5 text-sm outline-none focus:border-mint/40">
                <option value="beginner">Новичок</option>
                <option value="intermediate">Средний</option>
                <option value="pro">Про</option>
              </select>
            </Field>
            <Field label="Пререквизит">
              <select value={editingMod.prerequisite_id ?? ""} onChange={(e) => setEditingMod({ ...editingMod, prerequisite_id: e.target.value || null })}
                className="w-full rounded-lg border border-black/40 bg-black/30 px-2.5 py-1.5 text-sm outline-none focus:border-mint/40">
                <option value="">— нет —</option>
                {modules.filter((mm) => mm.id !== editingMod.id).map((mm) => <option key={mm.id} value={mm.id}>{mm.title}</option>)}
              </select>
            </Field>
          </div>
          <Field label="Обложка">
            <MediaInput
              url={editingMod.cover_url ?? ""}
              onUrl={(u) => setEditingMod({ ...editingMod, cover_url: u })}
              accept="image/*"
              hint="URL картинки или загрузите файл"
            />
            {editingMod.cover_url && (
              <img src={editingMod.cover_url} alt="" className="mt-2 h-20 w-full rounded-lg object-cover" />
            )}
          </Field>
          <label className="flex items-center gap-2 text-xs">
            <input type="checkbox" checked={editingMod.is_published ?? true}
              onChange={(e) => setEditingMod({ ...editingMod, is_published: e.target.checked })} />
            Опубликован
          </label>
          <div className="flex gap-2">
            <button onClick={submitModule} className="flex-1 rounded-lg bg-mint py-1.5 text-xs font-semibold text-black hover:bg-mint/90">Сохранить</button>
            <button onClick={() => setEditingMod(null)} className="rounded-lg border border-black/40 bg-black/20 px-3 py-1.5 text-xs text-muted-foreground hover:bg-black/30">Отмена</button>
          </div>
        </div>
      )}

      {loading && <div className="px-1 text-xs text-muted-foreground">Загрузка…</div>}

      <div className="space-y-1.5 overflow-y-auto pr-1" style={{ maxHeight: "calc(100vh - 260px)" }}>
        {modules.map((m) => {
          const isCollapsed = collapsed[m.id];
          const items = byModule.get(m.id) ?? [];
          return (
            <div key={m.id} className="glass overflow-hidden rounded-xl">
              <div className="group/mod flex items-center gap-1.5 px-3 py-2 transition hover:bg-white/[0.02]">
                <button
                  onClick={() => setCollapsed((c) => ({ ...c, [m.id]: !c[m.id] }))}
                  className="text-muted-foreground hover:text-foreground"
                  title={isCollapsed ? "Развернуть" : "Свернуть"}
                >
                  <ChevronDown className={`h-4 w-4 transition-transform ${isCollapsed ? "-rotate-90" : ""}`} />
                </button>
                <button onClick={() => setEditingMod(m)} className="flex-1 truncate text-left text-sm font-semibold text-foreground hover:text-mint">
                  {m.title}
                </button>
                <span className="rounded-full bg-black/40 px-1.5 text-[10px] text-muted-foreground">{items.length}</span>
                {!m.is_published && <span className="rounded bg-amber-400/15 px-1.5 text-[9px] uppercase text-amber-300">черн.</span>}
                <button onClick={() => createLessonIn(m.id)} title="Добавить урок" className="p-0.5 text-muted-foreground opacity-0 transition-all hover:text-mint group-hover/mod:opacity-100">
                  <Plus className="h-3.5 w-3.5" />
                </button>
                <button onClick={() => removeModule(m.id)} title="Удалить" className="p-0.5 text-muted-foreground opacity-0 transition-all hover:text-red-400 group-hover/mod:opacity-100">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
              {!isCollapsed && (
                <ul className="space-y-0.5 border-t border-black/40 px-2 py-2">
                  {items.map((l) => (
                    <LessonPill key={l.id} l={l} active={selectedId === l.id} onOpen={onSelectLesson} onDelete={removeLesson} />
                  ))}
                  {items.length === 0 && (
                    <li className="px-2 py-1.5 text-[11px] text-muted-foreground">Пусто. Нажмите +</li>
                  )}
                </ul>
              )}
            </div>
          );
        })}
        {orphans.length > 0 && (
          <div className="glass rounded-xl p-2">
            <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Без модуля</div>
            <ul className="space-y-0.5">
              {orphans.map((l) => (
                <LessonPill key={l.id} l={l} active={selectedId === l.id} onOpen={onSelectLesson} onDelete={removeLesson} />
              ))}
            </ul>
          </div>
        )}
      </div>
    </aside>
  );
}

function LessonPill({ l, active, onOpen, onDelete }: { l: LessonRow; active: boolean; onOpen: (id: string) => void; onDelete: (id: string) => void }) {
  return (
    <li className={`group/lesson flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm transition ${active ? "bg-mint/15 text-mint" : "text-muted-foreground hover:bg-white/[0.03] hover:text-foreground"}`}>
      <svg className={`h-3.5 w-3.5 shrink-0 ${active ? "" : "opacity-40"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16"/></svg>
      <button className="flex-1 truncate text-left" onClick={() => onOpen(l.id)}>{l.title}</button>
      {!l.is_published && <span className="rounded bg-amber-400/15 px-1 text-[9px] uppercase text-amber-300">черн.</span>}
      <button onClick={() => onDelete(l.id)} className="text-muted-foreground opacity-0 transition-opacity hover:text-red-400 group-hover/lesson:opacity-100">
        <Trash2 className="h-3 w-3" />
      </button>
    </li>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

/* ─────────── Lesson Editor ─────────── */

function LessonEditor({
  lesson, modules, onSaved, onDeleted, preview, setPreview,
}: {
  lesson: LessonFull; modules: Module[];
  onSaved: (l: any) => void; onDeleted: () => void;
  preview: boolean; setPreview: (v: boolean) => void;
}) {
  const [meta, setMeta] = useState<LessonFull>(lesson);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const save = useServerFn(upsertLesson);
  const drop = useServerFn(delLesson);

  function patch(p: Partial<LessonFull>) {
    setMeta((m) => ({ ...m, ...p }));
    setDirty(true);
  }
  function setBlocks(fn: (b: Block[]) => Block[]) {
    setMeta((m) => ({ ...m, content_blocks: fn(m.content_blocks) }));
    setDirty(true);
  }

  async function doSave() {
    setSaving(true);
    try {
      const sanitized = meta.content_blocks.map((b) =>
        b.type === "paragraph" ? { ...b, html: sanitizeInlineHtml(b.html) } : b,
      );
      const r = await save({
        data: {
          id: meta.id,
          module_id: meta.module_id,
          slug: meta.slug,
          title: meta.title,
          category: meta.category,
          difficulty: (meta.difficulty as any) || "beginner",
          duration_min: meta.duration_min,
          order_index: meta.order_index,
          xp_reward: meta.xp_reward,
          pass_score: meta.pass_score,
          cover_url: meta.cover_url,
          content_md: meta.content_md ?? "",
          content_blocks: sanitized,
          quiz: meta.quiz ?? [],
          is_published: meta.is_published,
        },
      });
      toast.success("Урок сохранён");
      setDirty(false);
      onSaved(r.lesson);
    } catch (e: any) {
      toast.error(e.message ?? "Ошибка сохранения");
    } finally {
      setSaving(false);
    }
  }

  async function doDelete() {
    if (!confirm("Удалить урок?")) return;
    await drop({ data: { id: meta.id } });
    onDeleted();
  }

  return (
    <section className="relative h-full overflow-y-auto p-6 space-y-4">
      <div className="mx-auto w-full max-w-[1100px] space-y-4">
      {/* Lesson header — catalog style */}
      <div className="glass rounded-2xl p-5">
        <div className="flex items-center justify-between gap-3">
          <input
            value={meta.title}
            onChange={(e) => patch({ title: e.target.value })}
            className="min-w-0 flex-1 bg-transparent text-2xl font-bold leading-tight text-foreground outline-none placeholder:text-muted-foreground"
            placeholder="Название урока"
          />
          <div className="flex shrink-0 items-center gap-2">
            <button onClick={() => setPreview(!preview)} className="inline-flex items-center gap-2 rounded-lg border border-black/40 bg-black/20 px-3 py-2 text-xs text-muted-foreground hover:bg-black/30">
              <Eye className="h-4 w-4" /> {preview ? "Редактор" : "Превью"}
            </button>
            <button
              onClick={doSave}
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-lg bg-mint px-5 py-2 text-sm font-semibold text-black transition hover:bg-mint/90 disabled:opacity-50"
            >
              <Save className="h-4 w-4" /> {saving ? "Сохранение…" : dirty ? "Сохранить*" : "Сохранить"}
            </button>
            <button onClick={doDelete} title="Удалить урок" className="rounded-lg border border-red-500/30 bg-transparent p-2 text-red-400/80 hover:bg-red-500/10">
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs">
          <label className="inline-flex cursor-pointer items-center gap-2">
            <input type="checkbox" checked={meta.is_published} onChange={(e) => patch({ is_published: e.target.checked })} className="sr-only peer" />
            <span className={`inline-block h-2.5 w-2.5 rounded-full transition ${meta.is_published ? "bg-mint" : "bg-muted-foreground/40"}`} />
            <span className={meta.is_published ? "text-mint" : "text-muted-foreground"}>
              {meta.is_published ? "Опубликовано" : "Черновик"}
            </span>
          </label>

          <div className="inline-flex items-center gap-2 rounded-lg border border-black/40 bg-black/20 px-2.5 py-1">
            <span className="text-muted-foreground">Модуль:</span>
            <select
              value={meta.module_id ?? ""}
              onChange={(e) => patch({ module_id: e.target.value || null })}
              className="cursor-pointer border-none bg-transparent pr-3 text-foreground outline-none"
            >
              <option value="">Без модуля</option>
              {modules.map((m) => <option key={m.id} value={m.id}>{m.title}</option>)}
            </select>
          </div>

          <span className="inline-flex items-center gap-1 text-muted-foreground">
            <Clock className="h-3.5 w-3.5" /> {meta.duration_min} мин
          </span>
          <span className="inline-flex items-center gap-1 text-mint">
            +{meta.xp_reward} XP
          </span>

          <div className="ml-auto flex items-center gap-2">
            <code className="font-mono text-[11px] text-muted-foreground">/learn/{meta.slug}</code>
            <button
              onClick={() => setShowSettings((v) => !v)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-black/40 bg-black/20 px-2.5 py-1 text-muted-foreground hover:bg-black/30"
            >
              <Settings2 className="h-3.5 w-3.5" /> Настройки
              {showSettings ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            </button>
          </div>
        </div>
      </div>


      {showSettings && (
        <div className="rounded-xl border border-black/50 bg-black/20 p-3">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            <Field label="Slug (URL)"><input value={meta.slug} onChange={(e) => patch({ slug: e.target.value })} className="w-full rounded bg-black/40 px-2 py-1 text-sm font-mono" /></Field>
            <Field label="Категория"><input value={meta.category} onChange={(e) => patch({ category: e.target.value })} className="w-full rounded bg-black/40 px-2 py-1 text-sm" /></Field>
            <Field label="Сложность">
              <select value={meta.difficulty} onChange={(e) => patch({ difficulty: e.target.value })} className="w-full rounded bg-black/40 px-2 py-1 text-sm">
                <option value="beginner">Новичок</option>
                <option value="intermediate">Средний</option>
                <option value="advanced">Продвинутый</option>
              </select>
            </Field>
            <Field label="Длительность, мин"><input type="number" value={meta.duration_min} onChange={(e) => patch({ duration_min: +e.target.value })} className="w-full rounded bg-black/40 px-2 py-1 text-sm" /></Field>
            <Field label="XP"><input type="number" value={meta.xp_reward} onChange={(e) => patch({ xp_reward: +e.target.value })} className="w-full rounded bg-black/40 px-2 py-1 text-sm" /></Field>
            <Field label="Порядок"><input type="number" value={meta.order_index} onChange={(e) => patch({ order_index: +e.target.value })} className="w-full rounded bg-black/40 px-2 py-1 text-sm" /></Field>
            <Field label="Проходной балл, %"><input type="number" value={meta.pass_score} onChange={(e) => patch({ pass_score: +e.target.value })} className="w-full rounded bg-black/40 px-2 py-1 text-sm" /></Field>
          </div>
        </div>
      )}



      {preview ? (
        <div className="rounded-xl border border-black/40 bg-black/20 p-6">
          <BlockRenderer blocks={meta.content_blocks} />
          {meta.quiz.length > 0 && (
            <div className="mt-6 border-t border-black/40 pt-4">
              <QuizPreview quiz={meta.quiz} />
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <RichLessonBody blocks={meta.content_blocks} setBlocks={setBlocks} />
          <QuizSection quiz={meta.quiz} setQuiz={(q) => patch({ quiz: q })} />
        </div>
      )}
      </div>
    </section>
  );
}

/* ─────────── Lesson body (single rich text field) ─────────── */

function RichLessonBody({
  blocks,
  setBlocks,
}: {
  blocks: Block[];
  setBlocks: (fn: (b: Block[]) => Block[]) => void;
}) {
  // Ensure exactly one paragraph block backing the rich editor.
  useEffect(() => {
    const hasParagraph = blocks.some((b) => b.type === "paragraph");
    if (!hasParagraph) {
      setBlocks(() => [newBlock("paragraph")]);
    }
    // eslint-disable-next-line
  }, []);

  const paragraph = blocks.find((b) => b.type === "paragraph") as
    | Extract<Block, { type: "paragraph" }>
    | undefined;

  if (!paragraph) {
    return <div className="rounded-xl border border-black/40 bg-black/20 p-6 text-sm text-muted-foreground">Инициализация…</div>;
  }

  function updateParagraph(p: Partial<Block>) {
    setBlocks((arr) => arr.map((b) => (b.id === paragraph!.id ? ({ ...b, ...p } as Block) : b)));
  }

  return <RichParagraphEditor block={paragraph} update={updateParagraph} />;
}

/* ─────────── Optional quiz section ─────────── */

function QuizSection({
  quiz,
  setQuiz,
}: {
  quiz: Array<{ q: string; options: string[]; correct: number }>;
  setQuiz: (q: Array<{ q: string; options: string[]; correct: number }>) => void;
}) {
  const [open, setOpen] = useState(quiz.length > 0);

  if (!open) {
    return (
      <button
        onClick={() => {
          setOpen(true);
          if (quiz.length === 0) setQuiz([{ q: "Вопрос?", options: ["Вариант 1", "Вариант 2"], correct: 0 }]);
        }}
        className="inline-flex items-center gap-2 rounded-lg border border-dashed border-white/10 bg-black/20 px-3 py-2 text-xs text-muted-foreground hover:border-mint/40 hover:text-mint"
      >
        <Plus className="h-3.5 w-3.5" /> Добавить тест к уроку
      </button>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">Тест урока</span>
        <button
          onClick={() => {
            if (quiz.length === 0 || confirm("Убрать тест?")) {
              setQuiz([]);
              setOpen(false);
            }
          }}
          className="text-[11px] text-muted-foreground hover:text-red-400"
        >
          Убрать
        </button>
      </div>
      <QuizEditor quiz={quiz} setQuiz={setQuiz} />
    </div>
  );
}

function QuizPreview({ quiz }: { quiz: Array<{ q: string; options: string[]; correct: number }> }) {
  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold uppercase tracking-wider text-cyan">Тест</h3>
      {quiz.map((q, i) => (
        <div key={i} className="rounded-lg border border-black/40 bg-black/30 p-3">
          <div className="mb-2 text-sm font-semibold">{i + 1}. {q.q}</div>
          <ul className="space-y-1 text-sm">
            {q.options.map((o, j) => (
              <li key={j} className={j === q.correct ? "text-mint" : "text-muted-foreground"}>
                {j === q.correct ? "✓" : "○"} {o}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

/* ─────────── Rich paragraph editor ─────────── */

const FONTS = ["System", "Inter", "DM Sans", "JetBrains Mono", "Michroma", "Archivo Black", "Space Grotesk", "Georgia"];

function FontPicker({ value, onChange }: { value?: string; onChange: (f: string) => void }) {
  return (
    <select value={value ?? ""} onChange={(e) => onChange(e.target.value)} className="rounded bg-black/40 px-2 py-1 text-xs">
      <option value="">Шрифт</option>
      {FONTS.map((f) => <option key={f} value={f === "System" ? "" : f}>{f}</option>)}
    </select>
  );
}

type UploadItem = { id: string; name: string; loaded: number; total: number; pct: number; done?: boolean; error?: string };

function formatBytes(n: number): string {
  if (n < 1024) return `${n} Б`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} КБ`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(2)} МБ`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} ГБ`;
}

function RichParagraphEditor({ block, update }: { block: Extract<Block, { type: "paragraph" }>; update: (p: Partial<Block>) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [sourceMode, setSourceMode] = useState(false);
  const [sourceValue, setSourceValue] = useState(block.html);
  const [currentBlock, setCurrentBlock] = useState<string>("p");
  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [selectedImg, setSelectedImg] = useState<HTMLImageElement | null>(null);
  const [imgBox, setImgBox] = useState<{ top: number; left: number; width: number; height: number } | null>(null);

  const createUrl = useServerFn(createUploadUrl);

  useEffect(() => {
    if (ref.current && ref.current.innerHTML !== block.html) ref.current.innerHTML = block.html;
    setSourceValue(block.html);
  }, [block.id]); // eslint-disable-line

  // Reflect current block style in toolbar select
  useEffect(() => {
    function poll() {
      if (!ref.current) return;
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0) return;
      const anchor = sel.anchorNode;
      if (!anchor || !ref.current.contains(anchor)) return;
      try {
        const fb = document.queryCommandValue("formatBlock");
        if (typeof fb === "string" && fb) {
          const normalized = fb.toLowerCase().replace(/[<>]/g, "").trim();
          if (normalized) setCurrentBlock(normalized === "div" ? "p" : normalized);
        }
      } catch {}
    }
    document.addEventListener("selectionchange", poll);
    return () => document.removeEventListener("selectionchange", poll);
  }, []);

  // Image selection + reposition on scroll/resize
  useEffect(() => {
    const editor = ref.current;
    if (!editor) return;
    function onClick(e: MouseEvent) {
      const t = e.target as HTMLElement;
      if (t && t.tagName === "IMG") {
        e.preventDefault();
        selectImage(t as HTMLImageElement);
      } else {
        setSelectedImg(null);
        setImgBox(null);
      }
    }
    editor.addEventListener("click", onClick);
    return () => editor.removeEventListener("click", onClick);
  }, []);

  function selectImage(img: HTMLImageElement) {
    // clear previous marker
    ref.current?.querySelectorAll("img[data-selected]").forEach((n) => n.removeAttribute("data-selected"));
    img.setAttribute("data-selected", "1");
    setSelectedImg(img);
    updateImgBox(img);
  }
  function updateImgBox(img: HTMLImageElement) {
    if (!wrapRef.current) return;
    const wrap = wrapRef.current.getBoundingClientRect();
    const r = img.getBoundingClientRect();
    setImgBox({ top: r.top - wrap.top, left: r.left - wrap.left, width: r.width, height: r.height });
  }
  useEffect(() => {
    if (!selectedImg) return;
    const handler = () => updateImgBox(selectedImg);
    window.addEventListener("scroll", handler, true);
    window.addEventListener("resize", handler);
    return () => {
      window.removeEventListener("scroll", handler, true);
      window.removeEventListener("resize", handler);
    };
  }, [selectedImg]);

  function mutateImg(fn: (img: HTMLImageElement) => void) {
    if (!selectedImg) return;
    fn(selectedImg);
    updateImgBox(selectedImg);
    commit();
  }
  function alignImage(kind: "left" | "center" | "right" | "inline") {
    mutateImg((img) => {
      img.style.float = "";
      img.style.display = "";
      img.style.marginLeft = "";
      img.style.marginRight = "";
      img.style.clear = "";
      if (kind === "left") { img.style.float = "left"; img.style.marginRight = "16px"; img.style.marginBottom = "8px"; }
      else if (kind === "right") { img.style.float = "right"; img.style.marginLeft = "16px"; img.style.marginBottom = "8px"; }
      else if (kind === "center") { img.style.display = "block"; img.style.marginLeft = "auto"; img.style.marginRight = "auto"; img.style.clear = "both"; }
      else { img.style.display = "inline-block"; }
    });
  }
  function setImgWidth(pct: number) {
    mutateImg((img) => { img.style.width = `${pct}%`; img.style.height = "auto"; });
  }
  function setImgAspect(a: string) {
    mutateImg((img) => {
      if (!a) { img.style.aspectRatio = ""; img.style.objectFit = ""; img.style.height = "auto"; }
      else { img.style.aspectRatio = a; img.style.objectFit = "cover"; img.style.height = ""; }
    });
  }
  function deleteImage() {
    if (!selectedImg) return;
    selectedImg.remove();
    setSelectedImg(null);
    setImgBox(null);
    commit();
  }
  function startResize(e: React.MouseEvent) {
    if (!selectedImg || !ref.current) return;
    e.preventDefault();
    e.stopPropagation();
    const img = selectedImg;
    const startX = e.clientX;
    const startWidth = img.getBoundingClientRect().width;
    const parentWidth = ref.current.getBoundingClientRect().width;
    function move(ev: MouseEvent) {
      const dx = ev.clientX - startX;
      const newW = Math.max(40, startWidth + dx);
      const pct = Math.min(100, Math.max(5, (newW / parentWidth) * 100));
      img.style.width = `${pct.toFixed(1)}%`;
      img.style.height = "auto";
      updateImgBox(img);
    }
    function up() {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
      commit();
    }
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  }



  function commit() {
    if (ref.current) update({ html: ref.current.innerHTML });
  }
  function exec(cmd: string, val?: string) {
    if (ref.current) ref.current.focus();
    document.execCommand(cmd, false, val);
    commit();
  }
  function insertHTML(html: string) {
    if (ref.current) ref.current.focus();
    document.execCommand("insertHTML", false, html);
    commit();
  }
  function handleStyle(v: string) {
    if (!v) return;
    if (v === "code") {
      const sel = window.getSelection()?.toString() ?? "";
      insertHTML(`<code>${sel || "код"}</code>`);
      return;
    }
    exec("formatBlock", `<${v}>`);
    setCurrentBlock(v);
  }
  function insertLink() {
    const url = prompt("URL ссылки:");
    if (url) exec("createLink", url);
  }
  function insertImageInline() {
    const url = prompt("URL картинки:");
    if (url) insertHTML(`<img src="${url}" alt="" />`);
  }
  function insertFormula() {
    const f = prompt("Формула (LaTeX-подобная):", "E = mc^2");
    if (f) insertHTML(`<code class="math">${f}</code>`);
  }
  function insertTable() {
    const cols = Math.max(1, Math.min(8, Number(prompt("Колонок?", "3") ?? 3)));
    const rows = Math.max(1, Math.min(20, Number(prompt("Строк?", "3") ?? 3)));
    let html = `<table><thead><tr>`;
    for (let c = 0; c < cols; c++) html += `<th>Заг ${c + 1}</th>`;
    html += `</tr></thead><tbody>`;
    for (let r = 0; r < rows; r++) {
      html += `<tr>`;
      for (let c = 0; c < cols; c++) html += `<td>&nbsp;</td>`;
      html += `</tr>`;
    }
    html += `</tbody></table><p></p>`;
    insertHTML(html);
  }
  function toggleSource() {
    if (!sourceMode) {
      setSourceValue(ref.current?.innerHTML ?? block.html);
      setSourceMode(true);
    } else {
      update({ html: sourceValue });
      if (ref.current) ref.current.innerHTML = sourceValue;
      setSourceMode(false);
    }
  }

  async function uploadOne(file: File) {
    const id = crypto.randomUUID();
    setUploads((u) => [...u, { id, name: file.name, loaded: 0, total: file.size, pct: 0 }]);
    try {
      const created = await createUrl({ data: { prefix: "lesson-assets", filename: file.name } });
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("PUT", created.uploadUrl, true);
        if (file.type) xhr.setRequestHeader("Content-Type", file.type);
        xhr.upload.onprogress = (e) => {
          if (!e.lengthComputable) return;
          const pct = Math.round((e.loaded / e.total) * 100);
          setUploads((u) => u.map((it) => (it.id === id ? { ...it, loaded: e.loaded, total: e.total, pct } : it)));
        };
        xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`HTTP ${xhr.status}: ${xhr.responseText}`)));
        xhr.onerror = () => reject(new Error("Ошибка сети"));
        xhr.send(file);
      });
      const url = publicStorageUrl(created.path);
      let html = "";
      if (file.type.startsWith("image/")) html = `<p><img src="${url}" alt="${file.name}" /></p>`;
      else if (file.type.startsWith("video/")) html = `<p><video src="${url}" controls></video></p>`;
      else if (file.type.startsWith("audio/")) html = `<p><audio src="${url}" controls></audio></p>`;
      else html = `<p><a href="${url}" target="_blank" rel="noopener noreferrer">📎 ${file.name} (${formatBytes(file.size)})</a></p>`;
      insertHTML(html);
      setUploads((u) => u.map((it) => (it.id === id ? { ...it, pct: 100, loaded: it.total, done: true } : it)));
      toast.success(`Загружено: ${file.name}`);
      setTimeout(() => setUploads((u) => u.filter((it) => it.id !== id)), 2500);
    } catch (e: any) {
      setUploads((u) => u.map((it) => (it.id === id ? { ...it, error: e.message ?? "Ошибка" } : it)));
      toast.error(`${file.name}: ${e.message ?? "Ошибка загрузки"}`);
    }
  }

  function pickFiles() {
    const input = document.createElement("input");
    input.type = "file";
    input.multiple = true;
    input.accept = "image/*,video/*,audio/*,application/pdf,.zip,.doc,.docx,.xls,.xlsx,.ppt,.pptx";
    input.onchange = () => {
      const files = Array.from(input.files ?? []);
      files.forEach(uploadOne);
    };
    input.click();
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const files = Array.from(e.dataTransfer.files ?? []);
    files.forEach(uploadOne);
  }

  const Divider = () => <span className="mx-0.5 h-6 w-px self-center bg-white/10" />;
  const styleValue = ["p", "h1", "h2", "h3", "pre", "blockquote"].includes(currentBlock) ? currentBlock : "p";
  const styleLabels: Record<string, string> = { p: "Обычный", h1: "H1", h2: "H2", h3: "H3", pre: "Preformatted", blockquote: "Цитата" };

  return (
    <div className="space-y-2">
      {/* Toolbar */}
      <div className="sticky top-0 z-10 flex flex-wrap items-center gap-0.5 rounded-xl border border-white/10 bg-[#0f0f0f]/95 p-2 text-xs backdrop-blur">
        <ToolBtn onClick={() => exec("undo")} title="Отменить"><Undo2 className="h-4 w-4" /></ToolBtn>
        <ToolBtn onClick={() => exec("redo")} title="Вернуть"><Redo2 className="h-4 w-4" /></ToolBtn>
        <Divider />

        <ToolBtn onClick={() => exec("bold")} title="Жирный"><Bold className="h-4 w-4" /></ToolBtn>
        <ToolBtn onClick={() => exec("italic")} title="Курсив"><Italic className="h-4 w-4" /></ToolBtn>
        <ToolBtn onClick={() => exec("underline")} title="Подчёркнутый"><Underline className="h-4 w-4" /></ToolBtn>
        <ToolBtn onClick={() => exec("strikeThrough")} title="Зачёркнутый"><Strikethrough className="h-4 w-4" /></ToolBtn>
        <ToolBtn onClick={() => handleStyle("code")} title="Инлайн-код"><Code className="h-4 w-4" /></ToolBtn>
        <Divider />

        <select
          value={styleValue}
          onChange={(e) => handleStyle(e.target.value)}
          className="cursor-pointer rounded-md border border-white/10 bg-black/40 px-2 py-1 text-[12px] text-gray-200 outline-none hover:bg-white/5"
          title="Стиль абзаца"
        >
          <option value="p">{styleLabels.p}</option>
          <option value="h1">Заголовок 1</option>
          <option value="h2">Заголовок 2</option>
          <option value="h3">Заголовок 3</option>
          <option value="pre">Preformatted</option>
          <option value="blockquote">Цитата</option>
        </select>
        <Divider />

        <label className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 hover:bg-white/5" title="Цвет текста">
          <Palette className="h-4 w-4 text-gray-400" />
          <input type="color" onChange={(e) => exec("foreColor", e.target.value)} className="h-4 w-5 cursor-pointer rounded border-0 bg-transparent p-0" />
        </label>
        <label className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 hover:bg-white/5" title="Выделение">
          <Highlighter className="h-4 w-4 text-gray-400" />
          <input type="color" onChange={(e) => exec("hiliteColor", e.target.value)} className="h-4 w-5 cursor-pointer rounded border-0 bg-transparent p-0" />
        </label>
        <Divider />

        <ToolBtn onClick={() => exec("insertOrderedList")} title="Нумерованный список"><ListOrdered className="h-4 w-4" /></ToolBtn>
        <ToolBtn onClick={() => exec("insertUnorderedList")} title="Маркированный список"><ListIcon className="h-4 w-4" /></ToolBtn>
        <ToolBtn onClick={() => exec("formatBlock", "<blockquote>")} title="Цитата"><Quote className="h-4 w-4" /></ToolBtn>
        <Divider />

        <ToolBtn onClick={() => exec("justifyLeft")} title="По левому краю"><AlignLeft className="h-4 w-4" /></ToolBtn>
        <ToolBtn onClick={() => exec("justifyCenter")} title="По центру"><AlignCenter className="h-4 w-4" /></ToolBtn>
        <ToolBtn onClick={() => exec("justifyRight")} title="По правому краю"><AlignRight className="h-4 w-4" /></ToolBtn>
        <Divider />

        <ToolBtn onClick={insertLink} title="Ссылка"><LinkIcon className="h-4 w-4" /></ToolBtn>
        <ToolBtn onClick={() => exec("unlink")} title="Убрать ссылку"><Link2Off className="h-4 w-4" /></ToolBtn>
        <ToolBtn onClick={insertImageInline} title="Картинка по URL"><ImagePlus className="h-4 w-4" /></ToolBtn>
        <ToolBtn onClick={insertFormula} title="Формула"><Sigma className="h-4 w-4" /></ToolBtn>
        <ToolBtn onClick={insertTable} title="Таблица"><TableIcon className="h-4 w-4" /></ToolBtn>
        <Divider />

        <button
          type="button"
          onMouseDown={(e) => { e.preventDefault(); pickFiles(); }}
          className="inline-flex items-center gap-1.5 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-[12px] font-medium text-emerald-300 hover:bg-emerald-500/15"
          title="Загрузить файл с ПК (drag&drop тоже работает)"
        >
          <Upload className="h-4 w-4" /> Загрузить
        </button>

        <ToolBtn onClick={() => exec("removeFormat")} title="Очистить формат"><Eraser className="h-4 w-4" /></ToolBtn>
        <button
          type="button"
          onMouseDown={(e) => { e.preventDefault(); toggleSource(); }}
          className={`ml-auto inline-flex items-center gap-1 rounded-md px-2 py-1 text-[12px] font-medium transition-colors ${sourceMode ? "bg-emerald-500/20 text-emerald-300" : "text-gray-400 hover:bg-white/5"}`}
          title="HTML-исходник"
        >
          <Terminal className="h-4 w-4" /> Source
        </button>
      </div>

      {sourceMode ? (
        <textarea
          value={sourceValue}
          onChange={(e) => setSourceValue(e.target.value)}
          onBlur={() => update({ html: sourceValue })}
          rows={22}
          className="w-full rounded-xl border border-white/10 bg-black/60 px-4 py-3 font-mono text-sm text-emerald-300 outline-none focus:border-emerald-500/40"
          spellCheck={false}
        />
      ) : (
        <div ref={wrapRef} className="relative">
          <div
            ref={ref}
            contentEditable
            suppressContentEditableWarning
            onInput={commit}
            onBlur={commit}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragEnter={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
            data-placeholder="Начните писать или перетащите сюда файлы (картинки, видео, аудио, документы)…"
            style={{ textAlign: block.align, fontFamily: block.font, minHeight: 520 }}
            className={`rich-editor rounded-xl border border-white/10 bg-[#0a0a0a] px-6 py-5 text-base leading-relaxed text-gray-200 outline-none transition focus:border-emerald-500/40 focus:shadow-[0_0_0_3px_rgba(16,185,129,0.08)] ${dragOver ? "is-dragover" : ""}`}
          />
          {selectedImg && imgBox && (
            <>
              {/* selection outline + corner handle */}
              <div
                className="pointer-events-none absolute rounded-md ring-2 ring-emerald-400/70"
                style={{ top: imgBox.top - 2, left: imgBox.left - 2, width: imgBox.width + 4, height: imgBox.height + 4 }}
              />
              <div
                onMouseDown={startResize}
                title="Тянуть, чтобы изменить размер"
                className="absolute z-20 h-3.5 w-3.5 cursor-nwse-resize rounded-sm border border-black/60 bg-emerald-400 shadow"
                style={{ top: imgBox.top + imgBox.height - 6, left: imgBox.left + imgBox.width - 6 }}
              />
              {/* floating toolbar */}
              <div
                className="absolute z-30 flex flex-wrap items-center gap-1 rounded-lg border border-white/10 bg-[#0f0f0f]/95 p-1.5 text-xs shadow-xl backdrop-blur"
                style={{
                  top: Math.max(4, imgBox.top - 44),
                  left: Math.min(Math.max(0, imgBox.left), Math.max(0, (wrapRef.current?.clientWidth ?? 800) - 460)),
                }}
                onMouseDown={(e) => e.preventDefault()}
              >
                <ToolBtn onClick={() => alignImage("left")} title="Обтекание слева"><AlignLeft className="h-4 w-4" /></ToolBtn>
                <ToolBtn onClick={() => alignImage("center")} title="По центру"><AlignCenter className="h-4 w-4" /></ToolBtn>
                <ToolBtn onClick={() => alignImage("right")} title="Обтекание справа"><AlignRight className="h-4 w-4" /></ToolBtn>
                <ToolBtn onClick={() => alignImage("inline")} title="В строке"><ImagePlus className="h-4 w-4" /></ToolBtn>
                <span className="mx-0.5 h-6 w-px bg-white/10" />
                {[25, 50, 75, 100].map((p) => (
                  <button
                    key={p}
                    type="button"
                    onMouseDown={(e) => { e.preventDefault(); setImgWidth(p); }}
                    className="rounded-md px-1.5 py-1 font-mono text-[11px] text-gray-300 hover:bg-white/5 hover:text-white"
                  >
                    {p}%
                  </button>
                ))}
                <span className="mx-0.5 h-6 w-px bg-white/10" />
                <select
                  onChange={(e) => { setImgAspect(e.target.value); e.currentTarget.selectedIndex = 0; }}
                  className="cursor-pointer rounded-md border border-white/10 bg-black/40 px-1.5 py-1 text-[11px] text-gray-200 outline-none hover:bg-white/5"
                  title="Кроп (соотношение сторон)"
                  defaultValue=""
                >
                  <option value="" disabled>Кроп ▾</option>
                  <option value="">Без кропа</option>
                  <option value="1/1">1:1 квадрат</option>
                  <option value="16/9">16:9</option>
                  <option value="4/3">4:3</option>
                  <option value="3/4">3:4</option>
                  <option value="21/9">21:9</option>
                </select>
                <span className="mx-0.5 h-6 w-px bg-white/10" />
                <button
                  type="button"
                  onMouseDown={(e) => { e.preventDefault(); deleteImage(); }}
                  className="rounded-md px-2 py-1 text-[11px] font-medium text-red-300 hover:bg-red-500/10"
                  title="Удалить"
                >
                  Удалить
                </button>
              </div>
            </>
          )}
        </div>
      )}


      {/* Upload progress list */}
      {uploads.length > 0 && (
        <div className="space-y-2 rounded-xl border border-white/10 bg-black/40 p-3">
          <div className="text-[10px] font-bold uppercase tracking-widest text-emerald-300/80">Загрузки ({uploads.length})</div>
          {uploads.map((u) => (
            <div key={u.id} className="space-y-1">
              <div className="flex items-center justify-between gap-2 text-xs">
                <span className="truncate text-gray-300">{u.name}</span>
                <span className={`shrink-0 font-mono text-[11px] ${u.error ? "text-red-400" : u.done ? "text-emerald-400" : "text-gray-400"}`}>
                  {u.error ? `Ошибка: ${u.error}` : `${formatBytes(u.loaded)} / ${formatBytes(u.total)} · ${u.pct}%`}
                </span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/5">
                <div
                  className={`h-full rounded-full transition-all ${u.error ? "bg-red-500" : u.done ? "bg-emerald-400" : "bg-emerald-500/70"}`}
                  style={{ width: `${u.pct}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center gap-3 text-[10px] uppercase tracking-widest text-gray-500">
        <span>Выравнивание блока:</span>
        <select value={block.align ?? "left"} onChange={(e) => update({ align: e.target.value as any })} className="rounded bg-black/40 px-2 py-0.5">
          <option value="left">Влево</option><option value="center">Центр</option><option value="right">Вправо</option><option value="justify">По ширине</option>
        </select>
        <span className="ml-auto text-gray-500">Drag & Drop файлов прямо в область текста</span>
      </div>
    </div>
  );
}

function ToolBtn({ onClick, children, title }: { onClick: () => void; children: React.ReactNode; title?: string }) {
  return (
    <button
      type="button"
      title={title}
      onMouseDown={(e) => { e.preventDefault(); onClick(); }}
      className="inline-flex h-7 min-w-7 items-center justify-center rounded-md px-1.5 text-gray-300 transition-colors hover:bg-white/5 hover:text-white"
    >
      {children}
    </button>
  );
}

/* ─────────── Media input (URL or upload) ─────────── */

function MediaInput({ url, onUrl, accept, hint }: { url: string; onUrl: (u: string) => void; accept: string; hint: string }) {
  const { session } = useAuth();
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [editing, setEditing] = useState<File | null>(null);

  async function doUpload(file: File | Blob, filename: string, contentType: string) {
    const userId = session?.user.id;
    if (!userId) return;
    // Goes straight from the browser to storage (uploadWithProgress), not
    // through a request body — 200 MB matches lesson-assets' own bucket
    // limit (20260818170000), there's no lower platform ceiling to worry
    // about here the way there was with the old base64-through-a-server-
    // function path.
    if (file.size > 200 * 1024 * 1024) {
      toast.error("Файл больше 200 МБ. Загрузите на внешний хост и вставьте URL.");
      return;
    }
    setBusy(true);
    setProgress(0);
    try {
      const { error, url } = await uploadWithProgress("lesson-assets", filename, file, {
        contentType: contentType || "application/octet-stream",
        onProgress: (p) => setProgress(p.percent),
      });
      if (error) throw error;
      onUrl(url!);
      toast.success("Загружено");
    } catch (e: any) {
      toast.error(e.message ?? "Ошибка загрузки");
    } finally {
      setBusy(false);
      setTimeout(() => setProgress(0), 500);
    }
  }

  function handleFile(file: File) {
    const editable = file.type.startsWith("image/") && file.type !== "image/gif";
    if (editable) setEditing(file);
    else doUpload(file, file.name, file.type);
  }

  return (
    <div className="space-y-2">
      {editing && (
        <ImageEditor
          file={editing}
          onCancel={() => setEditing(null)}
          onConfirm={async (blob, mime) => {
            const ext = mime === "image/png" ? "png" : "jpg";
            await doUpload(blob, editing.name.replace(/\.[^.]+$/, "") + `.${ext}`, mime);
            setEditing(null);
          }}
        />
      )}
      <input value={url} onChange={(e) => onUrl(e.target.value)} placeholder={hint} className="w-full rounded bg-black/40 px-2 py-1 text-sm" />
      <label className="inline-flex cursor-pointer items-center gap-2 rounded border border-mint/40 bg-mint/10 px-3 py-1.5 text-xs text-mint hover:bg-mint/20">
        <Upload className="h-3.5 w-3.5" /> {busy ? `Загрузка… ${progress}%` : "Загрузить файл"}
        <input type="file" accept={accept} className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }} />
      </label>
    </div>
  );
}

/* ─────────── Quiz editor ─────────── */

function QuizEditor({ quiz, setQuiz }: { quiz: Array<{ q: string; options: string[]; correct: number }>; setQuiz: (q: any) => void }) {
  function upd(i: number, patch: any) {
    setQuiz(quiz.map((q, j) => (j === i ? { ...q, ...patch } : q)));
  }
  return (
    <div className="rounded-xl border border-cyan/40 bg-cyan/5 p-4 space-y-3">
      <h3 className="text-sm font-semibold uppercase tracking-wider text-cyan">Тест по уроку ({quiz.length})</h3>
      {quiz.map((q, i) => (
        <div key={i} className="rounded-lg border border-black/50 bg-black/30 p-3 space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Вопрос {i + 1}</span>
            <button onClick={() => setQuiz(quiz.filter((_, j) => j !== i))} className="ml-auto text-destructive text-xs">Удалить</button>
          </div>
          <input value={q.q} onChange={(e) => upd(i, { q: e.target.value })} placeholder="Вопрос" className="w-full rounded bg-black/40 px-2 py-1 text-sm" />
          {q.options.map((opt, oi) => (
            <div key={oi} className="flex gap-2">
              <input type="radio" checked={q.correct === oi} onChange={() => upd(i, { correct: oi })} className="accent-mint" />
              <input value={opt} onChange={(e) => upd(i, { options: q.options.map((x, j) => (j === oi ? e.target.value : x)) })} className="flex-1 rounded bg-black/40 px-2 py-1 text-sm" />
              <button onClick={() => upd(i, { options: q.options.filter((_, j) => j !== oi), correct: Math.min(q.correct, q.options.length - 2) })} className="text-destructive text-xs">×</button>
            </div>
          ))}
          <button onClick={() => upd(i, { options: [...q.options, "Вариант"] })} className="rounded border border-black/50 bg-black/30 px-2 py-1 text-xs">+ Вариант</button>
        </div>
      ))}
      <button onClick={() => setQuiz([...quiz, { q: "Новый вопрос", options: ["Вариант 1", "Вариант 2"], correct: 0 }])}
        className="rounded-lg border border-cyan/40 bg-cyan/10 px-3 py-1.5 text-xs text-cyan">
        + Вопрос
      </button>
    </div>
  );
}
