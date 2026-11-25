"""Reusable request dependencies: "who is calling?", "which organization?" and "are they allowed?".

FastAPI runs these before an endpoint. An endpoint under /api/orgs/{org_id}/... that declares
`tenant: OrgMember` only runs if the caller belongs to that organization; `OrgAdmin` also
requires the admin or owner role. Not belonging answers 404, not 403, so outsiders can't even
learn that an organization id exists.
"""

from dataclasses import dataclass
from typing import Annotated

import jwt
from fastapi import Depends, Path
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import get_db
from app.errors import AppError, not_found
from app.models import ROLE_RANK, Membership, Role, User
from app.security import decode_access_token

bearer = HTTPBearer(auto_error=False)

DB = Annotated[Session, Depends(get_db)]


def get_current_user(db: DB, creds: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)]) -> User:
    unauthorized = AppError(
        401, "Not signed in, or your session has expired", headers={"WWW-Authenticate": "Bearer"}
    )
    if creds is None:
        raise unauthorized
    try:
        user_id = decode_access_token(creds.credentials)
    except jwt.PyJWTError, KeyError, ValueError:
        raise unauthorized from None
    user = db.get(User, user_id)
    if user is None or not user.is_active:
        raise unauthorized
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]


@dataclass(frozen=True)
class Tenant:
    """The organization a request acts in, who is acting, and their role there."""

    org_id: int
    user: User
    role: Role

    def at_least(self, role: Role) -> bool:
        return ROLE_RANK[self.role] >= ROLE_RANK[role]


def get_tenant(org_id: Annotated[int, Path(ge=1)], user: CurrentUser, db: DB) -> Tenant:
    role = db.scalar(
        select(Membership.role).where(Membership.organization_id == org_id, Membership.user_id == user.id)
    )
    if role is None:
        raise not_found("Organization")
    return Tenant(org_id=org_id, user=user, role=role)


def require_role(role: Role):
    def check(tenant: Annotated[Tenant, Depends(get_tenant)]) -> Tenant:
        if not tenant.at_least(role):
            raise AppError(403, f"Only an organization {role.value} or above can do this")
        return tenant

    return check


OrgMember = Annotated[Tenant, Depends(get_tenant)]
OrgAdmin = Annotated[Tenant, Depends(require_role(Role.ADMIN))]
OrgOwner = Annotated[Tenant, Depends(require_role(Role.OWNER))]
