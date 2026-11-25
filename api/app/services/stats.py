"""Dashboard numbers for one organization, cached.

The dashboard runs several aggregate queries over every task in the organization. They are
computed once, stored in the cache for STATS_CACHE_SECONDS, and thrown away as soon as any task
or project in that organization changes, so the numbers are never stale for long.
"""

import logging
from datetime import UTC, date, datetime, timedelta

from sqlalchemy import case, func, select
from sqlalchemy.orm import Session

from app.cache import get_cache
from app.config import get_settings
from app.models import Priority, Project, Task, TaskStatus
from app.schemas import ProjectProgress, StatsOut

log = logging.getLogger(__name__)


def _key(org_id: int) -> str:
    return f"stats:v1:org:{org_id}"


def invalidate_stats(org_id: int) -> None:
    try:
        get_cache().delete(_key(org_id))
    except Exception:  # a cache outage must never break a write
        log.warning("could not invalidate stats cache for org %s", org_id, exc_info=True)


def compute_stats(db: Session, org_id: int, today: date | None = None) -> StatsOut:
    today = today or datetime.now(UTC).date()
    in_org = Task.organization_id == org_id
    open_ = Task.status != TaskStatus.DONE

    by_status = {s: 0 for s in TaskStatus}
    for status, n in db.execute(select(Task.status, func.count()).where(in_org).group_by(Task.status)):
        by_status[status] = n
    by_priority = {p: 0 for p in Priority}
    for priority, n in db.execute(
        select(Task.priority, func.count()).where(in_org, open_).group_by(Task.priority)
    ):
        by_priority[priority] = n

    def count(*where) -> int:
        return db.scalar(select(func.count()).select_from(Task).where(in_org, *where)) or 0

    done = func.coalesce(func.sum(case((Task.status == TaskStatus.DONE, 1), else_=0)), 0)
    projects = [
        ProjectProgress(id=pid, name=name, key=key, total=int(total), done=int(d))
        for pid, name, key, total, d in db.execute(
            select(Project.id, Project.name, Project.key, func.count(Task.id), done)
            .outerjoin(Task, Task.project_id == Project.id)
            .where(Project.organization_id == org_id)
            .group_by(Project.id, Project.name, Project.key)
            .order_by(Project.name)
        )
    ]
    return StatsOut(
        total_tasks=sum(by_status.values()),
        by_status=by_status,
        by_priority=by_priority,
        overdue=count(open_, Task.due_date < today),
        due_this_week=count(open_, Task.due_date >= today, Task.due_date <= today + timedelta(days=7)),
        completed_last_7_days=count(Task.completed_at >= datetime.now(UTC) - timedelta(days=7)),
        projects=projects,
        generated_at=datetime.now(UTC),
    )


def get_stats(db: Session, org_id: int) -> StatsOut:
    cache = get_cache()
    try:
        hit = cache.get(_key(org_id))
    except Exception:
        log.warning("stats cache read failed; computing directly", exc_info=True)
        hit = None
    if hit:
        stats = StatsOut.model_validate_json(hit)
        stats.cached = True
        return stats
    stats = compute_stats(db, org_id)
    try:
        cache.set(_key(org_id), stats.model_dump_json(), get_settings().stats_cache_seconds)
    except Exception:
        log.warning("stats cache write failed", exc_info=True)
    return stats
