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
import { STAGE_LABEL } from "@/lib/stages";
import { formatDate, formatDateTime } from "@/lib/utils";
import { isManager, useAuthStore } from "@/stores/auth-store";

export default function CandidatePage() {
  const { applicationId } = useParams<{ applicationId: string }>();
  const user = useAuthStore((state) => state.user);
  const manager = isManager(user);

  const application = useApplication(applicationId);
  const interviews = useInterviews(applicationId);
  const scorecards = useScorecards(applicationId);
  const history = useHistory(applicationId, manager);
  const users = useUsers(manager);
  const cancel = useCancelInterview();
  const assess = useAssessApplication();

  const [scheduling, setScheduling] = useState(false);
  const [scoring, setScoring] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState<string | null>(null);
  const [matchScore, setMatchScore] = useState("");
  const [managerNotes, setManagerNotes] = useState("");

  useEffect(() => {
    if (!application.data) return;
    setMatchScore(application.data.match_score?.toString() ?? "");
    setManagerNotes(application.data.manager_notes ?? "");
  }, [application.data]);

  if (application.isError) return <ErrorState message={application.error.message} />;
  if (!application.data) return <Skeleton className="h-96" />;

  const candidate = application.data;
  const nameOf = (id: string) => (id === user?.id ? "You" : (users.data?.find((item) => item.id === id)?.full_name ?? "Interviewer"));
  const interviewOf = (id: string) => interviews.data?.find((item) => item.id === id);
  const mine = scorecards.data?.scorecards.filter((card) => card.interviewer_id === user?.id) ?? [];
  const waitingOnMe = !manager && mine.some((card) => card.status === "pending");

  return (
    <>
      <Link href="/candidates" className="text-sm font-semibold text-muted-foreground hover:text-foreground">
        All candidates
      </Link>

      <header className="mb-8 mt-3 rounded-lg border bg-card p-6">
        <div className="flex flex-wrap items-center gap-4">
          <Avatar name={candidate.full_name} className="size-14 text-base" />
          <div className="min-w-0 flex-1">
            <h1 className="text-3xl font-bold">{candidate.full_name}</h1>
            <p className="text-muted-foreground">Applied for {candidate.job_title} on {formatDate(candidate.created_at)}</p>
          </div>
          {manager && (
            <div className="flex gap-2">
              <Button variant="soft" size="sm" onClick={() => setScheduling(true)} disabled={candidate.stage === "hired" || candidate.stage === "rejected"}>
                <CalendarPlus /> Assign interviewer
              </Button>
              <StageMenu application={candidate} />
            </div>
          )}
        </div>
        <StageThread stage={candidate.stage} className="mt-8 max-w-2xl" />
      </header>

      <div className="grid gap-6 lg:grid-cols-[1fr_1.4fr]">
        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Applicant profile</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3 text-sm">
              <a href={`mailto:${candidate.email}`} className="flex items-center gap-2 hover:text-primary">
                <Mail className="size-4 text-muted-foreground" /> {candidate.email}
              </a>
              <a href={`tel:${candidate.phone}`} className="flex items-center gap-2 hover:text-primary">
                <Phone className="size-4 text-muted-foreground" /> {candidate.phone}
              </a>
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
                    disabled={assess.isPending || (matchScore !== "" && (Number(matchScore) < 0 || Number(matchScore) > 100))}
                    onClick={() => assess.mutate(
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

          {manager && (
            <Card>
              <CardHeader>
                <CardTitle>Activity</CardTitle>
              </CardHeader>
              <CardContent>
                <ol className="flex flex-col gap-4 border-l pl-5">
                  {history.data?.map((item) => (
                    <li key={item.id} className="relative text-sm">
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
                        {isMine && item.status === "scheduled" && card?.status === "pending" && (
                          <Button size="sm" onClick={() => setScoring(item.id)}>
                            Fill scorecard
                          </Button>
                        )}
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
