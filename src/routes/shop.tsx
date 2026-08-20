import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { ShoppingBag, Send } from "lucide-react";
import { getMerch } from "@/lib/public.functions";
import { RouteError, RouteNotFound } from "@/components/route-fallbacks";
import { BannerImage } from "@/components/banner-image";

const merchQuery = queryOptions({ queryKey: ["merch"], queryFn: () => getMerch() });

export const Route = createFileRoute("/shop")({
  head: () => ({
    meta: [
      { title: "Магазин — MixPro" },
      { name: "description", content: "Мерч сообщества MixPro: футболки, стикеры и другое." },
      { property: "og:title", content: "Магазин — MixPro" },
      { property: "og:description", content: "Каталог мерча сообщества MixPro." },
    ],
  }),
  loader: ({ context }) => {
    context.queryClient.ensureQueryData(merchQuery);
  },
  component: ShopPage,
  errorComponent: RouteError,
  notFoundComponent: RouteNotFound,
});

function ShopPage() {
  const { data } = useSuspenseQuery(merchQuery);
  const [category, setCategory] = useState<string | null>(null);

  const categories = [...new Set(data.items.map((i) => i.category).filter((c): c is string => !!c))];
  const filtered = category ? data.items.filter((i) => i.category === category) : data.items;

  return (
    <div className="mx-auto max-w-5xl px-4 py-16">
      <div className="text-center">
        <ShoppingBag className="mx-auto h-10 w-10 text-mint" />
        <h1 className="mt-4 text-3xl font-bold md:text-4xl">Магазин</h1>
        <p className="mx-auto mt-2 max-w-lg text-muted-foreground">
          Мерч сообщества MixPro. Онлайн-оплата пока не подключена — заказ оформляется вручную через поддержку.
        </p>
      </div>

      {categories.length > 1 && (
        <div className="mt-10 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => setCategory(null)}
            className={`rounded-full px-4 py-1.5 text-sm transition-colors ${!category ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground"}`}
          >
            Всё
          </button>
          {categories.map((c) => (
            <button
              key={c}
              onClick={() => setCategory(c === category ? null : c)}
              className={`rounded-full px-4 py-1.5 text-sm transition-colors ${category === c ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground"}`}
            >
              {c}
            </button>
          ))}
        </div>
      )}

      {filtered.length === 0 ? (
        <p className="mt-16 text-center text-muted-foreground">
          {data.items.length === 0 ? "Пока пусто — мерч скоро появится." : `Нет товаров в категории «${category}».`}
        </p>
      ) : (
        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((item) => (
            <div key={item.id} className="glass flex flex-col overflow-hidden rounded-2xl">
              <div className="aspect-square w-full bg-secondary">
                {item.image_url ? (
                  <BannerImage path={item.image_url} className="h-full w-full object-cover" />
                ) : (
                  <div className="grid h-full w-full place-items-center text-muted-foreground">
                    <ShoppingBag className="h-8 w-8 opacity-40" />
                  </div>
                )}
              </div>
              <div className="flex flex-1 flex-col p-5">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-lg font-semibold">{item.name}</h3>
                  {item.price_label && <span className="shrink-0 rounded-full bg-mint/10 px-2.5 py-1 text-xs font-bold text-mint">{item.price_label}</span>}
                </div>
                {item.description && <p className="mt-1.5 line-clamp-3 text-sm text-muted-foreground">{item.description}</p>}
                <a
                  href="https://t.me/mixpro_support"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-auto inline-flex items-center justify-center gap-2 self-start rounded-lg border border-border px-3 py-1.5 pt-4 text-sm font-semibold text-foreground hover:bg-secondary"
                >
                  <Send className="h-3.5 w-3.5" /> Хочу это — написать в поддержку
                </a>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
