# Part 22: UI building blocks, styles and config (copyable)

The small reusable pieces every page is made of (`components/ui/` and `components/shared/`), the global CSS (`globals.css`) and `next.config.ts`. The `ui/` components follow **shadcn/ui**: you copy them into your project and own them, and the complex ones (dialog, dropdown, tabs) are built on **Radix UI**, which handles keyboard use, focus and screen readers.

## `components/ui/button.tsx`

```tsx
// Slot = render the button's styles onto its CHILD element instead of a <button> (used by asChild).
import { Slot } from "@radix-ui/react-slot";
// cva = "class variance authority": define style VARIANTS (default/outline/ghost...) in one place.
import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  // Base classes every button gets. disabled:... = styles when disabled.
  // [&_svg]:size-4 = any <svg> (icon) inside the button is 16px and never shrinks.
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-semibold transition-colors disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      // <Button variant="outline">
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",   // filled purple
        outline: "border border-input bg-card hover:bg-muted",
        ghost: "hover:bg-muted",                                             // no background until hover
        destructive: "bg-destructive text-white hover:bg-destructive/90",    // red, for dangerous actions
        soft: "bg-accent text-accent-foreground hover:bg-accent/70",         // light purple
      },
      // <Button size="sm">
      size: {
        default: "h-10 px-4",
        sm: "h-8 px-3 text-[13px]",
        lg: "h-12 px-6 text-base",
        icon: "size-9",                                                      // square, for icon-only buttons
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

// The props: everything a normal <button> accepts, plus variant/size, plus asChild.
// "extends" = this interface includes all of those others.
export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export function Button({ className, variant, size, asChild = false, ...props }: ButtonProps) {
  // asChild: <Button asChild><Link href="/x">Go</Link></Button> renders ONE <a> with button styles,
  // instead of a <button> wrapped around a link (which would be invalid HTML).
  const Comp = asChild ? Slot : "button";
  // cn() merges the variant classes with any extra className from the caller.
  return <Comp className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}

export { buttonVariants };
```

## `components/ui/input.tsx`

```tsx
import * as React from "react";
import { cn } from "@/lib/utils";

// Shared look for inputs, textareas and selects. focus-visible:ring = a soft purple ring when focused with the keyboard.
const fieldStyle =
  "w-full rounded-md border border-input bg-card px-3 text-sm placeholder:text-muted-foreground/70 focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/25 disabled:opacity-50";

// forwardRef = let parents pass a "ref" through to the real <input>.
// React Hook Form's register() needs this ref to read the input's value.
export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => <input ref={ref} className={cn(fieldStyle, "h-10", className)} {...props} />,
);
// displayName = the name shown in React's developer tools.
Input.displayName = "Input";

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => <textarea ref={ref} className={cn(fieldStyle, "min-h-24 py-2", className)} {...props} />,
);
Textarea.displayName = "Textarea";

// A native select keeps keyboard and mobile behaviour correct with no extra code.
export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, ...props }, ref) => <select ref={ref} className={cn(fieldStyle, "h-10", className)} {...props} />,
);
Select.displayName = "Select";
```

## `components/ui/dialog.tsx`

```tsx
"use client";

// Radix's Dialog: handles opening/closing, Escape to close, keeping keyboard focus inside, and
// marking the rest of the page as hidden for screen readers.
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import * as React from "react";
import { cn } from "@/lib/utils";

// Re-export Radix parts under our names.
export const Dialog = DialogPrimitive.Root;          // holds open/onOpenChange
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

// The box itself. ComponentPropsWithoutRef<...> = "accept every prop Radix's Content accepts".
export function DialogContent({
  className,
  children,
  ...props
}: React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>) {
  return (
    // Portal = render at the end of <body>, so the dialog sits above everything else.
    <DialogPrimitive.Portal>
      {/* The dimmed background. data-[state=open]:... = an animation when Radix marks it as open. */}
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-foreground/40 backdrop-blur-[2px] data-[state=open]:animate-in data-[state=open]:fade-in-0" />
      {/* Centred with left-1/2 top-1/2 + -translate-x/y-1/2. max-h-[90vh] + overflow-y-auto = scroll if tall. */}
      <DialogPrimitive.Content
        className={cn(
          "fixed left-1/2 top-1/2 z-50 max-h-[90vh] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-lg border bg-card p-6 shadow-xl data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95",
          className,
        )}
        {...props}
      >
        {children}
        {/* The × button in the corner. */}
        <DialogPrimitive.Close className="absolute right-4 top-4 rounded-md p-1 text-muted-foreground hover:bg-muted" aria-label="Close">
          <X className="size-4" />
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

// pr-6 = leave room for the × button.
export function DialogHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("mb-4 flex flex-col gap-1 pr-6", className)} {...props} />;
}

// Title and Description are linked to the dialog for screen readers (they're announced when it opens).
export function DialogTitle({ className, ...props }: React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>) {
  return <DialogPrimitive.Title className={cn("font-display text-xl font-semibold", className)} {...props} />;
}

export function DialogDescription({
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>) {
  return <DialogPrimitive.Description className={cn("text-sm text-muted-foreground", className)} {...props} />;
}
```

## `components/ui/dropdown-menu.tsx` and `tabs.tsx`

```tsx
"use client";

// Radix dropdown menu: arrow keys move between items, Enter selects, Escape closes.
import * as MenuPrimitive from "@radix-ui/react-dropdown-menu";
import * as React from "react";
import { cn } from "@/lib/utils";

export const DropdownMenu = MenuPrimitive.Root;
export const DropdownMenuTrigger = MenuPrimitive.Trigger;

export function DropdownMenuContent({
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof MenuPrimitive.Content>) {
  return (
    <MenuPrimitive.Portal>
      {/* align="end" = line up with the trigger's right edge. sideOffset = a 6px gap below it. */}
      <MenuPrimitive.Content
        align="end"
        sideOffset={6}
        className={cn(
          "z-50 min-w-48 rounded-lg border bg-card p-1 shadow-lg data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95",
          className,
        )}
        {...props}
      />
    </MenuPrimitive.Portal>
  );
}

// data-disabled / data-highlighted are attributes Radix sets; Tailwind styles them (faded / grey background).
export function DropdownMenuItem({ className, ...props }: React.ComponentPropsWithoutRef<typeof MenuPrimitive.Item>) {
  return (
    <MenuPrimitive.Item
      className={cn(
        "flex cursor-pointer items-center gap-2 rounded-md px-2.5 py-2 text-sm outline-none data-disabled:opacity-40 data-highlighted:bg-muted",
        className,
      )}
      {...props}
    />
  );
}

export function DropdownMenuLabel({ className, ...props }: React.ComponentPropsWithoutRef<typeof MenuPrimitive.Label>) {
  return <MenuPrimitive.Label className={cn("px-2.5 py-1.5 text-xs font-semibold text-muted-foreground", className)} {...props} />;
}

export function DropdownMenuSeparator({ className, ...props }: React.ComponentPropsWithoutRef<typeof MenuPrimitive.Separator>) {
  return <MenuPrimitive.Separator className={cn("my-1 h-px bg-border", className)} {...props} />;
}
```

```tsx
"use client";

// Radix tabs: arrow keys switch tabs; only the active panel is shown.
import * as TabsPrimitive from "@radix-ui/react-tabs";
import * as React from "react";
import { cn } from "@/lib/utils";

export const Tabs = TabsPrimitive.Root;          // <Tabs defaultValue="pipeline">

// The grey bar holding the tab buttons.
export function TabsList({ className, ...props }: React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>) {
  return <TabsPrimitive.List className={cn("inline-flex gap-1 rounded-lg bg-muted p-1", className)} {...props} />;
}

// One tab button. data-[state=active]:... = white "raised" look for the selected tab.
export function TabsTrigger({ className, ...props }: React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      className={cn(
        "rounded-md px-3 py-1.5 text-sm font-semibold text-muted-foreground transition-colors data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-sm",
        className,
      )}
      {...props}
    />
  );
}

// The panel shown for the active tab.
export function TabsContent({ className, ...props }: React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>) {
  return <TabsPrimitive.Content className={cn("mt-5", className)} {...props} />;
}
```

## The small ones: card, badge, avatar, skeleton, label

```tsx
// card.tsx: a white rounded box with a border, plus header/title/description/content parts.
// "...props" passes anything else (onClick, style...) through to the <div>.
export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-lg border bg-card text-card-foreground", className)} {...props} />;
}
export function CardHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex flex-col gap-1 p-5 pb-3", className)} {...props} />;
}
export function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h2 className={cn("text-lg font-semibold", className)} {...props} />;
}
export function CardDescription({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("text-sm text-muted-foreground", className)} {...props} />;
}
export function CardContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-5 pt-2", className)} {...props} />;
}

// badge.tsx: a small rounded "pill" label.
export function Badge({ className, ...props }: React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn("inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-0.5 text-xs font-semibold", className)}
      {...props}
    />
  );
}

// avatar.tsx: a circle with the person's initials ("Ada Okafor" -> "AO").
// aria-hidden: decorative, because the name is always written next to it.
export function Avatar({ name, className }: { name: string; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-bold text-accent-foreground",
        className,
      )}
    >
      {initials(name)}
    </span>
  );
}

// skeleton.tsx: a grey pulsing block shown while data loads (animate-pulse = fades in and out).
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-md bg-muted", className)} />;
}

// label.tsx: a bold <label>. Its htmlFor matches an input's id, so clicking the label focuses the input.
export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn("text-sm font-semibold", className)} {...props} />;
}
```

## `components/shared/field.tsx`, `empty-state.tsx`, `page-header.tsx`

```tsx
import { Label } from "@/components/ui/label";

// A label, the input passed as children, and its error message.
// Used by every form, so they all look and behave the same.
export function Field({
  label,
  htmlFor,          // must match the input's id
  error,            // Zod/server message, shown in red
  hint,             // grey help text, hidden when there's an error
  children,
}: {
  label: string;
  htmlFor: string;
  error?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint && !error && <p className="text-xs text-muted-foreground">{hint}</p>}
      {error && (
        <p role="alert" className="text-xs font-medium text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
```

```tsx
import type { LucideIcon } from "lucide-react";

// "Nothing here yet" box with an icon, a title, optional text and an optional button.
export function EmptyState({ icon: Icon, title, description, action }: {
  icon: LucideIcon; title: string; description?: string; action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed px-6 py-12 text-center">
      <span className="flex size-11 items-center justify-center rounded-full bg-accent text-accent-foreground">
        <Icon className="size-5" />
      </span>
      <p className="font-display text-lg font-semibold">{title}</p>
      {description && <p className="max-w-sm text-sm text-muted-foreground">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

// A red box for errors from the API ("Cannot reach the server...").
export function ErrorState({ message }: { message: string }) {
  return (
    <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
      {message}
    </div>
  );
}
```

```tsx
// page-header.tsx: the page title, a description, and buttons on the right.
// flex-wrap: on narrow screens the buttons wrap under the title instead of overflowing.
export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-3xl font-bold">{title}</h1>
        {description && <p className="mt-1 text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}
```

## `src/app/globals.css` (the important parts)

```css
/* Load Tailwind (all its utility classes) and a small animation library. */
@import "tailwindcss";
@import "tw-animate-css";

/* DESIGN TOKENS: every colour is defined ONCE here as a CSS variable.
   Change --primary and every purple button, link and bar changes with it. */
:root {
  --background: #f5f6fb;          /* page background (very light grey-blue) */
  --foreground: #14162b;          /* main text (near black) */
  --card: #ffffff;                /* cards and inputs */
  --card-foreground: #14162b;
  --muted: #eceef7;               /* subtle backgrounds */
  --muted-foreground: #5d6180;    /* secondary text */
  --border: #e0e3f0;
  --input: #d5d9ea;
  --primary: #3a36e0;             /* HirePlume indigo */
  --primary-foreground: #ffffff;  /* text on primary */
  --accent: #e8e9ff;              /* light indigo */
  --accent-foreground: #2723a8;
  --destructive: #d62f56;         /* red for errors/danger */
  --ring: #3a36e0;                /* focus ring */
  --radius: 0.75rem;              /* corner roundness */

  /* One color per pipeline stage. Used by the "stage thread" everywhere. */
  --stage-applied: #7b8099;
  --stage-screen: #1d8fd1;
  --stage-interview: #7a3fe0;
  --stage-offer: #d98a0b;
  --stage-hired: #12966a;
  --stage-rejected: #d62f56;
}

/* Expose the variables to Tailwind, so classes like bg-primary, text-muted-foreground,
   bg-status-good-wash and font-display all work. */
@theme inline {
  --color-background: var(--background);
  --color-primary: var(--primary);
  /* ...one line per colour above, plus the status colours... */
  --font-sans: var(--font-figtree), ui-sans-serif, system-ui, sans-serif;           /* body text */
  --font-display: var(--font-bricolage), var(--font-figtree), ui-sans-serif, sans-serif; /* headings */
}

/* Base styles for plain HTML elements. */
@layer base {
  * { border-color: var(--border); }
  body { background: var(--background); color: var(--foreground); font-family: var(--font-sans); -webkit-font-smoothing: antialiased; }
  h1, h2, h3 { font-family: var(--font-display); letter-spacing: -0.02em; }
  /* A visible outline for keyboard users only (focus-visible), never for mouse clicks. */
  :focus-visible { outline: 2px solid var(--ring); outline-offset: 2px; }
}

/* The stage thread draws itself once: scaleX from 0 to 1, growing from the left. */
@keyframes thread-draw { from { transform: scaleX(0); } to { transform: scaleX(1); } }
.thread-draw { transform-origin: left; animation: thread-draw 0.9s cubic-bezier(0.22, 1, 0.36, 1) both; }

/* ---- Dashboard ---- */
/* Status colours: reserved for MEANING (good / attention / critical), always with an icon and a label. */
:root {
  --status-good: #12966a;     --status-good-wash: #e3f5ee;
  --status-warning: #b26b00;  --status-warning-wash: #fdf1dc;
  --status-critical: #c8264c; --status-critical-wash: #fde7ec;
}

/* The greeting banner: layered gradients (a soft indigo glow) + a fading dot pattern (::after). */
.dash-hero { position: relative; overflow: hidden; background: radial-gradient(...), radial-gradient(...), linear-gradient(...); }
.dash-hero::after { /* dots */ background-image: radial-gradient(rgb(58 54 224 / 12%) 1px, transparent 1px);
  background-size: 18px 18px; mask-image: linear-gradient(115deg, transparent 45%, black 100%); content: ""; pointer-events: none; }

/* Cards rise in once; each waits --rise-delay (set from React) before starting. */
@keyframes dash-rise { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }
.dash-rise { animation: dash-rise 0.6s cubic-bezier(0.22, 1, 0.36, 1) both; animation-delay: var(--rise-delay, 0ms); }
/* Bars grow from their left edge once. */
.dash-grow { transform-origin: left; animation: dash-grow 0.8s cubic-bezier(0.22, 1, 0.36, 1) both; animation-delay: var(--rise-delay, 0ms); }

/* Respect the visitor's "reduce motion" setting (motion sickness, distraction): no animations. */
@media (prefers-reduced-motion: reduce) {
  .dash-rise, .dash-grow, .thread-draw, .home-hero-photo { animation: none; }
  .scroll-reveal, .scroll-reveal.is-ready:not(.is-visible) { opacity: 1; transform: none; filter: none; transition: none; }
}

/* Landing page: its own palette (.home-page), the hero photo zoom, the dark wash over the photo,
   ScrollReveal's hidden/visible states, and the example stage flow (.home-stage-*). */
.scroll-reveal { transition: opacity 700ms ..., transform 700ms ..., filter 700ms ...; transition-delay: var(--reveal-delay, 0ms); }
.scroll-reveal.is-ready:not(.is-visible) { opacity: 0; transform: translateY(24px); filter: blur(3px); }
```

## `frontend/next.config.ts`

```ts
import type { NextConfig } from "next";

// HTTP headers added to EVERY page response, for security.
const securityHeaders = [
  // Invitation links carry a one-time token in the URL: never send the full URL to other sites.
  // (When a page loads something from another site, the browser normally says which page it came
  //  from: the "referrer". This sends only "https://hireplume-app.vercel.app", never the path or ?token=.)
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Don't let the browser guess a file's type and run it as a script.
  { key: "X-Content-Type-Options", value: "nosniff" },
  // No other site may show HirePlume inside a frame (clickjacking).
  { key: "X-Frame-Options", value: "DENY" },
  // Switch off browser features the app never uses.
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
];

const nextConfig: NextConfig = {
  // Where Next.js looks for files when tracing what the server build needs.
  outputFileTracingRoot: process.cwd(),
  // Don't advertise "X-Powered-By: Next.js" (less information for attackers).
  poweredByHeader: false,
  // Apply the headers to every path. "/:path*" = any URL.
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
```

## Other config files, briefly

| File | What it does |
|---|---|
| `frontend/package.json` | The project's name, its scripts (`dev`, `build`, `start`, `typecheck`) and every library with its version range |
| `frontend/bun.lock` | The **exact** versions installed, so every machine (and Vercel) gets the same ones |
| `frontend/tsconfig.json` | TypeScript settings: `strict: true` (strictest checks), `"paths": {"@/*": ["./src/*"]}` (the `@/` shortcut), `"jsx": "preserve"` (Next.js handles JSX) |
| `frontend/components.json` | shadcn/ui settings (where components and utils live) |
| `frontend/postcss.config.mjs` | Runs Tailwind when CSS is built |
| `frontend/.env.example` / `.env.local` | `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_GOOGLE_CLIENT_ID` (the `.local` file is never committed) |
| `frontend/.vercelignore` | Files the Vercel CLI must not upload (`node_modules`, `.next`, `.env*`) |
| `src/app/icon.svg` | The favicon (Next.js serves any `app/icon.*` automatically) |
