from datetime import datetime, timezone
from enum import Enum as PythonEnum

from sqlalchemy import DateTime, Enum

# Every datetime column stores a timezone-aware timestamp (timestamptz).
TIMESTAMPTZ = DateTime(timezone=True)


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def enum_column(enum_class: type[PythonEnum]) -> Enum:
    """Store a Python enum as a plain VARCHAR(20) holding the enum values.

    Plain text avoids PostgreSQL ENUM types, which are awkward to change in migrations.
    """
    return Enum(
        enum_class,
        native_enum=False,
        length=20,
        values_callable=lambda members: [member.value for member in members],
    )
