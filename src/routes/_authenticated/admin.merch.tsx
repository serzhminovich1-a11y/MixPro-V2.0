import { useEffect, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { ShoppingBag, Trash2, ImagePlus, Pencil, Check, X, Eye, EyeOff } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { RouteError, RouteNotFound } from "@/components/route-fallbacks";
import { RoleGate } from "@/components/role-gate";
import { BannerImage } from "@/components/banner-image";
import { ImageEditor } from "@/components/image-editor";
import { uploadWithProgress, removeStorageObjects } from "@/lib/upload-progress";

export const Route = createFileRoute("/_authenticated/admin/merch")({
  head: () => ({ meta: [{ title: "Магазин · управление — MixPro" }, { name: "robots", content: "noindex" }] }),
  component: () => (
    <RoleGate role="moderator">
      <AdminMerchPage />
    </RoleGate>
  ),
  errorComponent: RouteError,
  notFoundComponent: RouteNotFound,
});

type MerchItem = Tables<"merch_items">;
const EMPTY_FORM = { name: "", description: "", price_label: "", category: "", is_active: true, sort_order: 0 };

function AdminMerchPage() {
  const [items, setItems] = useState<MerchItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<MerchItem | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [pendingImage, setPendingImage] = useState<File | null>(null);
  const [uploadedImagePath, setUploadedImagePath] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [saving, setSaving] = useState(false);
  const imageInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    const { data } = await supabase.from("merch_items").select("*").order("sort_order", { ascending: true }).order("created_at", { ascending: false });
    setItems((data ?? []) as MerchItem[]);
    setLoading(false);
  }

  function startCreate() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setUploadedImagePath(null);
    setShowForm(true);
  }

  function startEdit(item: MerchItem) {
    setEditing(item);
    setForm({
      name: item.name,
      description: item.description ?? "",
      price_label: item.price_label,
      category: item.category ?? "",
      is_active: item.is_active,
      sort_order: item.sort_order,
    });
    setUploadedImagePath(item.image_url);
    setShowForm(true);
  }

  function onImagePick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 12 * 1024 * 1024) { toast.error("Файл больше 12 МБ"); return; }
    setPendingImage(file);
    if (imageInputRef.current) imageInputRef.current.value = "";
  }

  async function uploadImageBlob(blob: Blob) {
    setUploadingImage(true);
    const { error, path } = await uploadWithProgress("merch", "photo.jpg", blob, { contentType: "image/jpeg" });
    setUploadingImage(false);
    setPendingImage(null);
    if (error || !path) { toast.error("Не удалось загрузить фото"); return; }
    const oldPath = uploadedImagePath;
    setUploadedImagePath(path);
    if (oldPath) removeStorageObjects([oldPath]);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSaving(true);
    const payload = {
      name: form.name.trim(),
      description: form.description.trim() || null,
      price_label: form.price_label.trim(),
      category: form.category.trim() || null,
      is_active: form.is_active,
      sort_order: form.sort_order,
      image_url: uploadedImagePath,
    };
    const { error } = editing
      ? await supabase.from("merch_items").update(payload).eq("id", editing.id)
      : await supabase.from("merch_items").insert(payload);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success(editing ? "Товар обновлён" : "Товар добавлен");
    setShowForm(false);
    load();
  }

  async function toggleActive(item: MerchItem) {
    const { error } = await supabase.from("merch_items").update({ is_active: !item.is_active }).eq("id", item.id);
    if (error) { toast.error(error.message); return; }
    setItems((prev) => prev.map((i) => i.id === item.id ? { ...i, is_active: !i.is_active } : i));
  }

  async function remove(item: MerchItem) {
    if (!confirm(`Удалить «${item.name}»?`)) return;
    if (item.image_url) removeStorageObjects([item.image_url]);
    const { error } = await supabase.from("merch_items").delete().eq("id", item.id);
    if (error) { toast.error(error.message); return; }
    setItems((prev) => prev.filter((i) => i.id !== item.id));
  }

  return (
    <div className="mx-auto max-w-5xl space-y-4 px-4 py-6">
      <div className="flex items-center gap-3">
        <div className="grid h-10 w-10 place-items-center rounded-md border border-mint/40 bg-mint/10 text-mint">
          <ShoppingBag className="h-5 w-5" />
        </div>
        <div className="flex-1">
          <h1 className="text-lg font-semibold">Магазин мерча</h1>
          <p className="text-xs text-muted-foreground">
            Каталог-витрина без онлайн-оплаты — покупатель пишет в поддержку. price_label — просто текст на карточке («1990 ₽», «По запросу»), не реальная оплата.
          </p>
        </div>
        <button
          onClick={startCreate}
          className="inline-flex items-center gap-1.5 rounded-md border border-mint/40 bg-mint/10 px-3 py-2 text-sm font-semibold text-mint hover:bg-mint/20"
        >
          <ShoppingBag className="h-4 w-4" /> Добавить товар
        </button>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Загрузка…</p>
      ) : items.length === 0 ? (
        <div className="rounded-md border border-border bg-panel p-6 text-sm text-muted-foreground">Пока нет товаров.</div>
      ) : (
        <div className="rounded-md border border-border bg-panel">
          {items.map((item) => (
            <div key={item.id} className="flex items-center gap-3 border-b border-border/60 p-3 last:border-b-0">
              <div className="h-12 w-12 shrink-0 overflow-hidden rounded-md bg-secondary">
                {item.image_url ? <BannerImage path={item.image_url} className="h-full w-full object-cover" /> : null}
              </div>
              <div className="min-w-0 flex-1">
                <p className={`truncate text-sm font-semibold ${item.is_active ? "" : "text-muted-foreground line-through"}`}>{item.name}</p>
                <p className="truncate text-xs text-muted-foreground">{item.category ?? "Без категории"} · {item.price_label || "без цены"}</p>
              </div>
              <button onClick={() => toggleActive(item)} className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-semibold ${item.is_active ? "border-mint/40 bg-mint/10 text-mint" : "border-border text-muted-foreground"}`}>
                {item.is_active ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />} {item.is_active ? "Виден" : "Скрыт"}
              </button>
              <button onClick={() => startEdit(item)} className="grid h-8 w-8 place-items-center rounded-md border border-border text-muted-foreground hover:border-mint/50 hover:text-mint" title="Редактировать">
                <Pencil className="h-3.5 w-3.5" />
              </button>
              <button onClick={() => remove(item)} className="grid h-8 w-8 place-items-center rounded-md border border-border text-muted-foreground hover:border-red-500/50 hover:text-red-400" title="Удалить">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm" onClick={() => setShowForm(false)}>
          <form onSubmit={save} className="glass w-full max-w-md rounded-2xl p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold">{editing ? "Редактировать товар" : "Новый товар"}</h2>
              <button type="button" onClick={() => setShowForm(false)} aria-label="Закрыть"><X className="h-5 w-5" /></button>
            </div>

            <div className="mt-4 flex items-center gap-3">
              <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-lg border border-border bg-secondary">
                {uploadedImagePath && <BannerImage path={uploadedImagePath} className="h-full w-full object-cover" />}
              </div>
              <button type="button" onClick={() => imageInputRef.current?.click()} disabled={uploadingImage}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold hover:bg-secondary disabled:opacity-50">
                <ImagePlus className="h-3.5 w-3.5" /> {uploadingImage ? "Загрузка…" : "Фото товара"}
              </button>
              <input ref={imageInputRef} type="file" accept="image/*" className="hidden" onChange={onImagePick} />
            </div>
            {pendingImage && (
              <ImageEditor
                file={pendingImage}
                defaultAspect="1:1"
                maxOutput={1200}
                onCancel={() => setPendingImage(null)}
                onConfirm={uploadImageBlob}
              />
            )}

            <div className="mt-4 space-y-3">
              <input
                required
                placeholder="Название"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full rounded-xl border border-input bg-background px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring"
              />
              <textarea
                placeholder="Описание (необязательно)"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                rows={2}
                className="w-full rounded-xl border border-input bg-background px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring"
              />
              <div className="flex gap-2">
                <input
                  placeholder="Цена (текст: «1990 ₽»)"
                  value={form.price_label}
                  onChange={(e) => setForm({ ...form, price_label: e.target.value })}
                  className="w-full rounded-xl border border-input bg-background px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring"
                />
                <input
                  placeholder="Категория"
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value })}
                  className="w-full rounded-xl border border-input bg-background px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} className="h-4 w-4 rounded border-input" />
                Виден в каталоге
              </label>
            </div>

            <button
              type="submit"
              disabled={saving || uploadingImage}
              className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground disabled:opacity-50"
            >
              <Check className="h-4 w-4" /> {saving ? "Сохраняем…" : "Сохранить"}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
