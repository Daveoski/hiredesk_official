"use client";

import { Activity, Briefcase, ClipboardCheck, Mail, Trophy, UserPlus, Users } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { EmptyState, ErrorState } from "@/components/shared/empty-state";
import { StageBadge } from "@/components/shared/stage-badge";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { RECOMMENDATION_LABEL } from "@/lib/constants";
import { useEmailProgressReport, useProgressReport } from "@/lib/queries";
import { MAIN_STAGES, ROLE_LABEL, STAGE_LABEL } from "@/lib/stages";
import { formatDateTime } from "@/lib/utils";
import { PipelineBar, Stat } from "./parts";

const PERIODS = [
  { days: 7, label: "Last 7 days" },
  { days: 30, label: "Last 30 days" },
  { days: 90, label: "Last 90 days" },
];

export function AdminDashboard() {
  const [days, setDays] = useState(7);
  const report = useProgressReport(days);
  const emailReport = useEmailProgressReport();
  const data = report.data;
  const totals = data?.totals;
  const loading = report.isLoading;

  return (
    <>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <label htmlFor="period" className="text-sm font-semibold text-muted-foreground">
            Period
          </label>
          <Select id="period" value={days} onChange={(event) => setDays(Number(event.target.value))} className="w-40">
            {PERIODS.map((period) => (
              <option key={period.days} value={period.days}>
                {period.label}
              </option>
            ))}
          </Select>
        </div>
        <Button
          variant="outline"
          disabled={emailReport.isPending}
          onClick={() =>
            emailReport.mutate(days, {
              onSuccess: (result) => toast.success(`Progress report sent to ${result.sent_to.join(", ")}`),
              onError: (error) => toast.error(error.message),
            })
          }
        >
          <Mail /> {emailReport.isPending ? "Sending..." : "Email me this report"}
        </Button>
      </div>

      {report.isError && <ErrorState message={report.error.message} />}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Stat label="Open jobs" value={totals?.open_jobs ?? 0} loading={loading} />
        <Stat label="Active candidates" value={totals?.active_candidates ?? 0} loading={loading} />
        <Stat label="New applications" value={totals?.new_applications ?? 0} loading={loading} hint="In this period" />
        <Stat label="Hired" value={totals?.hired ?? 0} loading={loading} hint={`${totals?.rejected ?? 0} rejected in this period`} />
        <Stat
          label="Interviews"
          value={totals?.upcoming_interviews ?? 0}
          loading={loading}
          hint={`upcoming · ${totals?.interviews_to_schedule ?? 0} still need a date`}
        />
        <Stat label="Overdue scorecards" value={totals?.scorecards_due ?? 0} loading={loading} tone="attention" hint="Interview over, scorecard not in" />
      </div>

      <Card className="mt-8">
        <CardHeader>
          <CardTitle>Hiring pipeline</CardTitle>
          <CardDescription>Every candidate in the company, by stage.</CardDescription>
        </CardHeader>
        <CardContent>{data ? <PipelineBar pipeline={data.pipeline} /> : <Skeleton className="h-10" />}</CardContent>
      </Card>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Progress by job</CardTitle>
          </CardHeader>
          <CardContent>
            {data && data.jobs.length === 0 ? (
              <EmptyState icon={Briefcase} title="No jobs yet" description="Hiring managers create jobs once you invite them." />
            ) : (
              <div className="-mx-5 overflow-x-auto px-5">
                <table className="w-full min-w-[640px] text-sm">
                  <thead>
                    <tr className="border-b text-left text-muted-foreground">
                      <th className="py-2 pr-3 font-semibold">Job</th>
                      <th className="py-2 pr-3 font-semibold">Hiring manager</th>
                      <th className="py-2 pr-3 font-semibold">Applicants</th>
                      {MAIN_STAGES.map((stage) => (
                        <th key={stage} className="py-2 pr-3 font-semibold">
                          {STAGE_LABEL[stage]}
                        </th>
                      ))}
                      <th className="py-2 pr-3 font-semibold">Hired</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {data?.jobs.map((job) => (
                      <tr key={job.id}>
                        <td className="py-2.5 pr-3">
                          <p className="font-semibold">{job.title}</p>
                          <p className="text-xs capitalize text-muted-foreground">{job.status}</p>
                        </td>
                        <td className="py-2.5 pr-3">{job.hiring_manager_name ?? "—"}</td>
                        <td className="py-2.5 pr-3 tabular-nums">{job.applicants}</td>
                        {MAIN_STAGES.map((stage) => (
                          <td key={stage} className="py-2.5 pr-3 tabular-nums">
                            {job.pipeline[stage]}
                          </td>
                        ))}
                        <td className="py-2.5 pr-3 font-semibold tabular-nums">{job.pipeline.hired}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Team progress</CardTitle>
            <CardDescription>What each hiring manager and interviewer has on their plate.</CardDescription>
          </CardHeader>
          <CardContent>
            {data && data.team.length === 0 ? (
              <EmptyState
                icon={UserPlus}
                title="No team members yet"
                action={
                  <Button asChild variant="outline">
                    <Link href="/team">Invite your team</Link>
                  </Button>
                }
              />
            ) : (
              <ul className="divide-y">
                {data?.team.map((member) => (
                  <li key={member.id} className="flex flex-wrap items-center gap-3 py-3">
                    <Avatar name={member.full_name} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold">{member.full_name}</p>
                      <p className="text-xs text-muted-foreground">{ROLE_LABEL[member.role]}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {member.role === "hiring_manager" ? (
                        <>
                          <Badge>{member.open_jobs} open jobs</Badge>
                          <Badge>{member.active_candidates} active candidates</Badge>
                        </>
                      ) : (
                        <>
                          {member.interviews_to_schedule > 0 && <Badge>{member.interviews_to_schedule} to schedule</Badge>}
                          <Badge>{member.upcoming_interviews} upcoming</Badge>
                          {member.scorecards_due > 0 && (
                            <Badge className="bg-destructive/10 text-destructive">{member.scorecards_due} scorecards overdue</Badge>
                          )}
                          <Badge>{member.scorecards_submitted} submitted</Badge>
                        </>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Results</CardTitle>
            <CardDescription>Hiring decisions in this period.</CardDescription>
          </CardHeader>
          <CardContent>
            {data && data.results.length === 0 ? (
              <EmptyState icon={Trophy} title="No decisions yet" />
            ) : (
              <ul className="divide-y">
                {data?.results.map((result) => (
                  <li key={result.application_id} className="flex items-center gap-3 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold">{result.candidate_name}</p>
                      <p className="truncate text-sm text-muted-foreground">
                        {result.job_title} · by {result.decided_by_name ?? "unknown"}
                        {result.match_score !== null && ` · match ${result.match_score}/100`}
                        {result.interviewer_recommendation && ` · ${RECOMMENDATION_LABEL[result.interviewer_recommendation]}`}
                      </p>
                    </div>
                    <StageBadge stage={result.outcome} />
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Interview scorecards</CardTitle>
            <CardDescription>Submitted in this period.</CardDescription>
          </CardHeader>
          <CardContent>
            {data && data.scorecards.length === 0 ? (
              <EmptyState icon={ClipboardCheck} title="No scorecards yet" />
            ) : (
              <ul className="divide-y">
                {data?.scorecards.map((card) => (
                  <li key={`${card.application_id}-${card.submitted_at}`} className="flex items-center gap-3 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold">{card.candidate_name}</p>
                      <p className="truncate text-sm text-muted-foreground">
                        {card.job_title} · {card.interviewer_name}
                      </p>
                    </div>
                    <div className="text-right text-sm">
                      <p className="font-semibold tabular-nums">{card.average_score !== null ? `${card.average_score}/5` : "—"}</p>
                      <p className="text-muted-foreground">{card.recommendation ? RECOMMENDATION_LABEL[card.recommendation] : "No recommendation"}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Recent activity</CardTitle>
          </CardHeader>
          <CardContent>
            {data && data.recent_activity.length === 0 ? (
              <EmptyState icon={Activity} title="No activity in this period" />
            ) : (
              <ul className="divide-y">
                {data?.recent_activity.map((item) => (
                  <li key={`${item.application_id}-${item.changed_at}`} className="flex flex-wrap items-center gap-3 py-3">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent text-accent-foreground">
                      <Users className="size-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold">
                        {item.candidate_name} <span className="font-normal text-muted-foreground">· {item.job_title}</span>
                      </p>
                      <p className="truncate text-sm text-muted-foreground">
                        {item.from_stage === null
                          ? "Applied"
                          : `${STAGE_LABEL[item.from_stage]} → ${STAGE_LABEL[item.to_stage]} by ${item.changed_by_name ?? "unknown"}`}
                      </p>
                    </div>
                    <span className="text-sm text-muted-foreground">{formatDateTime(item.changed_at)}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
