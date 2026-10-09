import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { STAGE_COLOR, STAGE_LABEL } from "@/lib/stages";
import type { Stage } from "@/lib/types";
import { cn } from "@/lib/utils";

export function Stat({
  label,
  value,
  loading = false,
  hint,
  tone = "default",
}: {
  label: string;
  value: number;
  loading?: boolean;
  hint?: string;
  tone?: "default" | "attention";
}) {
  return (
    <Card className={cn("p-5", tone === "attention" && value > 0 && "border-primary/40 bg-primary/5")}>
      <p className="text-sm font-semibold text-muted-foreground">{label}</p>
      {loading ? <Skeleton className="mt-2 h-9 w-14" /> : <p className="mt-1 font-display text-4xl font-bold">{value}</p>}
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </Card>
  );
}

// One "to do" row: what needs doing, for whom, and where to do it.
export function TaskRow({
  icon: Icon,
  title,
  detail,
  href,
  action,
}: {
  icon: LucideIcon;
  title: string;
  detail: string;
  href: string;
  action: string;
}) {
  return (
    <li>
      <Link href={href} className="flex items-center gap-3 py-3 hover:text-primary">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent text-accent-foreground">
          <Icon className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{title}</p>
          <p className="truncate text-sm text-muted-foreground">{detail}</p>
        </div>
        <span className="shrink-0 text-sm font-semibold text-primary">{action} →</span>
      </Link>
    </li>
  );
}

// A horizontal bar with one segment per stage, sized by how many candidates are in it.
export function PipelineBar({ pipeline }: { pipeline: Record<Stage, number> }) {
  const stages = Object.keys(STAGE_LABEL) as Stage[];
  const total = stages.reduce((sum, stage) => sum + (pipeline[stage] ?? 0), 0);
  return (
    <div>
      <div className="flex h-3 overflow-hidden rounded-full bg-muted" role="img" aria-label="Candidates per stage">
        {total > 0 &&
          stages.map((stage) =>
            pipeline[stage] ? (
              <span key={stage} style={{ width: `${(pipeline[stage] / total) * 100}%`, background: STAGE_COLOR[stage] }} />
            ) : null,
          )}
      </div>
      <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm">
        {stages.map((stage) => (
          <li key={stage} className="flex items-center gap-2">
            <span className="size-2.5 rounded-full" style={{ background: STAGE_COLOR[stage] }} />
            <span className="text-muted-foreground">{STAGE_LABEL[stage]}</span>
            <span className="font-semibold tabular-nums">{pipeline[stage] ?? 0}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
