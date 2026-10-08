import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  BriefcaseBusiness,
  CalendarDays,
  Check,
  Mail,
  Phone,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import { ScrollReveal } from "@/components/shared/scroll-reveal";

const features = [
  {
    icon: BriefcaseBusiness,
    number: "01",
    title: "Applications, with context",
    text: "Publish roles, receive applications and CVs, then review each candidate's qualifications beside the requirements that matter.",
  },
  {
    icon: CalendarDays,
    number: "02",
    title: "Interviews, thoughtfully assigned",
    text: "Move candidates through your hiring stages, assign interviewers, schedule virtual or in-person meetings, and collect scorecards.",
  },
  {
    icon: ShieldCheck,
    number: "03",
    title: "Decisions, clearly recorded",
    text: "Hiring managers make the final assessment and decision. Company admins receive outcome updates, while access stays role-based.",
  },
];

const roles = [
  { icon: ShieldCheck, role: "Company admin", text: "Set up the company workspace, invite teammates, and receive hiring outcome updates." },
  { icon: BriefcaseBusiness, role: "Hiring manager", text: "Manage roles and applications, assess candidates, and make the final decision." },
  { icon: UserRound, role: "Interviewer", text: "See assigned interviews, meet candidates, and submit an independent scorecard." },
];

export default function Home() {
  return (
    <main className="home-page min-h-screen bg-[#f7f8f5] text-[#17201d]">
      <section className="home-hero relative isolate flex min-h-[760px] flex-col justify-between overflow-hidden bg-[#17201d] text-white sm:min-h-[820px]">
        <div
          aria-hidden="true"
          className="home-hero-photo absolute inset-0 -z-20 bg-cover bg-center"
          style={{ backgroundImage: "url('https://images.unsplash.com/photo-1521737711867-e3b97375f902?auto=format&fit=crop&w=2200&q=85')" }}
        />
        <div aria-hidden="true" className="home-hero-wash absolute inset-0 -z-10" />

        <header>
          <nav className="mx-auto flex max-w-7xl items-center justify-between px-5 py-5 sm:px-8 lg:px-12" aria-label="Main navigation">
            <Link href="/" className="font-display text-2xl font-semibold text-white sm:text-3xl">
              HireDesk<span className="text-[#db7559]">.</span>
            </Link>
            <div className="flex items-center gap-4 sm:gap-8">
              <a href="#workflow" className="hidden text-sm text-white/75 transition hover:text-white sm:inline">Workflow</a>
              <a href="#teams" className="hidden text-sm text-white/75 transition hover:text-white sm:inline">For your team</a>
              <Link href="/login" className="text-sm font-semibold text-white/85 transition hover:text-white">Sign in</Link>
              <Link href="/register" className="inline-flex items-center gap-2 rounded-full bg-[#e6f18f] px-4 py-2.5 text-sm font-semibold text-[#17201d] transition hover:bg-white sm:px-5">
                Get started <ArrowUpRight className="size-4" />
              </Link>
            </div>
          </nav>
        </header>

        <div className="mx-auto w-full max-w-7xl px-5 pb-7 pt-16 sm:px-8 sm:pb-9 lg:px-12">
          <ScrollReveal className="max-w-4xl">
            <p className="mb-5 text-xs font-semibold uppercase text-[#e6f18f]">A considered way to build your team</p>
            <h1 className="font-display text-6xl font-semibold leading-[0.98] text-white sm:text-7xl lg:text-8xl">HireDesk</h1>
            <p className="mt-5 max-w-2xl text-lg leading-8 text-white/85 sm:text-xl">
              Every application, conversation, and assessment in its right place. A thoughtful hiring workspace for teams that want to make better decisions together.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link href="/register" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-[#e6f18f] px-6 text-sm font-semibold text-[#17201d] transition hover:-translate-y-0.5 hover:bg-white">
                Create your workspace <ArrowRight className="size-4" />
              </Link>
              <a href="#workflow" className="inline-flex min-h-12 items-center justify-center rounded-full border border-white/35 px-6 text-sm font-semibold text-white transition hover:bg-white/10">
                Explore the workflow
              </a>
            </div>
          </ScrollReveal>

          <div className="mt-12 flex flex-wrap items-center gap-x-8 gap-y-3 border-t border-white/25 pt-5 text-xs font-medium uppercase text-white/75 sm:mt-16 sm:gap-x-12">
            <span>Applications</span><span aria-hidden="true" className="text-[#e6f18f]">/</span>
            <span>Interviews</span><span aria-hidden="true" className="text-[#e6f18f]">/</span>
            <span>Decisions</span>
          </div>
        </div>
      </section>

      <section id="workflow" className="scroll-mt-6 bg-[#f7f8f5]">
        <div className="mx-auto grid max-w-7xl gap-12 px-5 py-20 sm:px-8 lg:grid-cols-[0.8fr_1.2fr] lg:gap-24 lg:px-12 lg:py-28">
          <ScrollReveal className="max-w-md self-start lg:sticky lg:top-16">
            <p className="text-xs font-semibold uppercase text-[#a84c37]">A clear line from start to decision</p>
            <h2 className="mt-4 font-display text-4xl font-semibold leading-tight sm:text-5xl">One process. The right people at every step.</h2>
            <p className="mt-5 text-base leading-7 text-[#5d6761]">
              Keep the hiring journey connected without blurring who owns each decision.
            </p>
          </ScrollReveal>

          <div className="divide-y divide-[#d7ddd7] border-y border-[#d7ddd7]">
            {features.map(({ icon: Icon, number, title, text }, index) => (
              <ScrollReveal key={number} delay={index * 90}>
                <article className="grid gap-5 py-7 sm:grid-cols-[56px_1fr] sm:gap-7 sm:py-9">
                  <div className="flex items-center gap-3 sm:block">
                    <span className="font-display text-sm text-[#a84c37]">{number}</span>
                    <Icon className="size-5 text-[#52665a] sm:mt-5" strokeWidth={1.6} />
                  </div>
                  <div>
                    <h3 className="font-display text-2xl font-semibold sm:text-3xl">{title}</h3>
                    <p className="mt-3 max-w-2xl text-base leading-7 text-[#5d6761]">{text}</p>
                  </div>
                </article>
              </ScrollReveal>
            ))}
          </div>
        </div>
      </section>

      <section id="teams" className="bg-[#202a25] text-white">
        <div className="mx-auto max-w-7xl px-5 py-20 sm:px-8 lg:px-12 lg:py-28">
          <ScrollReveal className="max-w-3xl">
            <p className="text-xs font-semibold uppercase text-[#e6f18f]">Made for distinct responsibilities</p>
            <h2 className="mt-4 font-display text-4xl font-semibold leading-tight sm:text-5xl">A shared outcome, with clear ownership.</h2>
            <p className="mt-5 max-w-2xl text-base leading-7 text-white/70">
              HireDesk keeps company administration, candidate assessment, and interviewer feedback in their proper lanes.
            </p>
          </ScrollReveal>

          <div className="mt-12 grid border-t border-white/20 md:grid-cols-3">
            {roles.map(({ icon: Icon, role, text }, index) => (
              <ScrollReveal key={role} delay={index * 100} className="h-full">
                <article className="h-full border-b border-white/20 py-7 md:border-b-0 md:border-r md:px-7 md:first:pl-0 md:last:border-r-0 md:last:pr-0 lg:py-9">
                  <Icon className="size-6 text-[#e6f18f]" strokeWidth={1.6} />
                  <h3 className="mt-6 font-display text-2xl font-semibold">{role}</h3>
                  <p className="mt-3 max-w-sm text-sm leading-6 text-white/70">{text}</p>
                </article>
              </ScrollReveal>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-[#e9eeea]">
        <div className="mx-auto grid max-w-7xl gap-10 px-5 py-20 sm:px-8 lg:grid-cols-[0.75fr_1.25fr] lg:gap-20 lg:px-12 lg:py-24">
          <ScrollReveal className="max-w-sm">
            <p className="text-xs font-semibold uppercase text-[#a84c37]">A considered candidate journey</p>
            <h2 className="mt-4 font-display text-4xl font-semibold leading-tight">Every handoff stays in view.</h2>
            <p className="mt-5 text-base leading-7 text-[#5d6761]">
              From the first application to a final outcome, the team can follow progress through the stages configured for each role.
            </p>
          </ScrollReveal>

          <ScrollReveal>
            <div className="home-stage-flow" aria-label="Example application stages">
              {["Applied", "Screen", "Interview", "Offer", "Hired"].map((stage, index) => (
                <div className="home-stage-item" key={stage}>
                  <span className={index === 4 ? "home-stage-dot home-stage-dot-final" : "home-stage-dot"} />
                  <span>{stage}</span>
                </div>
              ))}
            </div>
            <div className="mt-8 flex items-start gap-3 border-t border-[#cbd3cc] pt-5 text-sm leading-6 text-[#5d6761]">
              <Check className="mt-1 size-4 shrink-0 text-[#a84c37]" />
              Interview scorecards support ratings and recommendations; the hiring manager makes the final call.
            </div>
          </ScrollReveal>
        </div>
      </section>

      <footer className="bg-[#f7f8f5]">
        <div className="mx-auto max-w-7xl px-5 py-16 sm:px-8 lg:px-12 lg:py-20">
          <ScrollReveal className="flex flex-col gap-8 border-b border-[#d7ddd7] pb-12 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <p className="text-xs font-semibold uppercase text-[#a84c37]">Make room for better decisions</p>
              <h2 className="mt-4 font-display text-4xl font-semibold leading-tight sm:text-5xl">Bring your next hiring process into focus.</h2>
            </div>
            <Link href="/register" className="inline-flex min-h-12 shrink-0 items-center justify-center gap-2 rounded-full bg-[#a84c37] px-6 text-sm font-semibold text-white transition hover:bg-[#863a2a]">
              Create your workspace <ArrowRight className="size-4" />
            </Link>
          </ScrollReveal>

          <div className="flex flex-col gap-5 pt-7 text-sm text-[#5d6761] sm:flex-row sm:items-center sm:justify-between">
            <Link href="/" className="font-display text-xl font-semibold text-[#17201d]">HireDesk<span className="text-[#a84c37]">.</span></Link>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-7">
              <a className="inline-flex items-center gap-2 hover:text-[#17201d]" href="mailto:okechukwuorjionuchie@gmail.com">
                <Mail className="size-4" /> okechukwuorjionuchie@gmail.com
              </a>
              <a className="inline-flex items-center gap-2 hover:text-[#17201d]" href="tel:+2349031707946">
                <Phone className="size-4" /> +2349031707946
              </a>
            </div>
          </div>
        </div>
      </footer>
    </main>
  );
}
