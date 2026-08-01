import { useEffect, useRef, useState } from "react";
import { X, ZoomIn, ZoomOut, RotateCcw, Check } from "lucide-react";

type Props = {
  file: File;
  size?: number;         // output size (px) — square
  onCancel: () => void;
  onConfirm: (blob: Blob) => void | Promise<void>;
};

/** Modal avatar editor: drag to reposition, wheel/slider to zoom, export as square PNG blob. */
export function AvatarEditor({ file, size = 512, onCancel, onConfirm }: Props) {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [zoom, setZoom] = useState(1);         // 1..4
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0, ox: 0, oy: 0 });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const url = URL.createObjectURL(file);
    const el = new Image();
    el.onload = () => { setImg(el); setOffset({ x: 0, y: 0 }); setZoom(1); };
    el.src = url;
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const VIEW = 320; // preview square size on screen

  function fitScale(): number {
    if (!img) return 1;
    return Math.max(VIEW / img.width, VIEW / img.height);
  }

  function clamp(off: { x: number; y: number }, z: number) {
    if (!img) return off;
    const scale = fitScale() * z;
    const w = img.width * scale;
    const h = img.height * scale;
    const maxX = Math.max(0, (w - VIEW) / 2);
    const maxY = Math.max(0, (h - VIEW) / 2);
    return {
      x: Math.max(-maxX, Math.min(maxX, off.x)),
      y: Math.max(-maxY, Math.min(maxY, off.y)),
    };
  }

  function onPointerDown(e: React.PointerEvent) {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    setDragging(true);
    dragStart.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y };
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!dragging) return;
    setOffset(clamp({
      x: dragStart.current.ox + (e.clientX - dragStart.current.x),
      y: dragStart.current.oy + (e.clientY - dragStart.current.y),
    }, zoom));
  }
  function onPointerUp() { setDragging(false); }
  function onWheel(e: React.WheelEvent) {
    e.preventDefault();
    const next = Math.max(1, Math.min(4, zoom + (e.deltaY < 0 ? 0.1 : -0.1)));
    setZoom(next);
    setOffset((o) => clamp(o, next));
  }

  function reset() { setZoom(1); setOffset({ x: 0, y: 0 }); }

  async function confirm() {
    if (!img) return;
    setBusy(true);
    // Map view coordinates -> source image crop rectangle.
    const scale = fitScale() * zoom;
    // Top-left of drawn image on the view (view centered)
    const drawW = img.width * scale;
    const drawH = img.height * scale;
    const drawX = (VIEW - drawW) / 2 + offset.x;
    const drawY = (VIEW - drawH) / 2 + offset.y;
    // Source rect that maps into the [0..VIEW] view
    const srcX = (-drawX) / scale;
    const srcY = (-drawY) / scale;
    const srcSize = VIEW / scale;

    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) { setBusy(false); return; }
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, srcX, srcY, srcSize, srcSize, 0, 0, size, size);
    const blob: Blob | null = await new Promise((res) => canvas.toBlob((b) => res(b), "image/jpeg", 0.92));
    if (blob) await onConfirm(blob);
    setBusy(false);
  }

  const scale = fitScale() * zoom;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-background/80 p-4 backdrop-blur-sm" onClick={onCancel}>
      <div className="w-full max-w-md rounded-2xl border border-border bg-background p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">Обрежь фото профиля</h3>
          <button onClick={onCancel} aria-label="Закрыть" className="text-muted-foreground hover:text-foreground"><X className="h-5 w-5" /></button>
        </div>

        <div
          className="relative mx-auto mt-4 overflow-hidden rounded-full bg-black/60 ring-2 ring-mint/40"
          style={{ width: VIEW, height: VIEW, cursor: dragging ? "grabbing" : "grab", touchAction: "none" }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onWheel={onWheel}
        >
          {img && (
            <img
              src={img.src}
              alt=""
              draggable={false}
              style={{
                position: "absolute",
                left: "50%",
                top: "50%",
                width: img.width * scale,
                height: img.height * scale,
                transform: `translate(calc(-50% + ${offset.x}px), calc(-50% + ${offset.y}px))`,
                userSelect: "none",
                pointerEvents: "none",
              }}
            />
          )}
          {/* subtle grid */}
          <div className="pointer-events-none absolute inset-0 grid grid-cols-3 grid-rows-3 opacity-30">
            {Array.from({ length: 9 }).map((_, i) => (
              <div key={i} className="border border-white/25" />
            ))}
          </div>
        </div>

        <div className="mt-4 flex items-center gap-3">
          <ZoomOut className="h-4 w-4 text-muted-foreground" />
          <input
            type="range"
            min={1}
            max={4}
            step={0.01}
            value={zoom}
            onChange={(e) => { const z = Number(e.target.value); setZoom(z); setOffset((o) => clamp(o, z)); }}
            className="flex-1 accent-mint"
          />
          <ZoomIn className="h-4 w-4 text-muted-foreground" />
          <button onClick={reset} aria-label="Сбросить" className="ml-1 text-muted-foreground hover:text-foreground">
            <RotateCcw className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onCancel} className="rounded-lg border border-border px-4 py-2 text-sm">Отмена</button>
          <button onClick={confirm} disabled={!img || busy} className="inline-flex items-center gap-1 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50">
            <Check className="h-4 w-4" /> {busy ? "Загружаем..." : "Применить"}
          </button>
        </div>
        <p className="mt-2 text-center text-[11px] text-muted-foreground">Перетаскивай мышью или пальцем · крути колёсиком для зума</p>
      </div>
    </div>
  );
}
