import uuid

from fastapi import APIRouter, HTTPException
from sqlmodel import Session, col, select

from app.auth.dependencies import CurrentUser, InterviewerUser
from app.auth.permissions import get_visible_application
from app.candidates.models import Application
from app.db.common import utcnow
from app.db.session import DbSession
from app.interviews.models import Interview, InterviewStatus
from app.scorecards.models import Recommendation, Scorecard, ScorecardRating, ScorecardStatus
from app.scorecards.schemas import ApplicationScorecards, ScorecardRead, ScorecardSubmit
from app.users.models import Role, User

router = APIRouter(tags=["Scorecards"])


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


@router.put("/interviews/{interview_id}/scorecard", response_model=ScorecardRead)
def submit_scorecard(interview_id: uuid.UUID, body: ScorecardSubmit, interviewer: InterviewerUser, db: DbSession):
    """An interviewer submits the scorecard of their own interview. It cannot be changed afterwards."""
    # The rows are locked, so a double click cannot submit the scorecard twice.
    row = db.exec(
        select(Scorecard, Interview)
        .join(Interview, Interview.id == Scorecard.interview_id)
        .where(
            Interview.id == interview_id,
            Interview.interviewer_id == interviewer.id,
            Interview.status != InterviewStatus.cancelled,
        )
        .with_for_update()
        .execution_options(populate_existing=True)
    ).first()
    if row is None:
        raise HTTPException(404, "Interview not found")
    scorecard, interview = row

    if scorecard.status == ScorecardStatus.submitted:
        raise HTTPException(409, "This scorecard was already submitted")
    if interview.status != InterviewStatus.scheduled:
        raise HTTPException(409, "The interview must be scheduled before submitting a scorecard")

    ratings = [
        ScorecardRating(
            scorecard_id=scorecard.id,
            criterion=item.criterion.strip(),
            rating=item.rating,
            comment=item.comment,
        )
        for item in body.ratings
    ]
    scorecard.status = ScorecardStatus.submitted
    scorecard.submitted_at = utcnow()
    scorecard.recommendation = body.recommendation
    interview.status = InterviewStatus.completed
    db.add_all([scorecard, interview, *ratings])
    db.flush()

    recommendations = db.exec(
        select(Scorecard.recommendation)
        .join(Interview, Interview.id == Scorecard.interview_id)
        .where(
            Interview.application_id == interview.application_id,
            Scorecard.status == ScorecardStatus.submitted,
            Scorecard.recommendation.is_not(None),
        )
    ).all()
    application = db.get(Application, interview.application_id)
    if Recommendation.not_recommend in recommendations:
        application.interviewer_recommendation = Recommendation.not_recommend.value
    elif recommendations and all(item == Recommendation.recommend for item in recommendations):
        application.interviewer_recommendation = Recommendation.recommend.value
    elif recommendations:
        application.interviewer_recommendation = Recommendation.maybe.value
    db.add(application)
    db.commit()
    return build_scorecard_read(scorecard, interview, ratings)


def hide_scorecards_from_interviewer(rows: list[tuple[Scorecard, Interview]], interviewer: User):
    """The privacy rule.

    An interviewer always sees their own scorecards. They see the other interviewers'
    submitted scorecards only after they have submitted all of their own for this candidate.
    """
    own_rows = [(card, interview) for card, interview in rows if interview.interviewer_id == interviewer.id]
    has_submitted_all_own = all(card.status == ScorecardStatus.submitted for card, _ in own_rows)
    if not has_submitted_all_own:
        return own_rows
    return [
        (card, interview)
        for card, interview in rows
        if interview.interviewer_id == interviewer.id or card.status == ScorecardStatus.submitted
    ]


def load_ratings(db: Session, scorecard_ids: list[uuid.UUID]) -> dict[uuid.UUID, list[ScorecardRating]]:
    ratings_by_scorecard: dict[uuid.UUID, list[ScorecardRating]] = {card_id: [] for card_id in scorecard_ids}
    if scorecard_ids:
        ratings = db.exec(
            select(ScorecardRating)
            .where(col(ScorecardRating.scorecard_id).in_(scorecard_ids))
            .order_by(col(ScorecardRating.criterion))
        ).all()
        for rating in ratings:
            ratings_by_scorecard[rating.scorecard_id].append(rating)
    return ratings_by_scorecard


@router.get("/applications/{application_id}/scorecards", response_model=ApplicationScorecards)
def read_application_scorecards(application_id: uuid.UUID, user: CurrentUser, db: DbSession):
    """Managers see every scorecard and the aggregate score. Interviewers see only what the privacy rule allows."""
    application, _ = get_visible_application(db, user, application_id)  # 404 if not in the user's scope

    rows = db.exec(
        select(Scorecard, Interview)
        .join(Interview, Interview.id == Scorecard.interview_id)
        .where(
            Interview.application_id == application.id,
            Interview.status != InterviewStatus.cancelled,
        )
        .order_by(col(Interview.starts_at))
    ).all()
    if user.role == Role.interviewer:
        rows = hide_scorecards_from_interviewer(rows, user)

    ratings_by_scorecard = load_ratings(db, [card.id for card, _ in rows])
    scorecards = [build_scorecard_read(card, interview, ratings_by_scorecard[card.id]) for card, interview in rows]

    aggregate_score = None
    if user.role != Role.interviewer:
        submitted_averages = [
            card.average_score for card in scorecards if card.status == ScorecardStatus.submitted
        ]
        if submitted_averages:
            aggregate_score = round(sum(submitted_averages) / len(submitted_averages), 2)
    return ApplicationScorecards(aggregate_score=aggregate_score, scorecards=scorecards)
