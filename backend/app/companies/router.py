import uuid

from fastapi import APIRouter
from pydantic import BaseModel, ConfigDict

from app.auth.dependencies import CurrentUser
from app.companies.models import Company
from app.db.session import DbSession

router = APIRouter(prefix="/companies", tags=["Companies"])


class CompanyRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str


@router.get("/me", response_model=CompanyRead)
def read_my_company(user: CurrentUser, db: DbSession):
    return db.get(Company, user.company_id)
