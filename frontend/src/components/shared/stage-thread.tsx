import { Check } from "lucide-react";
import { MAIN_STAGES, STAGE_COLOR, STAGE_LABEL } from "@/lib/stages";
import type { Stage } from "@/lib/types";
import { cn } from "@/lib/utils";

// The "stage thread": a line that runs through the hiring stages and fills up to the current one.
// It is the signature of HireDesk and is reused on the candidate page and the board.
export function StageThread({ stage, className }: { stage: Stage; className?: string }) {
  const finished = stage === "hired";
  const rejected = stage === "rejected";
  const currentIndex = finished ? MAIN_STAGES.length : MAIN_STAGES.indexOf(stage);
  const color = STAGE_COLOR[stage];

  return (
    <div className={cn("w-full", className)}>
      <ol className="relative flex items-start justify-between">
        <span aria-hidden className="absolute left-3 right-3 top-3 h-0.5 bg-border" />
        {!rejected && (
          <span
            aria-hidden
            className="thread-draw absolute left-3 top-3 h-0.5"
            style={{
              background: color,
              width: `calc((100% - 1.5rem) * ${Math.min(currentIndex, MAIN_STAGES.length - 1) / (MAIN_STAGES.length - 1)})`,
            }}
          />
        )}
        {MAIN_STAGES.map((item, index) => {
          const reached = !rejected && index <= currentIndex;
          const current = !rejected && !finished && index === currentIndex;
          const done = !rejected && (index < currentIndex || finished);
          return (
            <li key={item} className="relative z-10 flex w-16 flex-col items-center gap-1.5">
              <span
                className={cn(
                  "flex size-6 items-center justify-center rounded-full border-2 bg-card",
                  current && "ring-4 ring-offset-0",
                )}
                style={{
                  borderColor: reached ? color : "var(--border)",
                  background: done ? color : undefined,
                  // The ring uses the stage color at low opacity.
                  boxShadow: current ? `0 0 0 4px color-mix(in srgb, ${color} 22%, transparent)` : undefined,
                }}
              >
                {done && <Check className="size-3.5 text-white" strokeWidth={3} />}
              </span>
              <span className={cn("text-[11px] font-semibold", reached ? "text-foreground" : "text-muted-foreground")}>
                {STAGE_LABEL[item]}
              </span>
            </li>
          );
        })}
      </ol>
      {(finished || rejected) && (
        <p className="mt-3 text-center text-sm font-semibold" style={{ color }}>
          {finished ? "Hired" : "Rejected"}
        </p>
      )}
    </div>
  );
}
