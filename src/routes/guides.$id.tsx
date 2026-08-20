import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { ArrowLeft, BookOpen } from "lucide-react";
import { getGuide } from "@/lib/public.functions";
import { RouteError, RouteNotFound } from "@/components/route-fallbacks";
import { AvatarImage } from "@/components/avatar-image";
import { BannerImage } from "@/components/banner-image";

const guideQuery = (id: string) =>
  queryOptions({
    queryKey: ["guide", id],
    queryFn: () => getGuide({ data: { id } }),
  });

export const Route = createFileRoute("/guides/$id")({
  loader: async ({ context, params }) => {
    const res = await context.queryClient.ensureQueryData(guideQuery(params.id));
    if (!res.guide) throw notFound();
    return { title: res.guide.title };
  },
  head: ({ loaderData }) => {
    if (!loaderData) return { meta: [{ title: "Руководство не найдено — MixPro" }, { name: "robots", content: "noindex" }] };
    return {
      meta: [
        { title: `${loaderData.title} — MixPro` },
        { name: "description", content: "Руководство от сообщества MixPro." },
      ],
    };
  },
  component: GuidePage,
  errorComponent: RouteError,
  notFoundComponent: RouteNotFound,
});

function GuidePage() {
  const { id } = Route.useParams();
  const { data } = useSuspenseQuery(guideQuery(id));
  const guide = data.guide;
  if (!guide) return null;

  return (
    <div className="mx-auto max-w-2xl px-4 py-14">
      <Link to="/u/$username" params={{ username: guide.author?.username ?? "" }} className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-3.5 w-3.5" /> К профилю автора
      </Link>

      {guide.cover_image && (
        <div className="mt-4 aspect-video w-full overflow-hidden rounded-2xl bg-secondary">
          <BannerImage path={guide.cover_image} className="h-full w-full object-cover" />
        </div>
      )}

      <div className="mt-4 flex items-center gap-2 text-xs text-mint">
        <BookOpen className="h-3.5 w-3.5" /> Руководство
      </div>
      <h1 className="mt-2 text-3xl font-bold tracking-tight">{guide.title}</h1>

      <Link to="/u/$username" params={{ username: guide.author?.username ?? "" }} className="mt-4 flex items-center gap-2">
        <div className="grid h-8 w-8 shrink-0 place-items-center overflow-hidden rounded-full bg-secondary text-xs font-bold text-mint">
          <AvatarImage path={guide.author?.avatar_url ?? null} fallback={(guide.author?.username ?? "A").slice(0, 2).toUpperCase()} className={guide.author?.avatar_url ? "h-full w-full object-cover" : ""} />
        </div>
        <span className="text-sm font-medium hover:underline">{guide.author?.username ?? "Аноним"}</span>
        <span className="text-xs text-muted-foreground">· {new Date(guide.created_at).toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" })}</span>
      </Link>

      <div className="panel mt-6 rounded-2xl p-6">
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">{guide.content}</p>
      </div>
    </div>
  );
}
