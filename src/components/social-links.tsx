import { useState } from "react";
import {
  Instagram,
  Youtube,
  Twitter,
  Github,
  Linkedin,
  Facebook,
  Twitch,
  Globe,
  Music2,
  Send,
  MessageCircle,
  Plus,
  X,
  Check,
  Pencil,
} from "lucide-react";

export type SocialLink = { type: string; url: string };

type IconType = React.ComponentType<{ className?: string }>;

type PlatformDef = {
  key: string;
  label: string;
  color: string;
  icon: IconType;
  match: RegExp;
  hint?: string;
};

const TikTokIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
    <path d="M16.5 3c.3 2.1 1.6 3.7 3.5 4.2v2.6c-1.5.1-2.9-.3-4.2-1.1v6.9c0 3.8-3.1 6.4-6.5 6.4-3.3 0-5.9-2.6-5.9-5.8 0-3.4 2.9-6 6.4-5.8v2.7c-1.9-.2-3.5 1.2-3.5 3.1 0 1.7 1.4 3 3.1 3s3.1-1.4 3.1-3.1V3h4Z" />
  </svg>
);

const SoundCloudIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
    <path d="M2 15v-3M4 16v-5M6 17v-7M8 17.5v-8M10 17.5V8c0-.6.4-1 1-1s1 .4 1 1v9.5m2 0V6c0-.6.4-1 1-1s1 .4 1 1v11.5m2.5 0V9.5c1.7 0 3 1.3 3 3v2.5c0 1.4-1.1 2.5-2.5 2.5H18.5Z" strokeLinecap="round" strokeWidth="1.8" stroke="currentColor" fill="none" />
  </svg>
);

const SpotifyIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
    <path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2Zm4.6 14.4a.7.7 0 0 1-1 .2c-2.7-1.6-6.1-2-10.1-1.1a.7.7 0 1 1-.3-1.3c4.4-1 8.2-.5 11.2 1.3a.7.7 0 0 1 .2.9Zm1.3-2.9a.9.9 0 0 1-1.2.3c-3.1-1.9-7.8-2.5-11.5-1.4a.9.9 0 1 1-.5-1.7c4.2-1.3 9.4-.6 12.9 1.6a.9.9 0 0 1 .3 1.2Zm.1-3c-3.7-2.2-9.8-2.4-13.3-1.3a1.1 1.1 0 1 1-.6-2c4.1-1.2 10.8-1 15 1.5a1.1 1.1 0 0 1-1.1 1.9Z" />
  </svg>
);

const VKIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
    <path d="M12.8 17.4c-5.7 0-9-3.9-9.1-10.4h2.9c.1 4.8 2.2 6.8 3.9 7.2V7h2.7v4.2c1.6-.2 3.4-2 4-4.2h2.7c-.5 2.7-2.3 4.5-3.6 5.2 1.3.6 3.4 2.2 4.2 5.2h-3c-.6-2-2.3-3.6-4.3-3.8v3.8h-.4Z" />
  </svg>
);

const DiscordIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
    <path d="M20.3 4.6A17 17 0 0 0 16 3.2l-.2.4a15 15 0 0 0-1.4-.2 16 16 0 0 0-4.8 0 12 12 0 0 0-1.4.2l-.2-.4A17 17 0 0 0 3.7 4.6C1.6 8 1.1 11.3 1.3 14.5a17 17 0 0 0 5.2 2.6l.4-.6c-.9-.3-1.7-.7-2.5-1.2l.6-.5a12 12 0 0 0 10.9 0l.6.5c-.8.5-1.6.9-2.5 1.2l.4.6a17 17 0 0 0 5.2-2.6c.3-3.7-.4-6.9-2.5-9.9ZM8.7 13c-.9 0-1.7-.9-1.7-2s.7-2 1.7-2 1.7.9 1.7 2-.8 2-1.7 2Zm6.6 0c-.9 0-1.7-.9-1.7-2s.7-2 1.7-2 1.7.9 1.7 2-.8 2-1.7 2Z" />
  </svg>
);

const TelegramIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
    <path d="M21.8 4.3 2.9 11.7c-1 .4-1 1.7 0 2l4.3 1.4 1.7 5.5c.2.7 1.1.9 1.6.3l2.5-2.7 4.6 3.4c.9.6 2.1.2 2.4-.9L23 6c.3-1.2-.8-2.2-1.9-1.7ZM10 15l-.4 3-1.2-4L18.5 8 10 15Z" />
  </svg>
);

export const PLATFORMS: PlatformDef[] = [
  { key: "website", label: "Сайт", color: "text-mint", icon: Globe, match: /^https?:\/\// },
  { key: "youtube", label: "YouTube", color: "text-red-400", icon: Youtube, match: /youtu\.?be/i, hint: "https://youtube.com/@…" },
  { key: "instagram", label: "Instagram", color: "text-pink-400", icon: Instagram, match: /instagram\.com/i, hint: "https://instagram.com/…" },
  { key: "tiktok", label: "TikTok", color: "text-foreground", icon: TikTokIcon, match: /tiktok\.com/i, hint: "https://tiktok.com/@…" },
  { key: "soundcloud", label: "SoundCloud", color: "text-orange-400", icon: SoundCloudIcon, match: /soundcloud\.com/i, hint: "https://soundcloud.com/…" },
  { key: "spotify", label: "Spotify", color: "text-emerald-400", icon: SpotifyIcon, match: /spotify\.com/i, hint: "https://open.spotify.com/artist/…" },
  { key: "twitch", label: "Twitch", color: "text-violet", icon: Twitch, match: /twitch\.tv/i, hint: "https://twitch.tv/…" },
  { key: "x", label: "X / Twitter", color: "text-foreground", icon: Twitter, match: /(twitter\.com|x\.com)/i, hint: "https://x.com/…" },
  { key: "telegram", label: "Telegram", color: "text-cyan-300", icon: TelegramIcon, match: /(t\.me|telegram)/i, hint: "https://t.me/…" },
  { key: "discord", label: "Discord", color: "text-indigo-300", icon: DiscordIcon, match: /discord/i, hint: "https://discord.gg/…" },
  { key: "vk", label: "VK", color: "text-blue-400", icon: VKIcon, match: /vk\.com/i, hint: "https://vk.com/…" },
  { key: "github", label: "GitHub", color: "text-foreground", icon: Github, match: /github\.com/i, hint: "https://github.com/…" },
  { key: "linkedin", label: "LinkedIn", color: "text-sky-400", icon: Linkedin, match: /linkedin\.com/i, hint: "https://linkedin.com/in/…" },
  { key: "facebook", label: "Facebook", color: "text-blue-500", icon: Facebook, match: /facebook\.com/i, hint: "https://facebook.com/…" },
  { key: "bandcamp", label: "Bandcamp", color: "text-cyan-400", icon: Music2, match: /bandcamp\.com/i, hint: "https://…bandcamp.com" },
  { key: "beatstars", label: "BeatStars", color: "text-yellow-400", icon: Music2, match: /beatstars\.com/i, hint: "https://beatstars.com/…" },
  { key: "other", label: "Другое", color: "text-muted-foreground", icon: MessageCircle, match: /.*/ },
];

export function detectPlatform(url: string): string {
  const clean = url.trim();
  for (const p of PLATFORMS) {
    if (p.key === "other" || p.key === "website") continue;
    if (p.match.test(clean)) return p.key;
  }
  return /^https?:\/\//.test(clean) ? "website" : "other";
}

function normalizeUrl(u: string) {
  const s = u.trim();
  if (!s) return "";
  if (/^https?:\/\//i.test(s)) return s;
  if (/^[\w.-]+\.\w{2,}/.test(s)) return `https://${s}`;
  return s;
}

export function parseSocials(raw: unknown): SocialLink[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((x): x is SocialLink => !!x && typeof x === "object" && typeof (x as SocialLink).url === "string")
    .map((x) => ({ type: (x.type ?? detectPlatform(x.url)) as string, url: x.url }))
    .filter((x) => x.url.trim().length > 0);
}

/* ----------------- Display ----------------- */

export function SocialLinksView({ socials, size = "md" }: { socials: SocialLink[]; size?: "sm" | "md" }) {
  if (!socials.length) return null;
  const box = size === "sm" ? "h-8 w-8" : "h-9 w-9";
  const ic = size === "sm" ? "h-4 w-4" : "h-[18px] w-[18px]";
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {socials.map((s, i) => {
        const meta = PLATFORMS.find((p) => p.key === s.type) ?? PLATFORMS[PLATFORMS.length - 1];
        const Icon = meta.icon;
        return (
          <a
            key={`${s.type}-${i}`}
            href={s.url}
            target="_blank"
            rel="noopener noreferrer nofollow"
            title={`${meta.label} · ${s.url}`}
            aria-label={`${meta.label}: ${s.url}`}
            className={`group relative grid ${box} place-items-center rounded-lg border border-border bg-background/60 transition-all hover:-translate-y-0.5 hover:scale-105 hover:border-mint/50 hover:bg-mint/10 hover:shadow-[0_0_0_3px_hsl(var(--mint)/0.12)]`}
          >
            <Icon className={`${ic} ${meta.color} transition-colors group-hover:text-mint`} />
            <span className="pointer-events-none absolute -top-8 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded-md border border-border bg-background px-2 py-0.5 text-[10px] font-medium opacity-0 shadow-lg transition-opacity group-hover:opacity-100">
              {meta.label}
            </span>
          </a>
        );
      })}
    </div>
  );
}

/* ----------------- Editor ----------------- */

export function SocialLinksEditor({
  value,
  onSave,
  saving = false,
}: {
  value: SocialLink[];
  onSave: (next: SocialLink[]) => Promise<void> | void;
  saving?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<SocialLink[]>(value);

  function begin() {
    setItems(value.length ? value : []);
    setOpen(true);
  }
  function add() {
    setItems((prev) => [...prev, { type: "website", url: "" }]);
  }
  function update(i: number, patch: Partial<SocialLink>) {
    setItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));
  }
  function remove(i: number) {
    setItems((prev) => prev.filter((_, idx) => idx !== i));
  }
  async function save() {
    const cleaned = items
      .map((it) => {
        const url = normalizeUrl(it.url);
        return { type: it.type === "other" || it.type === "website" ? detectPlatform(url) : it.type, url };
      })
      .filter((it) => it.url.length > 0);
    await onSave(cleaned);
    setOpen(false);
  }

  if (!open) {
    return (
      <div className="flex items-center gap-2">
        <SocialLinksView socials={value} />
        <button
          onClick={begin}
          className="inline-flex items-center gap-1 rounded-md border border-dashed border-border px-2 py-1 text-[11px] text-muted-foreground hover:border-mint/50 hover:text-mint"
        >
          <Pencil className="h-3 w-3" /> {value.length ? "Изменить соцсети" : "Добавить соцсети"}
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-background/60 p-3">
      <div className="flex items-center gap-2">
        <p className="text-xs font-semibold uppercase tracking-widest text-mint">Мои соцсети</p>
        <span className="text-[10px] text-muted-foreground">{items.length}/12</span>
        <button onClick={() => setOpen(false)} className="ml-auto text-muted-foreground hover:text-foreground">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-3 space-y-2">
        {items.length === 0 && (
          <p className="rounded-md border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">
            Пока пусто. Добавь ссылку на YouTube, SoundCloud, Instagram, Telegram и т.д.
          </p>
        )}
        {items.map((it, i) => {
          const meta = PLATFORMS.find((p) => p.key === it.type) ?? PLATFORMS[0];
          const Icon = meta.icon;
          return (
            <div key={i} className="flex items-center gap-2">
              <div className="grid h-9 w-9 shrink-0 place-items-center rounded-md border border-border bg-background">
                <Icon className={`h-4 w-4 ${meta.color}`} />
              </div>
              <select
                value={it.type}
                onChange={(e) => update(i, { type: e.target.value })}
                className="rounded-md border border-input bg-background px-2 py-1.5 text-xs outline-none focus:ring-1 focus:ring-ring"
              >
                {PLATFORMS.map((p) => (
                  <option key={p.key} value={p.key}>
                    {p.label}
                  </option>
                ))}
              </select>
              <input
                value={it.url}
                onChange={(e) => update(i, { url: e.target.value, type: it.type === "other" ? detectPlatform(e.target.value) : it.type })}
                placeholder={meta.hint ?? "https://…"}
                className="min-w-0 flex-1 rounded-md border border-input bg-background px-2 py-1.5 text-sm outline-none focus:ring-1 focus:ring-ring"
              />
              <button
                onClick={() => remove(i)}
                aria-label="Удалить"
                className="rounded p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          );
        })}
      </div>

      <div className="mt-3 flex items-center gap-2">
        <button
          onClick={add}
          disabled={items.length >= 12}
          className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs hover:bg-secondary disabled:opacity-50"
        >
          <Plus className="h-3 w-3" /> Добавить ссылку
        </button>
        <button
          onClick={save}
          disabled={saving}
          className="ml-auto inline-flex items-center gap-1 rounded-md bg-mint px-3 py-1.5 text-xs font-bold text-black hover:brightness-110 disabled:opacity-50"
        >
          <Check className="h-3 w-3" /> Сохранить
        </button>
      </div>
    </div>
  );
}

// keep unused Send re-exported so tree-shake doesn't warn if we later swap icon
export { Send };
