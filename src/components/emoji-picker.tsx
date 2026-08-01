import { useState } from "react";
import { Smile } from "lucide-react";

/** Curated but wide emoji picker — 8 categories, native OS glyphs (works on iOS/Android/Win/Mac). */
const CATEGORIES: { key: string; label: string; icon: string; emojis: string }[] = [
  {
    key: "smileys",
    label: "Смайлы",
    icon: "😀",
    emojis:
      "😀😃😄😁😆😅🤣😂🙂🙃😉😊😇🥰😍🤩😘😗😚😙🥲😋😛😜🤪😝🤑🤗🤭🤫🤔🤐🤨😐😑😶😏😒🙄😬😮‍💨🤥😌😔😪🤤😴😷🤒🤕🤢🤮🤧🥵🥶🥴😵😵‍💫🤯🤠🥳🥸😎🤓🧐😕😟🙁☹️😮😯😲😳🥺😦😧😨😰😥😢😭😱😖😣😞😓😩😫🥱😤😡😠🤬😈👿💀☠️💩🤡👹👺👻👽👾🤖",
  },
  {
    key: "hands",
    label: "Жесты",
    icon: "👍",
    emojis:
      "👍👎👌🤌🤏✌️🤞🫰🤟🤘🤙🫵🫱🫲🫳🫴👈👉👆🖕👇☝️👋🤚🖐️✋🖖👏🙌🫶🤝🙏✍️💅🤳💪🦾🦵🦿🦶👣👀👁️👅👄🫦🧠🫀🫁🦷🦴",
  },
  {
    key: "hearts",
    label: "Сердца",
    icon: "❤️",
    emojis:
      "❤️🧡💛💚💙💜🤎🖤🤍💔❣️💕💞💓💗💖💘💝💟♥️🫀💌💋💫✨⭐🌟💥🔥💯🎉🎊",
  },
  {
    key: "music",
    label: "Музыка",
    icon: "🎧",
    emojis:
      "🎧🎤🎙️🎚️🎛️🎼🎵🎶🎹🥁🪘🎷🎺🎸🪕🎻🪗📻📀💿📼🔊🔉🔈🔇📢📣🎬🎭🎨🎪🎫🎟️🎯🕹️🎮🎲♠️♥️♦️♣️♟️🃏🀄🎴",
  },
  {
    key: "objects",
    label: "Объекты",
    icon: "💡",
    emojis:
      "💡🔦🕯️🧯🛠️🔧🔩⚙️🧰🪛🪚⛏️⚒️🛡️🗡️⚔️🔫💣🧨🪃🔗⛓️🧲🔬🔭📡💻⌨️🖥️🖨️🖱️🖲️💽💾💿📀🧮📱📲☎️📞📟📠🔋🔌💎🎁🎈🎀🎂🍰🍾🍷🍸🍹🍺🍻🥂🥃🧃",
  },
  {
    key: "tech",
    label: "Технологии",
    icon: "⚡",
    emojis:
      "⚡🔥💧🌊❄️☁️🌪️🌈☀️🌙⭐✨🌟💫⚗️🧪🧬🔬🔭🛰️🚀🛸💾💿📀🖥️⌨️🖱️💻📱📡🔋🔌📶📳📴🛡️🔐🔒🔓🗝️🔑",
  },
  {
    key: "food",
    label: "Еда",
    icon: "🍕",
    emojis:
      "🍕🍔🍟🌭🥪🌮🌯🫔🥙🧆🥚🍳🥘🍲🫕🥣🥗🍿🧈🧂🥫🍱🍘🍙🍚🍛🍜🍝🍠🍢🍣🍤🍥🥮🍡🥟🥠🥡🦪🍦🍧🍨🍩🍪🎂🍰🧁🥧🍫🍬🍭🍮🍯🍼🥛☕🍵🧃🥤🧋🍶🍺🍻🥂🍷🥃🍸🍹🧉🍾",
  },
  {
    key: "flags",
    label: "Флаги",
    icon: "🏁",
    emojis:
      "🏁🚩🎌🏴🏳️🏳️‍🌈🏳️‍⚧️🏴‍☠️🇺🇦🇷🇺🇧🇾🇰🇿🇬🇪🇦🇲🇦🇿🇺🇸🇬🇧🇪🇺🇩🇪🇫🇷🇮🇹🇪🇸🇳🇱🇸🇪🇳🇴🇫🇮🇩🇰🇵🇱🇨🇿🇯🇵🇨🇳🇰🇷🇮🇳🇧🇷🇦🇺🇨🇦🇲🇽🇦🇷🇹🇷🇸🇦🇦🇪🇮🇱🇪🇬🇿🇦",
  },
];

function splitEmojis(s: string): string[] {
  // Split by grapheme (handles ZWJ / skin tones)
  if (typeof Intl !== "undefined" && "Segmenter" in Intl) {
    const seg = new (Intl as unknown as { Segmenter: new (locale: string, opts: { granularity: string }) => { segment: (s: string) => Iterable<{ segment: string }> } }).Segmenter("en", { granularity: "grapheme" });
    return Array.from(seg.segment(s), (x) => x.segment).filter((x) => x.trim());
  }
  return Array.from(s);
}

export function EmojiPicker({ onPick, onClose }: { onPick: (e: string) => void; onClose?: () => void }) {
  const [cat, setCat] = useState(CATEGORIES[0].key);
  const active = CATEGORIES.find((c) => c.key === cat) ?? CATEGORIES[0];
  const list = splitEmojis(active.emojis);
  return (
    <div className="w-72 max-w-[92vw] rounded-xl border border-border bg-background/95 p-2 shadow-2xl backdrop-blur-md">
      <div className="flex flex-wrap gap-1 border-b border-border pb-2">
        {CATEGORIES.map((c) => (
          <button
            key={c.key}
            type="button"
            onClick={() => setCat(c.key)}
            className={`rounded-md px-2 py-1 text-base leading-none transition ${cat === c.key ? "bg-mint/20 ring-1 ring-mint/60" : "hover:bg-secondary"}`}
            title={c.label}
          >
            {c.icon}
          </button>
        ))}
        {onClose && (
          <button type="button" onClick={onClose} className="ml-auto rounded-md px-2 py-1 text-xs text-muted-foreground hover:text-foreground">×</button>
        )}
      </div>
      <div className="mt-2 grid max-h-56 grid-cols-8 gap-0.5 overflow-y-auto">
        {list.map((e, i) => (
          <button
            key={`${e}-${i}`}
            type="button"
            onClick={() => onPick(e)}
            className="rounded-md p-1 text-lg leading-none transition hover:scale-110 hover:bg-secondary"
          >
            {e}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Small trigger button + popover wrapper. */
export function EmojiTrigger({ onPick, className }: { onPick: (e: string) => void; className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`relative ${className ?? ""}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="text-muted-foreground hover:text-foreground"
        aria-label="Эмодзи"
      >
        <Smile className="h-4 w-4" />
      </button>
      {open && (
        <div className="absolute right-0 top-full z-30 mt-2">
          <EmojiPicker onPick={(e) => { onPick(e); }} onClose={() => setOpen(false)} />
        </div>
      )}
    </div>
  );
}
