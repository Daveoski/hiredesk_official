import Link from "next/link";
import { cn } from "@/lib/utils";

// The HirePlume mark: a feather pen whose spine is the long stroke of a tick.
// Writing the offer and picking the hire, in one shape. Same drawing as app/icon.svg,
// but the square follows the theme's primary colour.
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" className={cn("size-8 shrink-0", className)}>
      <rect width="32" height="32" rx="8" fill="var(--primary)" />
      <g transform="translate(0.4 0.9)">
        <path d="M26 5.5C18.5 6.5 13 11.5 13.6 19.5 20.5 18.8 25.2 13.5 26 5.5Z" fill="#ffffff" />
        <path d="M16.6 8.4 18.4 8.9 19.6 12.7ZM22.1 16 21.2 17 17.7 15.3Z" fill="var(--primary)" />
        <path d="M13.6 19.5 24.6 7.1" stroke="var(--primary)" strokeWidth="0.9" strokeLinecap="round" />
        <path d="M6.5 18.6 10.4 23 13.6 19.5" stroke="#e6f18f" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      </g>
    </svg>
  );
}

export function Logo({ href = "/overview" }: { href?: string }) {
  return (
    <Link href={href} className="inline-flex items-center gap-2 font-display text-xl font-bold tracking-tight">
      <LogoMark />
      <span>
        Hire<span className="text-primary">Plume</span>
      </span>
    </Link>
  );
}
