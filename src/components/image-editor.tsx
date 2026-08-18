import { useEffect, useMemo, useRef, useState } from "react";
import { X, ZoomIn, ZoomOut, RotateCcw, RotateCw, FlipHorizontal, Check, Maximize2 } from "lucide-react";

type Props = {
  file: File;
  /** Max output dimension (px) on the longer side. */
  maxOutput?: number;
  onCancel: () => void;
  onConfirm: (blob: Blob, mimeType: string) => void | Promise<void>;
};

const FRAME_MAX = 420; // on-screen frame box (px)

/**
 * General-purpose crop/rotate/flip editor — same drag-to-pan,
 * wheel-to-zoom interaction as AvatarEditor, but for arbitrary
 * (non-square) images: the frame follows the image's own aspect ratio
 * instead of forcing a circle, and adds 90°-step rotate + horizontal
 * flip. Used wherever a plain file picker isn't enough (glossary term
 * media, etc.) — AvatarEditor stays as-is for the avatar's fixed
 * circular crop.
 */
export function ImageEditor({ file, maxOutput = 1600, onCancel, onConfirm }: Props) {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [rotation, setRotation] = useState<0 | 90 | 180 | 270>(0);
  const [flip, setFlip] = useState(false);
  const [dragging, setDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0, ox: 0, oy: 0 });
  const [busy, setBusy] = useState(false);
  const isPng = file.type === "image/png";

  useEffect(() => {
    const url = URL.createObjectURL(file);
    const el = new Image();
    el.onload = () => { setImg(el); setOffset({ x: 0, y: 0 }); setZoom(1); };
    el.src = url;
    return () => URL.revokeObjectURL(url);
  }, [file]);

  // Rotating 90°/270° swaps which dimension is "wide" — the frame follows,
  // same as any photo editor's crop box does after a rotate.
  const rotated = rotation === 90 || rotation === 270;
  const effW = img ? (rotated ? img.height : img.width) : 1;
  const effH = img ? (rotated ? img.width : img.height) : 1;

  const frame = useMemo(() => {
    const aspect = effW / effH;
    return aspect >= 1
      ? { w: FRAME_MAX, h: Math.round(FRAME_MAX / aspect) }
      : { w: Math.round(FRAME_MAX * aspect), h: FRAME_MAX };
  }, [effW, effH]);

  function fitScale(): number {
    if (!img) return 1;
    // "cover" the frame at zoom=1 — the whole (rotated) image exactly
    // fills the frame with nothing cropped yet, matching its own aspect.
    return Math.max(frame.w / effW, frame.h / effH);
  }

  function clamp(off: { x: number; y: number }, z: number) {
    if (!img) return off;
    const scale = fitScale() * z;
    const w = effW * scale;
    const h = effH * scale;
    const maxX = Math.max(0, (w - frame.w) / 2);
    const maxY = Math.max(0, (h - frame.h) / 2);
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

  function rotate(dir: 1 | -1) {
    setRotation((r) => ((r + (dir === 1 ? 90 : -90) + 360) % 360) as 0 | 90 | 180 | 270);
    setOffset({ x: 0, y: 0 });
    setZoom(1);
  }
  function resetAll() {
    setZoom(1); setOffset({ x: 0, y: 0 }); setRotation(0); setFlip(false);
  }

  async function confirm() {
    if (!img) return;
    setBusy(true);
    const scale = fitScale() * zoom;
    const drawW = effW * scale;
    const drawH = effH * scale;
    const drawX = (frame.w - drawW) / 2 + offset.x;
    const drawY = (frame.h - drawH) / 2 + offset.y;
    // Crop rect in the *rotated* coordinate space, then un-rotate below.
    const srcX = -drawX / scale;
    const srcY = -drawY / scale;
    const srcW = frame.w / scale;
    const srcH = frame.h / scale;

    // Output size: scale the frame's own aspect ratio up to maxOutput on
    // its longer side.
    const outAspect = frame.w / frame.h;
    const width = outAspect >= 1 ? maxOutput : Math.round(maxOutput * outAspect);
    const height = outAspect >= 1 ? Math.round(maxOutput / outAspect) : maxOutput;

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) { setBusy(false); return; }
    ctx.imageSmoothingQuality = "high";

    ctx.save();
    ctx.translate(width / 2, height / 2);
    ctx.rotate((rotation * Math.PI) / 180);
    ctx.scale(flip ? -1 : 1, 1);
    // In un-rotated image space, width/height swap back for rotated cases.
    const destW = rotated ? height : width;
    const destH = rotated ? width : height;
    ctx.drawImage(img, srcX, srcY, srcW, srcH, -destW / 2, -destH / 2, destW, destH);
    ctx.restore();

    const mime = isPng ? "image/png" : "image/jpeg";
    const blob: Blob | null = await new Promise((res) => canvas.toBlob((b) => res(b), mime, 0.92));
    if (blob) await onConfirm(blob, mime);
    setBusy(false);
  }

  const scale = fitScale() * zoom;
  // Rotated footprint — this is the box that must cover the frame, and
  // the one the pan offset is measured against (see clamp()).
  const dispW = effW * scale;
  const dispH = effH * scale;
  // The image's own natural (pre-rotation) size at that same scale.
  const naturalW = (img?.width ?? 1) * scale;
  const naturalH = (img?.height ?? 1) * scale;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-background/80 p-4 backdrop-blur-sm" onClick={onCancel}>
      <div className="w-full max-w-lg rounded-2xl border border-border bg-background p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">Обрежь и поверни изображение</h3>
          <button onClick={onCancel} aria-label="Закрыть" className="text-muted-foreground hover:text-foreground"><X className="h-5 w-5" /></button>
        </div>

        <div
          className="relative mx-auto mt-4 overflow-hidden rounded-lg bg-black/60 ring-2 ring-mint/40"
          style={{ width: frame.w, height: frame.h, cursor: dragging ? "grabbing" : "grab", touchAction: "none" }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onWheel={onWheel}
        >
          {img && (
            // Two nested layers so pan and rotate never fight over the same
            // transform: PAN (outer) sizes its box to the rotated footprint
            // and only ever translates — that's the box that must cover the
            // frame. ROTATE+FLIP (inner) sizes its box to the image's own
            // natural (pre-rotation) dimensions and only ever rotates/flips
            // around its own center, which "translate(-50%,-50%) + left/top
            // 50%" keeps centered inside the outer box regardless of angle.
            <div
              style={{
                position: "absolute",
                left: "50%",
                top: "50%",
                width: dispW,
                height: dispH,
                transform: `translate(calc(-50% + ${offset.x}px), calc(-50% + ${offset.y}px))`,
              }}
            >
              <div
                style={{
                  position: "absolute",
                  left: "50%",
                  top: "50%",
                  width: naturalW,
                  height: naturalH,
                  transform: `translate(-50%, -50%) rotate(${rotation}deg) scaleX(${flip ? -1 : 1})`,
                }}
              >
                <img
                  src={img.src}
                  alt=""
                  draggable={false}
                  style={{ width: "100%", height: "100%", userSelect: "none", pointerEvents: "none" }}
                />
              </div>
            </div>
          )}
          <div className="pointer-events-none absolute inset-0 grid grid-cols-3 grid-rows-3 opacity-30">
            {Array.from({ length: 9 }).map((_, i) => (
              <div key={i} className="border border-white/25" />
            ))}
          </div>
        </div>

        <div className="mt-4 flex items-center gap-3">
          <ZoomOut className="h-4 w-4 shrink-0 text-muted-foreground" />
          <input
            type="range"
            min={1}
            max={4}
            step={0.01}
            value={zoom}
            onChange={(e) => { const z = Number(e.target.value); setZoom(z); setOffset((o) => clamp(o, z)); }}
            className="flex-1 accent-mint"
          />
          <ZoomIn className="h-4 w-4 shrink-0 text-muted-foreground" />
        </div>

        <div className="mt-3 flex items-center justify-center gap-2">
          <button onClick={() => rotate(-1)} title="Повернуть влево" className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-xs hover:bg-secondary">
            <RotateCcw className="h-3.5 w-3.5" /> 90°
          </button>
          <button onClick={() => rotate(1)} title="Повернуть вправо" className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-xs hover:bg-secondary">
            <RotateCw className="h-3.5 w-3.5" /> 90°
          </button>
          <button onClick={() => setFlip((f) => !f)} title="Отразить по горизонтали" className={`inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 text-xs hover:bg-secondary ${flip ? "border-mint/50 bg-mint/10 text-mint" : "border-border"}`}>
            <FlipHorizontal className="h-3.5 w-3.5" /> Отразить
          </button>
          <button onClick={resetAll} title="Сбросить всё" className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-xs hover:bg-secondary">
            <Maximize2 className="h-3.5 w-3.5" /> Сброс
          </button>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onCancel} className="rounded-lg border border-border px-4 py-2 text-sm">Отмена</button>
          <button onClick={confirm} disabled={!img || busy} className="inline-flex items-center gap-1 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50">
            <Check className="h-4 w-4" /> {busy ? "Обрабатываем..." : "Применить"}
          </button>
        </div>
        <p className="mt-2 text-center text-[11px] text-muted-foreground">Перетаскивай для сдвига · колёсико/ползунок — зум · кнопки — поворот и отражение</p>
      </div>
    </div>
  );
}
