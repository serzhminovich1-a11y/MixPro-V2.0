import { Link } from "@tanstack/react-router";
import { Fragment } from "react";

// Match @username tokens: letters, digits, underscore, hyphen, dot. 2–32 chars.
// Must not be preceded by a word char (avoid matching emails).
export const MENTION_RE = /(^|[^A-Za-z0-9_])@([A-Za-z0-9_][A-Za-z0-9_.-]{1,31})/g;

export function extractMentions(text: string): string[] {
  const out = new Set<string>();
  for (const m of text.matchAll(MENTION_RE)) out.add(m[2].toLowerCase());
  return Array.from(out);
}

/** Render text with @mentions turned into links to /u/$username, preserving line breaks. */
export function MentionText({ text, className }: { text: string; className?: string }) {
  const parts: React.ReactNode[] = [];
  let last = 0;
  let key = 0;
  const re = new RegExp(MENTION_RE.source, "g");
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    const [full, prefix, name] = match;
    const start = match.index + prefix.length;
    if (start > last) parts.push(<Fragment key={key++}>{text.slice(last, start)}</Fragment>);
    parts.push(
      <Link
        key={key++}
        to="/u/$username"
        params={{ username: name }}
        className="rounded bg-mint/15 px-1 py-px font-medium text-mint hover:bg-mint/25 hover:underline"
      >
        @{name}
      </Link>,
    );
    last = start + 1 + name.length;
    if (last === match.index + full.length && re.lastIndex < last) re.lastIndex = last;
  }
  if (last < text.length) parts.push(<Fragment key={key++}>{text.slice(last)}</Fragment>);
  return <span className={className}>{parts}</span>;
}

/** Detect an active "@query" being typed at the caret. Returns null if none. */
export function detectMentionQuery(value: string, caret: number): { query: string; start: number } | null {
  if (caret <= 0) return null;
  const before = value.slice(0, caret);
  const at = before.lastIndexOf("@");
  if (at < 0) return null;
  // Must be at start or preceded by whitespace/punct
  if (at > 0 && /[A-Za-z0-9_]/.test(before[at - 1])) return null;
  const frag = before.slice(at + 1);
  if (!/^[A-Za-z0-9_.-]*$/.test(frag)) return null;
  if (frag.length > 32) return null;
  return { query: frag, start: at };
}
