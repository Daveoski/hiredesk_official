import uuid

from fastapi import HTTPException
from sqlmodel import Session, select

from app.candidates.models import Application, StageHistory
from app.jobs.models import Stage
from app.users.models import User

# The pipeline rules: a candidate moves one step forward, or is rejected from any open stage.
ALLOWED_TRANSITIONS: dict[Stage, set[Stage]] = {
    Stage.applied: {Stage.screen, Stage.rejected},
    Stage.screen: {Stage.interview, Stage.rejected},
    Stage.interview: {Stage.offer, Stage.rejected},
    Stage.offer: {Stage.hired, Stage.rejected},
    Stage.hired: set(),
    Stage.rejected: set(),
}


def change_stage(db: Session, application_id: uuid.UUID, new_stage: Stage, user: User) -> Application:
    """Move an application to a new stage and record it in the stage history.

    The application row is locked (SELECT ... FOR UPDATE) until commit. If two requests
    change the same candidate at the same time, the second one waits, then sees the
    stage the first one set and is checked against it. So the history never contains
    two rows that claim the same "from" stage.
    """
    # populate_existing makes sure we read the stage as it is now, not an older copy
    # that this session loaded before the lock was taken.
    application = db.exec(
        select(Application)
        .where(Application.id == application_id)
        .with_for_update()
        .execution_options(populate_existing=True)
    ).one()

    if new_stage not in ALLOWED_TRANSITIONS[application.stage]:
        raise HTTPException(
            409,
            f"A candidate in '{application.stage.value}' cannot be moved to '{new_stage.value}'",
        )

    db.add(
        StageHistory(
            application_id=application.id,
            from_stage=application.stage,
            to_stage=new_stage,
            changed_by_id=user.id,
        )
    )
    application.stage = new_stage
    db.add(application)
    db.commit()
    return application
