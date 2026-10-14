import { ArrowLeft } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { Logo } from "@/components/layout/logo";
import { StageThread } from "@/components/shared/stage-thread";
import { ThemeToggle } from "@/components/shared/theme-toggle";

// Shared frame for account forms: the form on the left, the product idea on the right.
export function AuthLayout({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="flex flex-col px-6 py-8 sm:px-12">
        <div className="flex items-center justify-between gap-4">
          <Logo href="/" />
          <div className="flex items-center gap-3">
            <ThemeToggle />
            <Link href="/" className="group inline-flex items-center gap-1.5 text-sm font-semibold text-muted-foreground transition hover:text-foreground">
              <ArrowLeft className="size-4 transition-transform group-hover:-translate-x-0.5" /> Home
            </Link>
          </div>
        </div>
        <div className="auth-swap mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-10">
          <h1 className="text-3xl font-bold">{title}</h1>
          <p className="mb-8 mt-2 text-muted-foreground">{subtitle}</p>
          {children}
        </div>
      </div>
      <div className="relative hidden overflow-hidden bg-foreground text-white lg:block">
        <Image
          src="/images/hero/hero-1.jpg"
          alt=""
          fill
          sizes="50vw"
          quality={70}
          className="hero-kenburns-a object-cover"
          style={{ animationDuration: "18s" }}
        />
        <div aria-hidden="true" className="absolute inset-0 bg-[linear-gradient(180deg,rgba(20,22,43,0.35)_0%,rgba(20,22,43,0.88)_70%)]" />
        <div className="relative flex h-full flex-col justify-end gap-8 p-14">
          <h2 className="hero-in max-w-md text-4xl font-bold leading-tight">Every candidate, one clear path to a decision.</h2>
          <p className="hero-in max-w-md text-white/80" style={{ animationDelay: "150ms" }}>
            Hiring managers publish roles. Admins build the team. Interviewers share clear feedback, and applicants stay informed.
          </p>
          <div className="hero-in max-w-md rounded-lg bg-background p-6 text-foreground shadow-2xl" style={{ animationDelay: "300ms" }}>
            <StageThread stage="interview" />
          </div>
        </div>
      </div>
    </div>
  );
}
