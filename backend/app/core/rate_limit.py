"""Limits how often one client can call the endpoints attackers would abuse.

Guessing passwords, flooding the public application form and burning through the AI
assistant's quota all need many requests, so each of those endpoints counts requests
per key (an IP address, an email or a user) in a fixed time window and answers 429
once the limit is passed.

The counts live in PostgreSQL, not in memory: on Vercel each request can run on a
different instance, so an in-memory counter would keep starting again from zero.
"""
import random
from datetime import datetime, timedelta, timezone

from fastapi import Depends, HTTPException, Request
from sqlalchemy import delete
from sqlalchemy.dialects.postgresql import insert
from sqlmodel import Field, SQLModel

from app.core.config import get_settings
from app.db.common import TIMESTAMPTZ, utcnow
from app.db.session import engine

MINUTES_15 = timedelta(minutes=15)
HOUR = timedelta(hours=1)


class RateLimitHit(SQLModel, table=True):
    """How many requests one key made in one time window."""

    __tablename__ = "rate_limits"

    key: str = Field(primary_key=True, max_length=200)
    window_start: datetime = Field(primary_key=True, sa_type=TIMESTAMPTZ, index=True)
    hits: int = 0


def hit(key: str, limit: int, window: timedelta) -> bool:
    """Count one request for `key`. False once it has made more than `limit` in this window."""
    if not get_settings().rate_limit_enabled:
        return True
    _, allowed = _count(key, limit, window)
    return allowed


def check(key: str, limit: int, window: timedelta) -> None:
    """Count one request for `key` and answer 429 once it has made more than `limit` in this window."""
    if not get_settings().rate_limit_enabled:
        return
    window_end, allowed = _count(key, limit, window)
    if not allowed:
        retry_after = max(1, int((window_end - utcnow()).total_seconds()))
        raise HTTPException(
            429,
            "Too many attempts. Please wait a few minutes and try again.",
            headers={"Retry-After": str(retry_after)},
        )


def _count(key: str, limit: int, window: timedelta) -> tuple[datetime, bool]:
    now = utcnow()
    seconds = int(window.total_seconds())
    window_start = datetime.fromtimestamp(now.timestamp() // seconds * seconds, timezone.utc)
    table = RateLimitHit.__table__
    # One statement adds the row or bumps its count, so simultaneous requests cannot both read the old count.
    statement = (
        insert(table)
        .values(key=key[:200], window_start=window_start, hits=1)
        .on_conflict_do_update(index_elements=["key", "window_start"], set_={"hits": table.c.hits + 1})
        .returning(table.c.hits)
    )
    # Its own connection, so the count is saved even when the request itself fails and rolls back.
    with engine.begin() as connection:
        hits = connection.execute(statement).scalar_one()
        if random.random() < 0.01:  # now and then, drop windows that ended long ago
            connection.execute(delete(table).where(table.c.window_start < now - timedelta(days=1)))
    return window_start + window, hits <= limit


def client_ip(request: Request) -> str:
    if get_settings().vercel:
        # Vercel sets this header itself and overwrites any value the client sent.
        forwarded = request.headers.get("x-forwarded-for", "").split(",")[0].strip()
        if forwarded:
            return forwarded
    return request.client.host if request.client else "unknown"


def limit_by_ip(name: str, limit: int, window: timedelta):
    """A route dependency: at most `limit` calls per IP address per window."""

    def dependency(request: Request) -> None:
        check(f"{name}:ip:{client_ip(request)}", limit, window)

    return Depends(dependency)
