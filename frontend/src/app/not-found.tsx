import Link from "next/link";
import { Logo } from "@/components/layout/logo";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 px-6 text-center">
      <Logo href="/" />
      <p className="text-sm font-bold uppercase tracking-[0.2em] text-primary">404</p>
      <h1 className="max-w-md text-4xl font-bold">This page isn&apos;t on the hiring plan</h1>
      <p className="max-w-md text-muted-foreground">
        The link may be old, or the job may no longer be accepting applications.
      </p>
      <div className="flex flex-wrap justify-center gap-2">
        <Button asChild>
          <Link href="/overview">Go to my dashboard</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/">Back to the home page</Link>
        </Button>
      </div>
    </main>
  );
}
