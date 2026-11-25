"""Organizations, their members, and the dashboard stats."""

from fastapi import APIRouter, Response

from app.deps import DB, CurrentUser, OrgAdmin, OrgMember
from app.models import Membership
from app.schemas import MemberAddIn, MemberOut, MemberRoleIn, MembershipOut, OrgIn, OrgOut, StatsOut, UserOut
from app.services import orgs
from app.services.auth import memberships_of
from app.services.stats import get_stats

router = APIRouter(prefix="/api/orgs", tags=["organizations"])


def _member_out(m: Membership) -> MemberOut:
    return MemberOut(user=UserOut.model_validate(m.user), role=m.role, joined_at=m.created_at)


@router.get("")
def my_organizations(user: CurrentUser, db: DB) -> list[MembershipOut]:
    return [MembershipOut.model_validate(m) for m in memberships_of(db, user)]


@router.post("", status_code=201)
def create_organization(data: OrgIn, user: CurrentUser, db: DB) -> MembershipOut:
    org = orgs.create_organization(db, user, data.name)
    db.commit()
    return MembershipOut(organization=OrgOut.model_validate(org), role="owner")


@router.get("/{org_id}")
def get_organization(tenant: OrgMember, db: DB) -> MembershipOut:
    org = orgs.get_organization(db, tenant)
    return MembershipOut(organization=OrgOut.model_validate(org), role=tenant.role)


@router.patch("/{org_id}")
def rename_organization(data: OrgIn, tenant: OrgAdmin, db: DB) -> OrgOut:
    org = orgs.get_organization(db, tenant)
    org.name = data.name
    db.commit()
    return OrgOut.model_validate(org)


@router.get("/{org_id}/members")
def list_members(tenant: OrgMember, db: DB) -> list[MemberOut]:
    return [_member_out(m) for m in orgs.list_members(db, tenant)]


@router.post("/{org_id}/members", status_code=201)
def add_member(data: MemberAddIn, tenant: OrgAdmin, db: DB) -> MemberOut:
    m = orgs.add_member(db, tenant, data.email, data.role)
    db.commit()
    return _member_out(m)


@router.patch("/{org_id}/members/{user_id}")
def change_role(user_id: int, data: MemberRoleIn, tenant: OrgAdmin, db: DB) -> MemberOut:
    m = orgs.change_role(db, tenant, user_id, data.role)
    db.commit()
    return _member_out(m)


@router.delete("/{org_id}/members/{user_id}", status_code=204)
def remove_member(user_id: int, tenant: OrgMember, db: DB) -> Response:
    orgs.remove_member(db, tenant, user_id)
    db.commit()
    return Response(status_code=204)


@router.get("/{org_id}/stats")
def stats(tenant: OrgMember, db: DB) -> StatsOut:
    return get_stats(db, tenant.org_id)
