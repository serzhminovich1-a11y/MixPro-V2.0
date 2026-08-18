// Block schema for lesson content — Stepik-style rich blocks.

export type BlockBase = { id: string };

export type HeadingBlock = BlockBase & {
  type: "heading";
  level: 1 | 2 | 3;
  text: string;
  align?: "left" | "center" | "right";
  color?: string;
  font?: string;
};

export type ParagraphBlock = BlockBase & {
  type: "paragraph";
  html: string; // sanitized inline-formatted HTML from contentEditable
  align?: "left" | "center" | "right" | "justify";
  font?: string;
  size?: number; // px
};

export type ImageBlock = BlockBase & {
  type: "image";
  url: string;
  caption?: string;
  width?: number; // percent 25-100
  align?: "left" | "center" | "right";
};

export type VideoBlock = BlockBase & {
  type: "video";
  url: string; // youtube/vimeo/mp4
  caption?: string;
};

export type CodeBlock = BlockBase & {
  type: "code";
  language?: string;
  code: string;
};

export type CalloutBlock = BlockBase & {
  type: "callout";
  variant: "info" | "warn" | "success" | "danger" | "tip";
  title?: string;
  text: string;
};

export type DividerBlock = BlockBase & { type: "divider" };

export type ListBlock = BlockBase & {
  type: "list";
  ordered: boolean;
  items: string[];
};

export type QuoteBlock = BlockBase & {
  type: "quote";
  text: string;
  author?: string;
};

export type EmbedBlock = BlockBase & {
  type: "embed";
  html: string; // raw iframe html (sanitized on save)
};

export type AudioBlock = BlockBase & {
  type: "audio";
  url: string;
  caption?: string;
};

export type AudioABBlock = BlockBase & {
  type: "audio_ab";
  urlA: string;
  urlB: string;
  labelA?: string;
  labelB?: string;
  caption?: string;
  blind?: boolean;
};

export type Block =
  | HeadingBlock
  | ParagraphBlock
  | ImageBlock
  | VideoBlock
  | AudioBlock
  | AudioABBlock
  | CodeBlock
  | CalloutBlock
  | DividerBlock
  | ListBlock
  | QuoteBlock
  | EmbedBlock;

export const BLOCK_LABELS: Record<Block["type"], string> = {
  heading: "Заголовок",
  paragraph: "Текст",
  image: "Картинка / GIF",
  video: "Видео",
  audio: "Аудио",
  audio_ab: "A/B сравнение",
  code: "Код",
  callout: "Плашка",
  divider: "Разделитель",
  list: "Список",
  quote: "Цитата",
  embed: "Встраивание",
};

export function newBlock(type: Block["type"]): Block {
  const id = crypto.randomUUID();
  switch (type) {
    case "heading":
      return { id, type: "heading", level: 2, text: "Заголовок", align: "left" };
    case "paragraph":
      return { id, type: "paragraph", html: "Введите текст…", align: "left" };
    case "image":
      return { id, type: "image", url: "", caption: "", width: 100, align: "center" };
    case "video":
      return { id, type: "video", url: "", caption: "" };
    case "audio":
      return { id, type: "audio", url: "", caption: "" };
    case "audio_ab":
      return { id, type: "audio_ab", urlA: "", urlB: "", labelA: "A", labelB: "B", caption: "", blind: false };
    case "code":
      return { id, type: "code", language: "typescript", code: "// код" };
    case "callout":
      return { id, type: "callout", variant: "info", title: "Заметка", text: "Полезный совет" };
    case "divider":
      return { id, type: "divider" };
    case "list":
      return { id, type: "list", ordered: false, items: ["Пункт 1", "Пункт 2"] };
    case "quote":
      return { id, type: "quote", text: "«Микс — это разговор частот».", author: "" };
    case "embed":
      return { id, type: "embed", html: "" };
  }
}

/** Extract youtube/vimeo id → normalized embed URL, else null. */
export function normalizeVideoEmbed(url: string): string | null {
  if (!url) return null;
  try {
    const u = new URL(url.trim());
    // YouTube
    if (u.hostname.includes("youtube.com")) {
      const id = u.searchParams.get("v");
      if (id) return `https://www.youtube.com/embed/${id}`;
      if (u.pathname.startsWith("/embed/")) return url;
    }
    if (u.hostname === "youtu.be") {
      const id = u.pathname.slice(1);
      if (id) return `https://www.youtube.com/embed/${id}`;
    }
    // Vimeo
    if (u.hostname.includes("vimeo.com")) {
      const id = u.pathname.split("/").filter(Boolean).pop();
      if (id && /^\d+$/.test(id)) return `https://player.vimeo.com/video/${id}`;
    }
    return null; // treat as mp4/direct
  } catch {
    return null;
  }
}

const ALLOWED_INLINE_TAGS = new Set([
  "B", "I", "U", "STRONG", "EM", "SPAN", "A", "BR", "MARK", "S", "SUB", "SUP", "CODE",
  // Block-level for rich lesson body
  "P", "DIV", "H1", "H2", "H3", "H4", "H5", "H6",
  "UL", "OL", "LI", "BLOCKQUOTE", "PRE", "HR", "FIGURE", "FIGCAPTION",
  "TABLE", "THEAD", "TBODY", "TFOOT", "TR", "TH", "TD",
  "IMG", "VIDEO", "AUDIO", "SOURCE", "IFRAME",
]);
const ALLOWED_ATTRS = new Set([
  "style", "href", "target", "rel", "class",
  "src", "alt", "title", "controls", "poster", "type",
  "width", "height", "colspan", "rowspan", "allow", "allowfullscreen", "frameborder", "loading",
]);

// ALLOWED_ATTRS only checks attribute *names* — href/src values still need
// scheme validation, or `<a href="javascript:...">` sails straight through.
const SAFE_URL = /^(https?:|mailto:|tel:|\/|#)/i;
const URL_ATTRS = ["href", "src", "poster"];

/** Very small sanitizer for contentEditable paragraph HTML (runs on save). */
export function sanitizeInlineHtml(html: string): string {
  if (typeof window === "undefined") return html;
  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, "text/html");
  const root = doc.body.firstElementChild;
  if (!root) return "";
  const walk = (el: Element) => {
    Array.from(el.children).forEach((c) => {
      if (!ALLOWED_INLINE_TAGS.has(c.tagName)) {
        const text = doc.createTextNode(c.textContent ?? "");
        c.replaceWith(text);
        return;
      }
      Array.from(c.attributes).forEach((a) => {
        if (!ALLOWED_ATTRS.has(a.name)) c.removeAttribute(a.name);
      });
      for (const attr of URL_ATTRS) {
        const v = c.getAttribute(attr);
        if (v && !SAFE_URL.test(v.trim())) c.removeAttribute(attr);
      }
      if (c.tagName === "A") {
        c.setAttribute("target", "_blank");
        c.setAttribute("rel", "noopener noreferrer");
      }
      walk(c);
    });
  };
  walk(root);
  return root.innerHTML;
}
