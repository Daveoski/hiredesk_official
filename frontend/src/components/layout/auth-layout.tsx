import { Logo } from "@/components/layout/logo";
import { StageThread } from "@/components/shared/stage-thread";

// Shared frame for account forms: the form on the left, the product idea on the right.
export function AuthLayout({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="flex flex-col px-6 py-8 sm:px-12">
        <Logo href="/" />
        <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-10">
          <h1 className="text-3xl font-bold">{title}</h1>
          <p className="mb-8 mt-2 text-muted-foreground">{subtitle}</p>
          {children}
        </div>
      </div>
      <div className="hidden flex-col justify-center gap-10 bg-foreground p-14 text-background lg:flex">
        <h2 className="max-w-md text-4xl font-bold leading-tight">Every candidate, one clear path to a decision.</h2>
        <p className="max-w-md text-background/70">
          Hiring managers publish roles. Admins build the team. Interviewers share clear feedback, and applicants stay informed.
        </p>
        <div className="max-w-md rounded-lg bg-background p-6 text-foreground">
          <StageThread stage="interview" />
        </div>
      </div>
    </div>
  );
}
