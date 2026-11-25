"""Projects. Any member can create and edit; only admins and owners can delete."""

from fastapi import APIRouter, Response

from app.deps import DB, OrgAdmin, OrgMember
from app.schemas import ProjectIn, ProjectOut, ProjectUpdate
from app.services import projects

router = APIRouter(prefix="/api/orgs/{org_id}/projects", tags=["projects"])


@router.get("")
def list_projects(tenant: OrgMember, db: DB) -> list[ProjectOut]:
    return projects.list_projects(db, tenant)


@router.post("", status_code=201)
def create_project(data: ProjectIn, tenant: OrgMember, db: DB) -> ProjectOut:
    project = projects.create_project(db, tenant, data)
    db.commit()
    return ProjectOut.model_validate(project)


@router.get("/{project_id}")
def get_project(project_id: int, tenant: OrgMember, db: DB) -> ProjectOut:
    return projects.project_out(db, tenant, project_id)


@router.patch("/{project_id}")
def update_project(project_id: int, data: ProjectUpdate, tenant: OrgMember, db: DB) -> ProjectOut:
    projects.update_project(db, tenant, project_id, data)
    db.commit()
    return projects.project_out(db, tenant, project_id)


@router.delete("/{project_id}", status_code=204)
def delete_project(project_id: int, tenant: OrgAdmin, db: DB) -> Response:
    projects.delete_project(db, tenant, project_id)
    db.commit()
    return Response(status_code=204)
