import uuid

from sqlmodel import Session, col, select

from app.scorecards.models import ScorecardRating


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
