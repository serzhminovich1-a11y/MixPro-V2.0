import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { Trophy, Medal } from "lucide-react";
import { getLeaderboard } from "@/lib/public.functions";
import { RouteError, RouteNotFound } from "@/components/route-fallbacks";
import { AvatarImage } from "@/components/avatar-image";

const leaderboardQuery = queryOptions({
  queryKey: ["leaderboard"],
  queryFn: () => getLeaderboard(),
});

export const Route = createFileRoute("/leaderboard")({
  head: () => ({
    meta: [
      { title: "Рейтинг звукорежиссёров — MixPro" },
      { name: "description", content: "Таблица лидеров MixPro: лучшие звукорежиссёры по XP, заработанным в тренировках слуха." },
      { property: "og:title", content: "Рейтинг звукорежиссёров — MixPro" },
      { property: "og:description", content: "Таблица лидеров по XP за тренировки слуха." },
    ],
  }),
  loader: ({ context }) => {
    context.queryClient.ensureQueryData(leaderboardQuery);
  },
  component: LeaderboardPage,
  errorComponent: RouteError,
  notFoundComponent: RouteNotFound,
});

// Real medal badges (icon + color), not bare emoji — emoji render
// inconsistently across OS/browsers and read as an afterthought next to
// the rest of the app's icon-driven UI.
const MEDALS = [
  { color: "#FCD34D", bg: "rgba(252,211,77,0.15)" }, // gold
  { color: "#D1D5DB", bg: "rgba(209,213,219,0.15)" }, // silver
  { color: "#FDBA74", bg: "rgba(253,186,116,0.15)" }, // bronze
];

function LeaderboardPage() {
  const { data } = useSuspenseQuery(leaderboardQuery);
  const navigate = useNavigate();

  return (
    <div className="mx-auto max-w-5xl px-4 py-14">
      <div className="flex items-center gap-3">
        <div className="grid h-9 w-9 place-items-center rounded-lg bg-mint/10 text-mint">
          <Trophy className="h-4 w-4" />
        </div>
        <span className="label-mono">Global ranking</span>
      </div>
      <h1 className="mt-4 text-3xl font-bold tracking-tight md:text-4xl">Рейтинг звукорежиссёров</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        {data.profiles.length > 0
          ? (() => {
              const n = data.profiles.length;
              // Same simplified (no 11–14 exception) plural convention already
              // used for "работа/работы/работ" elsewhere in this codebase.
              const noun = n === 1 ? "инженер" : n >= 2 && n <= 4 ? "инженера" : "инженеров";
              const verb = n === 1 ? "соревнуется" : "соревнуются";
              return <>{n} {noun} {verb} за XP. Играй — поднимайся выше.</>;
            })()
          : "XP начисляется за игры для слуха. Играй — поднимайся выше."}
      </p>

      <div className="panel mt-8 overflow-hidden rounded-2xl">
        {data.profiles.length === 0 ? (
          <p className="p-10 text-center text-sm text-muted-foreground">
            Пока никого нет. Стань первым — сыграй в игру для слуха!
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="px-4 py-3 text-left label-mono">#</th>
                <th className="px-4 py-3 text-left label-mono">Инженер</th>
                <th className="px-4 py-3 text-right label-mono">Level</th>
                <th className="px-4 py-3 text-right label-mono">XP</th>
              </tr>
            </thead>
            <tbody>
              {data.profiles.map((p, i) => {
                const medal = MEDALS[i];
                return (
                  <tr
                    key={p.id}
                    onClick={() => navigate({ to: "/u/$username", params: { username: p.username } })}
                    onKeyDown={(e) => { if (e.key === "Enter") navigate({ to: "/u/$username", params: { username: p.username } }); }}
                    role="link"
                    tabIndex={0}
                    className="cursor-pointer border-b border-border/40 transition-colors last:border-0 hover:bg-secondary/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
                  >
                    <td className="px-4 py-3">
                      {medal ? (
                        <span className="grid h-7 w-7 place-items-center rounded-full" style={{ background: medal.bg, color: medal.color }}>
                          <Medal className="h-4 w-4" />
                        </span>
                      ) : (
                        <span className="font-mono text-xs text-muted-foreground">{String(i + 1).padStart(2, "0")}</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <AvatarImage
                          path={p.avatar_url}
                          fallback={p.username.slice(0, 2).toUpperCase()}
                          className={p.avatar_url ? "h-11 w-11 shrink-0 rounded-full object-cover" : "grid h-11 w-11 shrink-0 place-items-center rounded-full bg-secondary text-xs font-bold uppercase text-mint"}
                        />
                        <span className="truncate font-medium">{p.username}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="rounded bg-violet/10 px-2 py-0.5 font-mono text-[10px] font-bold text-violet">
                        LV {p.level}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-bold text-mint">{p.xp}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
