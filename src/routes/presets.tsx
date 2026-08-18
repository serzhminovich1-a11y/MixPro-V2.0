import { useRef, useState } from "react";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { SlidersHorizontal, Download, Upload, X, Lock } from "lucide-react";
import { getPresets } from "@/lib/public.functions";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useSubscription } from "@/hooks/use-subscription";
import { PremiumBadge } from "@/components/premium-paywall";
import { RouteError, RouteNotFound } from "@/components/route-fallbacks";
import { resolveStorageUrl } from "@/lib/storage-url";
import { uploadWithProgress } from "@/lib/upload-progress";


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
