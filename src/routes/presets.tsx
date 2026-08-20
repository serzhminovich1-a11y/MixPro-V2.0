import { useEffect, useRef, useState } from "react";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { SlidersHorizontal, Download, Upload, X, Lock, MessageSquare, Loader2 } from "lucide-react";
import { getPresets } from "@/lib/public.functions";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useSubscription } from "@/hooks/use-subscription";
import { PremiumBadge } from "@/components/premium-paywall";
import { RouteError, RouteNotFound } from "@/components/route-fallbacks";
import { resolveStorageUrl } from "@/lib/storage-url";
import { uploadWithProgress } from "@/lib/upload-progress";
import { StarRating, StarPicker } from "@/components/star-rating";


const presetsQuery = queryOptions({ queryKey: ["presets"], queryFn: () => getPresets() });

export const Route = createFileRoute("/presets")({
  head: () => ({
    meta: [
      { title: "Пресеты для DAW — MixPro" },
      { name: "description", content: "Каталог пресетов от сообщества: FL Studio, Ableton, Logic Pro, Cubase. Скачивай и делись своими." },
      { property: "og:title", content: "Пресеты для DAW — MixPro" },
      { property: "og:description", content: "Каталог пресетов от сообщества звукорежиссёров." },
    ],
  }),
  loader: ({ context }) => {
    context.queryClient.ensureQueryData(presetsQuery);
  },
  component: PresetsPage,
  errorComponent: RouteError,
  notFoundComponent: RouteNotFound,
});

const DAWS = ["FL Studio", "Ableton Live", "Logic Pro", "Cubase", "Pro Tools", "Reaper", "Studio One", "Другое"];

function PresetsPage() {
  const { data } = useSuspenseQuery(presetsQuery);
  const { session } = useAuth();
  const sub = useSubscription();

  const [dawFilter, setDawFilter] = useState<string | null>(null);
  const [showUpload, setShowUpload] = useState(false);
  const [reviewsFor, setReviewsFor] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const router = useRouter();

  const filtered = dawFilter ? data.presets.filter((p) => p.daw === dawFilter) : data.presets;

  async function handleDownload(preset: (typeof data.presets)[number]) {
    if (!session) return;
    if (!preset.file_url) return;
    if ((preset as { is_premium?: boolean }).is_premium && !sub.active) return;
    await supabase.rpc("increment_downloads", { _preset_id: preset.id });
    const url = await resolveStorageUrl("presets", preset.file_url, "presets");
    if (url) window.open(url, "_blank");
    queryClient.invalidateQueries({ queryKey: ["presets"] });

    router.invalidate();
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-16">
      <div className="text-center">
        <SlidersHorizontal className="mx-auto h-10 w-10 text-mint" />
        <h1 className="mt-4 text-3xl font-bold md:text-4xl">Пресеты</h1>
        <p className="mx-auto mt-2 max-w-lg text-muted-foreground">
          Пресеты от сообщества для любых DAW. Делись своими наработками и качай чужие.
        </p>
        {session && (
          <button
            onClick={() => setShowUpload(true)}
            className="mt-6 inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground transition-transform hover:scale-105"
          >
            <Upload className="h-4 w-4" /> Загрузить пресет
          </button>
        )}
      </div>

      <div className="mt-10 flex flex-wrap justify-center gap-2">
        <button
          onClick={() => setDawFilter(null)}
          className={`rounded-full px-4 py-1.5 text-sm transition-colors ${!dawFilter ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground"}`}
        >
          Все
        </button>
        {DAWS.map((d) => (
          <button
            key={d}
            onClick={() => setDawFilter(d === dawFilter ? null : d)}
            className={`rounded-full px-4 py-1.5 text-sm transition-colors ${dawFilter === d ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground"}`}
          >
            {d}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <p className="mt-16 text-center text-muted-foreground">
          Пока нет пресетов{dawFilter ? ` для ${dawFilter}` : ""}. Будь первым, кто поделится!
        </p>
      ) : (
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((preset) => {
            const isPremium = (preset as { is_premium?: boolean }).is_premium === true;
            const locked = isPremium && !sub.active;
            return (
            <div key={preset.id} className={`glass flex flex-col rounded-2xl p-6 ${locked ? "opacity-80" : ""}`}>
              <div className="flex items-center justify-between gap-2">
                <span className="rounded-full bg-secondary px-3 py-1 text-xs font-semibold text-cyan">{preset.daw}</span>
                <div className="flex items-center gap-2">
                  {isPremium && <PremiumBadge />}
                  {preset.genre && <span className="text-xs text-muted-foreground">{preset.genre}</span>}
                </div>
              </div>
              <h3 className="mt-3 text-lg font-semibold">{preset.title}</h3>
              {preset.description && <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{preset.description}</p>}
              <button
                type="button"
                onClick={() => setReviewsFor(preset.id)}
                className="mt-2 inline-flex items-center gap-1.5 self-start text-xs text-muted-foreground hover:text-foreground"
              >
                {preset.avgRating != null ? (
                  <>
                    <StarRating value={preset.avgRating} size={12} />
                    <span className="font-mono">{preset.avgRating.toFixed(1)}</span>
                    <span>({preset.reviewCount})</span>
                  </>
                ) : (
                  <>
                    <MessageSquare className="h-3 w-3" /> Оставить отзыв
                  </>
                )}
              </button>
              <div className="mt-auto flex items-center justify-between pt-4">
                <span className="text-xs text-muted-foreground">
                  {preset.author?.username ?? "Аноним"} · {preset.downloads} ⬇
                </span>
                {session ? (
                  preset.file_url ? (
                    locked ? (
                      <span className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500/20 px-3 py-1.5 text-xs font-semibold text-amber-300">
                        <Lock className="h-3.5 w-3.5" /> Только по подписке
                      </span>
                    ) : (
                      <button
                        onClick={() => handleDownload(preset)}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:scale-105"
                      >
                        <Download className="h-3.5 w-3.5" /> Скачать
                      </button>
                    )
                  ) : (
                    <span className="text-xs text-muted-foreground">Нет файла</span>
                  )
                ) : (
                  <Link to="/auth" className="text-xs text-primary hover:underline">
                    Войти для скачивания
                  </Link>
                )}
              </div>
            </div>
            );
          })}

        </div>
      )}

      {showUpload && session && <UploadModal onClose={() => setShowUpload(false)} userId={session.user.id} />}
      {reviewsFor && (
        <ReviewsModal
          presetId={reviewsFor}
          userId={session?.user.id ?? null}
          onClose={() => setReviewsFor(null)}
          onChanged={() => { queryClient.invalidateQueries({ queryKey: ["presets"] }); router.invalidate(); }}
        />
      )}
    </div>
  );
}

type Review = { id: string; author_id: string; rating: number; content: string | null; created_at: string; author: { username: string } | null };

function ReviewsModal({ presetId, userId, onClose, onChanged }: { presetId: string; userId: string | null; onClose: () => void; onChanged: () => void }) {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [myRating, setMyRating] = useState(0);
  const [myContent, setMyContent] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data } = await supabase
        .from("preset_reviews")
        .select("id, author_id, rating, content, created_at")
        .eq("preset_id", presetId)
        .order("created_at", { ascending: false });
      if (!alive) return;
      if (!data) { setLoading(false); return; }
      const authorIds = [...new Set(data.map((r) => r.author_id))];
      const { data: profs } = authorIds.length
        ? await supabase.from("profiles").select("id, username").in("id", authorIds)
        : { data: [] as { id: string; username: string }[] };
      const map = new Map((profs ?? []).map((p) => [p.id, p]));
      const built = data.map((r) => ({ ...r, author: map.get(r.author_id) ?? null }));
      setReviews(built);
      const mine = built.find((r) => r.author_id === userId);
      if (mine) { setMyRating(mine.rating); setMyContent(mine.content ?? ""); }
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [presetId, userId]);

  async function submit() {
    if (!userId || myRating === 0) return;
    setSaving(true);
    const { error } = await supabase
      .from("preset_reviews")
      .upsert({ preset_id: presetId, author_id: userId, rating: myRating, content: myContent.trim() || null }, { onConflict: "preset_id,author_id" });
    setSaving(false);
    if (!error) {
      onChanged();
      onClose();
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="glass max-h-[85vh] w-full max-w-md overflow-y-auto rounded-2xl p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">Отзывы</h2>
          <button onClick={onClose} aria-label="Закрыть"><X className="h-5 w-5" /></button>
        </div>

        {userId && (
          <div className="mt-4 rounded-xl border border-border bg-secondary/30 p-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">Твой отзыв</p>
            <StarPicker value={myRating} onChange={setMyRating} />
            <textarea
              value={myContent}
              onChange={(e) => setMyContent(e.target.value)}
              placeholder="Что понравилось или нет? (необязательно)"
              rows={2}
              maxLength={500}
              className="mt-2 w-full resize-none rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
            <button
              onClick={submit}
              disabled={saving || myRating === 0}
              className="mt-2 inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null} Сохранить
            </button>
          </div>
        )}

        <div className="mt-4 space-y-3">
          {loading ? (
            <p className="text-sm text-muted-foreground">Загрузка…</p>
          ) : reviews.length === 0 ? (
            <p className="text-sm text-muted-foreground">Пока нет отзывов. Будь первым!</p>
          ) : (
            reviews.map((r) => (
              <div key={r.id} className="border-t border-border/60 pt-3 first:border-t-0 first:pt-0">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold">{r.author?.username ?? "Аноним"}</span>
                  <StarRating value={r.rating} />
                </div>
                {r.content && <p className="mt-1 text-sm text-foreground/80">{r.content}</p>}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function UploadModal({ onClose, userId }: { onClose: () => void; userId: string }) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [daw, setDaw] = useState(DAWS[0]);
  const [genre, setGenre] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const file = fileRef.current?.files?.[0];
      let filePath: string | null = null;
      if (file) {
        if (file.size > 20 * 1024 * 1024) throw new Error("Файл больше 20 МБ.");
        const { error: upErr, path } = await uploadWithProgress("presets", file.name, file, { contentType: file.type });
        if (upErr) throw upErr;
        filePath = path ?? null;
      }
      const { error: insErr } = await supabase.from("presets").insert({
        author_id: userId,
        title,
        description: description || null,
        daw,
        genre: genre || null,
        file_url: filePath,
      });
      if (insErr) throw insErr;
      queryClient.invalidateQueries({ queryKey: ["presets"] });
      router.invalidate();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось загрузить.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="glass w-full max-w-md rounded-2xl p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">Загрузить пресет</h2>
          <button onClick={onClose} aria-label="Закрыть"><X className="h-5 w-5" /></button>
        </div>
        <form onSubmit={handleSubmit} className="mt-4 space-y-3">
          <input
            required
            placeholder="Название"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full rounded-xl border border-input bg-background px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
          <textarea
            placeholder="Описание (необязательно)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            className="w-full rounded-xl border border-input bg-background px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
          <select
            value={daw}
            onChange={(e) => setDaw(e.target.value)}
            className="w-full rounded-xl border border-input bg-background px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring"
          >
            {DAWS.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
          <input
            placeholder="Жанр (необязательно)"
            value={genre}
            onChange={(e) => setGenre(e.target.value)}
            className="w-full rounded-xl border border-input bg-background px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
          <input ref={fileRef} type="file" className="w-full text-sm text-muted-foreground" />
          {error && <p className="text-sm text-destructive">{error}</p>}
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground disabled:opacity-50"
          >
            {busy ? "Загружаем..." : "Опубликовать"}
          </button>
        </form>
      </div>
    </div>
  );
}
