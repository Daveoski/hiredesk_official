import Link from "next/link";

// Laid out with flexbox rather than translate(), so the mark also looks right in older browsers.
export function Logo({ href = "/overview" }: { href?: string }) {
  return (
    <Link href={href} className="inline-flex items-center gap-2 font-display text-xl font-bold tracking-tight">
      <span className="relative flex size-8 items-center rounded-lg bg-primary px-1.5">
        <span className="absolute inset-x-1.5 top-[15px] h-0.5 bg-[rgba(255,255,255,0.5)]" />
        <span className="relative flex w-full items-center justify-between">
          <span className="size-2 rounded-full bg-white" />
          <span className="size-2 rounded-full bg-[rgba(255,255,255,0.6)]" />
        </span>
      </span>
      HireDesk
    </Link>
  );
}
