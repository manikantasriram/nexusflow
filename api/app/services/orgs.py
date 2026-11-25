"""Organizations and their members.

Role rules (owner > admin > member):
- Admins and owners can add members, change roles and remove people.
- You can only act on someone ranked below you, and only grant roles below your own.
  So an admin manages members; only an owner creates admins or appoints other owners.
- An organization always keeps at least one owner.
- Anyone can remove themselves (leave), unless they are the last owner.
"""

import re
import secrets

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.deps import Tenant
from app.errors import AppError, not_found
from app.models import ROLE_RANK, Membership, Organization, Role, User


def _slugify(name: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")[:48]
    return slug or "org"


def create_organization(db: Session, owner: User, name: str) -> Organization:
    base = _slugify(name)
    slug = base
    while db.scalar(select(Organization.id).where(Organization.slug == slug)) is not None:
        slug = f"{base}-{secrets.token_hex(2)}"
    org = Organization(name=name, slug=slug)
    db.add(org)
    db.flush()
    db.add(Membership(organization_id=org.id, user_id=owner.id, role=Role.OWNER))
    db.flush()
    return org


def get_organization(db: Session, tenant: Tenant) -> Organization:
    org = db.get(Organization, tenant.org_id)
    if org is None:
        raise not_found("Organization")
    return org


def list_members(db: Session, tenant: Tenant) -> list[Membership]:
    return list(
        db.scalars(
            select(Membership)
            .join(User)
            .where(Membership.organization_id == tenant.org_id)
            .order_by(Membership.created_at, User.full_name)
        )
    )


def _membership(db: Session, tenant: Tenant, user_id: int) -> Membership:
    m = db.scalar(
        select(Membership).where(Membership.organization_id == tenant.org_id, Membership.user_id == user_id)
    )
    if m is None:
        raise not_found("Member")
    return m


def _owner_count(db: Session, org_id: int) -> int:
    return (
        db.scalar(
            select(func.count())
            .select_from(Membership)
            .where(Membership.organization_id == org_id, Membership.role == Role.OWNER)
        )
        or 0
    )


def _check_can_grant(tenant: Tenant, role: Role) -> None:
    if tenant.role != Role.OWNER and ROLE_RANK[role] >= ROLE_RANK[tenant.role]:
        raise AppError(403, f"Only an owner can give someone the {role.value} role")


def add_member(db: Session, tenant: Tenant, email: str, role: Role) -> Membership:
    _check_can_grant(tenant, role)
    user = db.scalar(select(User).where(User.email == email.lower()))
    if user is None:
        raise AppError(404, "No NexusFlow account uses that email. Ask them to sign up first.")
    exists = db.scalar(
        select(Membership.id).where(
            Membership.organization_id == tenant.org_id, Membership.user_id == user.id
        )
    )
    if exists is not None:
        raise AppError(409, f"{user.full_name} is already a member")
    m = Membership(organization_id=tenant.org_id, user_id=user.id, role=role)
    db.add(m)
    db.flush()
    return m


def change_role(db: Session, tenant: Tenant, user_id: int, role: Role) -> Membership:
    m = _membership(db, tenant, user_id)
    if m.role == role:
        return m
    is_self = user_id == tenant.user.id
    if not is_self and ROLE_RANK[m.role] >= ROLE_RANK[tenant.role] and tenant.role != Role.OWNER:
        raise AppError(403, "You can only change the role of people ranked below you")
    if is_self and ROLE_RANK[role] > ROLE_RANK[m.role]:
        raise AppError(403, "You can't promote yourself")
    _check_can_grant(tenant, role)
    if m.role == Role.OWNER and _owner_count(db, tenant.org_id) <= 1:
        raise AppError(409, "An organization needs at least one owner. Appoint another owner first.")
    m.role = role
    db.flush()
    return m


def remove_member(db: Session, tenant: Tenant, user_id: int) -> None:
    m = _membership(db, tenant, user_id)
    is_self = user_id == tenant.user.id
    if not is_self:
        if not tenant.at_least(Role.ADMIN):
            raise AppError(403, "Only an organization admin or above can remove people")
        if ROLE_RANK[m.role] >= ROLE_RANK[tenant.role] and tenant.role != Role.OWNER:
            raise AppError(403, "You can only remove people ranked below you")
    if m.role == Role.OWNER and _owner_count(db, tenant.org_id) <= 1:
        raise AppError(409, "An organization needs at least one owner. Appoint another owner first.")
    db.delete(m)
    db.flush()


def is_member(db: Session, org_id: int, user_id: int) -> bool:
    return (
        db.scalar(
            select(Membership.id).where(Membership.organization_id == org_id, Membership.user_id == user_id)
        )
        is not None
    )
