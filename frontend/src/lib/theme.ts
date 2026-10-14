"use client";

import { useSyncExternalStore } from "react";
import { THEME_STORAGE_KEY } from "@/lib/theme-script";

export type ThemeChoice = "light" | "dark" | "system";

const listeners = new Set<() => void>();

function readChoice(): ThemeChoice {
  try {
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    return saved === "light" || saved === "dark" ? saved : "system";
  } catch {
    return "system";
  }
}

function systemPrefersDark() {
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function applyTheme(choice: ThemeChoice) {
  const dark = choice === "dark" || (choice === "system" && systemPrefersDark());
  const root = document.documentElement;
  root.classList.toggle("dark", dark);
  root.style.colorScheme = dark ? "dark" : "light";
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  // While on "system", follow the device when it switches (for example at sunset).
  const onSystemChange = () => {
    if (readChoice() === "system") applyTheme("system");
    listener();
  };
  const onStorage = (event: StorageEvent) => {
    if (event.key === THEME_STORAGE_KEY) {
      applyTheme(readChoice());
      listener();
    }
  };
  media.addEventListener("change", onSystemChange);
  window.addEventListener("storage", onStorage); // other tabs
  return () => {
    listeners.delete(listener);
    media.removeEventListener("change", onSystemChange);
    window.removeEventListener("storage", onStorage);
  };
}

function snapshot() {
  const choice = readChoice();
  const resolved = choice === "system" ? (systemPrefersDark() ? "dark" : "light") : choice;
  return `${choice}:${resolved}`;
}

/** The saved choice and the theme actually showing. Before mounting, both report "system"/"light". */
export function useTheme() {
  const value = useSyncExternalStore(subscribe, snapshot, () => "system:light");
  const [choice, resolved] = value.split(":") as [ThemeChoice, "light" | "dark"];
  return { choice, resolved, setTheme };
}

type ViewTransitionDocument = Document & {
  startViewTransition?: (update: () => void) => { ready: Promise<void> };
};

/** Saves the choice and switches, revealing the new theme in a circle from `origin` where supported. */
export function setTheme(choice: ThemeChoice, origin?: { x: number; y: number }) {
  try {
    if (choice === "system") localStorage.removeItem(THEME_STORAGE_KEY);
    else localStorage.setItem(THEME_STORAGE_KEY, choice);
  } catch {
    // Private browsing: the theme still changes for this visit.
  }

  const update = () => {
    applyTheme(choice);
    listeners.forEach((listener) => listener());
  };

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const doc = document as ViewTransitionDocument;
  if (reduceMotion) return update();

  if (doc.startViewTransition && origin) {
    const radius = Math.hypot(Math.max(origin.x, innerWidth - origin.x), Math.max(origin.y, innerHeight - origin.y));
    doc.startViewTransition(update).ready.then(() => {
      document.documentElement.animate(
        { clipPath: [`circle(0px at ${origin.x}px ${origin.y}px)`, `circle(${radius}px at ${origin.x}px ${origin.y}px)`] },
        { duration: 550, easing: "cubic-bezier(0.4, 0, 0.2, 1)", pseudoElement: "::view-transition-new(root)" },
      );
    });
    return;
  }

  // Older browsers: a short cross-fade of colors instead.
  const root = document.documentElement;
  root.classList.add("theme-fade");
  update();
  window.setTimeout(() => root.classList.remove("theme-fade"), 350);
}
