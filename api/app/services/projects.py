"""Projects inside an organization."""

from sqlalchemy import case, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.deps import Tenant
from app.errors import AppError, not_found
from app.models import Project, Task, TaskStatus
from app.schemas import ProjectIn, ProjectOut, ProjectUpdate
from app.services.stats import invalidate_stats

_done = func.coalesce(func.sum(case((Task.status == TaskStatus.DONE, 1), else_=0)), 0)


def _with_counts(db: Session, tenant: Tenant, project_id: int | None = None) -> list[ProjectOut]:
    stmt = (
        select(Project, func.count(Task.id), _done)
        .outerjoin(Task, Task.project_id == Project.id)
        .where(Project.organization_id == tenant.org_id)
        .group_by(Project.id)
        .order_by(Project.created_at.desc(), Project.id.desc())
    )
    if project_id is not None:
        stmt = stmt.where(Project.id == project_id)
    out = []
    for project, total, done in db.execute(stmt):
        item = ProjectOut.model_validate(project)
        item.task_count, item.done_count = int(total), int(done)
        out.append(item)
    return out


def list_projects(db: Session, tenant: Tenant) -> list[ProjectOut]:
    return _with_counts(db, tenant)


def get_project(db: Session, tenant: Tenant, project_id: int) -> Project:
    project = db.scalar(
        select(Project).where(Project.id == project_id, Project.organization_id == tenant.org_id)
    )
    if project is None:
        raise not_found("Project")
    return project


def project_out(db: Session, tenant: Tenant, project_id: int) -> ProjectOut:
    found = _with_counts(db, tenant, project_id)
    if not found:
        raise not_found("Project")
    return found[0]


def create_project(db: Session, tenant: Tenant, data: ProjectIn) -> Project:
    taken = db.scalar(
        select(Project.id).where(Project.organization_id == tenant.org_id, Project.key == data.key)
    )
    if taken is not None:
        raise AppError(409, f"The key {data.key} is already used by another project")
    project = Project(
        organization_id=tenant.org_id,
        name=data.name,
        key=data.key,
        description=data.description,
        created_by_id=tenant.user.id,
    )
    db.add(project)
    try:
        db.flush()
    except IntegrityError:  # two people picked the same key at the same moment
        db.rollback()
        raise AppError(409, f"The key {data.key} is already used by another project") from None
    invalidate_stats(tenant.org_id)
    return project


def update_project(db: Session, tenant: Tenant, project_id: int, data: ProjectUpdate) -> Project:
    project = get_project(db, tenant, project_id)
    for field, value in data.model_dump(exclude_unset=True, exclude_none=True).items():
        setattr(project, field, value)
    db.flush()
    invalidate_stats(tenant.org_id)
    return project


def delete_project(db: Session, tenant: Tenant, project_id: int) -> None:
    db.delete(get_project(db, tenant, project_id))
    db.flush()
    invalidate_stats(tenant.org_id)
