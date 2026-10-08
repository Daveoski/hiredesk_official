"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { useAuthStore } from "@/stores/auth-store";

// Every page inside (app) needs a logged-in user.
export default function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const token = useAuthStore((state) => state.token);
  // Render nothing until the browser has mounted, so the server and browser HTML match.
  const [mounted, setMounted] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (useAuthStore.persist.hasHydrated()) {
      setHydrated(true);
      return;
    }
    return useAuthStore.persist.onFinishHydration(() => setHydrated(true));
  }, []);

  useEffect(() => {
    if (hydrated && !token) router.replace("/login");
  }, [hydrated, token, router]);

  if (!mounted || !hydrated || !token) return null;
  return <AppShell>{children}</AppShell>;
}
