# Part 9: Scorecards (copyable)

After an interview **has started**, the interviewer submits a scorecard: 1–20 criteria, each rated 1–5 with an optional comment, plus an overall recommendation. Three rules keep feedback fair:
1. **Immutable:** once submitted, a scorecard can't be changed.
2. **Privacy:** you can't see other interviewers' scorecards until you've submitted your own (this prevents *anchoring bias*, where people copy the first opinion they see).
3. **No aggregate for interviewers:** only managers see the combined score.

## `backend/app/scorecards/schemas.py`

```python
# ── scorecards/schemas.py ──

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, computed_field, model_validator

from app.scorecards.models import Recommendation, ScorecardStatus


# One criterion in the submitted form.
class RatingInput(BaseModel):
    criterion: str = Field(min_length=1, max_length=100)     # e.g. "Communication"
    rating: int = Field(ge=1, le=5)                          # 1..5 (the database also enforces this)
    comment: str | None = Field(default=None, max_length=1000)


# BODY of PUT /interviews/{id}/scorecard.
class ScorecardSubmit(BaseModel):
    ratings: list[RatingInput] = Field(min_length=1, max_length=20)   # 1 to 20 criteria
    recommendation: Recommendation | None = None                      # optional overall opinion

    # "Communication" and "communication " count as the SAME criterion.
    @model_validator(mode="after")
    def criteria_must_be_unique(self):
        # Normalise each name: trim spaces, lower-case.
        criteria = [item.criterion.strip().lower() for item in self.ratings]
        # A set drops duplicates; if it's shorter than the list, there was a duplicate.
        if len(criteria) != len(set(criteria)):
            raise ValueError("Each criterion can only be rated once")
        return self


# One rating in the response.
class RatingRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    criterion: str
    rating: int
    comment: str | None


# One scorecard in the response.
class ScorecardRead(BaseModel):
    id: uuid.UUID
    interview_id: uuid.UUID
    interviewer_id: uuid.UUID          # copied from the interview (scorecards don't store it)
    status: ScorecardStatus
    recommendation: Recommendation | None
    submitted_at: datetime | None
    ratings: list[RatingRead]

    # Calculated, included in the JSON as "average_score".
    @computed_field
    @property
    def average_score(self) -> float | None:
        """The average of this scorecard's ratings."""
        if not self.ratings:
            return None                       # pending scorecards have no ratings
        # e.g. ratings 5 and 3 -> (5 + 3) / 2 = 4.0, rounded to 2 decimal places.
        return round(sum(item.rating for item in self.ratings) / len(self.ratings), 2)


# What GET /applications/{id}/scorecards returns.
class ApplicationScorecards(BaseModel):
    # Only managers get the aggregate: the average of the submitted scorecards' averages.
    aggregate_score: float | None
    scorecards: list[ScorecardRead]
```

## `backend/app/scorecards/router.py`

```python
# ── scorecards/router.py: submit a scorecard; read a candidate's scorecards. ──

import uuid

from fastapi import APIRouter, BackgroundTasks, HTTPException
from sqlmodel import Session, col, select

from app.auth.dependencies import CurrentUser, InterviewerUser
from app.auth.permissions import get_visible_application
from app.candidates.models import Application
from app.core.notifications import label, notify_company_admins
from app.db.common import utcnow
from app.db.session import DbSession
from app.interviews.models import Interview, InterviewStatus
from app.jobs.models import Job
from app.scorecards.models import Recommendation, Scorecard, ScorecardRating, ScorecardStatus
from app.scorecards.schemas import ApplicationScorecards, ScorecardRead, ScorecardSubmit
from app.users.models import Role, User

# No prefix: the two endpoints live under /interviews/... and /applications/... respectively.
router = APIRouter(tags=["Scorecards"])


# Helper: build the response object from a scorecard, its interview and its ratings.
def build_scorecard_read(scorecard: Scorecard, interview: Interview, ratings: list[ScorecardRating]) -> ScorecardRead:
    return ScorecardRead(
        id=scorecard.id,
        interview_id=scorecard.interview_id,
        interviewer_id=interview.interviewer_id,
        status=scorecard.status,
        recommendation=scorecard.recommendation,
        submitted_at=scorecard.submitted_at,
        ratings=ratings,
    )


# ── PUT /interviews/{interview_id}/scorecard: submit (once). ──
@router.put("/interviews/{interview_id}/scorecard", response_model=ScorecardRead)
def submit_scorecard(
    interview_id: uuid.UUID,
    body: ScorecardSubmit,
    interviewer: InterviewerUser,         # interviewers only
    db: DbSession,
    background_tasks: BackgroundTasks,
):
    """An interviewer submits the scorecard of their own interview. It cannot be changed afterwards."""
    # The rows are locked, so a double click cannot submit the scorecard twice.
    row = db.exec(
        select(Scorecard, Interview)
        .join(Interview, Interview.id == Scorecard.interview_id)
        .where(
            Interview.id == interview_id,
            Interview.interviewer_id == interviewer.id,           # only YOUR interview
            Interview.status != InterviewStatus.cancelled,        # not a cancelled one
        )
        .with_for_update()                                        # lock until commit
        .execution_options(populate_existing=True)                # read fresh values after locking
    ).first()
    if row is None:
        # Not found, not yours, or cancelled: all 404.
        raise HTTPException(404, "Interview not found")
    scorecard, interview = row

    # A second click waits for the lock, then sees "submitted" here and gets 409.
    if scorecard.status == ScorecardStatus.submitted:
        raise HTTPException(409, "This scorecard was already submitted")
    # It must have a time (not just "assigned").
    if interview.status != InterviewStatus.scheduled:
        raise HTTPException(409, "The interview must be scheduled before submitting a scorecard")
    # And that time must have arrived: no scoring an interview that hasn't happened.
    if interview.starts_at is None or interview.starts_at > utcnow():
        raise HTTPException(409, "You can submit the scorecard once the interview has started")

    # One ScorecardRating row per criterion (a list comprehension).
    ratings = [
        ScorecardRating(
            scorecard_id=scorecard.id,
            criterion=item.criterion.strip(),     # trim stray spaces
            rating=item.rating,
            comment=item.comment,
        )
        for item in body.ratings
    ]
    # Lock in the scorecard and finish the interview.
    scorecard.status = ScorecardStatus.submitted
    scorecard.submitted_at = utcnow()
    scorecard.recommendation = body.recommendation
    interview.status = InterviewStatus.completed
    # *ratings "spreads" the list: add_all([scorecard, interview, rating1, rating2, ...]).
    db.add_all([scorecard, interview, *ratings])
    # Send the changes to the database (still uncommitted) so the query below can see this scorecard.
    db.flush()

    # Recompute the CANDIDATE's overall interviewer recommendation from ALL submitted scorecards.
    recommendations = db.exec(
        select(Scorecard.recommendation)
        .join(Interview, Interview.id == Scorecard.interview_id)
        .where(
            Interview.application_id == interview.application_id,   # same candidate
            Scorecard.status == ScorecardStatus.submitted,
            Scorecard.recommendation.is_not(None),
        )
    ).all()
    application = db.get(Application, interview.application_id)
    # The rule:
    #   any "not recommend"  -> not recommend (one strong "no" matters most)
    #   all "recommend"      -> recommend
    #   any other mix        -> maybe
    if Recommendation.not_recommend in recommendations:
        application.interviewer_recommendation = Recommendation.not_recommend.value
    # all(...) = True if every item passes; "recommendations and" guards against an empty list.
    elif recommendations and all(item == Recommendation.recommend for item in recommendations):
        application.interviewer_recommendation = Recommendation.recommend.value
    elif recommendations:
        application.interviewer_recommendation = Recommendation.maybe.value
    db.add(application)
    # Save everything together and release the lock.
    db.commit()

    result = build_scorecard_read(scorecard, interview, ratings)
    job = db.get(Job, application.job_id)
    # "\n".join(...) puts each rating on its own line: "- Communication: 4/5".
    rating_lines = "\n".join(f"- {item.criterion}: {item.rating}/5" for item in ratings)
    notify_company_admins(
        db,
        background_tasks,
        job.company_id,
        subject=f"Scorecard submitted: {application.full_name} for {job.title}",
        text=(
            f"{interviewer.full_name} submitted their interview scorecard for {application.full_name} ({job.title}).\n\n"
            f"Recommendation: {label(body.recommendation.value) if body.recommendation else 'none given'}\n"
            f"Average rating: {result.average_score}/5\n"
            f"{rating_lines}\n\n"
            f"Overall interviewer recommendation so far: {label(application.interviewer_recommendation or 'none')}\n"
        ),
    )
    return result


# ── The privacy rule (used only for interviewers). ──
# rows = (scorecard, interview) pairs for one candidate.
def hide_scorecards_from_interviewer(rows: list[tuple[Scorecard, Interview]], interviewer: User):
    """The privacy rule.

    An interviewer always sees their own scorecards. They see the other interviewers'
    submitted scorecards only after they have submitted all of their own for this candidate.
    """
    # This interviewer's own scorecards for the candidate (they could have more than one interview).
    own_rows = [(card, interview) for card, interview in rows if interview.interviewer_id == interviewer.id]
    # Have they submitted ALL of their own? ("_" = ignore the interview in each pair.)
    has_submitted_all_own = all(card.status == ScorecardStatus.submitted for card, _ in own_rows)
    if not has_submitted_all_own:
        # Not yet: show only their own, so nobody else's opinion can influence them.
        return own_rows
    # Yes: show their own, plus everyone else's SUBMITTED ones (never others' pending drafts).
    return [
        (card, interview)
        for card, interview in rows
        if interview.interviewer_id == interviewer.id or card.status == ScorecardStatus.submitted
    ]


# Load the ratings of many scorecards in ONE query (not one query per scorecard),
# grouped as {scorecard_id: [ratings...]}.
def load_ratings(db: Session, scorecard_ids: list[uuid.UUID]) -> dict[uuid.UUID, list[ScorecardRating]]:
    # A DICT COMPREHENSION: start every scorecard with an empty list (so pending ones get []).
    ratings_by_scorecard: dict[uuid.UUID, list[ScorecardRating]] = {card_id: [] for card_id in scorecard_ids}
    if scorecard_ids:
        ratings = db.exec(
            select(ScorecardRating)
            .where(col(ScorecardRating.scorecard_id).in_(scorecard_ids))   # WHERE scorecard_id IN (...)
            .order_by(col(ScorecardRating.criterion))                      # alphabetical criteria
        ).all()
        # Put each rating into its scorecard's list.
        for rating in ratings:
            ratings_by_scorecard[rating.scorecard_id].append(rating)
    return ratings_by_scorecard
    # (Doing one query per scorecard would be the "N+1 queries" problem: slow with many rows.)


# ── GET /applications/{application_id}/scorecards ──
@router.get("/applications/{application_id}/scorecards", response_model=ApplicationScorecards)
def read_application_scorecards(application_id: uuid.UUID, user: CurrentUser, db: DbSession):
    """Managers see every scorecard and the aggregate score. Interviewers see only what the privacy rule allows."""
    # First: may this user see the candidate at all?
    application, _ = get_visible_application(db, user, application_id)  # 404 if not in the user's scope

    # Every scorecard for this candidate, skipping cancelled interviews, ordered by interview time.
    rows = db.exec(
        select(Scorecard, Interview)
        .join(Interview, Interview.id == Scorecard.interview_id)
        .where(
            Interview.application_id == application.id,
            Interview.status != InterviewStatus.cancelled,
        )
        .order_by(col(Interview.starts_at))
    ).all()
    # Interviewers go through the privacy rule; managers see everything.
    if user.role == Role.interviewer:
        rows = hide_scorecards_from_interviewer(rows, user)

    ratings_by_scorecard = load_ratings(db, [card.id for card, _ in rows])
    scorecards = [build_scorecard_read(card, interview, ratings_by_scorecard[card.id]) for card, interview in rows]

    # The aggregate = the average of each SUBMITTED scorecard's average. Managers only.
    # e.g. Ann averaged 4.0 and Bob 2.0 -> (4.0 + 2.0) / 2 = 3.0
    aggregate_score = None
    if user.role != Role.interviewer:
        submitted_averages = [
            card.average_score for card in scorecards if card.status == ScorecardStatus.submitted
        ]
        if submitted_averages:
            aggregate_score = round(sum(submitted_averages) / len(submitted_averages), 2)
    return ApplicationScorecards(aggregate_score=aggregate_score, scorecards=scorecards)
```

**Example of the privacy rule** (Ann and Bob both interview Cathy):

| Moment | Ann sees | Bob sees | Manager sees |
|---|---|---|---|
| Nobody has submitted | Ann's (pending) | Bob's (pending) | both pending, no aggregate |
| Ann submits | Ann's only (Bob is still pending) | Bob's only | Ann's + Bob's pending, aggregate = Ann's average |
| Bob submits | both | both | both + aggregate |
