# Part 19: Candidates (copyable)

- `/candidates`: search, filter and sort.
- `/candidates/[applicationId]`: everything about one candidate (profile, assessment, interviews, scorecards, history).
- `StageMenu`: move, hire or reject.
- `StageThread` / `StageBadge`: the stage visuals.
- `ScheduleDialog` (assign an interviewer) and `ScorecardDialog` (fill in a scorecard).

## `src/app/(app)/candidates/page.tsx`

```tsx
"use client";

import { Users } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { EmptyState, ErrorState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { StageBadge } from "@/components/shared/stage-badge";
import { Avatar } from "@/components/ui/avatar";
import { Card } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useApplications } from "@/lib/queries";
import { PIPELINE, STAGE_LABEL } from "@/lib/constants";
import { formatDate } from "@/lib/utils";
import { isManager, useAuthStore } from "@/stores/auth-store";

export default function CandidatesPage() {
  const user = useAuthStore((state) => state.user);
  // Three pieces of UI state: the search text, the stage filter, the sort column.
  const [search, setSearch] = useState("");
  const [stage, setStage] = useState("");
  const [sortBy, setSortBy] = useState("created_at");
  // Salary sorts lowest first; everything else highest/newest first.
  const sortOrder = sortBy === "expected_salary" ? "asc" : "desc";
  // SORTING happens on the server (a new request when sortBy changes)...
  const applications = useApplications(undefined, sortBy, sortOrder);

  // ...SEARCH and STAGE filtering happen in the browser on the loaded list (instant, no request).
  const rows = (applications.data ?? []).filter(
    (item) =>
      (!stage || item.stage === stage) &&
      // Search name, email and job title together, ignoring upper/lower case.
      (!search || `${item.full_name} ${item.email} ${item.job_title}`.toLowerCase().includes(search.toLowerCase())),
  );

  return (
    <>
      <PageHeader title="Candidates" description="Everyone you can see across your jobs." />
      <div className="mb-4 flex flex-wrap gap-3">
        {/* A CONTROLLED input: React holds its value (search) and updates it on every keystroke. */}
        <Input
          aria-label="Search candidates"
          placeholder="Search by name, email or job"
          className="max-w-xs"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <Select aria-label="Filter by stage" className="w-44" value={stage} onChange={(event) => setStage(event.target.value)}>
          <option value="">All stages</option>
          {PIPELINE.map((item) => (
            <option key={item} value={item}>
              {STAGE_LABEL[item]}
            </option>
          ))}
        </Select>
        {/* Sorting only for hiring managers (interviewers see a short, assigned list). */}
        {isManager(user) && (
          <Select aria-label="Sort candidates" className="w-56" value={sortBy} onChange={(event) => setSortBy(event.target.value)}>
            <option value="created_at">Newest applications</option>
            <option value="match_score">Qualification match</option>
            <option value="expected_salary">Expected salary</option>
            <option value="interviewer_recommendation">Interviewer decision</option>
          </Select>
        )}
      </div>

      {applications.isError && <ErrorState message={applications.error.message} />}
      {applications.isLoading && <Skeleton className="h-48" />}
      {applications.data && rows.length === 0 && (
        <EmptyState icon={Users} title="No candidates found" description="Try a different search or stage." />
      )}
      {rows.length > 0 && (
        <Card className="overflow-hidden">
          <ul className="divide-y">
            {rows.map((item) => (
              <li key={item.id}>
                <Link href={`/candidates/${item.id}`} className="flex items-center gap-3 px-5 py-3.5 hover:bg-muted/50">
                  <Avatar name={item.full_name} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{item.full_name}</p>
                    {/* Extra details only when present. replaceAll("_", " ") = "not_recommend" -> "not recommend". */}
                    <p className="truncate text-sm text-muted-foreground">
                      {item.job_title}
                      {item.match_score !== null && ` · ${item.match_score}% match`}
                      {item.expected_salary !== null && ` · ${item.expected_salary.toLocaleString()}`}
                      {item.interviewer_recommendation && ` · ${item.interviewer_recommendation.replaceAll("_", " ")}`}
                    </p>
                  </div>
                  {/* The date is hidden on phones (hidden sm:block). */}
                  <span className="hidden text-sm text-muted-foreground sm:block">{formatDate(item.created_at)}</span>
                  <StageBadge stage={item.stage} />
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}
```

## `src/app/(app)/candidates/[applicationId]/page.tsx`

```tsx
"use client";

import { CalendarPlus, FileText, Mail, Phone } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ScheduleDialog } from "@/components/features/schedule-dialog";
import { ScorecardDialog } from "@/components/features/scorecard-dialog";
import { EmptyState, ErrorState } from "@/components/shared/empty-state";
import { StageMenu } from "@/components/shared/stage-menu";
import { StageThread } from "@/components/shared/stage-thread";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field } from "@/components/shared/field";
import { Input, Textarea } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useApplication,
  useAssessApplication,
  useCancelInterview,
  useHistory,
  useInterviews,
  useScorecards,
  useUsers,
} from "@/lib/queries";
import { STAGE_LABEL } from "@/lib/constants";
import { formatDate, formatDateTime } from "@/lib/utils";
import { isManager, useAuthStore } from "@/stores/auth-store";

export default function CandidatePage() {
  const { applicationId } = useParams<{ applicationId: string }>();
  const user = useAuthStore((state) => state.user);
  const manager = isManager(user);           // true for hiring managers

  // Everything this page needs, fetched in parallel.
  const application = useApplication(applicationId);
  const interviews = useInterviews(applicationId);
  const scorecards = useScorecards(applicationId);
  const history = useHistory(applicationId, manager);    // managers only
  const users = useUsers(manager);                        // to show interviewer names
  const cancel = useCancelInterview();
  const assess = useAssessApplication();

  // Which dialog is open: assign (true/false), score (an interview id or null), cancel (an interview id or null).
  const [scheduling, setScheduling] = useState(false);
  const [scoring, setScoring] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState<string | null>(null);
  // The assessment form's values (kept as text while typing).
  const [matchScore, setMatchScore] = useState("");
  const [managerNotes, setManagerNotes] = useState("");

  // When the candidate loads (or reloads after saving), copy their saved assessment into the form.
  useEffect(() => {
    if (!application.data) return;
    setMatchScore(application.data.match_score?.toString() ?? "");
    setManagerNotes(application.data.manager_notes ?? "");
  }, [application.data]);

  if (application.isError) return <ErrorState message={application.error.message} />;
  if (!application.data) return <Skeleton className="h-96" />;

  const candidate = application.data;
  // A user's name from the team list, or "You", or a fallback.
  const nameOf = (id: string) => (id === user?.id ? "You" : (users.data?.find((item) => item.id === id)?.full_name ?? "Interviewer"));
  const interviewOf = (id: string) => interviews.data?.find((item) => item.id === id);
  // This interviewer's own scorecards for the candidate.
  const mine = scorecards.data?.scorecards.filter((card) => card.interviewer_id === user?.id) ?? [];
  // An interviewer with a pending scorecard sees the privacy note (others' scorecards are hidden).
  const waitingOnMe = !manager && mine.some((card) => card.status === "pending");

  return (
    <>
      <Link href="/candidates" className="text-sm font-semibold text-muted-foreground hover:text-foreground">
        All candidates
      </Link>

      {/* HEADER: avatar, name, job, the manager's buttons, and the stage thread. */}
      <header className="mb-8 mt-3 rounded-lg border bg-card p-6">
        <div className="flex flex-wrap items-center gap-4">
          <Avatar name={candidate.full_name} className="size-14 text-base" />
          <div className="min-w-0 flex-1">
            <h1 className="text-3xl font-bold">{candidate.full_name}</h1>
            <p className="text-muted-foreground">Applied for {candidate.job_title} on {formatDate(candidate.created_at)}</p>
          </div>
          {manager && (
            <div className="flex gap-2">
              {/* No new interviews once the process is finished. */}
              <Button variant="soft" size="sm" onClick={() => setScheduling(true)} disabled={candidate.stage === "hired" || candidate.stage === "rejected"}>
                <CalendarPlus /> Assign interviewer
              </Button>
              <StageMenu application={candidate} />
            </div>
          )}
        </div>
        <StageThread stage={candidate.stage} className="mt-8 max-w-2xl" />
      </header>

      {/* Two columns on large screens: left (profile, requirements, assessment, activity), right (interviews, scorecards). */}
      <div className="grid gap-6 lg:grid-cols-[1fr_1.4fr]">
        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Applicant profile</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3 text-sm">
              {/* mailto: and tel: links open the email app / phone dialer. */}
              <a href={`mailto:${candidate.email}`} className="flex items-center gap-2 hover:text-primary">
                <Mail className="size-4 text-muted-foreground" /> {candidate.email}
              </a>
              <a href={`tel:${candidate.phone}`} className="flex items-center gap-2 hover:text-primary">
                <Phone className="size-4 text-muted-foreground" /> {candidate.phone}
              </a>
              {/* The CV on Cloudinary, in a new tab. */}
              <a href={candidate.cv_url} target="_blank" rel="noreferrer" className="flex items-center gap-2 font-semibold text-primary hover:underline">
                <FileText className="size-4" /> Open CV
              </a>
              {candidate.expected_salary !== null && (
                <p className="text-muted-foreground">Expected salary: {candidate.expected_salary.toLocaleString()}</p>
              )}
              {candidate.candidate_qualifications && (
                <div>
                  <p className="font-semibold">Qualifications and experience</p>
                  <p className="mt-1 whitespace-pre-line leading-relaxed text-muted-foreground">{candidate.candidate_qualifications}</p>
                </div>
              )}
              {candidate.supporting_documents.length > 0 && (
                <div className="border-t pt-3">
                  <p className="mb-2 font-semibold">Supporting documents</p>
                  <ul className="flex flex-col gap-2">
                    {candidate.supporting_documents.map((document) => (
                      <li key={document.url}>
                        {/* The document name is shown as TEXT: React escapes it, so it can't inject HTML. */}
                        <a href={document.url} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-primary hover:underline">
                          <FileText className="size-4" /> {document.name}
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {candidate.cover_letter && (
                <p className="mt-2 whitespace-pre-line rounded-md bg-muted p-3 leading-relaxed">{candidate.cover_letter}</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Role requirements</CardTitle></CardHeader>
            <CardContent className="flex flex-col gap-3 text-sm">
              <p className="whitespace-pre-line leading-relaxed text-muted-foreground">
                {candidate.job_qualification_requirements || "No specific qualifications listed."}
              </p>
              {(candidate.job_salary_min !== null || candidate.job_salary_max !== null) && (
                <p className="border-t pt-3 font-semibold">
                  Salary range: {candidate.job_salary_min?.toLocaleString() ?? "Not stated"} – {candidate.job_salary_max?.toLocaleString() ?? "Not stated"}
                </p>
              )}
            </CardContent>
          </Card>

          {/* The hiring manager's assessment form (controlled inputs, not React Hook Form). */}
          {manager && (
            <Card>
              <CardHeader><CardTitle>Qualification assessment</CardTitle></CardHeader>
              <CardContent className="flex flex-col gap-4">
                <p className="text-sm text-muted-foreground">Compare the applicant&apos;s details with the role requirements and record your assessment.</p>
                <Field label="Qualification match (0–100)" htmlFor="match_score">
                  <Input id="match_score" type="number" min={0} max={100} value={matchScore} onChange={(event) => setMatchScore(event.target.value)} />
                </Field>
                <Field label="Hiring manager notes" htmlFor="manager_notes">
                  <Textarea id="manager_notes" rows={4} value={managerNotes} onChange={(event) => setManagerNotes(event.target.value)} />
                </Field>
                <div>
                  <Button
                    // Disabled while saving, or when the score is outside 0-100.
                    disabled={assess.isPending || (matchScore !== "" && (Number(matchScore) < 0 || Number(matchScore) > 100))}
                    onClick={() => assess.mutate(
                      // Empty score = null (no score).
                      { id: candidate.id, match_score: matchScore === "" ? null : Number(matchScore), manager_notes: managerNotes },
                      { onSuccess: () => toast.success("Assessment saved"), onError: (error) => toast.error(error.message) },
                    )}
                  >
                    {assess.isPending ? "Saving..." : "Save assessment"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* The stage history as a simple vertical timeline. */}
          {manager && (
            <Card>
              <CardHeader>
                <CardTitle>Activity</CardTitle>
              </CardHeader>
              <CardContent>
                <ol className="flex flex-col gap-4 border-l pl-5">
                  {history.data?.map((item) => (
                    <li key={item.id} className="relative text-sm">
                      {/* A dot positioned on the left border line. */}
                      <span className="absolute -left-6.5 top-1.5 size-2.5 rounded-full bg-primary" />
                      <p className="font-semibold">
                        {item.from_stage ? `${STAGE_LABEL[item.from_stage]} to ${STAGE_LABEL[item.to_stage]}` : `Applied`}
                      </p>
                      <p className="text-muted-foreground">
                        {formatDateTime(item.changed_at)}
                        {item.changed_by_id && ` · ${nameOf(item.changed_by_id)}`}
                      </p>
                    </li>
                  ))}
                </ol>
              </CardContent>
            </Card>
          )}
        </div>

        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Interviews</CardTitle>
            </CardHeader>
            <CardContent>
              {interviews.data?.length === 0 ? (
                <EmptyState icon={CalendarPlus} title="No interviews yet" description={manager ? "Schedule one to get scorecards started." : undefined} />
              ) : (
                <ul className="divide-y">
                  {interviews.data?.map((item) => {
                    // This interview's scorecard, and whether it's the current user's interview.
                    const card = scorecards.data?.scorecards.find((entry) => entry.interview_id === item.id);
                    const isMine = item.interviewer_id === user?.id;
                    return (
                      <li key={item.id} className="flex flex-wrap items-center gap-3 py-3">
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold">{item.starts_at ? formatDateTime(item.starts_at) : "Awaiting interviewer schedule"}</p>
                          <p className="text-sm text-muted-foreground">
                            {item.duration_minutes ? `${item.duration_minutes} min · ` : ""}{nameOf(item.interviewer_id)}
                          </p>
                          {item.meeting_url && <a href={item.meeting_url} target="_blank" rel="noreferrer" className="text-sm font-semibold text-primary hover:underline">Open meeting link</a>}
                          {item.location && <p className="text-sm text-muted-foreground">{item.location}</p>}
                        </div>
                        <Badge className="capitalize">{item.status}</Badge>
                        {/* "Fill scorecard": my interview, scheduled, scorecard pending, AND started.
                            Before it starts, a note instead (the backend refuses early scorecards too). */}
                        {isMine && item.status === "scheduled" && card?.status === "pending" &&
                          (item.starts_at && new Date(item.starts_at).getTime() <= Date.now() ? (
                            <Button size="sm" onClick={() => setScoring(item.id)}>
                              Fill scorecard
                            </Button>
                          ) : (
                            <span className="text-xs text-muted-foreground">Scorecard opens when the interview starts</span>
                          ))}
                        {/* Managers can cancel interviews that haven't finished. */}
                        {manager && (item.status === "assigned" || item.status === "scheduled") && (
                          <Button size="sm" variant="ghost" onClick={() => setCancelling(item.id)}>
                            Cancel
                          </Button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle>Scorecards</CardTitle>
              {/* The aggregate score: managers only (the API sends null to interviewers).
                  "!= null" catches both null and undefined. */}
              {manager && scorecards.data?.aggregate_score != null && (
                <div className="text-right">
                  <p className="font-display text-3xl font-bold leading-none">{scorecards.data.aggregate_score.toFixed(1)}</p>
                  <p className="text-xs text-muted-foreground">out of 5, all interviewers</p>
                </div>
              )}
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              {waitingOnMe && (
                <p className="rounded-md bg-accent p-3 text-sm text-accent-foreground">
                  Other interviewers&apos; scorecards stay hidden until you submit yours.
                </p>
              )}
              {/* Each scorecard the API let this user see (the privacy rule is applied on the server). */}
              {scorecards.data?.scorecards.map((card) => (
                <div key={card.id} className="rounded-lg border p-4">
                  <div className="mb-2 flex items-center justify-between">
                    <p className="font-semibold">
                      {nameOf(card.interviewer_id)}
                      {interviewOf(card.interview_id)?.starts_at && (
                        <span className="font-normal text-muted-foreground"> · {formatDate(interviewOf(card.interview_id)!.starts_at!)}</span>
                      )}
                    </p>
                    {card.status === "submitted" ? (
                      <Badge className="bg-stage-hired/15 text-stage-hired">
                        {card.recommendation?.replaceAll("_", " ")} · {card.average_score?.toFixed(1)}/5
                      </Badge>
                    ) : (
                      <Badge>Pending</Badge>
                    )}
                  </div>
                  {card.ratings.map((rating) => (
                    <div key={rating.criterion} className="flex items-baseline justify-between gap-4 py-1 text-sm">
                      <span>
                        {rating.criterion}
                        {rating.comment && <span className="block text-xs text-muted-foreground">{rating.comment}</span>}
                      </span>
                      <span className="font-bold">{rating.rating}/5</span>
                    </div>
                  ))}
                </div>
              ))}
              {scorecards.data?.scorecards.length === 0 && (
                <p className="text-sm text-muted-foreground">Scorecards appear once an interview is scheduled.</p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* The three dialogs. */}
      {manager && <ScheduleDialog application={candidate} open={scheduling} onOpenChange={setScheduling} />}
      {scoring && (
        <ScorecardDialog interviewId={scoring} candidateName={candidate.full_name} open onOpenChange={() => setScoring(null)} />
      )}
      <ConfirmDialog
        open={cancelling !== null}
        onOpenChange={(open) => !open && setCancelling(null)}
        title="Cancel this interview?"
        description="The interviewer's time slot is released. This cannot be undone."
        confirmLabel="Cancel interview"
        destructive
        loading={cancel.isPending}
        // "cancelling && ..." only runs the mutation when an id is set.
        onConfirm={() =>
          cancelling &&
          cancel.mutate(cancelling, {
            onSuccess: () => {
              toast.success("Interview cancelled");
              setCancelling(null);
            },
            onError: (error) => {
              toast.error(error.message);
              setCancelling(null);
            },
          })
        }
      />
    </>
  );
}
```

## `src/components/shared/stage-menu.tsx`

```tsx
"use client";

import { ChevronDown } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
// A dropdown menu built on Radix UI (accessible: keyboard support, focus handling).
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { useDecide, useMoveStage } from "@/lib/queries";
import { isFinal, MOVABLE_STAGES, STAGE_LABEL } from "@/lib/constants";
import type { Application } from "@/lib/types";

// Managers use this to move a candidate or make the final decision.
// The backend enforces the order of the stages, so a refused move shows the backend message.
export function StageMenu({ application }: { application: Application }) {
  const move = useMoveStage();
  const decide = useDecide();
  // Which decision is waiting for confirmation: "hired", "rejected" or none.
  const [confirm, setConfirm] = useState<"hired" | "rejected" | null>(null);

  // Hired/rejected candidates can't be moved, so show no menu at all.
  if (isFinal(application.stage)) return null;

  // Move to a stage. (typeof MOVABLE_STAGES)[number] = "one of the items in MOVABLE_STAGES".
  const onMove = (stage: (typeof MOVABLE_STAGES)[number]) =>
    move.mutate(
      { id: application.id, stage },
      {
        onSuccess: () => toast.success(`${application.full_name} moved to ${STAGE_LABEL[stage]}`),
        // e.g. "A candidate in 'applied' cannot be moved to 'offer'" (skipping a stage).
        onError: (error) => toast.error(error.message),
      },
    );

  // Runs when the confirm dialog's button is pressed.
  const onDecide = () => {
    if (!confirm) return;
    decide.mutate(
      { id: application.id, decision: confirm },
      {
        onSuccess: () => {
          toast.success(confirm === "hired" ? `${application.full_name} hired` : `${application.full_name} rejected`);
          setConfirm(null);
        },
        onError: (error) => {
          toast.error(error.message);
          setConfirm(null);
        },
      },
    );
  };

  return (
    <>
      <DropdownMenu>
        {/* asChild = use our Button as the trigger instead of a default button. */}
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm">
            Move <ChevronDown />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuLabel>Move to stage</DropdownMenuLabel>
          {/* Screen, Interview, Offer. The current stage is disabled. onSelect = clicked or chosen by keyboard. */}
          {MOVABLE_STAGES.map((stage) => (
            <DropdownMenuItem key={stage} disabled={stage === application.stage} onSelect={() => onMove(stage)}>
              {STAGE_LABEL[stage]}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          {/* Hire is only possible from Offer. Decisions open a confirmation first. */}
          <DropdownMenuItem disabled={application.stage !== "offer"} onSelect={() => setConfirm("hired")}>
            Hire candidate
          </DropdownMenuItem>
          <DropdownMenuItem className="text-destructive" onSelect={() => setConfirm("rejected")}>
            Reject candidate
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {/* "Are you sure?" for final decisions. */}
      <ConfirmDialog
        open={confirm !== null}
        onOpenChange={(open) => !open && setConfirm(null)}
        title={confirm === "hired" ? `Hire ${application.full_name}?` : `Reject ${application.full_name}?`}
        description={
          confirm === "hired"
            ? "This is the final decision. A candidate can only be hired from the Offer stage."
            : "This is the final decision. The candidate cannot be moved again."
        }
        confirmLabel={confirm === "hired" ? "Hire candidate" : "Reject candidate"}
        destructive={confirm === "rejected"}      // a red button for rejecting
        loading={decide.isPending}
        onConfirm={onDecide}
      />
    </>
  );
}
```

## `src/components/shared/stage-thread.tsx` and `stage-badge.tsx`

```tsx
import { Check } from "lucide-react";
import { MAIN_STAGES, STAGE_COLOR, STAGE_LABEL } from "@/lib/constants";
import type { Stage } from "@/lib/types";
import { cn } from "@/lib/utils";

// The "stage thread": a line that runs through the hiring stages and fills up to the current one.
// It is the signature of HirePlume and is reused on the candidate page and the board.
export function StageThread({ stage, className }: { stage: Stage; className?: string }) {
  const finished = stage === "hired";
  const rejected = stage === "rejected";
  // How far along: hired = past the end (4); otherwise the stage's position (applied = 0).
  const currentIndex = finished ? MAIN_STAGES.length : MAIN_STAGES.indexOf(stage);
  const color = STAGE_COLOR[stage];

  return (
    <div className={cn("w-full", className)}>
      <ol className="relative flex items-start justify-between">
        {/* The grey background line. aria-hidden = decorative. */}
        <span aria-hidden className="absolute left-3 right-3 top-3 h-0.5 bg-border" />
        {/* The coloured progress line, from the first dot to the current one (hidden when rejected).
            calc((100% - 1.5rem) * fraction): the full line width times how far along we are.
            thread-draw = it animates growing from the left (globals.css). */}
        {!rejected && (
          <span
            aria-hidden
            className="thread-draw absolute left-3 top-3 h-0.5"
            style={{
              background: color,
              width: `calc((100% - 1.5rem) * ${Math.min(currentIndex, MAIN_STAGES.length - 1) / (MAIN_STAGES.length - 1)})`,
            }}
          />
        )}
        {MAIN_STAGES.map((item, index) => {
          const reached = !rejected && index <= currentIndex;                    // coloured border
          const current = !rejected && !finished && index === currentIndex;      // glowing ring
          const done = !rejected && (index < currentIndex || finished);          // filled + tick
          return (
            // z-10 puts the dots above the line.
            <li key={item} className="relative z-10 flex w-16 flex-col items-center gap-1.5">
              <span
                className={cn(
                  "flex size-6 items-center justify-center rounded-full border-2 bg-card",
                  current && "ring-4 ring-offset-0",
                )}
                style={{
                  borderColor: reached ? color : "var(--border)",
                  background: done ? color : undefined,
                  // The ring uses the stage color at low opacity.
                  // color-mix(...) = mix the colour with transparency (22% colour).
                  boxShadow: current ? `0 0 0 4px color-mix(in srgb, ${color} 22%, transparent)` : undefined,
                }}
              >
                {done && <Check className="size-3.5 text-white" strokeWidth={3} />}
              </span>
              <span className={cn("text-[11px] font-semibold", reached ? "text-foreground" : "text-muted-foreground")}>
                {STAGE_LABEL[item]}
              </span>
            </li>
          );
        })}
      </ol>
      {/* A final word under the thread for hired/rejected. */}
      {(finished || rejected) && (
        <p className="mt-3 text-center text-sm font-semibold" style={{ color }}>
          {finished ? "Hired" : "Rejected"}
        </p>
      )}
    </div>
  );
}
```

```tsx
// stage-badge.tsx: a small pill with a coloured dot and the stage name.
import { Badge } from "@/components/ui/badge";
import { STAGE_COLOR, STAGE_LABEL } from "@/lib/constants";
import type { Stage } from "@/lib/types";

export function StageBadge({ stage }: { stage: Stage }) {
  return (
    <Badge className="bg-card ring-1 ring-border">
      <span className="size-2 rounded-full" style={{ background: STAGE_COLOR[stage] }} />
      {STAGE_LABEL[stage]}
    </Badge>
  );
}
```

## `src/components/features/schedule-dialog.tsx`: assign an interviewer

```tsx
"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { Field } from "@/components/shared/field";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input, Select } from "@/components/ui/input";
import { useAssignInterviewer, useUsers } from "@/lib/queries";
import { assignInterviewerSchema } from "@/lib/schemas";
import type { Application } from "@/lib/types";

type AssignmentValues = z.infer<typeof assignInterviewerSchema>;

// Managers assign an interviewer; the interviewer chooses the time and meeting format.
export function ScheduleDialog({
  application,
  open,
  onOpenChange,
}: {
  application: Application;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Assign interviewer</DialogTitle>
          <DialogDescription>Choose a teammate to interview {application.full_name} for {application.job_title}.</DialogDescription>
        </DialogHeader>
        {/* Render the form only while open, so it starts fresh every time. */}
        {open && <ScheduleForm application={application} onDone={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}

function ScheduleForm({ application, onDone }: { application: Application; onDone: () => void }) {
  // GET /users?role=interviewer: the company's interviewers.
  const interviewers = useUsers(true, "interviewer");
  const assign = useAssignInterviewer();
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<AssignmentValues>({
    resolver: zodResolver(assignInterviewerSchema),
    defaultValues: { interviewer_id: "" },
  });

  function onSubmit(values: AssignmentValues) {
    assign.mutate(
      { application_id: application.id, interviewer_id: values.interviewer_id },
      {
        onSuccess: () => { toast.success("Interviewer assigned"); onDone(); },
        // Show the server's message under the select (e.g. "process is already finished").
        onError: (error) => setError("interviewer_id", { message: error.message }),
      },
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
      {/* Explain an empty dropdown instead of leaving the manager confused. */}
      {interviewers.data?.length === 0 && (
        <p role="status" className="rounded-md bg-accent px-3 py-2 text-sm text-accent-foreground">
          Your company has no interviewers yet. Ask your company admin to invite one from the Team page.
        </p>
      )}
      <Field label="Interviewer" htmlFor="interviewer_id" error={errors.interviewer_id?.message}>
        <Select id="interviewer_id" {...register("interviewer_id")}>
          <option value="">Choose an interviewer</option>
          {interviewers.data?.map((user) => (
            <option key={user.id} value={user.id}>
              {user.full_name}
            </option>
          ))}
        </Select>
      </Field>
      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={assign.isPending}>
          {assign.isPending ? "Assigning..." : "Assign interviewer"}
        </Button>
      </div>
    </form>
  );
}
```

## `src/components/features/scorecard-dialog.tsx`

```tsx
"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Trash2 } from "lucide-react";
// Controller = connect a custom input (our 1-5 buttons) to the form.
// useFieldArray = manage a LIST of fields that can grow or shrink (the criteria).
import { Controller, useFieldArray, useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { Field } from "@/components/shared/field";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input, Select } from "@/components/ui/input";
import { useSubmitScorecard } from "@/lib/queries";
import { scorecardSchema } from "@/lib/schemas";
import { cn } from "@/lib/utils";

type ScorecardValues = z.infer<typeof scorecardSchema>;

// Three criteria are filled in to start with; the interviewer can rename, add or remove.
const STARTER_CRITERIA = ["Role skills", "Communication", "Problem solving"];

export function ScorecardDialog({
  interviewId,
  candidateName,
  open,
  onOpenChange,
}: {
  interviewId: string;
  candidateName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Scorecard for {candidateName}</DialogTitle>
          <DialogDescription>Rate each criterion from 1 to 5. Once submitted, a scorecard cannot be changed.</DialogDescription>
        </DialogHeader>
        {open && <ScorecardForm interviewId={interviewId} onDone={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}

function ScorecardForm({ interviewId, onDone }: { interviewId: string; onDone: () => void }) {
  const submit = useSubmitScorecard();
  const {
    control,          // needed by Controller and useFieldArray
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ScorecardValues>({
    resolver: zodResolver(scorecardSchema),
    // Ratings start at 0 (= not chosen), which fails the "min 1" rule until a number is picked.
    defaultValues: { recommendation: "maybe", ratings: STARTER_CRITERIA.map((criterion) => ({ criterion, rating: 0, comment: "" })) },
  });
  // fields = the current list (each has a stable .id for React keys); append/remove change it.
  const { fields, append, remove } = useFieldArray({ control, name: "ratings" });

  function onSubmit(values: ScorecardValues) {
    submit.mutate(
      {
        interviewId,
        // Empty comments become undefined (not sent).
        ratings: values.ratings.map((item) => ({ ...item, comment: item.comment || undefined })),
        recommendation: values.recommendation,
      },
      {
        onSuccess: () => {
          toast.success("Scorecard submitted");
          onDone();
        },
        // e.g. "You can submit the scorecard once the interview has started" or "already submitted".
        onError: (error) => toast.error(error.message),
      },
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-5" noValidate>
      <Field label="Overall recommendation" htmlFor="recommendation" error={errors.recommendation?.message}>
        <Select id="recommendation" {...register("recommendation")}>
          <option value="recommend">Recommend</option>
          <option value="maybe">Maybe</option>
          <option value="not_recommend">Do not recommend</option>
        </Select>
      </Field>
      {/* One box per criterion. */}
      {fields.map((field, index) => (
        <div key={field.id} className="rounded-lg border p-4">
          <div className="flex items-start gap-2">
            <div className="flex-1">
              {/* Field names like "ratings.0.criterion" address an item inside the list. */}
              <Field label="Criterion" htmlFor={`criterion-${index}`} error={errors.ratings?.[index]?.criterion?.message}>
                <Input id={`criterion-${index}`} {...register(`ratings.${index}.criterion`)} />
              </Field>
            </div>
            {/* Remove button, but always keep at least one criterion. */}
            {fields.length > 1 && (
              <Button type="button" variant="ghost" size="icon" className="mt-6" aria-label="Remove criterion" onClick={() => remove(index)}>
                <Trash2 />
              </Button>
            )}
          </div>
          {/* The 1-5 rating buttons: a custom input, connected with Controller. */}
          <Controller
            control={control}
            name={`ratings.${index}.rating`}
            render={({ field: rating }) => (
              <div className="mt-3">
                {/* role="radiogroup"/"radio" + aria-checked make the buttons behave like radio buttons for screen readers. */}
                <div role="radiogroup" aria-label="Rating" className="flex gap-2">
                  {[1, 2, 3, 4, 5].map((value) => (
                    <button
                      key={value}
                      type="button"
                      role="radio"
                      aria-checked={rating.value === value}
                      onClick={() => rating.onChange(value)}        // tell the form the new value
                      className={cn(
                        "size-10 rounded-md border text-sm font-bold transition-colors",
                        rating.value === value ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-muted",
                      )}
                    >
                      {value}
                    </button>
                  ))}
                </div>
                {errors.ratings?.[index]?.rating && (
                  <p role="alert" className="mt-1 text-xs font-medium text-destructive">
                    Choose a rating from 1 to 5
                  </p>
                )}
              </div>
            )}
          />
          <Input className="mt-3" placeholder="Comment (optional)" aria-label="Comment" {...register(`ratings.${index}.comment`)} />
        </div>
      ))}
      {/* A list-level error, e.g. "Add at least one criterion". */}
      {errors.ratings?.root && (
        <p role="alert" className="text-xs font-medium text-destructive">
          {errors.ratings.root.message}
        </p>
      )}
      {/* Add another criterion (max 20, like the backend). */}
      <Button
        type="button"
        variant="soft"
        className="self-start"
        disabled={fields.length >= 20}
        onClick={() => append({ criterion: "", rating: 0, comment: "" })}
      >
        <Plus /> Add criterion
      </Button>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={submit.isPending}>
          {submit.isPending ? "Submitting..." : "Submit scorecard"}
        </Button>
      </div>
    </form>
  );
}
```
