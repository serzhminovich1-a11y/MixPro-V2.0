import { createFileRoute } from "@tanstack/react-router";
import { CompressorGame } from "./games.compressor-ratio";

export const Route = createFileRoute("/games/compressor-attack")({
  head: () => ({
    meta: [
      { title: "Compressor Attack — Тренажёр слуха | MixPro" },
      { name: "description", content: "Определи, в каком варианте attack самый быстрый." },
      { property: "og:title", content: "Compressor Attack — Тренажёр слуха | MixPro" },
      { property: "og:description", content: "Определи, в каком варианте attack самый быстрый." },
    ],
  }),
  component: () => <CompressorGame variant="attack" gameType="comp-attack" />,
});
