import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { MessagesSquare, Plus, Pencil, Trash2, X, Loader2, CornerDownRight } from "lucide-react";
import { getForumCategories } from "@/lib/public.functions";
import { upsertCategory, deleteCategory } from "@/lib/community.functions";
import { RoleGate } from "@/components/role-gate";
import { RouteError, RouteNotFound } from "@/components/route-fallbacks";

export const Route = createFileRoute("/_authenticated/admin/forum")({
  head: () => ({ meta: [{ title: "Форум — MixPro" }, { name: "robots", content: "noindex" }] }),
  component: () => (
    <RoleGate role="moderator">
      <AdminForumPage />
    </RoleGate>
  ),
  errorComponent: RouteError,
  notFoundComponent: RouteNotFound,
});

type Category = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  icon: string | null;
  order_index: number;
  parent_id: string | null;
  thread_count: number;
};

const EMPTY = { id: undefined as string | undefined, slug: "", name: "", description: "", icon: "💬", orderIndex: 0, parentId: "" };

function AdminForumPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<typeof EMPTY | null>(null);
  const [busy, setBusy] = useState(false);
  const _list = useServerFn(getForumCategories);
  const _upsert = useServerFn(upsertCategory);
  const _delete = useServerFn(deleteCategory);

  async function reload() {
    setLoading(true);
    const r = await _list();
    setCategories(r.categories as Category[]);
    setLoading(false);
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps -- run once on mount only
  useEffect(() => { reload(); }, []);

  async function save() {
    if (!editing) return;
    if (!editing.slug.trim() || !editing.name.trim()) return;
    setBusy(true);
    try {
      await _upsert({
        data: {
          id: editing.id,
          slug: editing.slug.trim(),
          name: editing.name.trim(),
          description: editing.description.trim() || undefined,
          icon: editing.icon.trim() || undefined,
          orderIndex: editing.orderIndex,
          parentId: editing.parentId || null,
        },
      });
      toast.success(editing.id ? "Категория обновлена" : "Категория создана");
      setEditing(null);
      await reload();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(c: Category) {
    if (!confirm(`Удалить категорию «${c.name}»? Все темы в ней (и в подразделах) тоже удалятся.`)) return;
    try {
      await _delete({ data: { id: c.id } });
      toast.success("Категория удалена");
      await reload();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  // Only top-level categories are offered as a parent — keeps the tree at
  // exactly two levels (category → subforum) by construction, no cycle
  // detection needed. Editing an existing top-level category also drops
  // itself from the list (can't be its own parent).
  const parentOptions = categories.filter((c) => !c.parent_id && c.id !== editing?.id);
  const byParent = new Map<string | null, Category[]>();
  for (const c of categories) {
    const key = c.parent_id ?? null;
    byParent.set(key, [...(byParent.get(key) ?? []), c]);
  }
  const topLevel = (byParent.get(null) ?? []).slice().sort((a, b) => a.order_index - b.order_index);

  function openEdit(c: Category) {
    setEditing({
      id: c.id,
      slug: c.slug,
      name: c.name,
      description: c.description ?? "",
      icon: c.icon ?? "💬",
      orderIndex: c.order_index,
      parentId: c.parent_id ?? "",
    });
  }

  function Row({ c, indented }: { c: Category; indented?: boolean }) {
    return (
      <div className={`panel flex items-center gap-3 rounded-xl p-4 ${indented ? "ml-6" : ""}`}>
        {indented && <CornerDownRight className="h-4 w-4 shrink-0 text-muted-foreground" />}
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-secondary text-xl">{c.icon ?? "💬"}</span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold">{c.name}</h3>
            <span className="font-mono text-[10px] text-muted-foreground">/{c.slug}</span>
          </div>
          {c.description && <p className="truncate text-xs text-muted-foreground">{c.description}</p>}
        </div>
        <span className="font-mono text-[11px] text-muted-foreground">{c.thread_count} тем</span>
        <button onClick={() => openEdit(c)} className="rounded p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground" title="Редактировать">
          <Pencil className="h-3.5 w-3.5" />
        </button>
        <button onClick={() => remove(c)} className="rounded p-1.5 text-muted-foreground hover:bg-destructive/20 hover:text-destructive" title="Удалить">
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-lg bg-cyan/10 text-cyan">
            <MessagesSquare className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Категории форума</h1>
            <p className="text-xs text-muted-foreground">Создание, правка и удаление разделов и подразделов форума.</p>
          </div>
        </div>
        <button
          onClick={() => setEditing({ ...EMPTY, orderIndex: categories.length + 1 })}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground"
        >
          <Plus className="h-3.5 w-3.5" /> Новая категория
        </button>
      </div>

      {editing && (
        <div className="mt-6 rounded-xl border border-mint/40 bg-mint/5 p-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">{editing.id ? "Редактировать категорию" : "Новая категория"}</h3>
            <button onClick={() => setEditing(null)} className="rounded p-1 text-muted-foreground hover:bg-secondary">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div>
              <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Название</label>
              <input
                value={editing.name}
                onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                className="mt-1 w-full rounded border border-input bg-background px-2.5 py-1.5 text-sm outline-none"
                placeholder="Микс"
              />
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Slug (латиница, -)</label>
              <input
                value={editing.slug}
                onChange={(e) => setEditing({ ...editing, slug: e.target.value })}
                className="mt-1 w-full rounded border border-input bg-background px-2.5 py-1.5 text-sm outline-none"
                placeholder="mix"
              />
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Иконка (эмодзи)</label>
              <input
                value={editing.icon}
                onChange={(e) => setEditing({ ...editing, icon: e.target.value })}
                className="mt-1 w-full rounded border border-input bg-background px-2.5 py-1.5 text-sm outline-none"
                placeholder="🎛"
              />
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Порядок</label>
              <input
                type="number"
                value={editing.orderIndex}
                onChange={(e) => setEditing({ ...editing, orderIndex: Number(e.target.value) || 0 })}
                className="mt-1 w-full rounded border border-input bg-background px-2.5 py-1.5 text-sm outline-none"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Родительская категория (необязательно)</label>
              <select
                value={editing.parentId}
                onChange={(e) => setEditing({ ...editing, parentId: e.target.value })}
                className="mt-1 w-full rounded border border-input bg-background px-2.5 py-1.5 text-sm outline-none"
              >
                <option value="">— Верхний уровень —</option>
                {parentOptions.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
              <p className="mt-1 text-[10px] text-muted-foreground">Если выбрать родителя, эта категория станет подразделом (вложенным разделом) внутри него.</p>
            </div>
            <div className="sm:col-span-2">
              <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Описание</label>
              <textarea
                value={editing.description}
                onChange={(e) => setEditing({ ...editing, description: e.target.value })}
                rows={2}
                className="mt-1 w-full resize-none rounded border border-input bg-background px-2.5 py-1.5 text-sm outline-none"
              />
            </div>
          </div>
          <div className="mt-3 flex justify-end gap-2">
            <button onClick={() => setEditing(null)} className="rounded border border-border bg-secondary px-3 py-1.5 text-xs">Отмена</button>
            <button
              onClick={save}
              disabled={busy || !editing.slug.trim() || !editing.name.trim()}
              className="inline-flex items-center gap-1.5 rounded bg-mint px-3 py-1.5 text-xs font-bold text-black disabled:opacity-50"
            >
              {busy && <Loader2 className="h-3 w-3 animate-spin" />} Сохранить
            </button>
          </div>
        </div>
      )}

      <div className="mt-6 space-y-2">
        {loading ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Загрузка…</p>
        ) : categories.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Категорий пока нет.</p>
        ) : (
          topLevel.map((parent) => {
            const children = (byParent.get(parent.id) ?? []).slice().sort((a, b) => a.order_index - b.order_index);
            return (
              <div key={parent.id} className="space-y-2">
                <Row c={parent} />
                {children.map((c) => <Row key={c.id} c={c} indented />)}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
