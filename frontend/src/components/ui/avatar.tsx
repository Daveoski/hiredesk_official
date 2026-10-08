import { cn, initials } from "@/lib/utils";

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
