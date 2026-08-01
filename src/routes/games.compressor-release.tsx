import { createFileRoute } from "@tanstack/react-router";
import { CompressorGame } from "./games.compressor-ratio";

export const Route = createFileRoute("/games/compressor-release")({
  head: () => ({
    meta: [
      { title: "Compressor Release — Тренажёр слуха | MixPro" },
      { name: "description", content: "Определи, в каком варианте release самый медленный." },
      { property: "og:title", content: "Compressor Release — Тренажёр слуха | MixPro" },
      { property: "og:description", content: "Определи, в каком варианте release самый медленный." },
    ],
  }),
  component: () => <CompressorGame variant="release" gameType="comp-release" />,
});
