"""What the AI assistant is asked to return, and what the API sends back.

The `*Result` / `JobDraft` models double as Claude's output format, so they only use
plain types (no numeric bounds); the service clamps numbers after parsing.
"""
from typing import Any, Literal

from pydantic import BaseModel, Field


class JobDraftRequest(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    notes: str = Field(default="", max_length=2000)


class JobDraft(BaseModel):
    description: str
    qualification_requirements: str
    eligibility_criteria: str


class CriterionCheck(BaseModel):
    criterion: str
    status: Literal["met", "not_met", "unclear"]
    evidence: str


class ScreeningResult(BaseModel):
    match_score: int
    recommendation: Literal["advance_to_interview", "needs_review", "reject"]
    summary: str
    strengths: list[str]
    gaps: list[str]
    qualification_checks: list[CriterionCheck]
    eligibility_checks: list[CriterionCheck]
    cover_letter_assessment: str


class FinalReviewResult(BaseModel):
    decision: Literal["hire", "do_not_hire", "needs_more_information"]
    confidence: Literal["low", "medium", "high"]
    summary: str
    score_comparison: str
    strengths: list[str]
    concerns: list[str]
    reasoning: str


class ApplicationAI(BaseModel):
    """The stored AI results for one candidate. Managers only."""

    enabled: bool
    screening: dict[str, Any] | None
    final_review: dict[str, Any] | None
