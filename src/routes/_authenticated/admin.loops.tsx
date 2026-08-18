import { useEffect, useRef, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { Music2, Trash2, Upload, Loader2, Pause, Play, Waves, ExternalLink, Pin, PinOff, Scissors } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { RouteError, RouteNotFound } from "@/components/route-fallbacks";
import { AdminTabs } from "@/components/admin-tabs";
import { listActiveLoops, setPinnedLoopId, getPinnedLoopId } from "@/lib/games/loops";
import { LoopEditor } from "@/components/loop-editor";
import { RoleGate } from "@/components/role-gate";

export const Route = createFileRoute("/_authenticated/admin/loops")({
  head: () => ({ meta: [{ title: "Лупы для игр — MixPro" }, { name: "robots", content: "noindex" }] }),
  component: () => (
    <RoleGate role="admin">
      <AdminLoopsPage />
    </RoleGate>
  ),
  errorComponent: RouteError,
  notFoundComponent: RouteNotFound,
});

type Loop = {
  id: string;
  title: string;
  storage_path: string;
  category: string;
  bpm: number | null;
  key: string | null;
  duration_seconds: number | null;
  is_active: boolean;
  created_at: string;
};

const CATEGORIES = ["mix", "drums", "bass", "chords", "vocals", "fx"] as const;

/** All ear-training routes that consume loops via the shared engine. */
const TRAINERS: { to: string; label: string; section: string }[] = [
  { to: "/games/frequency",          label: "EQ Peak · частоты",      section: "EQ" },
  { to: "/games/eq-cut",             label: "EQ Cut · вырез",         section: "EQ" },
  { to: "/games/ear-eq",             label: "Найди изменение",         section: "EQ" },
  { to: "/games/filter-type",        label: "Filter Type",             section: "EQ" },
  { to: "/games/db-quiz",            label: "dB Quiz",                 section: "Level" },
  { to: "/games/db-pro",             label: "dB Pro",                  section: "Level" },
  { to: "/games/pan",                label: "Pan",                     section: "Level" },
  { to: "/games/compressor-ratio",   label: "Comp Ratio",              section: "Dyn" },
  { to: "/games/compressor-attack",  label: "Comp Attack",             section: "Dyn" },
  { to: "/games/compressor-release", label: "Comp Release",            section: "Dyn" },
  { to: "/games/compression",        label: "Comp Sculpt",             section: "Dyn" },
  { to: "/games/distortion",         label: "Distortion",              section: "FX" },
  { to: "/games/delay-time",         label: "Delay Time",              section: "FX" },
  { to: "/games/reverb",             label: "Reverb",                  section: "FX" },
];

function fmtDuration(s: number | null) {
  if (!s) return "—";
  const m = Math.floor(s / 60);
  const r = Math.floor(s % 60);
  return `${m}:${r.toString().padStart(2, "0")}`;
}
function fmtSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

async function decodeDuration(file: File): Promise<number | null> {
  try {
    const ac = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    const buf = await file.arrayBuffer();
    const decoded = await ac.decodeAudioData(buf);
    ac.close();
    return decoded.duration;
  } catch { return null; }
}

function AdminLoopsPage() {
  const { user } = Route.useRouteContext();
  const [allowed, setAllowed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loops, setLoops] = useState<Loop[]>([]);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]>("mix");
  const [bpm, setBpm] = useState<string>("");
  const [keyName, setKeyName] = useState("");
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [pinnedId, setPinnedId] = useState<string | null>(null);
  const [rowTarget, setRowTarget] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState<Loop | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const navigate = useNavigate();

  useEffect(() => { setPinnedId(getPinnedLoopId()); }, []);

  function openInTrainer(loop: Loop, to: string) {
    setPinnedLoopId(loop.id);
    setPinnedId(loop.id);
    toast.success(`Луп «${loop.title}» закреплён — открываю тренажёр`);
    // For the frequency trainer we also pass the URL param so its Settings UI
    // reflects the choice; other trainers read the pin from sessionStorage.
    if (to === "/games/frequency") {
      navigate({ to: "/games/frequency", search: { loopId: loop.id } });
    } else {
      navigate({ to });
    }
  }

  function unpin() {
    setPinnedLoopId(null);
    setPinnedId(null);
    toast.message("Закреплённый луп снят — тренажёры вернутся к автоподбору");
  }

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", user.id);
      const rs = (roles ?? []).map((r) => r.role as string);
      if (!alive) return;
      const canMod = rs.some((r) => ["moderator", "admin", "super_admin"].includes(r));
      setAllowed(canMod);
      if (canMod) {
        const { data } = await supabase
          .from("game_loops")
          .select("*")
          .order("created_at", { ascending: false });
        if (alive) setLoops((data ?? []) as Loop[]);
      }
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [user.id]);

  async function handleFiles(files: FileList | File[]) {
    const arr = Array.from(files);
    if (!arr.length) return;
    setUploading(true);
    try {
      for (const file of arr) {
        setProgress(0);
        const duration = await decodeDuration(file);
        const cleanName = file.name.replace(/[^\w.\-]+/g, "_");
        const path = `${category}/${Date.now()}_${cleanName}`;
        const { error: upErr } = await supabase.storage
          .from("game-loops")
          .upload(path, file, { contentType: file.type || "audio/wav", upsert: false });
        if (upErr) throw upErr;
        setProgress(70);
        const title = file.name.replace(/\.[^.]+$/, "");
        const { data: row, error: insErr } = await supabase
          .from("game_loops")
          .insert({
            title,
            storage_path: path,
            category,
            bpm: bpm ? Number(bpm) : null,
            key: keyName || null,
            duration_seconds: duration,
            uploaded_by: user.id,
          })
          .select()
          .single();
        if (insErr) throw insErr;
        setProgress(100);
        setLoops((prev) => [row as Loop, ...prev]);
        toast.success(`Загружено: ${title} (${fmtSize(file.size)})`);
      }
      // reset the loop cache so new file is picked up by games
      await listActiveLoops(true);
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : "Ошибка загрузки");
    } finally {
      setUploading(false);
      setProgress(0);
    }
  }

  async function toggleActive(loop: Loop) {
    const { error } = await supabase
      .from("game_loops")
      .update({ is_active: !loop.is_active })
      .eq("id", loop.id);
    if (error) { toast.error(error.message); return; }
    setLoops((prev) => prev.map((l) => l.id === loop.id ? { ...l, is_active: !l.is_active } : l));
    await listActiveLoops(true);
  }

  async function removeLoop(loop: Loop) {
    if (!confirm(`Удалить луп "${loop.title}"?`)) return;
    const { error: sErr } = await supabase.storage.from("game-loops").remove([loop.storage_path]);
    if (sErr) { toast.error(sErr.message); return; }
    const { error } = await supabase.from("game_loops").delete().eq("id", loop.id);
    if (error) { toast.error(error.message); return; }
    setLoops((prev) => prev.filter((l) => l.id !== loop.id));
    await listActiveLoops(true);
  }

  async function preview(loop: Loop) {
    if (playingId === loop.id) {
      audioRef.current?.pause();
      setPlayingId(null);
      return;
    }
    const { data, error } = await supabase.storage
      .from("game-loops")
      .createSignedUrl(loop.storage_path, 60 * 10);
    if (error || !data?.signedUrl) { toast.error("Не удалось получить ссылку"); return; }
    if (!audioRef.current) audioRef.current = new Audio();
    audioRef.current.src = data.signedUrl;
    audioRef.current.onended = () => setPlayingId(null);
    try {
      await audioRef.current.play();
      setPlayingId(loop.id);
    } catch (e) {
      toast.error("Не удалось воспроизвести превью");
      setPlayingId(null);
    }
  }

  if (loading) return <div className="mx-auto max-w-6xl px-4 py-10 text-muted-foreground">Загрузка…</div>;
  if (!allowed) return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <div className="rounded-md border border-border bg-panel p-6 text-muted-foreground">
        Доступ только для модераторов и админов.
      </div>
    </div>
  );

  return (
    <div className="mx-auto max-w-6xl space-y-4 px-4 py-6">
      <AdminTabs active="loops" />

      <div className="flex items-center gap-3">
        <div className="grid h-10 w-10 place-items-center rounded-md border border-mint/40 bg-mint/10 text-mint">
          <Music2 className="h-5 w-5" />
        </div>
        <div className="flex-1">
          <h1 className="text-lg font-semibold">Библиотека лупов — источник для тренажёров</h1>
          <p className="text-xs text-muted-foreground">
            Загружай сюда dry-loops (WAV/MP3). Любой активный (<b>ON</b>) луп сразу становится источником
            сигнала для тренажёров. Выбери тренажёр в списке напротив лупа — луп «закрепится» и будет
            использоваться во всех играх до тех пор, пока ты не снимешь закрепление.
          </p>
        </div>
        {pinnedId && (
          <button
            onClick={unpin}
            className="inline-flex items-center gap-1 rounded-md border border-mint/40 bg-mint/10 px-2 py-1 text-[11px] font-semibold text-mint hover:bg-mint/20"
            title="Снять закреплённый луп со всех тренажёров"
          >
            <PinOff className="h-3 w-3" />
            Открепить
          </button>
        )}
      </div>

      <div className="rounded-md border border-mint/30 bg-mint/5 p-3 text-xs text-mint/90">
        <b>Как пользоваться:</b> 1) загрузи файл ниже → 2) в строке лупа выбери нужный тренажёр в
        выпадающем списке → 3) нажми «Открыть» — луп закрепится (<Pin className="inline h-3 w-3 -mt-0.5" />)
        и будет играть во всех тренажёрах, куда бы ты ни зашёл. Кнопка «Открепить» сверху вернёт
        автоподбор лупов по категории.
      </div>




      <div className="rounded-md border border-border bg-panel p-4">
        <div className="mb-3 grid grid-cols-1 gap-3 md:grid-cols-4">
          <label className="space-y-1 text-xs">
            <div className="text-muted-foreground">Категория</div>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as (typeof CATEGORIES)[number])}
              className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm"
            >
              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
          <label className="space-y-1 text-xs">
            <div className="text-muted-foreground">BPM (опц.)</div>
            <input
              type="number"
              value={bpm}
              onChange={(e) => setBpm(e.target.value)}
              placeholder="100"
              className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm"
            />
          </label>
          <label className="space-y-1 text-xs">
            <div className="text-muted-foreground">Тональность (опц.)</div>
            <input
              value={keyName}
              onChange={(e) => setKeyName(e.target.value)}
              placeholder="Cm"
              className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm"
            />
          </label>
          <div className="flex items-end">
            <label className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-md border border-mint/40 bg-mint/10 px-3 py-2 text-sm font-semibold text-mint hover:bg-mint/20">
              {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              {uploading ? `Загрузка ${progress}%` : "Загрузить файлы"}
              <input
                type="file"
                accept="audio/*"
                multiple
                disabled={uploading}
                onChange={(e) => e.target.files && handleFiles(e.target.files)}
                className="hidden"
              />
            </label>
          </div>
        </div>
        {uploading && (
          <div className="h-1 w-full overflow-hidden rounded bg-secondary">
            <div className="h-full bg-mint transition-all" style={{ width: `${progress}%` }} />
          </div>
        )}
      </div>

      <div className="rounded-md border border-border bg-panel">
        <div className="grid grid-cols-[1fr_80px_60px_60px_80px_320px] gap-2 border-b border-border px-3 py-2 text-[10px] uppercase tracking-widest text-muted-foreground">
          <div>Название</div>
          <div>Категория</div>
          <div>BPM</div>
          <div>Тон.</div>
          <div>Длит.</div>
          <div className="text-right">Открыть в тренажёре / действия</div>
        </div>
        {loops.length === 0 && (
          <div className="p-6 text-sm text-muted-foreground">
            Пока нет загруженных лупов. Загрузите первый файл — он сразу станет доступен играм.
          </div>
        )}
        {loops.map((l) => {
          const isPinned = pinnedId === l.id;
          const target = rowTarget[l.id] ?? "/games/frequency";
          return (
            <div key={l.id} className={`grid grid-cols-[1fr_80px_60px_60px_80px_320px] items-center gap-2 border-b border-border/60 px-3 py-2 text-sm last:border-b-0 ${isPinned ? "bg-mint/5" : ""}`}>
              <div className="flex items-center gap-2 truncate">
                <button
                  onClick={() => preview(l)}
                  className="grid h-7 w-7 place-items-center rounded-md border border-border bg-background hover:border-mint/50 hover:text-mint"
                  title={playingId === l.id ? "Пауза" : "Прослушать"}
                >
                  {playingId === l.id ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                </button>
                {isPinned && <Pin className="h-3 w-3 shrink-0 text-mint" aria-label="Закреплён" />}
                <span className={`truncate ${l.is_active ? "" : "text-muted-foreground line-through"}`}>{l.title}</span>
              </div>
              <div className="text-xs text-muted-foreground">{l.category}</div>
              <div className="text-xs text-muted-foreground">{l.bpm ?? "—"}</div>
              <div className="text-xs text-muted-foreground">{l.key ?? "—"}</div>
              <div className="text-xs text-muted-foreground">{fmtDuration(l.duration_seconds)}</div>
              <div className="flex justify-end gap-1">
                <select
                  value={target}
                  onChange={(e) => setRowTarget((s) => ({ ...s, [l.id]: e.target.value }))}
                  disabled={!l.is_active}
                  className="max-w-[170px] rounded-md border border-border bg-background px-2 py-1 text-[11px] disabled:opacity-50"
                  title="Куда применить этот луп"
                >
                  {["EQ", "Level", "Dyn", "FX"].map((sec) => (
                    <optgroup key={sec} label={sec}>
                      {TRAINERS.filter((t) => t.section === sec).map((t) => (
                        <option key={t.to} value={t.to}>{t.label}</option>
                      ))}
                    </optgroup>
                  ))}
                </select>
                <button
                  onClick={() => openInTrainer(l, target)}
                  disabled={!l.is_active}
                  className="inline-flex items-center gap-1 rounded-md border border-mint/40 bg-mint/10 px-2 py-1 text-[11px] font-semibold text-mint hover:bg-mint/20 disabled:pointer-events-none disabled:opacity-50"
                  title={l.is_active ? "Закрепить луп и открыть выбранный тренажёр" : "Активируйте луп (ON), чтобы использовать в тренажёре"}
                >
                  <Waves className="h-3 w-3" />
                  Открыть
                  <ExternalLink className="h-3 w-3 opacity-60" />
                </button>
                <button
                  onClick={() => toggleActive(l)}
                  className={`rounded-md border px-2 py-1 text-[11px] font-semibold ${
                    l.is_active
                      ? "border-mint/40 bg-mint/10 text-mint"
                      : "border-border text-muted-foreground"
                  }`}
                >
                  {l.is_active ? "ON" : "OFF"}
                </button>
                <button
                  onClick={() => setEditing(l)}
                  className="grid h-7 w-7 place-items-center rounded-md border border-border text-muted-foreground hover:border-mint/50 hover:text-mint"
                  title="Переименовать / обрезать"
                >
                  <Scissors className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => removeLoop(l)}
                  className="grid h-7 w-7 place-items-center rounded-md border border-border text-muted-foreground hover:border-red-500/50 hover:text-red-400"
                  title="Удалить"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {editing && (
        <LoopEditor
          loop={editing}
          onClose={() => setEditing(null)}
          onUpdated={(patch) => {
            setLoops((prev) => prev.map((x) => x.id === editing.id ? { ...x, ...patch } as Loop : x));
            setEditing((cur) => cur ? { ...cur, ...patch } as Loop : cur);
          }}
        />
      )}
    </div>
  );
}
