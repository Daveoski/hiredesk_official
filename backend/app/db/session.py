from collections.abc import Iterator
from typing import Annotated

from fastapi import Depends
from sqlmodel import Session, create_engine

from app.core.config import get_settings

# prepare_threshold=None turns off server-side prepared statements, which a connection
# pooler in transaction mode (Neon's pooled DATABASE_URL on Vercel) cannot share.
engine = create_engine(get_settings().database_url, pool_pre_ping=True, connect_args={"prepare_threshold": None})


def get_db() -> Iterator[Session]:
    # One session per request. expire_on_commit=False keeps objects readable after commit().
    with Session(engine, expire_on_commit=False) as session:
        yield session


DbSession = Annotated[Session, Depends(get_db)]
