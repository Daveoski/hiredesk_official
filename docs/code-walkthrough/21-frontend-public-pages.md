# Part 21: Public pages: apply, landing (copyable)

## `src/app/apply/[jobId]/page.tsx`: the candidate's application form

```tsx
"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, FileText, X } from "lucide-react";
import { useParams } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { CvDropzone } from "@/components/features/cv-dropzone";
import { Logo } from "@/components/layout/logo";
import { ErrorState } from "@/components/shared/empty-state";
import { Field } from "@/components/shared/field";
import { StageThread } from "@/components/shared/stage-thread";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Textarea } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import { applySchema, checkSupportingDocument, MAX_DOCUMENTS } from "@/lib/schemas";
import { uploadDirect } from "@/lib/uploads";
import type { PublicJob } from "@/lib/types";

type ApplyValues = z.infer<typeof applySchema>;

// The public application page. Candidates do not need an account.
export default function ApplyPage() {
  const { jobId } = useParams<{ jobId: string }>();
  // Files live OUTSIDE React Hook Form (it handles text inputs; files are kept in state).
  const [cv, setCv] = useState<File | null>(null);
  const [cvError, setCvError] = useState("");
  const [documents, setDocuments] = useState<File[]>([]);
  const [documentsError, setDocumentsError] = useState("");
  const [serverError, setServerError] = useState("");
  const [done, setDone] = useState(false);                     // true = show "Application sent"
  // Where the submission is: uploading files, sending the form, or idle (drives the button text).
  const [phase, setPhase] = useState<"idle" | "uploading" | "sending">("idle");

  // The job advert. "false" as the 2nd argument of api.get = no token (public endpoint).
  // useQuery is used directly here (no shared hook needed).
  const job = useQuery({
    queryKey: ["public-job", jobId],
    queryFn: () => api.get<PublicJob>(`/public/jobs/${jobId}`, false),
  });

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ApplyValues>({ resolver: zodResolver(applySchema) });

  async function onSubmit(values: ApplyValues) {
    setServerError("");
    // The CV is required but lives outside the form, so check it here.
    if (!cv) {
      setCvError("Attach your CV");
      return;
    }
    setCvError("");
    if (documents.length > MAX_DOCUMENTS) {
      setDocumentsError(`Upload no more than ${MAX_DOCUMENTS} supporting documents`);
      return;
    }
    try {
      // Files go straight to storage first; the application then only carries their ids.
      setPhase("uploading");
      // Promise.all = run all uploads AT THE SAME TIME and wait for all of them.
      // [cvId, ...documentIds] = the first result is the CV's id; the rest are the documents'.
      const [cvId, ...documentIds] = await Promise.all([
        uploadDirect(jobId, "cv", cv),
        ...documents.map((document) => uploadDirect(jobId, "document", document)),
      ]);

      setPhase("sending");
      // A multipart form with the text fields and the uploaded files' ids.
      const form = new FormData();
      form.append("full_name", values.full_name);
      form.append("email", values.email);
      form.append("phone", values.phone);
      form.append("candidate_qualifications", values.candidate_qualifications);
      if (values.expected_salary) form.append("expected_salary", values.expected_salary);
      if (values.cover_letter) form.append("cover_letter", values.cover_letter);
      form.append("cv_public_id", cvId);
      // Each document: its id + its original name (appended in matching order).
      documentIds.forEach((id, index) => {
        form.append("document_public_ids", id);
        form.append("document_names", documents[index].name);
      });
      await api.postForm(`/public/jobs/${jobId}/applications`, form);
      setDone(true);
    } catch (err) {
      // e.g. "You have already applied to this job" (409), or an upload error.
      setServerError(err instanceof Error ? err.message : "Could not send your application");
    } finally {
      setPhase("idle");
    }
  }

  return (
    <div className="min-h-screen">
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4 sm:px-8">
          {/* href="#" = the logo doesn't take candidates into the app. */}
          <Logo href="#" />
          {job.data && <span className="text-sm font-semibold text-muted-foreground">{job.data.company_name}</span>}
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-10 sm:px-8">
        {job.isLoading && <Skeleton className="h-64" />}
        {/* A closed, draft or unknown job gets 404 from the API, shown as this message. */}
        {job.isError && <ErrorState message="This job is not accepting applications." />}

        {job.data && (
          // Two columns on large screens: the advert (wider) and the form.
          <div className="grid gap-8 lg:grid-cols-[1.2fr_1fr]">
            <section>
              <p className="text-sm font-semibold text-primary">{job.data.company_name} is hiring</p>
              <h1 className="mt-1 text-4xl font-bold leading-tight sm:text-5xl">{job.data.title}</h1>
              {/* Shows candidates the process ahead of them. */}
              <div className="mt-8 rounded-lg border bg-card p-6">
                <h2 className="mb-4 text-sm font-semibold text-muted-foreground">What happens after you apply</h2>
                <StageThread stage="applied" />
              </div>
              <h2 className="mb-2 mt-8 text-xl font-semibold">About the role</h2>
              <p className="max-w-prose whitespace-pre-line leading-relaxed text-foreground/80">{job.data.description}</p>
              {job.data.qualification_requirements && (
                <>
                  <h2 className="mb-2 mt-8 text-xl font-semibold">What you&apos;ll bring</h2>
                  <p className="max-w-prose whitespace-pre-line leading-relaxed text-foreground/80">{job.data.qualification_requirements}</p>
                </>
              )}
              {(job.data.salary_min !== null || job.data.salary_max !== null) && (
                <p className="mt-5 text-sm font-semibold text-muted-foreground">
                  Salary range: {job.data.salary_min?.toLocaleString() ?? "Not stated"} – {job.data.salary_max?.toLocaleString() ?? "Not stated"}
                </p>
              )}
            </section>

            <section>
              {/* lg:sticky lg:top-6 = on large screens the form stays in view while the advert scrolls. */}
              <Card className="lg:sticky lg:top-6">
                {done ? (
                  // The success message replaces the form.
                  <CardContent className="flex flex-col items-center gap-3 px-6 py-12 text-center">
                    <CheckCircle2 className="size-12 text-stage-hired" />
                    <h2 className="text-2xl font-bold">Application sent</h2>
                    <p className="text-muted-foreground">
                      Thanks for applying to {job.data.company_name}. We emailed you a confirmation.
                    </p>
                  </CardContent>
                ) : (
                  <>
                    <CardHeader>
                      <CardTitle className="text-2xl">Apply for this role</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
                        <Field label="Full name" htmlFor="full_name" error={errors.full_name?.message}>
                          <Input id="full_name" autoComplete="name" {...register("full_name")} />
                        </Field>
                        <Field label="Email" htmlFor="email" error={errors.email?.message}>
                          <Input id="email" type="email" autoComplete="email" {...register("email")} />
                        </Field>
                        <Field label="Phone" htmlFor="phone" error={errors.phone?.message}>
                          <Input id="phone" type="tel" autoComplete="tel" {...register("phone")} />
                        </Field>
                        <Field label="Relevant qualifications and experience" htmlFor="candidate_qualifications" error={errors.candidate_qualifications?.message}>
                          <Textarea id="candidate_qualifications" rows={4} {...register("candidate_qualifications")} />
                        </Field>
                        <Field label="Expected salary (optional)" htmlFor="expected_salary" error={errors.expected_salary?.message}>
                          <Input id="expected_salary" type="number" min="0" {...register("expected_salary")} />
                        </Field>
                        {/* The drag-and-drop CV picker (below). */}
                        <Field label="CV" htmlFor="cv">
                          <CvDropzone file={cv} onChange={setCv} error={cvError} />
                        </Field>
                        <Field label="Supporting documents (up to 6)" htmlFor="supporting_documents" error={documentsError}>
                          {/* multiple = choose several files at once. accept = filter the file picker. */}
                          <Input
                            id="supporting_documents"
                            type="file"
                            multiple
                            accept=".pdf,.doc,.docx,.png,.jpg,.jpeg"
                            onChange={(event) => {
                              // event.target.files is a FileList; Array.from makes a normal array.
                              const next = Array.from(event.target.files ?? []);
                              if (next.length > MAX_DOCUMENTS) {
                                setDocumentsError(`Upload no more than ${MAX_DOCUMENTS} supporting documents`);
                                setDocuments([]);
                                return;
                              }
                              // Check each file; .find(Boolean) = the first error message, if any.
                              const invalid = next.map(checkSupportingDocument).find(Boolean);
                              setDocumentsError(invalid ?? "");
                              setDocuments(invalid ? [] : next);
                            }}
                          />
                          <p className="text-xs text-muted-foreground">PDF, DOC, DOCX, PNG or JPG. Up to 10 MB each.</p>
                          {/* The chosen documents, each with a remove button. */}
                          {documents.length > 0 && (
                            <ul className="mt-2 flex flex-col gap-2">
                              {documents.map((document, index) => (
                                <li key={`${document.name}-${document.lastModified}`} className="flex items-center gap-2 text-sm">
                                  <FileText className="size-4 text-muted-foreground" />
                                  <span className="min-w-0 flex-1 truncate">{document.name}</span>
                                  {/* Remove = keep every document except the one at this index. */}
                                  <Button type="button" variant="ghost" size="icon" aria-label={`Remove ${document.name}`} onClick={() => setDocuments((current) => current.filter((_, itemIndex) => itemIndex !== index))}>
                                    <X />
                                  </Button>
                                </li>
                              ))}
                            </ul>
                          )}
                        </Field>
                        <Field label="Cover letter (optional)" htmlFor="cover_letter" error={errors.cover_letter?.message}>
                          <Textarea id="cover_letter" {...register("cover_letter")} />
                        </Field>
                        {serverError && (
                          <p role="alert" className="text-sm font-medium text-destructive">
                            {serverError}
                          </p>
                        )}
                        <Button type="submit" size="lg" disabled={isSubmitting}>
                          {phase === "uploading"
                            ? `Uploading ${documents.length ? "files" : "your CV"}...`
                            : isSubmitting
                              ? "Sending..."
                              : "Send application"}
                        </Button>
                      </form>
                    </CardContent>
                  </>
                )}
              </Card>
            </section>
          </div>
        )}
      </main>
    </div>
  );
}
```

## `src/components/features/cv-dropzone.tsx`

```tsx
"use client";

import { FileText, Upload, X } from "lucide-react";
import { useRef, useState } from "react";
import { checkCv } from "@/lib/schemas";
import { cn } from "@/lib/utils";

// A drag-and-drop area (or click to browse) for the CV.
// The PARENT holds the file (file/onChange); this component only shows and checks it.
export function CvDropzone({
  file,
  onChange,
  error,
}: {
  file: File | null;
  onChange: (file: File | null) => void;
  error?: string;
}) {
  // A ref to the hidden <input type="file">, so our button can "click" it.
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);       // highlight while a file is dragged over
  const [localError, setLocalError] = useState("");

  // Check a chosen or dropped file; pass it up only if it's valid.
  function choose(next: File | undefined) {
    if (!next) return;
    const problem = checkCv(next);                        // wrong type or too big?
    setLocalError(problem ?? "");
    onChange(problem ? null : next);
  }

  // Our own error takes priority over the parent's ("Attach your CV").
  const message = localError || error;

  return (
    <div className="flex flex-col gap-1.5">
      {/* The real file input, visually hidden (sr-only) but still usable by screen readers. */}
      <input
        ref={inputRef}
        id="cv"
        type="file"
        accept=".pdf,.doc,.docx"
        className="sr-only"
        // files?.[0] = the first chosen file, if any.
        onChange={(event) => choose(event.target.files?.[0])}
      />
      {file ? (
        // A file is chosen: show its name and size, with a remove button.
        <div className="flex items-center gap-3 rounded-md border bg-card p-3">
          <FileText className="size-5 text-primary" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{file.name}</p>
            {/* bytes / 1024 / 1024 = megabytes, to 2 decimals. */}
            <p className="text-xs text-muted-foreground">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
          </div>
          <button type="button" aria-label="Remove CV" className="rounded p-1 hover:bg-muted" onClick={() => onChange(null)}>
            <X className="size-4" />
          </button>
        </div>
      ) : (
        // No file yet: the drop area. Clicking it opens the hidden file input.
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          // preventDefault on dragover is REQUIRED for the browser to allow dropping here.
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          // preventDefault stops the browser from opening the file itself.
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            choose(event.dataTransfer.files[0]);
          }}
          className={cn(
            "flex flex-col items-center gap-1 rounded-md border-2 border-dashed px-4 py-8 text-center transition-colors hover:border-primary hover:bg-accent/50",
            dragging && "border-primary bg-accent/50",
          )}
        >
          <Upload className="size-5 text-primary" />
          <span className="text-sm font-semibold">Drop your CV here or browse</span>
          <span className="text-xs text-muted-foreground">PDF, DOC or DOCX, up to 5 MB</span>
        </button>
      )}
      {message && (
        <p role="alert" className="text-xs font-medium text-destructive">
          {message}
        </p>
      )}
    </div>
  );
}
```

## `src/app/page.tsx`: the landing page (structure)

```tsx
import Link from "next/link";
import { ArrowRight, ArrowUpRight, BriefcaseBusiness, CalendarDays, Check, Mail, Phone, ShieldCheck, UserRound } from "lucide-react";
import { ScrollReveal } from "@/components/shared/scroll-reveal";

// No "use client": this page has no state, so Next.js renders it on the SERVER as plain HTML
// (fast to load, good for search engines). ScrollReveal inside is a client component, which is allowed.

// The three feature rows, as DATA. The page maps over them instead of repeating JSX 3 times.
const features = [
  { icon: BriefcaseBusiness, number: "01", title: "Applications, with context",
    text: "Publish roles, receive applications and CVs, then review each candidate's qualifications beside the requirements that matter." },
  { icon: CalendarDays, number: "02", title: "Interviews, thoughtfully assigned",
    text: "Move candidates through your hiring stages, assign interviewers, schedule virtual or in-person meetings, and collect scorecards." },
  { icon: ShieldCheck, number: "03", title: "Decisions, clearly recorded",
    text: "Hiring managers make the final assessment and decision. Company admins receive outcome updates, while access stays role-based." },
];

// The three role cards, also as data.
const roles = [
  { icon: ShieldCheck, role: "Company admin", text: "Set up the company workspace, invite teammates, and receive hiring outcome updates." },
  { icon: BriefcaseBusiness, role: "Hiring manager", text: "Manage roles and applications, assess candidates, and make the final decision." },
  { icon: UserRound, role: "Interviewer", text: "See assigned interviews, meet candidates, and submit an independent scorecard." },
];

export default function Home() {
  return (
    // home-page sets this page's own colours (green/coral/lime) in globals.css.
    // bg-[#f7f8f5] = an exact colour written inline in Tailwind ("arbitrary value").
    <main className="home-page min-h-screen bg-[#f7f8f5] text-[#17201d]">
      {/* 1) HERO: full-height photo with a dark gradient over it. isolate + -z-20/-z-10 layer
             the photo and the wash BEHIND the text. */}
      <section className="home-hero relative isolate flex min-h-[760px] flex-col justify-between overflow-hidden bg-[#17201d] text-white sm:min-h-[820px]">
        {/* aria-hidden: decorative image, ignored by screen readers. home-hero-photo = a slow zoom-out. */}
        <div aria-hidden="true" className="home-hero-photo absolute inset-0 -z-20 bg-cover bg-center"
          style={{ backgroundImage: "url('https://images.unsplash.com/photo-1521737711867-e3b97375f902?auto=format&fit=crop&w=2200&q=85')" }} />
        <div aria-hidden="true" className="home-hero-wash absolute inset-0 -z-10" />

        {/* Top navigation. "#workflow" links scroll to a section on the same page;
            <Link> is used for other pages. */}
        <header>
          <nav className="mx-auto flex max-w-7xl items-center justify-between px-5 py-5 sm:px-8 lg:px-12" aria-label="Main navigation">
            <Link href="/" className="font-display text-2xl font-semibold text-white sm:text-3xl">
              HirePlume<span className="text-[#db7559]">.</span>
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

        {/* The big headline, intro and two buttons, fading in with ScrollReveal. */}
        <div className="mx-auto w-full max-w-7xl px-5 pb-7 pt-16 sm:px-8 sm:pb-9 lg:px-12">
          <ScrollReveal className="max-w-4xl">
            <p className="mb-5 text-xs font-semibold uppercase text-[#e6f18f]">A considered way to build your team</p>
            <h1 className="font-display text-6xl font-semibold leading-[0.98] text-white sm:text-7xl lg:text-8xl">HirePlume</h1>
            <p className="mt-5 max-w-2xl text-lg leading-8 text-white/85 sm:text-xl">
              Every application, conversation, and assessment in its right place. A thoughtful hiring workspace for teams that want to make better decisions together.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              {/* hover:-translate-y-0.5 = lifts slightly on hover. */}
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

      {/* 2) WORKFLOW. id="workflow" is the target of the "#workflow" links. scroll-mt-6 leaves a gap
             above it when scrolled to. */}
      <section id="workflow" className="scroll-mt-6 bg-[#f7f8f5]">
        {/* Two columns on large screens: 0.8 and 1.2 parts wide. */}
        <div className="mx-auto grid max-w-7xl gap-12 px-5 py-20 sm:px-8 lg:grid-cols-[0.8fr_1.2fr] lg:gap-24 lg:px-12 lg:py-28">
          {/* The left heading stays on screen while the list scrolls (lg:sticky lg:top-16). */}
          <ScrollReveal className="max-w-md self-start lg:sticky lg:top-16">
            <p className="text-xs font-semibold uppercase text-[#a84c37]">A clear line from start to decision</p>
            <h2 className="mt-4 font-display text-4xl font-semibold leading-tight sm:text-5xl">One process. The right people at every step.</h2>
            <p className="mt-5 text-base leading-7 text-[#5d6761]">
              Keep the hiring journey connected without blurring who owns each decision.
            </p>
          </ScrollReveal>

          {/* The three features, from the "features" array. Each fades in 90ms after the previous one. */}
          <div className="divide-y divide-[#d7ddd7] border-y border-[#d7ddd7]">
            {features.map(({ icon: Icon, number, title, text }, index) => (
              <ScrollReveal key={number} delay={index * 90}>
                <article className="grid gap-5 py-7 sm:grid-cols-[56px_1fr] sm:gap-7 sm:py-9">
                  <div className="flex items-center gap-3 sm:block">
                    <span className="font-display text-sm text-[#a84c37]">{number}</span>
                    {/* strokeWidth = thinner icon lines. */}
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

      {/* 3) TEAMS: a dark section with the three role cards. */}
      <section id="teams" className="bg-[#202a25] text-white">
        <div className="mx-auto max-w-7xl px-5 py-20 sm:px-8 lg:px-12 lg:py-28">
          <ScrollReveal className="max-w-3xl">
            <p className="text-xs font-semibold uppercase text-[#e6f18f]">Made for distinct responsibilities</p>
            <h2 className="mt-4 font-display text-4xl font-semibold leading-tight sm:text-5xl">A shared outcome, with clear ownership.</h2>
            <p className="mt-5 max-w-2xl text-base leading-7 text-white/70">
              HirePlume keeps company administration, candidate assessment, and interviewer feedback in their proper lanes.
            </p>
          </ScrollReveal>

          {/* Three columns on medium screens. md:first:pl-0 / md:last:border-r-0 = special styles for the
              first/last card (no left padding on the first, no right border on the last). */}
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

      {/* 4) STAGES: an example pipeline drawn with plain CSS classes from globals.css. */}
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
            {/* .home-stage-flow = a 5-column grid; each item draws a dot and a connecting line (::after). */}
            <div className="home-stage-flow" aria-label="Example application stages">
              {["Applied", "Screen", "Interview", "Offer", "Hired"].map((stage, index) => (
                <div className="home-stage-item" key={stage}>
                  {/* The last dot (index 4, "Hired") is filled coral. */}
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

      {/* 5) FOOTER: a last call to action, the logo, and contact links. */}
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
            <Link href="/" className="font-display text-xl font-semibold text-[#17201d]">HirePlume<span className="text-[#a84c37]">.</span></Link>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-7">
              {/* mailto: opens the visitor's email app; tel: opens the phone dialer. */}
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
```

## `src/components/shared/scroll-reveal.tsx`

```tsx
"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

// Fades its children in the first time they scroll into view.
export function ScrollReveal({
  children,
  className,
  delay = 0,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
}) {
  const elementRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = elementRef.current;
    if (!element) return;

    // "is-ready" hides it (CSS: opacity 0, moved down, slightly blurred). It's added from JavaScript,
    // so if JavaScript never runs, the content is still visible (progressive enhancement).
    element.classList.add("is-ready");
    // IntersectionObserver = the browser tells us when an element enters the visible screen area.
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          element.classList.add("is-visible");     // CSS transitions it into place
          observer.unobserve(element);             // only once
        }
      },
      // threshold 0.16 = when 16% is visible. rootMargin: trigger 40px before the bottom edge.
      { threshold: 0.16, rootMargin: "0px 0px -40px 0px" },
    );

    observer.observe(element);
    // Cleanup: stop observing if the component disappears.
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={elementRef}
      className={cn("scroll-reveal", className)}
      // Each item can start later (--reveal-delay is read by the CSS transition).
      style={{ "--reveal-delay": `${delay}ms` } as React.CSSProperties}
    >
      {children}
    </div>
  );
}
```
