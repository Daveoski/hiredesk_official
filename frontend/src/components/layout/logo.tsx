import Link from "next/link";

export function Logo({ href = "/overview" }: { href?: string }) {
  return (
    <Link href={href} className="inline-flex items-center gap-2 font-display text-xl font-bold tracking-tight">
      <span className="relative flex size-8 items-center justify-center rounded-lg bg-primary">
        <span className="absolute left-1.5 right-1.5 top-1/2 h-0.5 -translate-y-1/2 bg-white/50" />
        <span className="absolute left-1.5 top-1/2 size-2 -translate-y-1/2 rounded-full bg-white" />
        <span className="absolute right-1.5 top-1/2 size-2 -translate-y-1/2 rounded-full bg-white/60" />
      </span>
      HireDesk
    </Link>
  );
}
