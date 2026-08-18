import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  Trophy, Gamepad2, GraduationCap, SlidersHorizontal, Pencil, Check, X,
  Shield, ShieldCheck, Crown, ImagePlus, Send, Trash2,
  Music4, Loader2, AlertTriangle, BadgeCheck,
  Search, LayoutGrid, List as ListIcon, Plus, ChevronDown, ChevronUp,
  Play, Heart, MessageCircle, Headphones, KeyRound,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { type PlayerTrack } from "@/components/track-player";
import { TrackCard } from "@/components/track-card";
import { AvatarEditor } from "@/components/avatar-editor";
import { analyzeAudioFile, fileExt, isLossless, isLossy, type TrackAnalysis } from "@/lib/audio-analysis";
import { leagueForXp, nextLeague, progressInLeague } from "@/lib/leagues";
import { uploadWithProgress, removeStorageObjects, formatBytes } from "@/lib/upload-progress";
import { resolveStorageUrl } from "@/lib/storage-url";
import { SocialLinksEditor, parseSocials } from "@/components/social-links";

export const Route = createFileRoute("/_authenticated/profile")({
  component: ProfilePage,
});

type Profile = Tables<"profiles"> & { verified?: boolean | null };
type GameScore = Tables<"game_scores">;

const AUDIO_EXTS = new Set(["wav", "flac", "aiff", "aif", "mp3", "aac", "m4a", "ogg", "opus"]);
const IMAGE_EXTS = new Set(["png", "jpg", "jpeg", "webp", "gif", "avif"]);

const ROLE_META: Record<string, { label: string; icon: typeof Shield; className: string }> = {
  super_admin: { label: "Супер-админ", icon: Crown, className: "text-yellow-400 border-yellow-400/40 bg-yellow-400/10" },
  admin: { label: "Админ", icon: ShieldCheck, className: "text-mint border-mint/40 bg-mint/10" },
  moderator: { label: "Модератор", icon: Shield, className: "text-cyan-400 border-cyan-400/40 bg-cyan-400/10" },
};


type StoredTrack = {
  path: string;
  label: string;
  format: string;
  size?: number;
  analysis?: TrackAnalysis;
  warnings?: string[];
};

type PostRow = {
  id: string;
  content: string;
  title: string | null;
  genre: string | null;
  play_count: number;
  media_urls: string[];
  tracks: StoredTrack[] | null;
  created_at: string;
  author_id: string;
};

type WallPost = PostRow & {
  imagesSigned: string[];
  playerTracks: PlayerTrack[];
  likeCount: number;
  likedByMe: boolean;
  commentCount: number;
};

async function signUrl(bucket: "avatars" | "wall", path: string): Promise<string | null> {
  return resolveStorageUrl(bucket, path, bucket);
}

type PendingTrack = {
  file: File;
  label: string;
  format: string;
  analyzing: boolean;
  analysis?: TrackAnalysis;
  warnings: string[];
  error?: string;
};

function ProfilePage() {
  const { user } = Route.useRouteContext();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [avatarSigned, setAvatarSigned] = useState<string | null>(null);
  const [scores, setScores] = useState<GameScore[]>([]);
  const [lessonsDone, setLessonsDone] = useState(0);
  const [presetsCount, setPresetsCount] = useState(0);
  const [roles, setRoles] = useState<string[]>([]);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ username: "", full_name: "", bio: "" });
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  const [changingPassword, setChangingPassword] = useState(false);
  const [pwForm, setPwForm] = useState({ password: "", confirm: "" });
  const [pwSaving, setPwSaving] = useState(false);
  const [pwError, setPwError] = useState<string | null>(null);
  const [pwDone, setPwDone] = useState(false);

  const [posts, setPosts] = useState<WallPost[]>([]);
  const [postText, setPostText] = useState("");
  const [postTitle, setPostTitle] = useState("");
  const [postGenre, setPostGenre] = useState("");
  const [postImages, setPostImages] = useState<File[]>([]);
  const [pendingTracks, setPendingTracks] = useState<PendingTrack[]>([]);
  const [posting, setPosting] = useState(false);
  const [uploads, setUploads] = useState<Record<string, { name: string; loaded: number; total: number }>>({});
  const [pendingAvatar, setPendingAvatar] = useState<File | null>(null);
  const [composerOpen, setComposerOpen] = useState(false);
  const [wallView, setWallView] = useState<"list" | "grid">("list");
  const [wallSearch, setWallSearch] = useState("");
  const [wallGenre, setWallGenre] = useState<string>("");
  const [wallSort, setWallSort] = useState<"new" | "old" | "plays" | "likes">("new");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const trackInputRef = useRef<HTMLInputElement>(null);

  const isSuperAdmin = roles.includes("super_admin");
  const canModerate = roles.some((r) => r === "moderator" || r === "admin" || r === "super_admin");


  const loadWall = useCallback(async () => {
    const { data: pdata } = await supabase
      .from("posts")
      .select("id, content, title, genre, play_count, media_urls, tracks, created_at, author_id")
      .eq("author_id", user.id)
      .order("created_at", { ascending: false })
      .limit(30);
    const rows = (pdata ?? []) as PostRow[];
    if (rows.length === 0) { setPosts([]); return; }
    const ids = rows.map((r) => r.id);
    const [likesRes, commentsRes] = await Promise.all([
      supabase.from("post_likes").select("post_id, user_id").in("post_id", ids),
      supabase.from("track_comments").select("post_id").in("post_id", ids),
    ]);

    const built: WallPost[] = await Promise.all(
      rows.map(async (r) => {
        const imagesSigned = (await Promise.all(r.media_urls.map((m) => signUrl("wall", m)))).filter(Boolean) as string[];
        const trackList = Array.isArray(r.tracks) ? r.tracks : [];
        const playerTracks: PlayerTrack[] = (await Promise.all(
          trackList.map(async (t) => {
            const url = await signUrl("wall", t.path);
            if (!url) return null;
            return {
              url,
              label: t.label || "Без названия",
              format: t.format,
              size: t.size,
              analysis: t.analysis,
              warnings: t.warnings,
            } as PlayerTrack;
          }),
        )).filter(Boolean) as PlayerTrack[];
        const likes = (likesRes.data ?? []).filter((l) => l.post_id === r.id);
        const commentCount = (commentsRes.data ?? []).filter((c) => c.post_id === r.id).length;
        return {
          ...r,
          imagesSigned,
          playerTracks,
          likeCount: likes.length,
          likedByMe: likes.some((l) => l.user_id === user.id),
          commentCount,
        };
      }),
    );
    setPosts(built);
  }, [user.id]);

  useEffect(() => {
    async function load() {
      const [p, s, lp, pr, rl] = await Promise.all([
        supabase.from("profiles").select("*").eq("id", user.id).maybeSingle(),
        supabase.from("game_scores").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(20),
        supabase.from("lesson_progress").select("id", { count: "exact", head: true }).eq("user_id", user.id),
        supabase.from("presets").select("id", { count: "exact", head: true }).eq("author_id", user.id),
        supabase.from("user_roles").select("role").eq("user_id", user.id),
      ]);
      if (p.data) {
        setProfile(p.data);
        setForm({ username: p.data.username ?? "", full_name: p.data.full_name ?? "", bio: p.data.bio ?? "" });
        const signed = p.data.avatar_url ? await signUrl("avatars", p.data.avatar_url) : null;
        setAvatarSigned(signed);
      }
      if (s.data) setScores(s.data);
      setLessonsDone(lp.count ?? 0);
      setPresetsCount(pr.count ?? 0);
      if (rl.data) setRoles(rl.data.map((r) => r.role as string));
      loadWall();
    }
    load();
  }, [user.id, loadWall]);

  async function saveProfile() {
    if (!form.username.trim() || !profile) return;
    setSaving(true);
    const { error } = await supabase.from("profiles").update({
      username: form.username.trim(),
      full_name: form.full_name.trim() || null,
      bio: form.bio.trim() || null,
    }).eq("id", user.id);
    setSaving(false);
    if (!error) {
      setProfile({ ...profile, username: form.username.trim(), full_name: form.full_name.trim() || null, bio: form.bio.trim() || null });
      setEditing(false);
    }
  }

  async function savePassword(e: React.FormEvent) {
    e.preventDefault();
    setPwError(null);
    if (pwForm.password.length < 6) {
      setPwError("Пароль должен быть не короче 6 символов.");
      return;
    }
    if (pwForm.password !== pwForm.confirm) {
      setPwError("Пароли не совпадают.");
      return;
    }
    setPwSaving(true);
    try {
      // Works regardless of how the current session was established
      // (email/password, Google, or a recovery link) — updateUser just
      // needs any active session. This is now the durable way to set a
      // password on an account, including ones that only ever signed in
      // via Google, without depending on the email-link redirect flow.
      const { error } = await supabase.auth.updateUser({ password: pwForm.password });
      if (error) throw error;
      setPwDone(true);
      setPwForm({ password: "", confirm: "" });
      setTimeout(() => { setChangingPassword(false); setPwDone(false); }, 2000);
    } catch (err) {
      setPwError(err instanceof Error ? err.message : "Ошибка");
    } finally {
      setPwSaving(false);
    }
  }

  function onAvatarPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 12 * 1024 * 1024) { alert("Файл больше 12 МБ"); return; }
    setPendingAvatar(file);
    if (avatarInputRef.current) avatarInputRef.current.value = "";
  }

  async function uploadAvatarBlob(blob: Blob) {
    if (!profile) return;
    setUploadingAvatar(true);
    const key = `avatar-${Date.now()}`;
    setUploads((u) => ({ ...u, [key]: { name: "Аватар", loaded: 0, total: blob.size } }));
    const { error, path } = await uploadWithProgress("avatars", "avatar.jpg", blob, {
      contentType: "image/jpeg",
      onProgress: (p) => setUploads((u) => ({ ...u, [key]: { name: "Аватар", loaded: p.loaded, total: p.total } })),
    });
    setUploads((u) => { const { [key]: _, ...rest } = u; return rest; });
    if (!error && path) {
      const oldPath = profile.avatar_url;
      await supabase.from("profiles").update({ avatar_url: path }).eq("id", user.id);
      if (oldPath) removeStorageObjects([oldPath]);
      const signed = await signUrl("avatars", path);
      setAvatarSigned(signed);
      setProfile({ ...profile, avatar_url: path });
    } else {
      alert("Не удалось загрузить: " + (error?.message ?? "неизвестная ошибка"));
    }
    setUploadingAvatar(false);
    setPendingAvatar(null);
  }



  async function addTrackFiles(files: FileList | null) {
    if (!files) return;
    const arr = Array.from(files);
    const items: PendingTrack[] = arr.map((f) => {
      const ext = fileExt(f.name);
      const warnings: string[] = [];
      if (!AUDIO_EXTS.has(ext)) warnings.push(`Неизвестный аудиоформат: ${ext.toUpperCase()}`);
      else if (isLossy(f.name)) warnings.push(`Формат ${ext.toUpperCase()} уже сжатый — LUFS и True Peak будут приблизительными. Для точности загружай WAV / FLAC.`);
      if (f.size > 60 * 1024 * 1024) warnings.push("Файл больше 60 МБ — загрузка займёт время.");
      return {
        file: f,
        label: guessVersionLabel(f.name, arr.length),
        format: ext,
        analyzing: true,
        warnings,
      };
    });
    setPendingTracks((prev) => [...prev, ...items].slice(0, 6));
    // analyze sequentially so we don't spin up 5 audio contexts
    for (let i = 0; i < items.length; i++) {
      try {
        const analysis = await analyzeAudioFile(items[i].file);
        setPendingTracks((prev) => prev.map((p) => p.file === items[i].file ? { ...p, analyzing: false, analysis } : p));
      } catch (err) {
        setPendingTracks((prev) => prev.map((p) => p.file === items[i].file ? { ...p, analyzing: false, error: (err as Error).message } : p));
      }
    }
  }

  function guessVersionLabel(name: string, batchSize: number) {
    const low = name.toLowerCase();
    if (/master/.test(low)) return "Мастер";
    if (/premaster|pre-master/.test(low)) return "Пре-мастер";
    if (/mix/.test(low)) return "Микс";
    if (/rough|draft/.test(low)) return "Черновик";
    if (/instrumental|instr/.test(low)) return "Инструментал";
    if (/dry|nofx|raw/.test(low)) return "Без обработки";
    return batchSize > 1 ? name.replace(/\.[^.]+$/, "").slice(0, 30) : "Версия";
  }

  async function submitPost(e: React.FormEvent) {
    e.preventDefault();
    if (!postText.trim() && postImages.length === 0 && pendingTracks.length === 0 && !postTitle.trim()) return;
    setPosting(true);

    const imageUrls: string[] = [];
    for (let i = 0; i < postImages.length; i++) {
      const f = postImages[i];
      const key = `img-${Date.now()}-${i}`;
      setUploads((u) => ({ ...u, [key]: { name: f.name, loaded: 0, total: f.size } }));
      const { error, path } = await uploadWithProgress("wall", f.name, f, {
        contentType: f.type || undefined,
        onProgress: (p) => setUploads((u) => ({ ...u, [key]: { name: f.name, loaded: p.loaded, total: p.total } })),
      });
      setUploads((u) => { const { [key]: _, ...rest } = u; return rest; });
      if (!error && path) imageUrls.push(path);
    }

    const trackRecords: StoredTrack[] = [];
    for (let i = 0; i < pendingTracks.length; i++) {
      const t = pendingTracks[i];
      const ext = fileExt(t.file.name) || "bin";
      const key = `trk-${Date.now()}-${i}`;
      setUploads((u) => ({ ...u, [key]: { name: t.file.name, loaded: 0, total: t.file.size } }));
      const { error, path } = await uploadWithProgress("wall", t.file.name, t.file, {
        contentType: t.file.type || undefined,
        onProgress: (p) => setUploads((u) => ({ ...u, [key]: { name: t.file.name, loaded: p.loaded, total: p.total } })),
      });
      setUploads((u) => { const { [key]: _, ...rest } = u; return rest; });
      if (!error && path) {
        trackRecords.push({
          path,
          label: t.label.trim() || `Версия ${i + 1}`,
          format: ext,
          size: t.file.size,
          analysis: t.analysis,
          warnings: t.warnings,
        });
      }
    }

    const { error } = await supabase.from("posts").insert({
      author_id: user.id,
      content: postText.trim() || " ",
      title: postTitle.trim() || null,
      genre: postGenre.trim().replace(/^#/, "") || null,
      media_urls: imageUrls,
      tracks: trackRecords as unknown as never,
    });
    setPosting(false);
    if (!error) {
      setPostText(""); setPostTitle(""); setPostGenre(""); setPostImages([]); setPendingTracks([]);
      if (imageInputRef.current) imageInputRef.current.value = "";
      if (trackInputRef.current) trackInputRef.current.value = "";
      loadWall();
    }
  }

  async function toggleLike(postId: string) {
    const post = posts.find((p) => p.id === postId);
    if (!post) return;
    if (post.likedByMe) await supabase.from("post_likes").delete().eq("post_id", postId).eq("user_id", user.id);
    else await supabase.from("post_likes").insert({ post_id: postId, user_id: user.id });
    setPosts((prev) => prev.map((p) => p.id === postId ? { ...p, likedByMe: !p.likedByMe, likeCount: p.likeCount + (p.likedByMe ? -1 : 1) } : p));
  }

  async function deletePost(postId: string) {
    if (!confirm("Удалить пост?")) return;
    const post = posts.find((p) => p.id === postId);
    const paths = [...(post?.media_urls ?? []), ...(post?.tracks ?? []).map((t) => t.path)];
    if (paths.length) removeStorageObjects(paths);
    await supabase.from("posts").delete().eq("id", postId);
    setPosts((prev) => prev.filter((p) => p.id !== postId));
  }

  const xp = profile?.xp ?? 0;
  const level = profile?.level ?? 1;
  const xpInLevel = xp % 100;
  const league = leagueForXp(xp);
  const nextL = nextLeague(xp);
  const leagueProgress = progressInLeague(xp);
  const topRole = roles.includes("super_admin") ? "super_admin"
    : roles.includes("admin") ? "admin"
    : roles.includes("moderator") ? "moderator" : null;
  const roleMeta = topRole ? ROLE_META[topRole] : null;

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <UploadProgressPanel uploads={uploads} />
      {/* Header card */}
      <div className="glass rounded-2xl p-6 md:p-8">
        <div className="flex flex-wrap items-start gap-6">
          <div className="relative">
            <div
              className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-secondary text-4xl font-bold text-mint"
              style={{ boxShadow: "var(--shadow-glow-mint)" }}
            >
              {avatarSigned ? <img src={avatarSigned} alt="" className="h-full w-full object-cover" /> : (profile?.username ?? "U")[0].toUpperCase()}
            </div>
            <button type="button" onClick={() => avatarInputRef.current?.click()} disabled={uploadingAvatar}
              aria-label="Изменить фото профиля"
              className="absolute -bottom-1 -right-1 grid h-8 w-8 place-items-center rounded-full border border-border bg-background text-foreground shadow-md hover:bg-secondary disabled:opacity-50"
            >
              <ImagePlus className="h-4 w-4" />
            </button>
            <input ref={avatarInputRef} type="file" accept="image/*" className="hidden" onChange={onAvatarPick} />
            {pendingAvatar && (
              <AvatarEditor
                file={pendingAvatar}
                onCancel={() => setPendingAvatar(null)}
                onConfirm={uploadAvatarBlob}
              />
            )}
          </div>

          <div className="min-w-0 flex-1">
            {editing ? (
              <div className="space-y-2">
                <input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} placeholder="Никнейм" maxLength={30}
                  className="w-full rounded-lg border border-input bg-background px-3 py-1.5 text-lg font-semibold outline-none focus:ring-2 focus:ring-ring" />
                <input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} placeholder="Имя и фамилия (ФИО)" maxLength={100}
                  className="w-full rounded-lg border border-input bg-background px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring" />
                <textarea value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })} placeholder="О себе (стиль, DAW, инструменты...)" maxLength={500} rows={3}
                  className="w-full resize-none rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring" />
                <div className="flex gap-2">
                  <button onClick={saveProfile} disabled={saving} className="inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground disabled:opacity-50">
                    <Check className="h-4 w-4" /> Сохранить
                  </button>
                  <button onClick={() => setEditing(false)} className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-sm">
                    <X className="h-4 w-4" /> Отмена
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="truncate text-2xl font-bold">{profile?.username ?? "..."}</h1>
                  {profile?.verified && (
                    <span title="Верифицированный аккаунт" className="inline-flex items-center gap-1 rounded-md border border-cyan-400/50 bg-cyan-400/10 px-1.5 py-0.5 text-xs font-semibold text-cyan-300">
                      <BadgeCheck className="h-3.5 w-3.5" />
                    </span>
                  )}
                  {roleMeta && (
                    <span className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-semibold ${roleMeta.className}`}>
                      <roleMeta.icon className="h-3.5 w-3.5" /> {roleMeta.label}
                    </span>
                  )}
                  <span
                    title={`Лига: ${league.name}`}
                    className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-bold ${league.color} ${league.bg} ${league.border}`}
                    style={{ boxShadow: league.aura }}
                  >
                    <span className="text-sm leading-none">{league.icon}</span> {league.name}
                  </span>
                  <span className="rounded-md border border-violet/40 bg-violet/10 px-2 py-0.5 text-xs font-mono font-bold text-violet">LV {level}</span>
                  <button onClick={() => setEditing(true)} aria-label="Редактировать профиль" className="ml-auto text-muted-foreground hover:text-foreground">
                    <Pencil className="h-4 w-4" />
                  </button>
                </div>
                {profile?.full_name && <p className="mt-1 text-sm font-medium text-foreground/90">{profile.full_name}</p>}
                <p className="mt-1 text-xs text-muted-foreground">{user.email}</p>
                {profile?.bio && <p className="mt-3 whitespace-pre-wrap text-sm text-foreground/80">{profile.bio}</p>}
                <div className="mt-3">
                  <SocialLinksEditor
                    value={parseSocials((profile as unknown as { socials?: unknown })?.socials)}
                    onSave={async (next) => {
                      if (!profile) return;
                      const { error } = await supabase
                        .from("profiles")
                        .update({ socials: next } as never)
                        .eq("id", user.id);
                      if (error) { alert("Ошибка: " + error.message); return; }
                      setProfile({ ...profile, ...({ socials: next } as Partial<Profile>) });
                    }}
                  />
                </div>
                <div className="mt-4">
                  <div className="flex items-center justify-between text-xs">
                    <span className={`font-semibold ${league.color}`}>{league.name}</span>
                    <span className="text-muted-foreground">
                      {nextL ? <>Ещё <span className="font-mono text-foreground">{leagueProgress.toNext}</span> XP до <span className={nextL.color}>{nextL.name}</span></> : "Максимальная лига"}
                    </span>
                  </div>
                  <div className="mt-1 h-2 overflow-hidden rounded-full bg-secondary">
                    <div className="h-full rounded-full transition-all" style={{ width: `${leagueProgress.pct}%`, background: "var(--gradient-neon)" }} />
                  </div>
                </div>

              </>
            )}
          </div>
        </div>
      </div>

      {/* Password */}
      <div className="glass mt-4 rounded-2xl p-5">
        {!changingPassword ? (
          <button
            type="button"
            onClick={() => { setChangingPassword(true); setPwError(null); setPwDone(false); }}
            className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground"
          >
            <KeyRound className="h-4 w-4" /> Сменить пароль
          </button>
        ) : (
          <form onSubmit={savePassword} className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <KeyRound className="h-4 w-4" /> Сменить пароль
            </div>
            <div className="flex flex-wrap gap-2">
              <input
                type="password"
                required
                minLength={6}
                placeholder="Новый пароль"
                value={pwForm.password}
                onChange={(e) => setPwForm({ ...pwForm, password: e.target.value })}
                className="min-w-[180px] flex-1 rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
              />
              <input
                type="password"
                required
                minLength={6}
                placeholder="Повторите пароль"
                value={pwForm.confirm}
                onChange={(e) => setPwForm({ ...pwForm, confirm: e.target.value })}
                className="min-w-[180px] flex-1 rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            {pwError && <p className="text-sm text-destructive">{pwError}</p>}
            {pwDone && <p className="text-sm text-mint">Пароль обновлён.</p>}
            <div className="flex gap-2">
              <button type="submit" disabled={pwSaving} className="inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground disabled:opacity-50">
                <Check className="h-4 w-4" /> {pwSaving ? "Секунду..." : "Сохранить"}
              </button>
              <button type="button" onClick={() => { setChangingPassword(false); setPwError(null); setPwForm({ password: "", confirm: "" }); }} className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-sm">
                <X className="h-4 w-4" /> Отмена
              </button>
            </div>
          </form>
        )}
      </div>

      <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        {[
          { icon: Trophy, label: "Всего XP", value: xp, color: "text-mint" },
          { icon: Gamepad2, label: "Игр сыграно", value: scores.length >= 20 ? "20+" : scores.length, color: "text-cyan" },
          { icon: GraduationCap, label: "Уроков пройдено", value: lessonsDone, color: "text-violet" },
          { icon: SlidersHorizontal, label: "Пресетов", value: presetsCount, color: "text-mint" },
        ].map((s) => (
          <div key={s.label} className="glass rounded-2xl p-5 text-center">
            <s.icon className={`mx-auto h-6 w-6 ${s.color}`} />
            <div className="mt-2 text-2xl font-bold">{s.value}</div>
            <div className="text-xs text-muted-foreground">{s.label}</div>
          </div>
        ))}
      </div>





      {/* Wall of works — compact, searchable, scalable */}
      <WallSection
        posts={posts}
        profile={profile}
        avatarSigned={avatarSigned}
        userId={user.id}
        canModerate={canModerate}
        composerOpen={composerOpen}
        setComposerOpen={setComposerOpen}
        wallView={wallView}
        setWallView={setWallView}
        wallSearch={wallSearch}
        setWallSearch={setWallSearch}
        wallGenre={wallGenre}
        setWallGenre={setWallGenre}
        wallSort={wallSort}
        setWallSort={setWallSort}
        expandedId={expandedId}
        setExpandedId={setExpandedId}
        onLike={toggleLike}
        onDelete={deletePost}
        composer={
          <form onSubmit={submitPost} className="glass mt-3 rounded-2xl p-4">
            <input value={postTitle} onChange={(e) => setPostTitle(e.target.value)} placeholder="Название работы"
              maxLength={120}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm font-semibold outline-none focus:ring-2 focus:ring-ring" />
            <input value={postGenre} onChange={(e) => setPostGenre(e.target.value)} placeholder="Жанр: House / Techno / Pop..."
              maxLength={40}
              className="mt-2 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring" />
            <textarea value={postText} onChange={(e) => setPostText(e.target.value)} placeholder="Расскажи о треке: жанр, референсы, что хочешь услышать в фидбэке..."
              rows={3} maxLength={2000}
              className="mt-2 w-full resize-none rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring" />

            {pendingTracks.length > 0 && (
              <div className="mt-3 space-y-2">
                {pendingTracks.map((t, i) => (
                  <div key={i} className="rounded-lg border border-border bg-background/50 p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Music4 className="h-4 w-4 text-mint" />
                      <input
                        value={t.label}
                        onChange={(e) => setPendingTracks((prev) => prev.map((p, j) => j === i ? { ...p, label: e.target.value } : p))}
                        placeholder="Пометка (Мастер / Без мастеринга / v2)"
                        maxLength={40}
                        className="min-w-0 flex-1 rounded border border-input bg-background px-2 py-1 text-sm outline-none focus:ring-1 focus:ring-ring"
                      />
                      <span className={`rounded px-2 py-0.5 text-[10px] font-mono uppercase ${isLossless(t.file.name) ? "bg-mint/15 text-mint" : "bg-amber-500/15 text-amber-300"}`}>{t.format}</span>
                      <span className="font-mono text-[10px] text-muted-foreground">{(t.file.size / 1024 / 1024).toFixed(1)} МБ</span>
                      <button type="button" onClick={() => setPendingTracks((prev) => prev.filter((_, j) => j !== i))}
                        className="ml-auto text-muted-foreground hover:text-destructive" aria-label="Убрать">
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="mt-2 flex items-center gap-2 text-xs">
                      {t.analyzing ? (
                        <span className="inline-flex items-center gap-1 text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" /> Анализ...</span>
                      ) : t.error ? (
                        <span className="text-destructive">Ошибка: {t.error}</span>
                      ) : t.analysis ? (
                        <span className="font-mono text-muted-foreground">
                          LUFS {isFinite(t.analysis.lufsIntegrated) ? t.analysis.lufsIntegrated.toFixed(1) : "—"} · TP {t.analysis.truePeakDb.toFixed(1)} · DR {t.analysis.crestDb.toFixed(1)} · {t.analysis.channels === 1 ? "MONO" : "STEREO"} @ {(t.analysis.sampleRate / 1000).toFixed(1)}k
                        </span>
                      ) : null}
                    </div>
                    {t.warnings.length > 0 && (
                      <div className="mt-2 flex gap-2 rounded border border-amber-500/30 bg-amber-500/5 px-2 py-1.5 text-[11px] text-amber-200">
                        <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                        <div>{t.warnings.map((w, k) => <p key={k}>{w}</p>)}</div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {postImages.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {postImages.map((f, i) => (
                  <span key={i} className="inline-flex items-center gap-1 rounded-md border border-border bg-secondary/50 px-2 py-1 text-xs">
                    {f.name}
                    <button type="button" onClick={() => setPostImages(postImages.filter((_, j) => j !== i))} className="text-muted-foreground hover:text-destructive">
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button type="button" onClick={() => trackInputRef.current?.click()}
                className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-secondary">
                <Music4 className="h-4 w-4" /> Добавить трек
              </button>
              <input ref={trackInputRef} type="file" accept="audio/*,.wav,.flac,.aif,.aiff,.mp3,.aac,.m4a,.ogg" multiple className="hidden"
                onChange={(e) => { addTrackFiles(e.target.files); if (trackInputRef.current) trackInputRef.current.value = ""; }} />
              <button type="button" onClick={() => imageInputRef.current?.click()}
                className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-secondary">
                <ImagePlus className="h-4 w-4" /> Обложка / скрин
              </button>
              <input ref={imageInputRef} type="file" accept="image/*" multiple className="hidden"
                onChange={(e) => { setPostImages(Array.from(e.target.files ?? []).slice(0, 4)); }} />
              <button type="submit" disabled={posting || pendingTracks.some((t) => t.analyzing)}
                className="ml-auto inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-1.5 text-sm font-semibold text-primary-foreground disabled:opacity-50">
                {posting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Опубликовать
              </button>
            </div>
          </form>
        }
      />

      <h2 className="mt-12 text-xl font-semibold">Последние игры</h2>
      {scores.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">Ты ещё не играл. Загляни в раздел «Игры»!</p>
      ) : (
        <div className="glass mt-4 overflow-hidden rounded-2xl">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="px-5 py-3">Игра</th>
                <th className="px-5 py-3">Очки</th>
                <th className="px-5 py-3">Точность</th>
                <th className="px-5 py-3">Дата</th>
              </tr>
            </thead>
            <tbody>
              {scores.map((s) => (
                <tr key={s.id} className="border-b border-border/50 last:border-0">
                  <td className="px-5 py-3 font-medium">{s.game_type === "frequency" ? "Угадай частоту" : "Найди изменение"}</td>
                  <td className="px-5 py-3 font-bold text-mint">+{s.score}</td>
                  <td className="px-5 py-3">{s.accuracy != null ? `${Math.round(s.accuracy)}%` : "—"}</td>
                  <td className="px-5 py-3 text-muted-foreground">{new Date(s.created_at).toLocaleDateString("ru-RU")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}


// Unused helper kept to satisfy lint if imported elsewhere
export const _unused = { AUDIO_EXTS, IMAGE_EXTS };

// ─── Wall section ────────────────────────────────────────────────────────────

type WallSectionProps = {
  posts: WallPost[];
  profile: Profile | null;
  avatarSigned: string | null;
  userId: string;
  canModerate: boolean;
  composerOpen: boolean;
  setComposerOpen: (v: boolean) => void;
  wallView: "list" | "grid";
  setWallView: (v: "list" | "grid") => void;
  wallSearch: string;
  setWallSearch: (v: string) => void;
  wallGenre: string;
  setWallGenre: (v: string) => void;
  wallSort: "new" | "old" | "plays" | "likes";
  setWallSort: (v: "new" | "old" | "plays" | "likes") => void;
  expandedId: string | null;
  setExpandedId: (v: string | null) => void;
  onLike: (id: string) => void;
  onDelete: (id: string) => void;
  composer: React.ReactNode;
};

function formatDuration(sec?: number) {
  if (!sec || !isFinite(sec)) return "—";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function WallSection(props: WallSectionProps) {
  const {
    posts, profile, avatarSigned, userId, canModerate,
    composerOpen, setComposerOpen, wallView, setWallView,
    wallSearch, setWallSearch, wallGenre, setWallGenre,
    wallSort, setWallSort, expandedId, setExpandedId,
    onLike, onDelete, composer,
  } = props;

  const genres = useMemo(() => {
    const s = new Set<string>();
    for (const p of posts) if (p.genre) s.add(p.genre);
    return Array.from(s).sort();
  }, [posts]);

  const filtered = useMemo(() => {
    const q = wallSearch.trim().toLowerCase();
    let arr = posts.filter((p) => {
      if (wallGenre && p.genre !== wallGenre) return false;
      if (!q) return true;
      const hay = [p.title, p.content, p.genre].filter(Boolean).join(" ").toLowerCase();
      return hay.includes(q);
    });
    arr = [...arr].sort((a, b) => {
      if (wallSort === "new") return b.created_at.localeCompare(a.created_at);
      if (wallSort === "old") return a.created_at.localeCompare(b.created_at);
      if (wallSort === "plays") return (b.play_count ?? 0) - (a.play_count ?? 0);
      if (wallSort === "likes") return b.likeCount - a.likeCount;
      return 0;
    });
    return arr;
  }, [posts, wallSearch, wallGenre, wallSort]);

  return (
    <section className="mt-12">
      {/* Toolbar */}
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-3 sm:flex sm:flex-wrap sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h2 className="truncate text-xl font-semibold">Портфолио</h2>
          <p className="text-xs text-muted-foreground">
            {posts.length} {posts.length === 1 ? "работа" : posts.length >= 2 && posts.length <= 4 ? "работы" : "работ"}
            {filtered.length !== posts.length && ` · показано ${filtered.length}`}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setComposerOpen(!composerOpen)}
          className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90"
        >
          <Plus className={`h-4 w-4 transition-transform ${composerOpen ? "rotate-45" : ""}`} />
          {composerOpen ? "Закрыть" : "Новая работа"}
        </button>
      </div>

      {/* Composer (collapsible) */}
      {composerOpen && composer}

      {/* Filters */}
      {posts.length > 0 && (
        <div className="mt-4 flex flex-wrap items-center gap-2 rounded-xl border border-border bg-background/40 p-2">
          <div className="relative min-w-[180px] flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              value={wallSearch}
              onChange={(e) => setWallSearch(e.target.value)}
              placeholder="Поиск по названию, жанру, описанию..."
              className="w-full rounded-md border border-input bg-background py-1.5 pl-8 pr-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          {genres.length > 0 && (
            <select
              value={wallGenre}
              onChange={(e) => setWallGenre(e.target.value)}
              className="rounded-md border border-input bg-background px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="">Все жанры</option>
              {genres.map((g) => <option key={g} value={g}>{g}</option>)}
            </select>
          )}
          <select
            value={wallSort}
            onChange={(e) => setWallSort(e.target.value as WallSectionProps["wallSort"])}
            className="rounded-md border border-input bg-background px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="new">Сначала новые</option>
            <option value="old">Сначала старые</option>
            <option value="plays">По прослушиваниям</option>
            <option value="likes">По лайкам</option>
          </select>
          <div className="ml-auto inline-flex overflow-hidden rounded-md border border-border">
            <button
              type="button"
              onClick={() => setWallView("list")}
              aria-label="Список"
              className={`grid h-8 w-8 place-items-center ${wallView === "list" ? "bg-primary text-primary-foreground" : "hover:bg-secondary"}`}
            >
              <ListIcon className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setWallView("grid")}
              aria-label="Сетка"
              className={`grid h-8 w-8 place-items-center ${wallView === "grid" ? "bg-primary text-primary-foreground" : "hover:bg-secondary"}`}
            >
              <LayoutGrid className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* Empty state */}
      {posts.length === 0 && (
        <div className="mt-6 rounded-2xl border border-dashed border-border bg-background/40 p-8 text-center">
          <Music4 className="mx-auto h-8 w-8 text-muted-foreground" />
          <p className="mt-3 text-sm font-medium">Портфолио пусто</p>
          <p className="mt-1 text-xs text-muted-foreground">Загрузи первый трек — он появится здесь с точными измерениями.</p>
          <button
            type="button"
            onClick={() => setComposerOpen(true)}
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground"
          >
            <Plus className="h-4 w-4" /> Добавить работу
          </button>
        </div>
      )}

      {filtered.length === 0 && posts.length > 0 && (
        <p className="mt-6 text-center text-sm text-muted-foreground">Ничего не найдено.</p>
      )}

      {/* Content */}
      {filtered.length > 0 && wallView === "list" && (
        <ul className="mt-4 overflow-hidden rounded-2xl border border-border bg-background/30">
          {filtered.map((post, i) => (
            <WallRow
              key={post.id}
              post={post}
              profile={profile}
              avatarSigned={avatarSigned}
              userId={userId}
              canModerate={canModerate}
              expanded={expandedId === post.id}
              onToggle={() => setExpandedId(expandedId === post.id ? null : post.id)}
              onLike={() => onLike(post.id)}
              onDelete={() => onDelete(post.id)}
              isLast={i === filtered.length - 1}
            />
          ))}
        </ul>
      )}

      {filtered.length > 0 && wallView === "grid" && (
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((post) => (
            <WallCard
              key={post.id}
              post={post}
              onOpen={() => { setWallView("list"); setExpandedId(post.id); setTimeout(() => document.getElementById(`wall-${post.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 50); }}
              onLike={() => onLike(post.id)}
            />
          ))}
        </div>
      )}
    </section>
  );
}

// ─── Compact list row ────────────────────────────────────────────────────────

function WallRow(props: {
  post: WallPost;
  profile: Profile | null;
  avatarSigned: string | null;
  userId: string;
  canModerate: boolean;
  expanded: boolean;
  onToggle: () => void;
  onLike: () => void;
  onDelete: () => void;
  isLast: boolean;
}) {
  const { post, profile, avatarSigned, userId, canModerate, expanded, onToggle, onLike, onDelete, isLast } = props;
  const cover = post.imagesSigned[0] ?? null;
  const primary = post.playerTracks[0];
  const analysis = primary?.analysis;
  const duration = formatDuration(analysis?.durationSec);
  const format = primary?.format?.toUpperCase();

  return (
    <li id={`wall-${post.id}`} className={isLast ? "" : "border-b border-border/60"}>
      <div
        onClick={onToggle}
        className={`grid cursor-pointer grid-cols-[56px_minmax(0,1fr)_auto] items-center gap-3 px-3 py-2.5 transition-colors hover:bg-secondary/40 sm:grid-cols-[56px_minmax(0,1fr)_auto_auto] ${expanded ? "bg-secondary/50" : ""}`}
      >
        {/* Cover */}
        <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-md bg-secondary">
          {cover ? (
            <img src={cover} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="grid h-full w-full place-items-center text-muted-foreground">
              <Music4 className="h-5 w-5" />
            </div>
          )}
          <div className="absolute inset-0 grid place-items-center bg-black/0 transition-colors hover:bg-black/40">
            <Play className="h-5 w-5 opacity-0 transition-opacity group-hover:opacity-100" />
          </div>
        </div>

        {/* Title + meta */}
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-2">
            <h3 className="truncate text-sm font-semibold">{post.title || "Без названия"}</h3>
            {format && (
              <span className={`shrink-0 rounded px-1.5 py-0.5 font-mono text-[9px] font-bold ${format === "WAV" || format === "FLAC" || format === "AIFF" ? "bg-mint/15 text-mint" : "bg-amber-500/15 text-amber-300"}`}>
                {format}
              </span>
            )}
            {post.playerTracks.length > 1 && (
              <span className="shrink-0 rounded border border-violet/40 bg-violet/10 px-1.5 py-0.5 text-[9px] font-bold text-violet">
                A/B ×{post.playerTracks.length}
              </span>
            )}
          </div>
          <div className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
            {post.genre && <span className="truncate">#{post.genre}</span>}
            <span>·</span>
            <span className="font-mono">{duration}</span>
            {analysis && isFinite(analysis.lufsIntegrated) && (
              <>
                <span>·</span>
                <span className="font-mono">{analysis.lufsIntegrated.toFixed(1)} LUFS</span>
              </>
            )}
            <span>·</span>
            <span>{new Date(post.created_at).toLocaleDateString("ru-RU", { day: "numeric", month: "short" })}</span>
          </div>
        </div>

        {/* Stats (desktop) */}
        <div className="hidden shrink-0 items-center gap-3 text-[11px] text-muted-foreground sm:flex">
          <span className="inline-flex items-center gap-1"><Headphones className="h-3 w-3" />{post.play_count ?? 0}</span>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onLike(); }}
            className={`inline-flex items-center gap-1 hover:text-foreground ${post.likedByMe ? "text-mint" : ""}`}
          >
            <Heart className={`h-3 w-3 ${post.likedByMe ? "fill-current" : ""}`} />
            {post.likeCount}
          </button>
          <span className="inline-flex items-center gap-1"><MessageCircle className="h-3 w-3" />{post.commentCount}</span>
        </div>

        {/* Actions */}
        <div className="flex shrink-0 items-center gap-1">
          {post.author_id === userId && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onDelete(); }}
              aria-label="Удалить"
              className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
          <div className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground">
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </div>
        </div>
      </div>

      {/* Expanded player */}
      {expanded && post.playerTracks.length > 0 && (
        <div className="border-t border-border/60 bg-background/50 p-4">
          {post.content.trim() && post.content.trim() !== "" && (
            <p className="mb-3 whitespace-pre-wrap text-sm text-foreground/80">{post.content}</p>
          )}
          <TrackCard
            postId={post.id}
            tracks={post.playerTracks}
            cover={cover}
            title={post.title ?? "Без названия"}
            artist={profile?.username ?? undefined}
            currentUserId={userId}
            currentUserAvatar={avatarSigned}
            currentUserName={profile?.username ?? undefined}
            createdAt={post.created_at}
            genre={post.genre}
            playCount={post.play_count}
            commentCount={post.commentCount}
            likeCount={post.likeCount}
            likedByMe={post.likedByMe}
            onLike={onLike}
            canDeleteAny={canModerate}
          />
          {post.imagesSigned.length > (post.playerTracks.length > 0 ? 1 : 0) && (
            <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-3">
              {post.imagesSigned.slice(1).map((url, i) => (
                <img key={i} src={url} alt="" className="w-full rounded-lg border border-border object-cover" />
              ))}
            </div>
          )}
        </div>
      )}
    </li>
  );
}

// ─── Grid card ───────────────────────────────────────────────────────────────

function WallCard(props: { post: WallPost; onOpen: () => void; onLike: () => void }) {
  const { post, onOpen, onLike } = props;
  const cover = post.imagesSigned[0] ?? null;
  const primary = post.playerTracks[0];
  const format = primary?.format?.toUpperCase();
  const duration = formatDuration(primary?.analysis?.durationSec);

  return (
    <article className="glass group flex flex-col overflow-hidden rounded-2xl">
      <button type="button" onClick={onOpen} className="relative block aspect-square w-full overflow-hidden bg-secondary">
        {cover ? (
          <img src={cover} alt="" className="h-full w-full object-cover transition-transform group-hover:scale-105" />
        ) : (
          <div className="grid h-full w-full place-items-center text-muted-foreground">
            <Music4 className="h-10 w-10" />
          </div>
        )}
        <div className="absolute inset-0 grid place-items-center bg-black/0 transition-colors group-hover:bg-black/40">
          <div className="grid h-12 w-12 place-items-center rounded-full bg-primary text-primary-foreground opacity-0 shadow-lg transition-opacity group-hover:opacity-100">
            <Play className="h-5 w-5 translate-x-0.5 fill-current" />
          </div>
        </div>
        <div className="absolute bottom-2 left-2 flex items-center gap-1">
          {format && (
            <span className={`rounded px-1.5 py-0.5 font-mono text-[9px] font-bold backdrop-blur ${format === "WAV" || format === "FLAC" || format === "AIFF" ? "bg-mint/80 text-black" : "bg-amber-500/80 text-black"}`}>
              {format}
            </span>
          )}
          <span className="rounded bg-black/60 px-1.5 py-0.5 font-mono text-[9px] font-bold text-white backdrop-blur">
            {duration}
          </span>
        </div>
      </button>
      <div className="flex flex-1 flex-col p-3">
        <h3 className="truncate text-sm font-semibold">{post.title || "Без названия"}</h3>
        <div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground">
          {post.genre && <span className="truncate">#{post.genre}</span>}
          <span className="ml-auto shrink-0">{new Date(post.created_at).toLocaleDateString("ru-RU", { day: "numeric", month: "short" })}</span>
        </div>
        <div className="mt-3 flex items-center gap-3 text-[11px] text-muted-foreground">
          <span className="inline-flex items-center gap-1"><Headphones className="h-3 w-3" />{post.play_count ?? 0}</span>
          <button type="button" onClick={onLike} className={`inline-flex items-center gap-1 hover:text-foreground ${post.likedByMe ? "text-mint" : ""}`}>
            <Heart className={`h-3 w-3 ${post.likedByMe ? "fill-current" : ""}`} />
            {post.likeCount}
          </button>
          <span className="inline-flex items-center gap-1"><MessageCircle className="h-3 w-3" />{post.commentCount}</span>
        </div>
      </div>
    </article>
  );
}

function UploadProgressPanel({ uploads }: { uploads: Record<string, { name: string; loaded: number; total: number }> }) {
  const items = Object.entries(uploads);
  if (items.length === 0) return null;
  return (
    <div className="fixed bottom-4 right-4 z-50 w-80 max-w-[calc(100vw-2rem)] rounded-xl border border-border bg-background/95 p-3 shadow-2xl backdrop-blur">
      <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-mint">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Загрузка · {items.length}
      </div>
      <div className="space-y-2">
        {items.map(([key, u]) => {
          const pct = u.total ? Math.round((u.loaded / u.total) * 100) : 0;
          return (
            <div key={key}>
              <div className="mb-1 flex items-center justify-between gap-2 text-[11px]">
                <span className="truncate font-medium">{u.name}</span>
                <span className="shrink-0 tabular-nums text-muted-foreground">
                  {formatBytes(u.loaded)} / {formatBytes(u.total)}
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-secondary">
                <div
                  className="h-full bg-mint transition-[width] duration-150"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}


