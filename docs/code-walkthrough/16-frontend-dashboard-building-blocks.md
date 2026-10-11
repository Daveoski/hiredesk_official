# Part 16: Dashboard building blocks: `parts.tsx` (copyable)

`src/components/features/dashboard/parts.tsx` holds the reusable pieces the three dashboards are built from:
- `DashboardHero`: the greeting banner with one big number.
- `StatTile`: the number tiles.
- `Section`: a card with a title.
- `AllClear` / `QuietEmpty`: empty states.
- `TaskRow`: a to-do row.
- `StageBars`: the pipeline chart.
- `OutcomeTile`: the hired/rejected tiles.
- `Agenda`: interviews grouped by day.
- `Timeline`: recent activity.
- `StageDot`: a coloured dot with a stage name.

```tsx
// Icons. "type LucideIcon" = the TYPE of an icon component (used for props that accept any icon).
import { AlertTriangle, ArrowRight, CheckCircle2, type LucideIcon, Sparkles, XCircle } from "lucide-react";
import Link from "next/link";
// CSSProperties = the type of a style={{...}} object. ReactNode = anything React can render.
import type { CSSProperties, ReactNode } from "react";
import { Avatar } from "@/components/ui/avatar";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { STAGE_COLOR, STAGE_LABEL } from "@/lib/stages";
import type { Stage } from "@/lib/types";
import { cn } from "@/lib/utils";

// ---- Small helpers ----

// Sets the CSS variable --rise-delay (e.g. "120ms") on an element, so cards fade in one after another.
// The .dash-rise animation in globals.css reads it. "as CSSProperties" because custom "--x"
// variables aren't in React's built-in style type.
const rise = (delay: number) => ({ "--rise-delay": `${delay}ms` }) as CSSProperties;

// "2026-10-11T09:00:00Z" -> "just now" / "5 min ago" / "3 h ago" / "yesterday" / "4 days ago".
// now = Date.now() by default (milliseconds since 1970); passing it in lets a list share one "now".
export function relativeTime(value: string, now = Date.now()) {
  // Difference in milliseconds / 60,000 = minutes. (60_000: the underscore is only for readability.)
  const minutes = Math.round((now - new Date(value).getTime()) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? "yesterday" : `${days} days ago`;
}

// "Good morning/afternoon/evening" by the visitor's own clock. A nested ternary: a ? b : c ? d : e.
function timeOfDay(date = new Date()) {
  const hour = date.getHours();
  return hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
}

// ---- Hero: the one focal point of the page ----

// Props are destructured straight from the object: ({ name, summary, ... }).
export function DashboardHero({
  name,
  summary,
  figure,
  figureLabel,
  loading,
  action,
}: {
  name: string;
  summary: ReactNode;      // text or elements
  figure: number;          // the one big number
  figureLabel: string;     // e.g. "tasks waiting on you"
  loading: boolean;
  action?: ReactNode;      // optional buttons
}) {
  // e.g. "Sunday, 11 October"
  const today = new Date().toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" });
  return (
    // dash-hero = the indigo gradient background (globals.css). dash-rise = fade-in animation.
    // min-w-0 stops long content making the page wider than a phone screen.
    <section className="dash-hero dash-rise mb-6 min-w-0 rounded-2xl border p-6 sm:p-8">
      {/* relative z-10 keeps the content above the decorative dots (the ::after layer). */}
      <div className="relative z-10 flex flex-wrap items-end justify-between gap-6">
        <div className="min-w-0 max-w-xl">
          <p className="text-sm font-semibold text-muted-foreground">{today}</p>
          {/* "Good afternoon, Tunde": only the first name (split at spaces, take [0]). */}
          <h1 className="mt-1 text-3xl font-bold sm:text-4xl">
            {timeOfDay()}, {name.split(" ")[0]}
          </h1>
          <p className="mt-2 text-base leading-relaxed text-muted-foreground">{summary}</p>
          {action && <div className="mt-5 flex flex-wrap gap-2">{action}</div>}
        </div>
        {/* The big-number card. bg-card/80 = 80% opaque; backdrop-blur = frosted glass. */}
        <div className="rounded-xl border bg-card/80 px-6 py-4 shadow-sm backdrop-blur">
          {/* While loading, a grey pulsing placeholder (Skeleton) instead of the number. */}
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
// (KPI = Key Performance Indicator: a headline number.)

export function StatTile({
  label,
  value,
  icon: Icon,            // rename to a capitalised name so it can be used as <Icon />
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
  // Warning style only when it's a warning-type tile AND the number is above zero.
  const flagged = status === "warning" && value > 0;
  return (
    <Card
      style={rise(delay)}
      // "group" lets children react to hovering the whole card. flagged adds an amber border.
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
          {/* Flagged tiles swap their icon for a warning triangle, so meaning never relies on colour alone. */}
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
// A card with a title, optional description, optional "View all →" link, and content.

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
  className?: string;        // extra classes from the caller, e.g. "lg:col-span-3"
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
          // shrink-0 = never squash the link when the title is long.
          <Link href={href} className="flex shrink-0 items-center gap-1 text-sm font-semibold text-primary hover:underline">
            {linkLabel ?? "View all"} <ArrowRight className="size-3.5" />
          </Link>
        )}
      </div>
      {/* flex-1 = take the remaining height, so cards in a row line up. */}
      <div className="flex-1 px-5 pb-5">{children}</div>
    </Card>
  );
}

// ---- Empty state that celebrates being done ----

// A green "You're all caught up" box for empty to-do lists.
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

// A neutral, dashed empty state ("No interviews scheduled").
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
// One clickable row: icon, title, detail, and an action pill ("Schedule →").

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
  urgent?: boolean;          // amber icon for things that are overdue or decisive
}) {
  return (
    <li>
      {/* -mx-2 + px-2 = the hover background extends slightly past the text edges. */}
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
        {/* The pill: hidden on phones (hidden ... sm:flex); fills purple when the row is hovered (group-hover). */}
        <span className="hidden shrink-0 items-center gap-1 rounded-full border bg-card px-3 py-1 text-xs font-semibold text-primary transition-colors group-hover:border-primary group-hover:bg-primary group-hover:text-primary-foreground sm:flex">
          {action} <ArrowRight className="size-3" />
        </span>
        {/* On phones just an arrow (sm:hidden = hide from small screens up). */}
        <ArrowRight className="size-4 shrink-0 text-muted-foreground sm:hidden" />
      </Link>
    </li>
  );
}

// ---- Stage bars: one bar per stage, one hue, value at the tip ----
// A simple bar chart made of <span>s. One colour (the brand colour) for all bars, because the
// stage colours aren't distinguishable enough for colour-blind people as chart colours.

export function StageBars({ pipeline, stages }: { pipeline: Record<Stage, number>; stages: Stage[] }) {
  // The biggest count (at least 1, to avoid dividing by zero). "...array" spreads it into Math.max.
  const max = Math.max(1, ...stages.map((stage) => pipeline[stage] ?? 0));
  // .reduce adds them all up: the total in these stages.
  const total = stages.reduce((sum, stage) => sum + (pipeline[stage] ?? 0), 0);
  return (
    // aria-label describes the chart for screen readers.
    <ul className="flex flex-col gap-3.5" aria-label="Candidates per stage">
      {stages.map((stage, index) => {
        const count = pipeline[stage] ?? 0;
        const share = total ? Math.round((count / total) * 100) : 0;     // percentage
        return (
          <li
            key={stage}
            // tabIndex={0} = reachable with the Tab key, so keyboard users can reveal the percentage too.
            tabIndex={0}
            // A two-column grid: a 6.5rem label column, then the bar.
            className="group relative grid grid-cols-[6.5rem_1fr] items-center gap-3 rounded-md outline-none"
            aria-label={`${STAGE_LABEL[stage]}: ${count} candidates, ${share}% of this pipeline`}
          >
            <span className="flex items-center gap-2 text-sm font-semibold">
              {/* The stage colour appears only as a small dot beside the name. */}
              <span className="size-2 shrink-0 rounded-full" style={{ background: STAGE_COLOR[stage] }} />
              {STAGE_LABEL[stage]}
            </span>
            <span className="flex h-6 items-center gap-2">
              {count > 0 && (
                <span
                  // dash-grow = the bar grows from left to right once (globals.css).
                  // rounded-r = rounded only at the tip; square at the baseline.
                  className="dash-grow h-[18px] rounded-r-[4px] bg-primary transition-opacity group-hover:opacity-80"
                  // Width relative to the biggest bar (max 85%, leaving room for the number).
                  // Each bar's animation starts a little later than the previous one.
                  style={{ width: `${(count / max) * 85}%`, minWidth: 4, ...rise(150 + index * 70) }}
                />
              )}
              {/* tabular-nums = all digits the same width, so numbers line up. */}
              <span className="text-sm font-semibold tabular-nums">{count}</span>
              {/* The percentage appears only on hover or keyboard focus. */}
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
  // Pick the icon COMPONENT: a tick or a cross.
  const Icon = hired ? CheckCircle2 : XCircle;
  return (
    <div
      className="flex items-center gap-3 rounded-xl p-4"
      // Light green or light red background (CSS variables from globals.css).
      style={{ background: hired ? "var(--status-good-wash)" : "var(--status-critical-wash)" }}
    >
      <Icon className="size-6 shrink-0" style={{ color: hired ? "var(--status-good)" : "var(--status-critical)" }} />
      <div>
        <p className="text-2xl font-semibold leading-none">{value}</p>
        {/* The word "Hired"/"Rejected" is always written, so the meaning doesn't depend on colour. */}
        <p className="mt-1 text-sm font-semibold">{hired ? "Hired" : "Rejected"}</p>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </div>
    </div>
  );
}

// ---- Agenda: interviews grouped by day ----

// The shape of one agenda entry ("export" so the dashboards can build them).
export interface AgendaItem {
  id: string;
  starts_at: string;
  title: string;            // the candidate's name
  detail: string;           // e.g. "Product Designer · 45 min · Video call"
  href?: string;            // optional link to the candidate
  joinUrl?: string | null;  // optional video-call link for the Join button
}

// "Today", "Tomorrow", or e.g. "Wednesday, 14 Oct".
function dayLabel(value: string) {
  const date = new Date(value);
  const today = new Date();
  const tomorrow = new Date();
  tomorrow.setDate(today.getDate() + 1);
  // toDateString() ignores the time, so comparing two of them compares calendar days.
  if (date.toDateString() === today.toDateString()) return "Today";
  if (date.toDateString() === tomorrow.toDateString()) return "Tomorrow";
  return date.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "short" });
}

export function Agenda({ items }: { items: AgendaItem[] }) {
  // Group items by day label. A Map keeps insertion order, so days stay sorted
  // (the items arrive already sorted by time).
  const groups = new Map<string, AgendaItem[]>();
  for (const item of items) {
    const key = dayLabel(item.starts_at);
    // Add the item to that day's list ("?? []" = start an empty list if none yet).
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  return (
    <div className="flex flex-col gap-5">
      {/* [...groups.entries()] turns the Map into an array of [day, items] pairs. */}
      {[...groups.entries()].map(([day, dayItems]) => (
        <div key={day}>
          <p className="mb-2 text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">{day}</p>
          <ul className="flex flex-col gap-2">
            {dayItems.map((item) => {
              // e.g. "3:00 PM" in the visitor's time zone.
              const time = new Date(item.starts_at).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
              // The row's content, built once and placed inside a link or a plain div below.
              const body = (
                <>
                  <span className="w-16 shrink-0 text-sm font-semibold tabular-nums">{time}</span>
                  {/* A thin coloured bar, like a calendar entry. */}
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
                    // target="_blank" opens a new tab. rel="noreferrer" stops the new page getting
                    // access to this page (a security best practice for external links).
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
  stage: Stage;            // colours the dot
  title: ReactNode;        // can contain elements (e.g. a StageDot)
  detail: string;
  at: string;              // when it happened
}

export function Timeline({ items }: { items: TimelineItem[] }) {
  const now = Date.now();
  return (
    // <ol> = an ordered list (the order matters: newest first).
    <ol className="relative">
      {items.map((item, index) => (
        <li key={item.id} className="relative flex gap-4 pb-5 last:pb-0">
          {/* The vertical connecting line, drawn for every item except the last.
              aria-hidden = decorative, so screen readers skip it. */}
          {index < items.length - 1 && <span className="absolute left-[7px] top-5 bottom-0 w-px bg-border" aria-hidden />}
          {/* The coloured dot. ring-4 ring-card = a card-coloured ring that "cuts" the line neatly. */}
          <span
            className="relative z-10 mt-1 size-[15px] shrink-0 rounded-full ring-4 ring-card"
            style={{ background: STAGE_COLOR[item.stage] }}
            aria-hidden
          />
          <div className="min-w-0 flex-1">
            <p className="text-sm">{item.title}</p>
            <p className="text-sm text-muted-foreground">{item.detail}</p>
          </div>
          {/* <time> with a machine-readable date; title shows the full date on hover. */}
          <time dateTime={item.at} className="shrink-0 text-xs text-muted-foreground" title={new Date(item.at).toLocaleString()}>
            {relativeTime(item.at, now)}
          </time>
        </li>
      ))}
    </ol>
  );
}

// A dot + stage name, used inside sentences ("moved to ● Offer").
export function StageDot({ stage }: { stage: Stage }) {
  return (
    <span className="inline-flex items-center gap-1.5 font-semibold">
      <span className="size-2 rounded-full" style={{ background: STAGE_COLOR[stage] }} />
      {STAGE_LABEL[stage]}
    </span>
  );
}
```
