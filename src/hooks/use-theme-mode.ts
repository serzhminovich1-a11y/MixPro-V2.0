import { useEffect, useState, useCallback } from "react";
import type { SiteThemeId } from "@/lib/site-themes";

const KEY_THEME = "mixpro:theme";
const KEY_AUTO = "mixpro:theme-auto";

const THEME_CLASSES = [
  "theme-night",
  "theme-day",
  "theme-ableton",
  "theme-pro-tools",
  "theme-noir-gold",
  "theme-cyberpunk",
];

const LIGHT_THEMES: SiteThemeId[] = ["day"];

function applyTheme(id: SiteThemeId) {
  const root = document.documentElement;
  THEME_CLASSES.forEach((c) => root.classList.remove(c));
  root.classList.add(`theme-${id}`);
  root.classList.remove("dark", "light");
  root.classList.add(LIGHT_THEMES.includes(id) ? "light" : "dark");
}

function isDaytime() {
  const h = new Date().getHours();
  return h >= 7 && h < 19;
}

export function useSiteTheme() {
  const [theme, setThemeState] = useState<SiteThemeId>(() => {
    if (typeof window === "undefined") return "night";
    return (localStorage.getItem(KEY_THEME) as SiteThemeId) || "night";
  });
  const [auto, setAutoState] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem(KEY_AUTO) === "1";
  });

  // Apply on mount + on every change
  useEffect(() => {
    if (auto) {
      applyTheme(isDaytime() ? "day" : "night");
    } else {
      applyTheme(theme);
    }
    localStorage.setItem(KEY_THEME, theme);
    localStorage.setItem(KEY_AUTO, auto ? "1" : "0");
  }, [theme, auto]);

  // Poll every minute while auto is on
  useEffect(() => {
    if (!auto) return;
    const id = window.setInterval(() => {
      applyTheme(isDaytime() ? "day" : "night");
    }, 60_000);
    return () => window.clearInterval(id);
  }, [auto]);

  const setTheme = useCallback((id: SiteThemeId) => {
    setAutoState(false);
    setThemeState(id);
  }, []);

  const toggleAuto = useCallback(() => setAutoState((v) => !v), []);

  return { theme, auto, setTheme, toggleAuto };
}
