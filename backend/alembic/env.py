from logging.config import fileConfig

from alembic import context
from sqlalchemy import create_engine
from sqlmodel import SQLModel

from app.core.config import get_settings

# Importing the models registers their tables in SQLModel.metadata.
import app.candidates.models  # noqa: F401
import app.companies.models  # noqa: F401
import app.interviews.models  # noqa: F401
import app.jobs.models  # noqa: F401
import app.scorecards.models  # noqa: F401
import app.users.models  # noqa: F401

config = context.config
if config.config_file_name is not None:
    fileConfig(config.config_file_name, disable_existing_loggers=False)

target_metadata = SQLModel.metadata


def run_migrations() -> None:
    engine = create_engine(get_settings().database_url)
    with engine.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata, compare_type=True)
        with context.begin_transaction():
            context.run_migrations()
    engine.dispose()


run_migrations()
