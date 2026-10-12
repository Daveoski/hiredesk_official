"use client";

import { Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useFinalReview, useRunScreening } from "@/lib/queries";
import type { AIFinalReview, AIScreening, ApplicationAI, CriterionCheck } from "@/lib/types";
import { cn, formatDateTime } from "@/lib/utils";

const GOOD = "bg-status-good-wash text-status-good";
const WARNING = "bg-status-warning-wash text-status-warning";
const CRITICAL = "bg-status-critical-wash text-status-critical";

const SCREENING_LABEL: Record<AIScreening["recommendation"], [string, string]> = {
  advance_to_interview: ["Advance to interview", GOOD],
  needs_review: ["Needs your review", WARNING],
  reject: ["Does not meet the requirements", CRITICAL],
};

const DECISION_LABEL: Record<AIFinalReview["decision"], [string, string]> = {
  hire: ["Hire", GOOD],
  needs_more_information: ["Needs more information", WARNING],
  do_not_hire: ["Do not hire", CRITICAL],
};

const CHECK_LABEL: Record<CriterionCheck["status"], [string, string]> = {
  met: ["Met", GOOD],
  unclear: ["Unclear", WARNING],
  not_met: ["Not met", CRITICAL],
};

function PointList({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div>
      <p className="font-semibold">{title}</p>
      <ul className="mt-1 list-disc pl-5 text-muted-foreground">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

function Checks({ title, checks }: { title: string; checks: CriterionCheck[] }) {
  if (checks.length === 0) return null;
  return (
    <div>
      <p className="mb-1 font-semibold">{title}</p>
      <ul className="divide-y">
        {checks.map((check) => (
          <li key={check.criterion} className="flex items-start justify-between gap-3 py-2">
            <span>
              {check.criterion}
              <span className="block text-xs text-muted-foreground">{check.evidence}</span>
            </span>
            <Badge className={cn("shrink-0", CHECK_LABEL[check.status][1])}>{CHECK_LABEL[check.status][0]}</Badge>
          </li>
        ))}
      </ul>
    </div>
  );
}

function NotConfigured() {
  return (
    <p className="text-sm text-muted-foreground">
      The AI assistant is turned off. Add GEMINI_API_KEY to the backend settings to use it.
    </p>
  );
}

// The AI screening of the CV, uploaded documents and typed answers, before the interview stage.
export function AIScreeningCard({ applicationId, ai }: { applicationId: string; ai: ApplicationAI | undefined }) {
  const run = useRunScreening();
  const screening = ai?.screening;

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-3">
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="size-5 text-primary" /> AI screening
        </CardTitle>
        {screening && (
          <div className="text-right">
            <p className="font-display text-3xl font-bold leading-none">{screening.match_score}</p>
            <p className="text-xs text-muted-foreground">match out of 100</p>
          </div>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-4 text-sm">
        {ai && !ai.enabled && !screening && <NotConfigured />}
        {ai?.enabled && !screening && !run.isPending && (
          <p className="text-muted-foreground">
            New applications are screened automatically within a minute. You can also run it now.
          </p>
        )}
        {screening && (
          <>
            <Badge className={cn("self-start", SCREENING_LABEL[screening.recommendation][1])}>
              {SCREENING_LABEL[screening.recommendation][0]}
            </Badge>
            <p className="leading-relaxed">{screening.summary}</p>
            <PointList title="Strengths" items={screening.strengths} />
            <PointList title="Gaps" items={screening.gaps} />
            <Checks title="Required qualifications" checks={screening.qualification_checks} />
            <Checks title="Eligibility criteria" checks={screening.eligibility_checks} />
            <div>
              <p className="font-semibold">Cover letter</p>
              <p className="mt-1 leading-relaxed text-muted-foreground">{screening.cover_letter_assessment}</p>
            </div>
            <p className="border-t pt-3 text-xs text-muted-foreground">
              Read: {screening.documents_read.join(", ") || "no documents"}
              {screening.documents_skipped.length > 0 && <> · Could not read: {screening.documents_skipped.join("; ")}</>}
              {" · "}
              {formatDateTime(screening.generated_at)}. AI advice: check it before acting.
            </p>
          </>
        )}
        {ai?.enabled && (
          <div>
            <Button
              size="sm"
              variant={screening ? "outline" : "default"}
              disabled={run.isPending}
              onClick={() =>
                run.mutate(applicationId, {
                  onSuccess: () => toast.success("Screening updated"),
                  onError: (error) => toast.error(error.message),
                })
              }
            >
              <Sparkles /> {run.isPending ? "Reading the application..." : screening ? "Screen again" : "Screen now"}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// The AI's comparison of the interview scorecards with the hiring manager's assessment.
export function AIFinalReviewCard({
  applicationId,
  ai,
  ready,
}: {
  applicationId: string;
  ai: ApplicationAI | undefined;
  ready: boolean;
}) {
  const review = useFinalReview();
  const result = ai?.final_review;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="size-5 text-primary" /> AI final recommendation
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 text-sm">
        {ai && !ai.enabled && !result && <NotConfigured />}
        {ai?.enabled && !result && (
          <p className="text-muted-foreground">
            Compares the interviewers&apos; scorecards with your qualification assessment and recommends whether to hire.
            {!ready && " It needs at least one submitted scorecard and your saved match score."}
          </p>
        )}
        {result && (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <Badge className={DECISION_LABEL[result.decision][1]}>{DECISION_LABEL[result.decision][0]}</Badge>
              <span className="text-xs text-muted-foreground">{result.confidence} confidence</span>
            </div>
            <p className="leading-relaxed">{result.summary}</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-md bg-muted p-3">
                <p className="font-display text-2xl font-bold leading-none">{result.manager_match_score}</p>
                <p className="text-xs text-muted-foreground">your match score / 100</p>
              </div>
              <div className="rounded-md bg-muted p-3">
                <p className="font-display text-2xl font-bold leading-none">{result.interviewer_average.toFixed(1)}</p>
                <p className="text-xs text-muted-foreground">
                  interviewers / 5 ({result.scorecards_compared} scorecard{result.scorecards_compared === 1 ? "" : "s"})
                </p>
              </div>
            </div>
            <div>
              <p className="font-semibold">How the scores compare</p>
              <p className="mt-1 leading-relaxed text-muted-foreground">{result.score_comparison}</p>
            </div>
            <PointList title="Strengths" items={result.strengths} />
            <PointList title="Concerns" items={result.concerns} />
            <div>
              <p className="font-semibold">Reasoning</p>
              <p className="mt-1 leading-relaxed text-muted-foreground">{result.reasoning}</p>
            </div>
            <p className="border-t pt-3 text-xs text-muted-foreground">
              {formatDateTime(result.generated_at)}. The decision stays yours: use Hire or Reject in the stage menu.
            </p>
          </>
        )}
        {ai?.enabled && (
          <div>
            <Button
              size="sm"
              variant={result ? "outline" : "default"}
              disabled={review.isPending || !ready}
              onClick={() =>
                review.mutate(applicationId, {
                  onSuccess: () => toast.success("Final recommendation ready"),
                  onError: (error) => toast.error(error.message),
                })
              }
            >
              <Sparkles /> {review.isPending ? "Comparing scores..." : result ? "Review again" : "Get final recommendation"}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
