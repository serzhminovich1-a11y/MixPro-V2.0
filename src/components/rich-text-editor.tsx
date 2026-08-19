import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Undo2, Redo2, Bold, Italic, Underline, Strikethrough, Code,
  Palette, Highlighter, List as ListIcon, ListOrdered, Quote,
  AlignLeft, AlignCenter, AlignRight, Link as LinkIcon, Link2Off,
  ImagePlus, Sigma, Table as TableIcon, Upload, Eraser, Terminal,
  Type, Sparkles, Send, Loader2,
} from "lucide-react";
import { createUploadUrl } from "@/lib/storage.functions";
import { publicStorageUrl } from "@/lib/storage-url";
import { formatBytes } from "@/lib/upload-progress";
import { aiEditText } from "@/lib/ai.functions";
import { sanitizeInlineHtml } from "@/lib/course-blocks";

type UploadItem = { id: string; name: string; loaded: number; total: number; pct: number; done?: boolean; error?: string };

const FONT_SIZES = [
  { label: "Обычный", value: "" },
  { label: "12", value: "12px" },
  { label: "14", value: "14px" },
  { label: "16", value: "16px" },
  { label: "18", value: "18px" },
  { label: "20", value: "20px" },
  { label: "24", value: "24px" },
  { label: "28", value: "28px" },
  { label: "32", value: "32px" },
  { label: "40", value: "40px" },
];
const FONT_FAMILIES = [
  { label: "Обычный", value: "" },
  { label: "Space Grotesk", value: "'Space Grotesk', sans-serif" },
  { label: "DM Sans", value: "'DM Sans', sans-serif" },
  { label: "JetBrains Mono", value: "'JetBrains Mono', monospace" },
  { label: "Michroma", value: "'Michroma', sans-serif" },
  { label: "Archivo Black", value: "'Archivo Black', sans-serif" },
];

export function ToolBtn({ onClick, children, title, active }: { onClick: () => void; children: React.ReactNode; title?: string; active?: boolean }) {
  return (
    <button
      type="button"
      title={title}
      onMouseDown={(e) => { e.preventDefault(); onClick(); }}
      className={`inline-flex h-7 min-w-7 items-center justify-center rounded-md px-1.5 transition-colors hover:bg-white/5 hover:text-white ${active ? "bg-white/10 text-white" : "text-gray-300"}`}
    >
      {children}
    </button>
  );
}

type Props = {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  minHeight?: number;
  /** Storage prefix uploaded files go to — determines who's allowed to write there (see storage.functions.ts). */
  uploadPrefix?: "lesson-assets";
};

/**
 * Full contentEditable rich-text editor: bold/italic/underline/strike,
 * inline code, paragraph styles, text/highlight color, font family+size,
 * lists, alignment, links, images (incl. drag&drop upload with
 * progress), tables, formulas, HTML source view. Used by both the course
 * lesson editor and the glossary term editor — one implementation so
 * formatting behaves identically everywhere it shows up.
 */
export function RichTextEditor({ value, onChange, placeholder, minHeight = 260, uploadPrefix = "lesson-assets" }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [sourceMode, setSourceMode] = useState(false);
  const [sourceValue, setSourceValue] = useState(value);
  const [currentBlock, setCurrentBlock] = useState<string>("p");
  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const createUrl = useServerFn(createUploadUrl);
  const [aiOpen, setAiOpen] = useState(false);
  const [aiInstruction, setAiInstruction] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const runAiFn = useServerFn(aiEditText);
  // Toolbar <select>s (font/size) steal focus the moment they're clicked,
  // which collapses window.getSelection() before their onChange fires —
  // so wrapSelection can't read it live. Mirror the live selection here
  // instead, updated continuously while it's inside the editor, and use
  // *this* when a select's onChange runs.
  const savedRangeRef = useRef<Range | null>(null);

  useEffect(() => {
    if (ref.current && ref.current.innerHTML !== value) ref.current.innerHTML = value;
    setSourceValue(value);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The contentEditable div only exists in the DOM while !sourceMode (see
  // the render below) — so at the moment toggleSource() flips sourceMode
  // back to false, ref.current is still null (the div hasn't remounted
  // yet) and a direct write there is a no-op, leaving the editor visibly
  // blank even though the parent's `value` is correct. Do the write here
  // instead, once the div actually exists again.
  useEffect(() => {
    if (!sourceMode && ref.current) ref.current.innerHTML = sourceValue;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceMode]);

  useEffect(() => {
    // Runs synchronously as part of the browser's own selectionchange
    // dispatch — i.e. on every single click in the editor, not just
    // formatting actions. document.queryCommandValue is a legacy,
    // inconsistently-implemented API, and calling it (or triggering the
    // setCurrentBlock re-render that follows) from inside that dispatch
    // is exactly the kind of thing that behaves differently across
    // Chromium builds. Defer to the next frame so none of this runs
    // until after the browser has already fully committed the click's
    // own caret placement.
    let raf = 0;
    function poll() {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        if (!ref.current) return;
        const sel = window.getSelection();
        if (!sel || sel.rangeCount === 0) return;
        const anchor = sel.anchorNode;
        if (!anchor || !ref.current.contains(anchor)) return;
        if (!sel.isCollapsed) savedRangeRef.current = sel.getRangeAt(0).cloneRange();
        try {
          const fb = document.queryCommandValue("formatBlock");
          if (typeof fb === "string" && fb) {
            const normalized = fb.toLowerCase().replace(/[<>]/g, "").trim();
            if (normalized) setCurrentBlock(normalized === "div" ? "p" : normalized);
          }
        } catch {}
      });
    }
    document.addEventListener("selectionchange", poll);
    return () => { document.removeEventListener("selectionchange", poll); cancelAnimationFrame(raf); };
  }, []);

  function commit() {
    if (ref.current) onChange(ref.current.innerHTML);
  }
  /** Toolbar controls that aren't plain buttons — <select>s, the native
   * <input type="color"> swatches, prompt() dialogs — all steal focus
   * before their change handler runs, which collapses window.getSelection()
   * the same way it does for the font selects. Re-apply the last live
   * selection we mirrored in `poll()` before touching execCommand. */
  function restoreSelection() {
    if (!ref.current) return;
    ref.current.focus();
    const sel = window.getSelection();
    const range = savedRangeRef.current;
    if (!sel || !range) return;
    const anchor = sel.anchorNode;
    const liveValid = sel.rangeCount > 0 && !sel.isCollapsed && !!anchor && ref.current.contains(anchor);
    if (liveValid) return;
    if (!ref.current.contains(range.commonAncestorContainer)) return;
    sel.removeAllRanges();
    sel.addRange(range.cloneRange());
  }
  function exec(cmd: string, val?: string) {
    restoreSelection();
    // Without this, foreColor/hiliteColor emit legacy <font color="...">
    // tags and alignment emits align="" attributes — neither survives
    // sanitizeInlineHtml's allowlist (which only knows <span style="…">).
    // Forcing CSS mode makes every command emit style-attributed markup.
    try { document.execCommand("styleWithCSS", false, "true"); } catch {}
    document.execCommand(cmd, false, val);
    commit();
  }
  function insertHTML(html: string) {
    restoreSelection();
    document.execCommand("insertHTML", false, html);
    commit();
  }
  /** Wrap the current selection in a <span style="prop:value">. execCommand
   * has no notion of arbitrary font-size/family values, only the legacy
   * 1-7 <font size> scale — this is the standard workaround. */
  function wrapSelection(styleProp: "fontSize" | "fontFamily", value: string) {
    const range = savedRangeRef.current;
    if (!range || range.collapsed || !value || !ref.current?.contains(range.commonAncestorContainer)) return;
    ref.current.focus();
    const span = document.createElement("span");
    span.style[styleProp] = value;
    try {
      range.surroundContents(span);
    } catch {
      const frag = range.extractContents();
      span.appendChild(frag);
      range.insertNode(span);
    }
    const sel = window.getSelection();
    if (sel) {
      sel.removeAllRanges();
      const newRange = document.createRange();
      newRange.selectNodeContents(span);
      sel.addRange(newRange);
      savedRangeRef.current = newRange.cloneRange();
    }
    commit();
  }
  function handleStyle(v: string) {
    if (!v) return;
    if (v === "code") {
      restoreSelection();
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
  function insertFormula() {
    const f = prompt("Формула (LaTeX-подобная):", "E = mc^2");
    if (f) insertHTML(`<code class="math">${f}</code>`);
  }
  /** The HTML of the current text selection, or null if there isn't one
   * (matching wrapSelection's own check) — used to decide whether an AI
   * request acts on just the selected passage or the whole field. */
  function getSelectedHtml(): string | null {
    const range = savedRangeRef.current;
    if (!range || range.collapsed || !ref.current?.contains(range.commonAncestorContainer)) return null;
    const container = document.createElement("div");
    container.appendChild(range.cloneContents());
    return container.innerHTML;
  }
  async function runAi(mode: "cleanup" | "expand" | "chat", instruction?: string) {
    if (!ref.current || aiBusy) return;
    const selectedHtml = getSelectedHtml();
    const targetHtml = selectedHtml ?? ref.current.innerHTML;
    setAiBusy(true);
    try {
      const { html } = await runAiFn({ data: { mode, html: targetHtml, instruction } });
      const clean = sanitizeInlineHtml(html);
      if (!selectedHtml) {
        // Nothing was selected — manufacture a "select everything" range so
        // the insertHTML() below still goes through execCommand (and is
        // thus undoable via Ctrl+Z like every other edit) instead of a raw
        // innerHTML write that would silently sit outside the undo stack.
        const range = document.createRange();
        range.selectNodeContents(ref.current);
        savedRangeRef.current = range;
      }
      insertHTML(clean); // restores the (real or manufactured) selection, then replaces it
      setAiOpen(false);
      setAiInstruction("");
    } catch (e: any) {
      toast.error(e.message ?? "Ошибка ИИ");
    } finally {
      setAiBusy(false);
    }
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
      setSourceValue(ref.current?.innerHTML ?? value);
      setSourceMode(true);
    } else {
      onChange(sourceValue);
      setSourceMode(false); // effect above re-syncs ref.current once the div remounts
    }
  }

  async function uploadOne(file: File) {
    const id = crypto.randomUUID();
    setUploads((u) => [...u, { id, name: file.name, loaded: 0, total: file.size, pct: 0 }]);
    try {
      const created = await createUrl({ data: { prefix: uploadPrefix, filename: file.name } });
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
      if (file.type.startsWith("image/")) html = `<p><img src="${url}" alt="${file.name}" loading="lazy" /></p>`;
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
    input.onchange = () => Array.from(input.files ?? []).forEach(uploadOne);
    input.click();
  }
  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    Array.from(e.dataTransfer.files ?? []).forEach(uploadOne);
  }

  const Divider = () => <span className="mx-0.5 h-6 w-px self-center bg-white/10" />;
  const styleValue = ["p", "h1", "h2", "h3", "pre", "blockquote"].includes(currentBlock) ? currentBlock : "p";
  const styleLabels: Record<string, string> = { p: "Обычный", h1: "H1", h2: "H2", h3: "H3", pre: "Preformatted", blockquote: "Цитата" };

  return (
    <div className="space-y-2">
      <div
        className="sticky top-0 z-10 flex flex-wrap items-center gap-0.5 rounded-xl border border-white/10 bg-[#0f0f0f]/95 p-2 text-xs backdrop-blur"
        onFocus={(e) => {
          // Toolbar <button>s never legitimately hold focus in this editor
          // — every deliberate click already sends it straight back to the
          // editor (exec()'s restoreSelection). On some Chromium builds
          // (confirmed on Brave) focus can land on the first button here
          // right after an ordinary click *in the text itself*, with no
          // application code calling .focus() anywhere — the browser
          // moving it natively. Enforce the invariant directly rather than
          // chase the exact native cause. Scoped to <button> only — the
          // <select>s and color <input>s in this same toolbar genuinely
          // need to keep focus while the user is using them.
          if (e.target instanceof HTMLButtonElement) ref.current?.focus();
        }}
      >
        <button
          type="button"
          onMouseDown={(e) => { e.preventDefault(); setAiOpen((o) => !o); }}
          className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-[12px] font-medium transition-colors ${aiOpen ? "border-violet-400/50 bg-violet-500/20 text-violet-200" : "border-violet-500/30 bg-violet-500/10 text-violet-300 hover:bg-violet-500/15"}`}
          title="Помощь ИИ: почистить, дописать или переделать текст"
        >
          <Sparkles className="h-4 w-4" /> ИИ
        </button>
        <Divider />

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

        <label className="inline-flex items-center gap-1" title="Шрифт">
          <Type className="h-3.5 w-3.5 text-gray-500" />
          <select
            defaultValue=""
            onChange={(e) => { wrapSelection("fontFamily", e.target.value); e.currentTarget.value = ""; }}
            className="cursor-pointer rounded-md border border-white/10 bg-black/40 px-2 py-1 text-[12px] text-gray-200 outline-none hover:bg-white/5"
            title="Шрифт (выделите текст)"
          >
            {FONT_FAMILIES.map((f) => <option key={f.label} value={f.value}>{f.label}</option>)}
          </select>
          <select
            defaultValue=""
            onChange={(e) => { wrapSelection("fontSize", e.target.value); e.currentTarget.value = ""; }}
            className="cursor-pointer rounded-md border border-white/10 bg-black/40 px-1.5 py-1 text-[12px] text-gray-200 outline-none hover:bg-white/5"
            title="Размер текста (выделите текст)"
          >
            {FONT_SIZES.map((s) => <option key={s.label} value={s.value}>{s.label}</option>)}
          </select>
        </label>
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

      {aiOpen && (
        <div className="space-y-2 rounded-xl border border-violet-500/30 bg-violet-500/5 p-3">
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              disabled={aiBusy}
              onMouseDown={(e) => { e.preventDefault(); runAi("cleanup"); }}
              className="inline-flex items-center gap-1 rounded-md border border-violet-500/30 bg-violet-500/10 px-2.5 py-1 text-xs text-violet-200 hover:bg-violet-500/20 disabled:opacity-50"
            >
              Причесать
            </button>
            <button
              type="button"
              disabled={aiBusy}
              onMouseDown={(e) => { e.preventDefault(); runAi("expand"); }}
              className="inline-flex items-center gap-1 rounded-md border border-violet-500/30 bg-violet-500/10 px-2.5 py-1 text-xs text-violet-200 hover:bg-violet-500/20 disabled:opacity-50"
            >
              Дописать
            </button>
          </div>
          <form
            onSubmit={(e) => { e.preventDefault(); if (aiInstruction.trim()) runAi("chat", aiInstruction.trim()); }}
            className="flex items-center gap-1.5"
          >
            <input
              value={aiInstruction}
              onChange={(e) => setAiInstruction(e.target.value)}
              placeholder="Своя команда: сократи вдвое, добавь пример, переведи в списки…"
              disabled={aiBusy}
              className="flex-1 rounded-md border border-white/10 bg-black/40 px-2.5 py-1.5 text-xs text-gray-200 outline-none placeholder:text-gray-500 focus:border-violet-400/40"
            />
            <button
              type="submit"
              disabled={aiBusy || !aiInstruction.trim()}
              className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-violet-500/80 text-white hover:bg-violet-500 disabled:opacity-40"
            >
              {aiBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
            </button>
          </form>
          <p className="text-[10px] text-gray-500">
            Если в тексте есть выделение — ИИ работает только с ним, иначе — со всем текстом. Результат можно отменить (Ctrl+Z / кнопка «Отменить»).
          </p>
        </div>
      )}

      {sourceMode ? (
        <textarea
          value={sourceValue}
          onChange={(e) => setSourceValue(e.target.value)}
          onBlur={() => onChange(sourceValue)}
          rows={16}
          className="w-full rounded-xl border border-white/10 bg-black/60 px-4 py-3 font-mono text-sm text-emerald-300 outline-none focus:border-emerald-500/40"
          spellCheck={false}
        />
      ) : (
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
          data-placeholder={placeholder ?? "Начните писать или перетащите сюда файлы…"}
          style={{ minHeight }}
          className={`rich-editor rounded-xl border border-white/10 bg-[#0a0a0a] px-6 py-5 text-base leading-relaxed text-gray-200 outline-none transition focus:border-emerald-500/40 focus:shadow-[0_0_0_3px_rgba(16,185,129,0.08)] ${dragOver ? "is-dragover" : ""}`}
        />
      )}

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
    </div>
  );
}
