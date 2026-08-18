import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Loader2, Scissors, X, Save, Play, Pause } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { computePeaks, encodeWavSlice } from "@/lib/games/wav";
import { listActiveLoops } from "@/lib/games/loops";

export type LoopEditorLoop = {
  id: string;
  title: string;
  storage_path: string;
  category: string;
  duration_seconds: number | null;
};

type Props = {
  loop: LoopEditorLoop;
  onClose: () => void;
  onUpdated: (patch: Partial<LoopEditorLoop>) => void;
};

const BINS = 480;

export function LoopEditor({ loop, onClose, onUpdated }: Props) {
  const [title, setTitle] = useState(loop.title);
  const [buffer, setBuffer] = useState<AudioBuffer | null>(null);
  const [peaks, setPeaks] = useState<Float32Array | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [startSec, setStartSec] = useState(0);
  const [endSec, setEndSec] = useState(0);
  const [saving, setSaving] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const dragRef = useRef<null | "start" | "end">(null);

  const duration = buffer?.duration ?? 0;

  // Load & decode audio
  useEffect(() => {
    let alive = true;
    setLoadError(null);
    (async () => {
      const { data, error } = await supabase.storage
        .from("game-loops")
        .createSignedUrl(loop.storage_path, 60 * 30);
      if (error || !data?.signedUrl) {
        if (!alive) return;
        toast.error("Не удалось загрузить луп");
        setLoadError(error?.message ?? "Файл недоступен в хранилище");
        return;
      }
      if (!alive) return;
      setSignedUrl(data.signedUrl);
      try {
        const res = await fetch(data.signedUrl);
        const ab = await res.arrayBuffer();
        const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        const ac = new AC();
        const decoded = await ac.decodeAudioData(ab);
        ac.close();
        if (!alive) return;
        setBuffer(decoded);
        setPeaks(computePeaks(decoded, BINS));
        setStartSec(0);
        setEndSec(decoded.duration);
      } catch (e) {
        console.error(e);
        toast.error("Ошибка декодирования аудио");
        if (alive) setLoadError("Не удалось декодировать аудио");
      }
    })();
    return () => { alive = false; };
  }, [loop.storage_path]);

  // Draw waveform + selection overlay
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !peaks || !duration) return;
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    const ctx = canvas.getContext("2d")!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    // dim outside selection
    const s = (startSec / duration) * w;
    const e = (endSec / duration) * w;
    ctx.fillStyle = "rgba(255,255,255,0.02)";
    ctx.fillRect(0, 0, w, h);

    // waveform bars
    const mid = h / 2;
    const step = w / peaks.length;
    for (let i = 0; i < peaks.length; i++) {
      const x = i * step;
      const inSel = x >= s && x <= e;
      const amp = peaks[i] * (h * 0.48);
      ctx.fillStyle = inSel ? "rgba(52, 211, 153, 0.9)" : "rgba(120, 130, 140, 0.35)";
      ctx.fillRect(x, mid - amp, Math.max(1, step - 0.5), amp * 2);
    }

    // selection handles
    ctx.fillStyle = "rgba(52,211,153,0.15)";
    ctx.fillRect(s, 0, e - s, h);
    ctx.strokeStyle = "rgba(52,211,153,1)";
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(s, 0); ctx.lineTo(s, h);
    ctx.moveTo(e, 0); ctx.lineTo(e, h); ctx.stroke();
  }, [peaks, startSec, endSec, duration]);

  function xToSec(clientX: number) {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const x = Math.max(0, Math.min(rect.width, clientX - rect.left));
    return (x / rect.width) * duration;
  }

  function onDown(e: React.PointerEvent) {
    if (!duration) return;
    const t = xToSec(e.clientX);
    const distS = Math.abs(t - startSec);
    const distE = Math.abs(t - endSec);
    dragRef.current = distS < distE ? "start" : "end";
    (e.target as Element).setPointerCapture?.(e.pointerId);
    onMove(e);
  }
  function onMove(e: React.PointerEvent) {
    if (!dragRef.current || !duration) return;
    const t = xToSec(e.clientX);
    if (dragRef.current === "start") setStartSec(Math.min(t, endSec - 0.05));
    else setEndSec(Math.max(t, startSec + 0.05));
  }
  function onUp() { dragRef.current = null; }

  function togglePlay() {
    if (!signedUrl) return;
    if (!audioRef.current) {
      audioRef.current = new Audio(signedUrl);
      audioRef.current.onended = () => setPlaying(false);
    }
    const a = audioRef.current;
    if (playing) { a.pause(); setPlaying(false); return; }
    a.currentTime = startSec;
    a.play();
    setPlaying(true);
    // stop at endSec
    const stopper = () => {
      if (!audioRef.current) return;
      if (audioRef.current.currentTime >= endSec) {
        audioRef.current.pause();
        setPlaying(false);
      } else if (playing || !audioRef.current.paused) {
        requestAnimationFrame(stopper);
      }
    };
    requestAnimationFrame(stopper);
  }

  async function saveRename() {
    const t = title.trim();
    if (!t || t === loop.title) return;
    setRenaming(true);
    const { error } = await supabase.from("game_loops").update({ title: t }).eq("id", loop.id);
    setRenaming(false);
    if (error) { toast.error(error.message); return; }
    onUpdated({ title: t });
    toast.success("Название сохранено");
    await listActiveLoops(true);
  }

  async function saveTrim() {
    if (!buffer) return;
    const trimLen = endSec - startSec;
    if (trimLen < 0.1) { toast.error("Слишком короткий фрагмент"); return; }
    if (Math.abs(trimLen - buffer.duration) < 0.05) {
      toast.message("Диапазон совпадает с оригиналом — обрезать нечего");
      return;
    }
    setSaving(true);
    try {
      const blob = encodeWavSlice(buffer, startSec, endSec);
      const cleanTitle = loop.title.replace(/[^\w.\-]+/g, "_");
      const newPath = `${loop.category}/${Date.now()}_${cleanTitle}_trim.wav`;
      const { error: upErr } = await supabase.storage
        .from("game-loops")
        .upload(newPath, blob, { contentType: "audio/wav", upsert: false });
      if (upErr) throw upErr;
      const { error: updErr } = await supabase.from("game_loops")
        .update({ storage_path: newPath, duration_seconds: trimLen })
        .eq("id", loop.id);
      if (updErr) throw updErr;
      // remove old file (best-effort)
      await supabase.storage.from("game-loops").remove([loop.storage_path]);
      onUpdated({ storage_path: newPath, duration_seconds: trimLen });
      await listActiveLoops(true);
      toast.success(`Обрезано: ${trimLen.toFixed(2)}s`);
      onClose();
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : "Ошибка обрезки");
    } finally {
      setSaving(false);
    }
  }

  const fmt = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toFixed(2).padStart(5, "0")}`;
  const trimLen = useMemo(() => Math.max(0, endSec - startSec), [startSec, endSec]);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4" onClick={onClose}>
      <div
        className="w-full max-w-3xl rounded-md border border-border bg-panel p-4 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center gap-2">
          <Scissors className="h-4 w-4 text-mint" />
          <div className="text-sm font-semibold">Редактор лупа</div>
          <button
            onClick={onClose}
            className="ml-auto grid h-7 w-7 place-items-center rounded-md border border-border text-muted-foreground hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Rename */}
        <div className="mb-3 flex items-end gap-2">
          <label className="flex-1 space-y-1 text-xs">
            <div className="text-muted-foreground">Название</div>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm"
            />
          </label>
          <button
            onClick={saveRename}
            disabled={renaming || !title.trim() || title === loop.title}
            className="inline-flex items-center gap-1 rounded-md border border-mint/40 bg-mint/10 px-3 py-1.5 text-xs font-semibold text-mint hover:bg-mint/20 disabled:opacity-50"
          >
            {renaming ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            Переименовать
          </button>
        </div>

        {/* Waveform */}
        <div className="rounded-md border border-border bg-background p-2">
          {loadError ? (
            <div className="grid h-[160px] place-items-center gap-1 text-center text-xs text-muted-foreground">
              <span>Не удалось загрузить луп</span>
              <span className="text-[10px] opacity-70">{loadError}</span>
            </div>
          ) : !peaks ? (
            <div className="grid h-[160px] place-items-center text-xs text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Декодирую…
            </div>
          ) : (
            <canvas
              ref={canvasRef}
              onPointerDown={onDown}
              onPointerMove={onMove}
              onPointerUp={onUp}
              onPointerCancel={onUp}
              className="block h-[160px] w-full cursor-ew-resize touch-none"
            />
          )}
          {!!duration && (
            <div className="mt-2 flex items-center gap-3 text-[11px] text-muted-foreground">
              <button
                onClick={togglePlay}
                className="inline-flex items-center gap-1 rounded-md border border-border bg-panel px-2 py-1 text-mint hover:border-mint/50"
              >
                {playing ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
                Прослушать
              </button>
              <span>Начало: <b className="text-foreground">{fmt(startSec)}</b></span>
              <span>Конец: <b className="text-foreground">{fmt(endSec)}</b></span>
              <span>Длина: <b className="text-mint">{fmt(trimLen)}</b></span>
              <span className="ml-auto">Оригинал: {fmt(duration)}</span>
            </div>
          )}
        </div>

        {/* Fine-tune sliders */}
        {!!duration && (
          <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
            <label className="space-y-1">
              <div className="text-muted-foreground">Начало (сек)</div>
              <input
                type="number" min={0} max={endSec - 0.05} step={0.01}
                value={startSec.toFixed(2)}
                onChange={(e) => setStartSec(Math.min(Number(e.target.value), endSec - 0.05))}
                className="w-full rounded-md border border-border bg-background px-2 py-1"
              />
            </label>
            <label className="space-y-1">
              <div className="text-muted-foreground">Конец (сек)</div>
              <input
                type="number" min={startSec + 0.05} max={duration} step={0.01}
                value={endSec.toFixed(2)}
                onChange={(e) => setEndSec(Math.max(Number(e.target.value), startSec + 0.05))}
                className="w-full rounded-md border border-border bg-background px-2 py-1"
              />
            </label>
          </div>
        )}

        <div className="mt-4 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-md border border-border bg-panel px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground"
          >
            Отмена
          </button>
          <button
            onClick={saveTrim}
            disabled={saving || !buffer || trimLen < 0.1}
            className="inline-flex items-center gap-1 rounded-md border border-mint/40 bg-mint/10 px-3 py-1.5 text-xs font-semibold text-mint hover:bg-mint/20 disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Scissors className="h-3.5 w-3.5" />}
            Обрезать и сохранить
          </button>
        </div>
      </div>
    </div>
  );
}
