"use client";

import Link from "next/link";
import { useEffect } from "react";
import { Logo } from "@/components/layout/logo";
import { Button } from "@/components/ui/button";

// Shown instead of a blank page when something on a page crashes.
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 px-6 text-center">
      <Logo href="/" />
      <h1 className="max-w-md text-4xl font-bold">Something went wrong on this page</h1>
      <p className="max-w-md text-muted-foreground">
        Your work is saved on the server. Try again, and if it keeps happening, go back to your dashboard.
      </p>
      {error.digest && <p className="font-mono text-xs text-muted-foreground">Reference: {error.digest}</p>}
      <div className="flex flex-wrap justify-center gap-2">
        <Button onClick={reset}>Try again</Button>
        <Button asChild variant="outline">
          <Link href="/overview">Go to my dashboard</Link>
        </Button>
      </div>
    </main>
  );
}
