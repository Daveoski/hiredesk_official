"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import { type ThemeChoice, useTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";

const options: { value: ThemeChoice; label: string; icon: typeof Sun }[] = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
];

// A three-way switch whose highlight slides to the chosen option.
export function ThemeToggle({ tone = "app", className }: { tone?: "app" | "dark"; className?: string }) {
  const { choice, setTheme } = useTheme();
  // The saved choice only exists in the browser; show nothing selected until then.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const active = mounted ? options.findIndex((option) => option.value === choice) : -1;

  return (
    <div
      role="radiogroup"
      aria-label="Colour theme"
      className={cn(
        "relative inline-grid h-9 grid-cols-3 rounded-full p-1",
        tone === "dark" ? "border border-white/25 bg-white/5" : "border bg-muted",
        className,
      )}
    >
      <span
        aria-hidden
        className={cn(
          "absolute inset-y-1 left-1 w-[calc((100%-0.5rem)/3)] rounded-full shadow-sm transition-[transform,opacity] duration-300 ease-[cubic-bezier(0.2,0.7,0.2,1)]",
          tone === "dark" ? "bg-[#e6f18f]" : "bg-primary",
          active < 0 && "opacity-0",
        )}
        style={{ transform: `translateX(${Math.max(active, 0) * 100}%)` }}
      />
      {options.map(({ value, label, icon: Icon }) => {
        const selected = value === choice && mounted;
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={label}
            title={label}
            onClick={(event) => setTheme(value, { x: event.clientX, y: event.clientY })}
            className={cn(
              "relative z-10 inline-flex w-8 items-center justify-center rounded-full transition-colors duration-300",
              tone === "dark"
                ? selected
                  ? "text-[#17201d]"
                  : "text-white/70 hover:text-white"
                : selected
                  ? "text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon className={cn("size-4 transition-transform duration-500", selected && "rotate-[360deg]")} />
          </button>
        );
      })}
    </div>
  );
}
