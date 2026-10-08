from typing import Annotated

from fastapi import Depends, HTTPException
from fastapi.security import OAuth2PasswordBearer

from app.core.security import decode_access_token
from app.db.session import DbSession
from app.users.models import Role, User

# tokenUrl lets the Swagger "Authorize" button log in through /auth/login.
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="auth/login")


def get_current_user(token: Annotated[str, Depends(oauth2_scheme)], db: DbSession) -> User:
    """Authentication: who is calling? The user is loaded from the database on every request."""
    user_id = decode_access_token(token)
    user = db.get(User, user_id) if user_id else None
    if user is None:
        raise HTTPException(401, "Invalid or expired token", headers={"WWW-Authenticate": "Bearer"})
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]


def require_roles(*allowed_roles: Role):
    """Authorization by role: only the listed roles may call the endpoint."""

    def check_role(user: CurrentUser) -> User:
        if user.role not in allowed_roles:
            raise HTTPException(403, "You do not have permission to do this")
        return user

    return check_role


AdminUser = Annotated[User, Depends(require_roles(Role.company_admin))]
ManagerUser = Annotated[User, Depends(require_roles(Role.company_admin, Role.hiring_manager))]
HiringManagerUser = Annotated[User, Depends(require_roles(Role.hiring_manager))]
InterviewerUser = Annotated[User, Depends(require_roles(Role.interviewer))]
