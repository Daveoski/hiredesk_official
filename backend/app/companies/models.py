import uuid

from sqlmodel import Field, SQLModel


class Company(SQLModel, table=True):
    __tablename__ = "companies"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    name: str
