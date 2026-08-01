import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Send, Trash2, Play, CornerDownRight, ChevronDown, ChevronRight } from "lucide-react";
import { EmojiTrigger } from "@/components/emoji-picker";
import { MentionText, detectMentionQuery } from "@/lib/mentions";
import { searchUsernames } from "@/lib/public.functions";
import { AvatarImage } from "@/components/avatar-image";

export type TrackCommentRow = {
  id: string;
  post_id: string;
  track_index: number;
  author_id: string;
  parent_id: string | null;
  timestamp_ms: number | null;
  content: string;
  created_at: string;
  author?: { username: string; avatar_url: string | null; avatarSigned?: string | null; verified?: boolean };
};

type Props = {
  postId: string;
  trackIndex: number;
  durationMs: number;
  currentMs: number;
  onSeek: (ms: number) => void;
  currentUserId: string | null;
  canDeleteAny: boolean;
  onCountChange?: (n: number) => void;
};

const PAGE_SIZE = 5;
const MAX_VISUAL_DEPTH = 5;

async function signAvatar(path: string | null): Promise<string | null> {
  if (!path) return null;
  if (path.startsWith("http")) return path;
  const { data } = await supabase.storage.from("avatars").createSignedUrl(path, 3600);
  return data?.signedUrl ?? null;
}

function fmt(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}

function countDescendants(id: string, childMap: Map<string, TrackCommentRow[]>): number {
  const kids = childMap.get(id) ?? [];
  let n = kids.length;
  for (const k of kids) n += countDescendants(k.id, childMap);
  return n;
}

export function TrackCommentsPanel(props: Props) {
  const { postId, trackIndex, durationMs, currentMs, onSeek, currentUserId, canDeleteAny, onCountChange } = props;
  const [rows, setRows] = useState<TrackCommentRow[]>([]);
  const [text, setText] = useState("");
  const [attachAt, setAttachAt] = useState(true);
  const [replyTo, setReplyTo] = useState<TrackCommentRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [visibleTop, setVisibleTop] = useState(PAGE_SIZE);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [suggestions, setSuggestions] = useState<{ id: string; username: string; avatar_url: string | null }[]>([]);
  const [mentionRange, setMentionRange] = useState<{ start: number; query: string } | null>(null);
  const [suggestIndex, setSuggestIndex] = useState(0);

  useEffect(() => {
    if (!mentionRange) { setSuggestions([]); return; }
    let alive = true;
    const t = setTimeout(async () => {
      const res = await searchUsernames({ data: { q: mentionRange.query } });
      if (alive) setSuggestions(res.users);
    }, 120);
    return () => { alive = false; clearTimeout(t); };
  }, [mentionRange]);

  const applyMention = useCallback((username: string | undefined) => {
    if (!username || !mentionRange) return;
    const ta = textareaRef.current;
    const caret = ta?.selectionStart ?? text.length;
    const before = text.slice(0, mentionRange.start);
    const after = text.slice(caret);
    const insert = `@${username} `;
    const next = before + insert + after;
    setText(next);
    setMentionRange(null);
    setSuggestions([]);
    requestAnimationFrame(() => {
      const pos = before.length + insert.length;
      ta?.focus();
      ta?.setSelectionRange(pos, pos);
    });
  }, [mentionRange, text]);


  const load = useCallback(async () => {
    const { data } = await supabase
      .from("track_comments")
      .select("id, post_id, track_index, author_id, parent_id, timestamp_ms, content, created_at")
      .eq("post_id", postId)
      .eq("track_index", trackIndex)
      .order("created_at", { ascending: true });
    const list = (data ?? []) as TrackCommentRow[];
    const authorIds = Array.from(new Set(list.map((c) => c.author_id)));
    if (authorIds.length) {
      const { data: authors } = await supabase
        .from("profiles")
        .select("id, username, avatar_url, verified")
        .in("id", authorIds);
      const map = new Map<string, TrackCommentRow["author"]>();
      for (const a of authors ?? []) {
        const signed = await signAvatar(a.avatar_url);
        map.set(a.id, { username: a.username, avatar_url: a.avatar_url, avatarSigned: signed, verified: (a as { verified?: boolean }).verified });
      }
      for (const r of list) r.author = map.get(r.author_id);
    }
    setRows(list);
    onCountChange?.(list.length);
  }, [postId, trackIndex, onCountChange]);

  useEffect(() => { load(); }, [load]);

  async function send() {
    if (!currentUserId || !text.trim()) return;
    setBusy(true);
    const payload = {
      post_id: postId,
      track_index: trackIndex,
      author_id: currentUserId,
      parent_id: replyTo?.id ?? null,
      content: text.trim(),
      timestamp_ms: replyTo ? null : (attachAt ? Math.max(0, Math.floor(currentMs)) : null),
    };
    const { error } = await supabase.from("track_comments").insert(payload);
    setBusy(false);
    if (!error) {
      setText("");
      setReplyTo(null);
      load();
    }
  }

  async function remove(id: string) {
    if (!confirm("Удалить комментарий и все ответы?")) return;
    await supabase.from("track_comments").delete().eq("id", id);
    load();
  }

  const { parents, childMap } = useMemo(() => {
    const parents = rows.filter((r) => !r.parent_id);
    const childMap = new Map<string, TrackCommentRow[]>();
    for (const r of rows) {
      if (r.parent_id) {
        const arr = childMap.get(r.parent_id) ?? [];
        arr.push(r);
        childMap.set(r.parent_id, arr);
      }
    }
    return { parents, childMap };
  }, [rows]);

  const toggleCollapse = useCallback((id: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  void durationMs; // strip moved into TrackPlayer
  const visibleParents = parents.slice(0, visibleTop);

  return (
    <div className="mt-3 space-y-3 rounded-xl border border-border/60 bg-background/40 p-3">
      {/* Timestamped-comments strip is rendered under the waveform inside TrackPlayer (SoundCloud style) */}

      <div className="space-y-2 max-h-[32rem] overflow-y-auto pr-1">
        {parents.length === 0 && <p className="text-center text-xs text-muted-foreground py-4">Ещё нет комментариев. Оставь фидбэк по треку!</p>}
        {visibleParents.map((c) => (
          <CommentNode
            key={c.id}
            row={c}
            depth={0}
            childMap={childMap}
            collapsed={collapsed}
            onToggleCollapse={toggleCollapse}
            currentUserId={currentUserId}
            canDeleteAny={canDeleteAny}
            onSeek={onSeek}
            onReply={setReplyTo}
            onDelete={remove}
          />
        ))}
        {parents.length > visibleTop && (
          <div className="flex justify-center pt-1">
            <button
              type="button"
              onClick={() => setVisibleTop((n) => n + PAGE_SIZE)}
              className="rounded-full border border-border bg-secondary/40 px-3 py-1 text-[11px] text-muted-foreground hover:bg-secondary hover:text-foreground"
            >
              Показать ещё ({parents.length - visibleTop})
            </button>
          </div>
        )}
        {visibleTop > PAGE_SIZE && parents.length <= visibleTop && (
          <div className="flex justify-center pt-1">
            <button
              type="button"
              onClick={() => setVisibleTop(PAGE_SIZE)}
              className="text-[11px] text-muted-foreground hover:text-foreground"
            >
              Свернуть
            </button>
          </div>
        )}
      </div>

      {currentUserId ? (
        <div className="rounded-lg border border-border bg-secondary/30 p-2">
          {replyTo && (
            <div className="mb-2 flex items-center gap-2 text-[11px] text-mint">
              <CornerDownRight className="h-3 w-3" />
              Ответ для <span className="font-semibold">{replyTo.author?.username ?? "?"}</span>
              <span className="truncate text-muted-foreground">«{replyTo.content.slice(0, 40)}{replyTo.content.length > 40 ? "…" : ""}»</span>
              <button onClick={() => setReplyTo(null)} className="ml-auto text-muted-foreground hover:text-foreground">×</button>
            </div>
          )}
          <div className="relative flex items-start gap-2">
            <div className="relative min-w-0 flex-1">
              <textarea
                ref={textareaRef}
                value={text}
                onChange={(e) => {
                  const v = e.target.value;
                  setText(v);
                  const caret = e.target.selectionStart ?? v.length;
                  const m = detectMentionQuery(v, caret);
                  setMentionRange(m);
                  setSuggestIndex(0);
                }}
                onKeyDown={(e) => {
                  if (!mentionRange || suggestions.length === 0) return;
                  if (e.key === "ArrowDown") { e.preventDefault(); setSuggestIndex((i) => (i + 1) % suggestions.length); }
                  else if (e.key === "ArrowUp") { e.preventDefault(); setSuggestIndex((i) => (i - 1 + suggestions.length) % suggestions.length); }
                  else if (e.key === "Enter" || e.key === "Tab") {
                    e.preventDefault();
                    applyMention(suggestions[suggestIndex]?.username);
                  } else if (e.key === "Escape") {
                    setMentionRange(null);
                  }
                }}
                onBlur={() => setTimeout(() => setMentionRange(null), 120)}
                placeholder={replyTo ? "Написать ответ... используй @ник, чтобы упомянуть" : "Оставь коммент. Используй @ник, чтобы упомянуть пользователя..."}
                rows={2}
                maxLength={1000}
                className="w-full resize-none rounded-md border border-input bg-background px-2 py-1.5 text-sm outline-none focus:ring-1 focus:ring-ring"
              />
              {mentionRange && suggestions.length > 0 && (
                <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-56 overflow-y-auto rounded-md border border-border bg-popover p-1 shadow-lg">
                  {suggestions.map((u, i) => (
                    <button
                      key={u.id}
                      type="button"
                      onMouseDown={(e) => { e.preventDefault(); applyMention(u.username); }}
                      onMouseEnter={() => setSuggestIndex(i)}
                      className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs ${i === suggestIndex ? "bg-secondary" : "hover:bg-secondary/60"}`}
                    >
                      <div className="grid h-5 w-5 place-items-center overflow-hidden rounded-full bg-secondary text-[10px] font-bold text-mint">
                        <AvatarImage path={u.avatar_url} fallback={u.username[0]?.toUpperCase() ?? "?"} className={u.avatar_url ? "h-full w-full object-cover" : ""} />
                      </div>
                      <span className="truncate font-medium">@{u.username}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="flex flex-col gap-1">
              <EmojiTrigger onPick={(e) => setText((t) => t + e)} />
              <button
                type="button"
                onClick={send}
                disabled={busy || !text.trim()}
                className="grid h-8 w-8 place-items-center rounded-md bg-primary text-primary-foreground disabled:opacity-50"
                aria-label="Отправить"
              >
                <Send className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
          {!replyTo && (
            <label className="mt-2 flex items-center gap-2 text-[11px] text-muted-foreground">
              <input type="checkbox" checked={attachAt} onChange={(e) => setAttachAt(e.target.checked)} className="accent-mint" />
              Прикрепить к моменту <span className="font-mono text-mint">{fmt(currentMs)}</span>
            </label>
          )}
        </div>
      ) : (
        <p className="text-center text-xs text-muted-foreground">Войди, чтобы оставить комментарий.</p>
      )}
    </div>
  );
}

// Thread accent colors cycle by depth for visual hierarchy
const THREAD_COLORS = [
  "border-mint/70",
  "border-cyan/60",
  "border-violet-400/60",
  "border-amber-400/60",
  "border-pink-400/60",
  "border-border",
];

function CommentNode({
  row, depth, childMap, collapsed, onToggleCollapse,
  currentUserId, canDeleteAny, onSeek, onReply, onDelete,
}: {
  row: TrackCommentRow;
  depth: number;
  childMap: Map<string, TrackCommentRow[]>;
  collapsed: Set<string>;
  onToggleCollapse: (id: string) => void;
  currentUserId: string | null;
  canDeleteAny: boolean;
  onSeek: (ms: number) => void;
  onReply: (r: TrackCommentRow) => void;
  onDelete: (id: string) => void;
}) {
  const canDelete = currentUserId && (row.author_id === currentUserId || canDeleteAny);
  const children = childMap.get(row.id) ?? [];
  const isCollapsed = collapsed.has(row.id);
  const totalDescendants = children.length ? countDescendants(row.id, childMap) : 0;
  const avatarSize = depth === 0 ? "h-7 w-7" : "h-6 w-6";
  const bubbleTone = depth === 0 ? "bg-secondary/40" : "bg-secondary/30";
  const textSize = depth === 0 ? "text-sm" : "text-xs";
  const nameSize = depth === 0 ? "text-xs" : "text-[11px]";

  return (
    <div>
      <div className="group flex gap-2">
        <div className={`grid ${avatarSize} shrink-0 place-items-center overflow-hidden rounded-full bg-secondary text-[10px] font-bold text-mint`}>
          {row.author?.avatarSigned ? <img src={row.author.avatarSigned} className="h-full w-full object-cover" alt="" /> : (row.author?.username ?? "?")[0].toUpperCase()}
        </div>
        <div className={`min-w-0 flex-1 rounded-lg ${bubbleTone} px-3 py-2`}>
          <div className={`flex items-center gap-2 ${nameSize}`}>
            {children.length > 0 && (
              <button
                type="button"
                onClick={() => onToggleCollapse(row.id)}
                className="grid h-4 w-4 place-items-center rounded text-muted-foreground hover:text-foreground"
                aria-label={isCollapsed ? "Развернуть" : "Свернуть"}
              >
                {isCollapsed ? <ChevronRight className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              </button>
            )}
            <span className="font-semibold">{row.author?.username ?? "..."}</span>
            {row.author?.verified && <span title="Верифицирован" className="text-cyan">✔</span>}
            {row.timestamp_ms != null && (
              <button
                onClick={() => onSeek(row.timestamp_ms ?? 0)}
                className="inline-flex items-center gap-1 rounded bg-mint/15 px-1.5 py-0.5 font-mono text-[10px] text-mint hover:bg-mint/25"
              >
                <Play className="h-2.5 w-2.5 fill-current" /> {fmt(row.timestamp_ms)}
              </button>
            )}
            <span className="text-[10px] text-muted-foreground">
              {new Date(row.created_at).toLocaleString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
            </span>
            <div className="ml-auto flex items-center gap-2 opacity-0 transition group-hover:opacity-100">
              {currentUserId && (
                <button onClick={() => onReply(row)} className="text-[10px] text-muted-foreground hover:text-foreground">Ответить</button>
              )}
              {canDelete && (
                <button onClick={() => onDelete(row.id)} aria-label="Удалить" className="text-muted-foreground hover:text-destructive">
                  <Trash2 className="h-3 w-3" />
                </button>
              )}
            </div>
          </div>
          <MentionText text={row.content} className={`mt-0.5 block whitespace-pre-wrap ${textSize}`} />
        </div>
      </div>

      {children.length > 0 && isCollapsed && (
        <button
          type="button"
          onClick={() => onToggleCollapse(row.id)}
          className="mt-1 ml-9 text-[11px] text-muted-foreground hover:text-foreground"
        >
          + Показать {totalDescendants} {totalDescendants === 1 ? "ответ" : "ответов"}
        </button>
      )}

      {children.length > 0 && !isCollapsed && (
        <div
          className={`mt-1 space-y-1 border-l-2 ${THREAD_COLORS[Math.min(depth, THREAD_COLORS.length - 1)]} ${depth === 0 ? "ml-9 pl-3" : "ml-4 pl-3"}`}
        >
          {children.map((child) => {
            // Cap visual indentation at MAX_VISUAL_DEPTH — deeper replies stay at same indent
            const nextDepth = Math.min(depth + 1, MAX_VISUAL_DEPTH);
            return (
              <CommentNode
                key={child.id}
                row={child}
                depth={nextDepth}
                childMap={childMap}
                collapsed={collapsed}
                onToggleCollapse={onToggleCollapse}
                currentUserId={currentUserId}
                canDeleteAny={canDeleteAny}
                onSeek={onSeek}
                onReply={onReply}
                onDelete={onDelete}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
