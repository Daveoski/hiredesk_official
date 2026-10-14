import Link from "next/link";
import {
  ArrowRight,
  BriefcaseBusiness,
  CalendarClock,
  CalendarDays,
  Check,
  ClipboardCheck,
  FileUp,
  KeyRound,
  Mail,
  PenLine,
  Phone,
  ShieldCheck,
  Sparkles,
  Star,
  UserRound,
  UsersRound,
} from "lucide-react";
import { HeroSlider } from "@/components/home/hero-slider";
import { SiteHeader } from "@/components/home/site-header";
import { ScrollReveal } from "@/components/shared/scroll-reveal";

const workflow = [
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

// Each card describes something the backend actually does today.
const features = [
  {
    icon: Sparkles,
    title: "AI screening and final review",
    text: "The AI assistant reads CVs, documents and answers, then weighs interview scorecards against your assessment. It advises; your hiring manager decides.",
    wide: true,
  },
  { icon: PenLine, title: "Job adverts in minutes", text: "Turn a title and a few notes into a description, required qualifications and eligibility criteria." },
  { icon: FileUp, title: "Public application links", text: "Share one link per role. Applicants upload their CV and supporting documents without an account." },
  { icon: CalendarClock, title: "Virtual or in-person", text: "Schedule interviews with a meeting link or a location, reschedule or cancel, and keep everyone informed." },
  { icon: ClipboardCheck, title: "Independent scorecards", text: "Interviewers rate and recommend on their own, so feedback stays honest and comparable." },
  { icon: Mail, title: "Progress reports by email", text: "Admins see open roles, pipeline movement and outcomes, and can email the report in one click." },
  { icon: UsersRound, title: "Invite your team", text: "Invite hiring managers and interviewers with shareable links. Each person only sees what their role needs." },
  { icon: KeyRound, title: "Secure sign-in", text: "Email and password or a work Google account, with rate-limited logins and expiring sessions." },
];

const roles = [
  { icon: ShieldCheck, role: "Company admin", text: "Set up the company workspace, invite teammates, and receive hiring outcome updates." },
  { icon: BriefcaseBusiness, role: "Hiring manager", text: "Manage roles and applications, assess candidates, and make the final decision." },
  { icon: UserRound, role: "Interviewer", text: "See assigned interviews, meet candidates, and submit an independent scorecard." },
];

const capabilities = [
  "CV uploads",
  "AI screening",
  "Interview scheduling",
  "Scorecards",
  "Team invitations",
  "Role-based access",
  "Progress reports",
  "Google sign-in",
  "Shareable apply links",
];

const stages = ["Applied", "Screen", "Interview", "Offer", "Hired"];

// An illustration of a candidate card, so visitors can picture the product. Not live data.
function PipelinePreview() {
  return (
    <div className="hero-float hidden w-82.5 rounded-2xl border border-white/20 bg-[rgba(23,32,29,0.55)] p-5 text-white shadow-2xl backdrop-blur-md lg:block">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/60">Example candidate</span>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-[rgba(230,241,143,0.15)] px-2.5 py-1 text-[11px] font-semibold text-[#e6f18f]">
          <span className="live-dot size-1.5 rounded-full bg-[#e6f18f]" /> In progress
        </span>
      </div>
      <div className="mt-4 flex items-center gap-3">
        <span className="inline-flex size-11 items-center justify-center rounded-full bg-[#db7559] font-display text-sm font-semibold">AO</span>
        <div>
          <p className="font-display text-lg font-semibold leading-tight">Adaeze Okafor</p>
          <p className="text-sm text-white/65">Product Designer · Lagos</p>
        </div>
      </div>
      <div className="mt-5 grid grid-cols-5 gap-1.5">
        {stages.map((stage, index) => (
          <div key={stage} className="flex flex-col gap-1.5">
            <span className="preview-stage h-1.5 rounded-full bg-white/20" style={{ "--stage-delay": `${index * 0.9}s` } as React.CSSProperties} />
            <span className="text-[10px] text-white/60">{stage}</span>
          </div>
        ))}
      </div>
      <div className="mt-5 space-y-2.5 border-t border-white/15 pt-4 text-sm">
        <div className="flex items-center justify-between">
          <span className="inline-flex items-center gap-2 text-white/75"><Sparkles className="size-4 text-[#e6f18f]" /> AI screening</span>
          <span className="font-semibold text-[#e6f18f]">Strong match</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="inline-flex items-center gap-2 text-white/75"><ClipboardCheck className="size-4 text-[#e6f18f]" /> Scorecards</span>
          <span className="inline-flex gap-0.5" aria-label="4 out of 5">
            {[0, 1, 2, 3, 4].map((star) => (
              <Star key={star} className={star < 4 ? "size-3.5 fill-[#e6f18f] text-[#e6f18f]" : "size-3.5 text-white/35"} />
            ))}
          </span>
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  return (
    <main className="home-page min-h-screen bg-(--home-paper) text-(--home-ink)">
      <SiteHeader />

      <section className="home-hero relative isolate flex min-h-svh flex-col justify-end overflow-hidden bg-[#17201d] text-white sm:min-h-215">
        <div aria-hidden="true" className="home-hero-wash absolute inset-0 -z-10" />

        <div className="mx-auto w-full max-w-7xl px-5 pb-7 pt-32 sm:px-8 sm:pb-9 lg:px-12">
          <div className="flex items-end justify-between gap-10">
            <div className="max-w-3xl">
              <p className="hero-in mb-5 inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/10 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-[#e6f18f] backdrop-blur-sm">
                <Sparkles className="size-3.5" /> Hiring, made for growing teams
              </p>
              <h1 className="hero-in font-display text-5xl font-semibold leading-[1.02] text-white sm:text-7xl lg:text-[5.4rem]" style={{ animationDelay: "120ms" }}>
                Hire the right people, <span className="hero-highlight">with confidence.</span>
              </h1>
              <p className="hero-in mt-6 max-w-2xl text-lg leading-8 text-white/85 sm:text-xl" style={{ animationDelay: "240ms" }}>
                HireDesk brings every application, interview, scorecard and decision into one calm workspace, so your team can move quickly and decide together.
              </p>
              <div className="hero-in mt-8 flex flex-col gap-3 sm:flex-row" style={{ animationDelay: "360ms" }}>
                <Link href="/register" className="cta-shine group inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-[#e6f18f] px-6 text-sm font-semibold text-[#17201d] transition hover:-translate-y-0.5 hover:bg-white hover:shadow-[0_12px_30px_-10px_rgba(230,241,143,0.7)]">
                  Create your workspace <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
                </Link>
                <a href="#features" className="inline-flex min-h-12 items-center justify-center rounded-full border border-white/35 px-6 text-sm font-semibold text-white backdrop-blur-sm transition hover:bg-[rgba(255,255,255,0.12)]">
                  See what it does
                </a>
              </div>
            </div>
            <PipelinePreview />
          </div>

          <div className="mt-12 border-t border-white/25 pt-5 sm:mt-16">
            <HeroSlider />
          </div>
        </div>
      </section>

      <div className="overflow-hidden border-b border-(--home-line) bg-[#e6f18f] py-4" aria-label="What HireDesk includes">
        <div className="marquee flex w-max gap-10 text-sm font-semibold uppercase tracking-[0.14em] text-[#17201d]">
          {[0, 1].map((copy) => (
            <div key={copy} className="flex gap-10" aria-hidden={copy === 1}>
              {capabilities.map((item) => (
                <span key={item} className="inline-flex items-center gap-10 whitespace-nowrap">
                  {item} <span className="text-[#a84c37]">✦</span>
                </span>
              ))}
            </div>
          ))}
        </div>
      </div>

      <section id="workflow" className="scroll-mt-20 bg-(--home-paper)">
        <div className="mx-auto grid max-w-7xl gap-12 px-5 py-20 sm:px-8 lg:grid-cols-[0.8fr_1.2fr] lg:gap-24 lg:px-12 lg:py-28">
          <ScrollReveal className="max-w-md self-start lg:sticky lg:top-24">
            <p className="text-xs font-semibold uppercase text-(--home-coral)">A clear line from start to decision</p>
            <h2 className="mt-4 font-display text-4xl font-semibold leading-tight sm:text-5xl">One process. The right people at every step.</h2>
            <p className="mt-5 text-base leading-7 text-(--home-body)">
              Keep the hiring journey connected without blurring who owns each decision.
            </p>
          </ScrollReveal>

          <div className="divide-y divide-(--home-line) border-y border-(--home-line)">
            {workflow.map(({ icon: Icon, number, title, text }, index) => (
              <ScrollReveal key={number} delay={index * 90}>
                <article className="workflow-row group grid gap-5 py-7 sm:grid-cols-[56px_1fr] sm:gap-7 sm:py-9">
                  <div className="flex items-center gap-3 sm:block">
                    <span className="font-display text-sm text-(--home-coral)">{number}</span>
                    <span className="mt-0 inline-flex size-10 items-center justify-center rounded-full bg-(--home-mist) text-(--home-icon) transition duration-300 group-hover:bg-[#17201d] dark:group-hover:bg-[#e6f18f] dark:group-hover:text-(--home-ink) group-hover:text-[#e6f18f] sm:mt-4">
                      <Icon className="size-5" strokeWidth={1.6} />
                    </span>
                  </div>
                  <div>
                    <h3 className="font-display text-2xl font-semibold transition-colors group-hover:text-(--home-coral) sm:text-3xl">{title}</h3>
                    <p className="mt-3 max-w-2xl text-base leading-7 text-(--home-body)">{text}</p>
                  </div>
                </article>
              </ScrollReveal>
            ))}
          </div>
        </div>
      </section>

      <section id="features" className="scroll-mt-20 bg-(--home-mist)">
        <div className="mx-auto max-w-7xl px-5 py-20 sm:px-8 lg:px-12 lg:py-28">
          <ScrollReveal className="max-w-3xl">
            <p className="text-xs font-semibold uppercase text-(--home-coral)">Everything in one workspace</p>
            <h2 className="mt-4 font-display text-4xl font-semibold leading-tight sm:text-5xl">Built for the way your team really hires.</h2>
            <p className="mt-5 max-w-2xl text-base leading-7 text-(--home-body)">
              From the job advert to the offer, each step is a tool your team can use today.
            </p>
          </ScrollReveal>

          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {features.map(({ icon: Icon, title, text, wide }, index) => (
              <ScrollReveal key={title} delay={(index % 3) * 80} className={wide ? "sm:col-span-2" : index === features.length - 1 ? "sm:col-span-2 lg:col-span-1" : undefined}>
                <article
                  className={
                    wide
                      ? "feature-card group h-full rounded-2xl border border-transparent bg-[#17201d] p-7 text-white dark:border-white/10 dark:bg-[#1c2722]"
                      : "feature-card group h-full rounded-2xl border border-(--home-line) bg-(--home-paper) p-6"
                  }
                >
                  <span
                    className={
                      wide
                        ? "inline-flex size-11 items-center justify-center rounded-xl bg-[#e6f18f] text-[#17201d] transition duration-500 group-hover:rotate-6 group-hover:scale-110"
                        : "inline-flex size-11 items-center justify-center rounded-xl bg-[#17201d] text-[#e6f18f] transition duration-500 group-hover:rotate-6 group-hover:scale-110"
                    }
                  >
                    <Icon className="size-5" strokeWidth={1.8} />
                  </span>
                  <h3 className={wide ? "mt-6 font-display text-2xl font-semibold sm:text-3xl" : "mt-5 font-display text-xl font-semibold"}>{title}</h3>
                  <p className={wide ? "mt-3 max-w-lg text-base leading-7 text-white/70" : "mt-2.5 text-sm leading-6 text-(--home-body)"}>{text}</p>
                </article>
              </ScrollReveal>
            ))}
          </div>
        </div>
      </section>

      <section id="teams" className="scroll-mt-20 bg-[#202a25] text-white dark:border-y dark:border-white/5 dark:bg-[#141c18]">
        <div className="mx-auto max-w-7xl px-5 py-20 sm:px-8 lg:px-12 lg:py-28">
          <ScrollReveal className="max-w-3xl">
            <p className="text-xs font-semibold uppercase text-[#e6f18f]">Made for distinct responsibilities</p>
            <h2 className="mt-4 font-display text-4xl font-semibold leading-tight sm:text-5xl">A shared outcome, with clear ownership.</h2>
            <p className="mt-5 max-w-2xl text-base leading-7 text-white/70">
              HireDesk keeps company administration, candidate assessment, and interviewer feedback in their proper lanes.
            </p>
          </ScrollReveal>

          <div className="mt-12 grid gap-4 md:grid-cols-3">
            {roles.map(({ icon: Icon, role, text }, index) => (
              <ScrollReveal key={role} delay={index * 100} className="h-full">
                <article className="role-card group h-full rounded-2xl border border-white/15 p-7 lg:p-8">
                  <Icon className="size-7 text-[#e6f18f] transition-transform duration-500 group-hover:-translate-y-1" strokeWidth={1.6} />
                  <h3 className="mt-6 font-display text-2xl font-semibold">{role}</h3>
                  <p className="mt-3 max-w-sm text-sm leading-6 text-white/70">{text}</p>
                </article>
              </ScrollReveal>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-(--home-paper)">
        <div className="mx-auto grid max-w-7xl gap-10 px-5 py-20 sm:px-8 lg:grid-cols-[0.75fr_1.25fr] lg:gap-20 lg:px-12 lg:py-24">
          <ScrollReveal className="max-w-sm">
            <p className="text-xs font-semibold uppercase text-(--home-coral)">A considered candidate journey</p>
            <h2 className="mt-4 font-display text-4xl font-semibold leading-tight">Every handoff stays in view.</h2>
            <p className="mt-5 text-base leading-7 text-(--home-body)">
              From the first application to a final outcome, the team can follow progress through the stages configured for each role.
            </p>
          </ScrollReveal>

          <ScrollReveal>
            <div className="home-stage-flow" aria-label="Example application stages">
              {stages.map((stage, index) => (
                <div className="home-stage-item" key={stage} style={{ "--stage-index": index } as React.CSSProperties}>
                  <span className={index === stages.length - 1 ? "home-stage-dot home-stage-dot-final" : "home-stage-dot"} />
                  <span>{stage}</span>
                </div>
              ))}
            </div>
            <div className="mt-8 flex items-start gap-3 border-t border-(--home-line) pt-5 text-sm leading-6 text-(--home-body)">
              <Check className="mt-1 size-4 shrink-0 text-(--home-coral)" />
              Interview scorecards support ratings and recommendations; the hiring manager makes the final call.
            </div>
          </ScrollReveal>
        </div>
      </section>

      <section className="px-5 pb-20 sm:px-8 lg:px-12">
        <ScrollReveal className="mx-auto max-w-7xl">
          <div className="cta-band relative overflow-hidden rounded-3xl border border-transparent bg-[#17201d] dark:border-white/10 dark:bg-[#18221d] px-7 py-14 text-white sm:px-12 lg:px-16 lg:py-20">
            <div className="relative flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
              <div className="max-w-2xl">
                <p className="text-xs font-semibold uppercase text-[#e6f18f]">Make room for better decisions</p>
                <h2 className="mt-4 font-display text-4xl font-semibold leading-tight sm:text-5xl">Bring your next hiring process into focus.</h2>
                <p className="mt-4 text-base leading-7 text-white/70">Set up your company workspace, invite your team, and publish your first role today.</p>
              </div>
              <div className="flex shrink-0 flex-col gap-3 sm:flex-row">
                <Link href="/register" className="cta-shine group inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-[#e6f18f] px-6 text-sm font-semibold text-[#17201d] transition hover:-translate-y-0.5 hover:bg-white">
                  Create your workspace <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
                </Link>
                <Link href="/login" className="inline-flex min-h-12 items-center justify-center rounded-full border border-white/35 px-6 text-sm font-semibold text-white transition hover:bg-white/10">
                  Sign in
                </Link>
              </div>
            </div>
          </div>
        </ScrollReveal>
      </section>

      <footer className="border-t border-(--home-line) bg-(--home-paper)">
        <div className="mx-auto flex max-w-7xl flex-col gap-5 px-5 py-10 text-sm text-(--home-body) sm:flex-row sm:items-center sm:justify-between sm:px-8 lg:px-12">
          <Link href="/" className="font-display text-xl font-semibold text-(--home-ink)">HireDesk<span className="text-(--home-coral)">.</span></Link>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-7">
            <a className="inline-flex items-center gap-2 hover:text-(--home-ink)" href="mailto:okechukwuorjionuchie@gmail.com">
              <Mail className="size-4" /> okechukwuorjionuchie@gmail.com
            </a>
            <a className="inline-flex items-center gap-2 hover:text-(--home-ink)" href="tel:+2349031707946">
              <Phone className="size-4" /> +2349031707946
            </a>
          </div>
        </div>
      </footer>
    </main>
  );
}
