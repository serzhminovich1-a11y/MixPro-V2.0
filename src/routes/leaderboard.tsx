import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { Trophy } from "lucide-react";
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

const medals = ["🥇", "🥈", "🥉"];

function LeaderboardPage() {
  const { data } = useSuspenseQuery(leaderboardQuery);

  return (
    <div className="mx-auto max-w-4xl px-4 py-14">
      <div className="flex items-center gap-3">
        <div className="grid h-9 w-9 place-items-center rounded-lg bg-mint/10 text-mint">
          <Trophy className="h-4 w-4" />
        </div>
        <span className="label-mono">Global ranking</span>
      </div>
      <h1 className="mt-4 text-3xl font-bold tracking-tight md:text-4xl">Рейтинг звукорежиссёров</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        XP начисляется за игры для слуха. Играй — поднимайся выше.
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
              {data.profiles.map((p, i) => (
                <tr key={p.id} className="border-b border-border/40 last:border-0 transition-colors hover:bg-secondary/40">
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                    {i < 3 ? <span className="text-lg">{medals[i]}</span> : String(i + 1).padStart(2, "0")}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <AvatarImage
                        path={p.avatar_url}
                        fallback={p.username.slice(0, 2).toUpperCase()}
                        className={p.avatar_url ? "h-8 w-8 shrink-0 rounded-full object-cover" : "grid h-8 w-8 shrink-0 place-items-center rounded-full bg-secondary text-[10px] font-bold uppercase text-mint"}
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
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
