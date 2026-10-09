import { AlertTriangle, ArrowRight, CheckCircle2, type LucideIcon, Sparkles, XCircle } from "lucide-react";
import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { Avatar } from "@/components/ui/avatar";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { STAGE_COLOR, STAGE_LABEL } from "@/lib/stages";
import type { Stage } from "@/lib/types";
import { cn } from "@/lib/utils";

// ---- Small helpers ----

const rise = (delay: number) => ({ "--rise-delay": `${delay}ms` }) as CSSProperties;

export function relativeTime(value: string, now = Date.now()) {
  const minutes = Math.round((now - new Date(value).getTime()) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? "yesterday" : `${days} days ago`;
}

function timeOfDay(date = new Date()) {
  const hour = date.getHours();
  return hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
}

// ---- Hero: the one focal point of the page ----

export function DashboardHero({
  name,
  summary,
  figure,
  figureLabel,
  loading,
  action,
}: {
  name: string;
  summary: ReactNode;
  figure: number;
  figureLabel: string;
  loading: boolean;
  action?: ReactNode;
}) {
  const today = new Date().toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" });
  return (
    <section className="dash-hero dash-rise mb-6 min-w-0 rounded-2xl border p-6 sm:p-8">
      <div className="relative z-10 flex flex-wrap items-end justify-between gap-6">
        <div className="min-w-0 max-w-xl">
          <p className="text-sm font-semibold text-muted-foreground">{today}</p>
          <h1 className="mt-1 text-3xl font-bold sm:text-4xl">
            {timeOfDay()}, {name.split(" ")[0]}
          </h1>
          <p className="mt-2 text-base leading-relaxed text-muted-foreground">{summary}</p>
          {action && <div className="mt-5 flex flex-wrap gap-2">{action}</div>}
        </div>
        <div className="rounded-xl border bg-card/80 px-6 py-4 shadow-sm backdrop-blur">
          {loading ? (
            <Skeleton className="h-14 w-20" />
          ) : (
            <p className="text-6xl font-semibold leading-none tracking-tight">{figure}</p>
          )}
          <p className="mt-2 text-sm font-semibold text-muted-foreground">{figureLabel}</p>
        </div>
      </div>
    </section>
  );
}

// ---- KPI row ----

export function StatTile({
  label,
  value,
  icon: Icon,
  hint,
  loading = false,
  status,
  delay = 0,
}: {
  label: string;
  value: number;
  icon: LucideIcon;
  hint?: string;
  loading?: boolean;
  // Only set when the number means "needs attention": it gets the warning treatment with an icon.
  status?: "warning";
  delay?: number;
}) {
  const flagged = status === "warning" && value > 0;
  return (
    <Card
      style={rise(delay)}
      className={cn(
        "dash-rise group relative min-w-0 overflow-hidden p-4 sm:p-5 transition-shadow hover:shadow-md",
        flagged && "border-status-warning/40",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-semibold text-muted-foreground">{label}</p>
        <span
          className={cn(
            "flex size-8 items-center justify-center rounded-lg bg-accent text-accent-foreground",
            flagged && "bg-status-warning-wash text-status-warning",
          )}
        >
          {flagged ? <AlertTriangle className="size-4" /> : <Icon className="size-4" />}
        </span>
      </div>
      {loading ? <Skeleton className="mt-3 h-9 w-14" /> : <p className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">{value}</p>}
      {hint && (
        <p className={cn("mt-1 text-xs text-muted-foreground", flagged && "font-semibold text-status-warning")}>
          {hint}
        </p>
      )}
    </Card>
  );
}

// ---- Section card ----

export function Section({
  title,
  description,
  href,
  linkLabel,
  className,
  delay = 0,
  children,
}: {
  title: string;
  description?: string;
  href?: string;
  linkLabel?: string;
  className?: string;
  delay?: number;
  children: ReactNode;
}) {
  return (
    <Card style={rise(delay)} className={cn("dash-rise flex min-w-0 flex-col", className)}>
      <div className="flex items-start justify-between gap-3 p-5 pb-3">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold">{title}</h2>
          {description && <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>}
        </div>
        {href && (
          <Link href={href} className="flex shrink-0 items-center gap-1 text-sm font-semibold text-primary hover:underline">
            {linkLabel ?? "View all"} <ArrowRight className="size-3.5" />
          </Link>
        )}
      </div>
      <div className="flex-1 px-5 pb-5">{children}</div>
    </Card>
  );
}

// ---- Empty state that celebrates being done ----

export function AllClear({ title, description }: { title: string; description: string }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl bg-status-good-wash px-6 py-10 text-center">
      <span className="flex size-11 items-center justify-center rounded-full bg-card text-status-good shadow-sm">
        <Sparkles className="size-5" />
      </span>
      <p className="font-display text-lg font-semibold">{title}</p>
      <p className="max-w-sm text-sm text-muted-foreground">{description}</p>
    </div>
  );
}

export function QuietEmpty({ icon: Icon, title, description }: { icon: LucideIcon; title: string; description?: string }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed px-6 py-10 text-center">
      <Icon className="size-5 text-muted-foreground" />
      <p className="font-semibold">{title}</p>
      {description && <p className="max-w-sm text-sm text-muted-foreground">{description}</p>}
    </div>
  );
}

// ---- To-do rows ----

export function TaskRow({
  icon: Icon,
  title,
  detail,
  href,
  action,
  urgent = false,
}: {
  icon: LucideIcon;
  title: string;
  detail: string;
  href: string;
  action: string;
  urgent?: boolean;
}) {
  return (
    <li>
      <Link
        href={href}
        className="group -mx-2 flex items-center gap-3 rounded-lg px-2 py-3 transition-colors hover:bg-muted/60"
      >
        <span
          className={cn(
            "flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent text-accent-foreground",
            urgent && "bg-status-warning-wash text-status-warning",
          )}
        >
          <Icon className="size-[18px]" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{title}</p>
          <p className="truncate text-sm text-muted-foreground">{detail}</p>
        </div>
        <span className="hidden shrink-0 items-center gap-1 rounded-full border bg-card px-3 py-1 text-xs font-semibold text-primary transition-colors group-hover:border-primary group-hover:bg-primary group-hover:text-primary-foreground sm:flex">
          {action} <ArrowRight className="size-3" />
        </span>
        <ArrowRight className="size-4 shrink-0 text-muted-foreground sm:hidden" />
      </Link>
    </li>
  );
}

// ---- Stage bars: one bar per stage, one hue, value at the tip ----

export function StageBars({ pipeline, stages }: { pipeline: Record<Stage, number>; stages: Stage[] }) {
  const max = Math.max(1, ...stages.map((stage) => pipeline[stage] ?? 0));
  const total = stages.reduce((sum, stage) => sum + (pipeline[stage] ?? 0), 0);
  return (
    <ul className="flex flex-col gap-3.5" aria-label="Candidates per stage">
      {stages.map((stage, index) => {
        const count = pipeline[stage] ?? 0;
        const share = total ? Math.round((count / total) * 100) : 0;
        return (
          <li
            key={stage}
            tabIndex={0}
            className="group relative grid grid-cols-[6.5rem_1fr] items-center gap-3 rounded-md outline-none"
            aria-label={`${STAGE_LABEL[stage]}: ${count} candidates, ${share}% of this pipeline`}
          >
            <span className="flex items-center gap-2 text-sm font-semibold">
              <span className="size-2 shrink-0 rounded-full" style={{ background: STAGE_COLOR[stage] }} />
              {STAGE_LABEL[stage]}
            </span>
            <span className="flex h-6 items-center gap-2">
              {count > 0 && (
                <span
                  className="dash-grow h-[18px] rounded-r-[4px] bg-primary transition-opacity group-hover:opacity-80"
                  style={{ width: `${(count / max) * 85}%`, minWidth: 4, ...rise(150 + index * 70) }}
                />
              )}
              <span className="text-sm font-semibold tabular-nums">{count}</span>
              <span className="text-xs text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
                {share}% of pipeline
              </span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}

// ---- Outcome tiles: status color + icon + label, never color alone ----

export function OutcomeTile({ outcome, value, hint }: { outcome: "hired" | "rejected"; value: number; hint: string }) {
  const hired = outcome === "hired";
  const Icon = hired ? CheckCircle2 : XCircle;
  return (
    <div
      className="flex items-center gap-3 rounded-xl p-4"
      style={{ background: hired ? "var(--status-good-wash)" : "var(--status-critical-wash)" }}
    >
      <Icon className="size-6 shrink-0" style={{ color: hired ? "var(--status-good)" : "var(--status-critical)" }} />
      <div>
        <p className="text-2xl font-semibold leading-none">{value}</p>
        <p className="mt-1 text-sm font-semibold">{hired ? "Hired" : "Rejected"}</p>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </div>
    </div>
  );
}

// ---- Agenda: interviews grouped by day ----

export interface AgendaItem {
  id: string;
  starts_at: string;
  title: string;
  detail: string;
  href?: string;
  joinUrl?: string | null;
}

function dayLabel(value: string) {
  const date = new Date(value);
  const today = new Date();
  const tomorrow = new Date();
  tomorrow.setDate(today.getDate() + 1);
  if (date.toDateString() === today.toDateString()) return "Today";
  if (date.toDateString() === tomorrow.toDateString()) return "Tomorrow";
  return date.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "short" });
}

export function Agenda({ items }: { items: AgendaItem[] }) {
  const groups = new Map<string, AgendaItem[]>();
  for (const item of items) {
    const key = dayLabel(item.starts_at);
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  return (
    <div className="flex flex-col gap-5">
      {[...groups.entries()].map(([day, dayItems]) => (
        <div key={day}>
          <p className="mb-2 text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">{day}</p>
          <ul className="flex flex-col gap-2">
            {dayItems.map((item) => {
              const time = new Date(item.starts_at).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
              const body = (
                <>
                  <span className="w-16 shrink-0 text-sm font-semibold tabular-nums">{time}</span>
                  <span className="h-9 w-[3px] shrink-0 rounded-full bg-primary/70" />
                  <Avatar name={item.title} className="size-8" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{item.title}</span>
                    <span className="block truncate text-sm text-muted-foreground">{item.detail}</span>
                  </span>
                </>
              );
              return (
                <li key={item.id} className="flex items-center gap-2">
                  {item.href ? (
                    <Link href={item.href} className="-mx-2 flex min-w-0 flex-1 items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-muted/60">
                      {body}
                    </Link>
                  ) : (
                    <div className="flex min-w-0 flex-1 items-center gap-3 py-1.5">{body}</div>
                  )}
                  {item.joinUrl && (
                    <a
                      href={item.joinUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="shrink-0 rounded-full bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground hover:opacity-90"
                    >
                      Join
                    </a>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}

// ---- Activity timeline ----

export interface TimelineItem {
  id: string;
  stage: Stage;
  title: ReactNode;
  detail: string;
  at: string;
}

export function Timeline({ items }: { items: TimelineItem[] }) {
  const now = Date.now();
  return (
    <ol className="relative">
      {items.map((item, index) => (
        <li key={item.id} className="relative flex gap-4 pb-5 last:pb-0">
          {index < items.length - 1 && <span className="absolute left-[7px] top-5 bottom-0 w-px bg-border" aria-hidden />}
          <span
            className="relative z-10 mt-1 size-[15px] shrink-0 rounded-full ring-4 ring-card"
            style={{ background: STAGE_COLOR[item.stage] }}
            aria-hidden
          />
          <div className="min-w-0 flex-1">
            <p className="text-sm">{item.title}</p>
            <p className="text-sm text-muted-foreground">{item.detail}</p>
          </div>
          <time dateTime={item.at} className="shrink-0 text-xs text-muted-foreground" title={new Date(item.at).toLocaleString()}>
            {relativeTime(item.at, now)}
          </time>
        </li>
      ))}
    </ol>
  );
}

export function StageDot({ stage }: { stage: Stage }) {
  return (
    <span className="inline-flex items-center gap-1.5 font-semibold">
      <span className="size-2 rounded-full" style={{ background: STAGE_COLOR[stage] }} />
      {STAGE_LABEL[stage]}
    </span>
  );
}
