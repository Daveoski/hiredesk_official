import Link from "next/link";
import { ArrowDownRight, ArrowRight, ArrowUpRight } from "lucide-react";

export default function Home() {
  return (
    <main className="bg-[#f4f3eb] text-[#15332e]">
      <header className="absolute inset-x-0 top-0 z-10">
        <nav className="mx-auto flex max-w-7xl items-center justify-between px-5 py-5 sm:px-10" aria-label="Main">
          <Link href="/" className="font-display text-2xl font-bold">HireDesk<span className="text-[#d76645]">.</span></Link>
          <div className="flex items-center gap-3 sm:gap-6">
            <Link href="/login" className="text-sm font-semibold text-white/90 hover:text-white">Sign in</Link>
            <Link href="/register" className="inline-flex items-center gap-2 rounded-md bg-[#d6ed88] px-4 py-2.5 text-sm font-bold text-[#18342e] hover:bg-white">
              Create account <ArrowUpRight className="size-4" />
            </Link>
          </div>
        </nav>
      </header>

      <section className="relative flex min-h-[68svh] items-end overflow-hidden bg-[#19332e] sm:min-h-155">
        <div
          role="img"
          aria-label="A hiring team reviewing applicants together around a table"
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: "url('https://images.unsplash.com/photo-1521737711867-e3b97375f902?auto=format&fit=crop&w=2200&q=85')" }}
        />
        <div className="absolute inset-0 bg-[#10231f]/55" />
        <div className="relative mx-auto w-full max-w-7xl px-5 pb-12 pt-36 text-white sm:px-10 sm:pb-16">
          <p className="mb-5 text-xs font-bold uppercase tracking-[0.18em] text-[#d6ed88]">Hiring, with the whole team in the loop</p>
          <h1 className="max-w-4xl font-display text-5xl font-semibold leading-[0.98] sm:text-7xl">HireDesk</h1>
          <p className="mt-5 max-w-xl text-base leading-relaxed text-white/85 sm:text-lg">
            One clear place to review applicants, bring interviewers together, and make thoughtful hiring decisions.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-4">
            <Link href="/register" className="inline-flex items-center gap-2 rounded-md bg-[#d6ed88] px-5 py-3 font-bold text-[#18342e] hover:bg-white">
              Set up your company <ArrowRight className="size-4" />
            </Link>
            <span className="text-sm text-white/75">Managers and interviewers sign in by invitation.</span>
          </div>
          <div className="mt-12 flex items-center gap-3 text-sm font-semibold text-white/80">
            <ArrowDownRight className="size-4 text-[#d6ed88]" /> From application to final decision
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-7xl gap-8 px-5 py-10 sm:grid-cols-[1fr_2fr] sm:px-10 sm:py-14">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#b34f35]">A more considered process</p>
          <h2 className="mt-3 max-w-sm font-display text-3xl font-semibold leading-tight sm:text-4xl">Good hiring is a team decision.</h2>
        </div>
        <div className="grid gap-6 sm:grid-cols-3">
          <div className="border-t border-[#15332e]/20 pt-4">
            <span className="text-sm font-bold text-[#b34f35]">01</span>
            <h3 className="mt-3 font-display text-xl font-semibold">Review with context</h3>
            <p className="mt-2 text-sm leading-relaxed text-[#49645e]">Compare experience and qualifications against each role, not across scattered files.</p>
          </div>
          <div className="border-t border-[#15332e]/20 pt-4">
            <span className="text-sm font-bold text-[#b34f35]">02</span>
            <h3 className="mt-3 font-display text-xl font-semibold">Bring in interviewers</h3>
            <p className="mt-2 text-sm leading-relaxed text-[#49645e]">Assign teammates, schedule a meeting, and collect structured feedback.</p>
          </div>
          <div className="border-t border-[#15332e]/20 pt-4">
            <span className="text-sm font-bold text-[#b34f35]">03</span>
            <h3 className="mt-3 font-display text-xl font-semibold">Move forward together</h3>
            <p className="mt-2 text-sm leading-relaxed text-[#49645e]">Keep applicants informed while managers make the final call.</p>
          </div>
        </div>
      </section>
    </main>
  );
}
