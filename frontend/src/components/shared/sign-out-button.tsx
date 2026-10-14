"use client";

import { LogOut } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/auth-store";

// Signs out with a short exit animation, so the change of state is visible rather than abrupt.
export function SignOutButton({
  onSignedOut,
  tone = "light",
  className,
}: {
  onSignedOut?: () => void;
  tone?: "light" | "dark";
  className?: string;
}) {
  const logout = useAuthStore((state) => state.logout);
  const [leaving, setLeaving] = useState(false);

  function signOut() {
    setLeaving(true);
    window.setTimeout(() => {
      logout();
      toast.success("You have signed out");
      onSignedOut?.();
    }, 260);
  }

  return (
    <button
      type="button"
      onClick={signOut}
      disabled={leaving}
      className={cn(
        "auth-pill group inline-flex h-10 items-center gap-2 rounded-full px-4 text-sm font-semibold",
        tone === "dark"
          ? "border border-white/30 text-white hover:border-white hover:bg-white hover:text-[#17201d]"
          : "border border-input bg-card text-foreground hover:border-destructive/40 hover:bg-destructive/5 hover:text-destructive",
        leaving && "auth-pill-leaving",
        className,
      )}
    >
      <LogOut className="size-4 transition-transform duration-300 group-hover:translate-x-0.5" />
      Sign out
    </button>
  );
}
