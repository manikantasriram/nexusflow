"""Measure the main task queries with and without their indexes.

    python -m app.bench --tasks 100000          # seed (once) and measure with indexes
    python -m app.bench --tasks 100000 --compare  # also measure with the indexes dropped

Run it against PostgreSQL (DATABASE_URL) for numbers worth quoting. It creates its own
"bench" organization, so it never touches demo or real data, and it puts the indexes back
afterwards. The printed Markdown table can go straight into the README.
"""

import argparse
import random
import statistics
import time
from datetime import UTC, date, datetime, timedelta

from sqlalchemy import Engine, func, insert, select, text
from sqlalchemy.orm import Session

from app.db import SessionLocal, engine
from app.models import Membership, Organization, Priority, Project, Role, Task, TaskStatus, User
from app.security import hash_password

BENCH_SLUG = "bench-org"
INDEXES = {
    "ix_tasks_board": "organization_id, project_id, status, position",
    "ix_tasks_assignee": "organization_id, assignee_id, status",
    "ix_tasks_due": "organization_id, due_date",
}
N_PROJECTS = 20
N_USERS = 10
N_NOISE_ORGS = 4  # other tenants' rows, so the organization filter has something to skip


def _seed(db: Session, n_tasks: int) -> tuple[int, int, int]:
    """Returns (org_id, a project id, a user id) for the queries."""
    org = db.scalar(select(Organization).where(Organization.slug == BENCH_SLUG))
    if org is None:
        print(f"Seeding {n_tasks:,} tasks per organization x {N_NOISE_ORGS + 1} organizations...")
        hashed = hash_password("bench-password-0")
        rng = random.Random(7)
        today = date.today()
        statuses, priorities = list(TaskStatus), list(Priority)
        for o in range(N_NOISE_ORGS + 1):
            slug = BENCH_SLUG if o == 0 else f"{BENCH_SLUG}-noise-{o}"
            new_org = Organization(name=slug, slug=slug)
            db.add(new_org)
            db.flush()
            users = [
                User(
                    email=f"bench{o}-{i}@bench.nexusflow.dev", full_name=f"Bench {i}", hashed_password=hashed
                )
                for i in range(N_USERS)
            ]
            db.add_all(users)
            db.flush()
            db.add_all(Membership(organization_id=new_org.id, user_id=u.id, role=Role.MEMBER) for u in users)
            projects = [
                Project(organization_id=new_org.id, name=f"P{p}", key=f"P{p}", description="")
                for p in range(N_PROJECTS)
            ]
            db.add_all(projects)
            db.flush()
            rows, number = [], dict.fromkeys((p.id for p in projects), 0)
            for i in range(n_tasks):
                project = projects[i % N_PROJECTS]
                number[project.id] += 1
                status = rng.choice(statuses)
                rows.append(
                    {
                        "organization_id": new_org.id,
                        "project_id": project.id,
                        "number": number[project.id],
                        "title": f"Task {i}",
                        "description": "",
                        "status": status,
                        "priority": rng.choice(priorities),
                        "assignee_id": rng.choice(users).id if rng.random() < 0.8 else None,
                        "due_date": today + timedelta(days=rng.randint(-60, 60))
                        if rng.random() < 0.6
                        else None,
                        "position": float(i),
                        "completed_at": datetime.now(UTC) if status == TaskStatus.DONE else None,
                    }
                )
                if len(rows) == 5000:
                    db.execute(insert(Task), rows)
                    rows = []
            if rows:
                db.execute(insert(Task), rows)
            for p in projects:
                p.task_counter = number[p.id]
            db.commit()
        org = db.scalar(select(Organization).where(Organization.slug == BENCH_SLUG))
        _analyze(engine)
    assert org is not None
    project_id = db.scalar(select(Project.id).where(Project.organization_id == org.id).order_by(Project.id))
    user_id = db.scalar(
        select(Membership.user_id).where(Membership.organization_id == org.id).order_by(Membership.id)
    )
    return org.id, project_id, user_id  # type: ignore[return-value]


def _analyze(eng: Engine) -> None:
    with eng.begin() as conn:
        conn.execute(text("ANALYZE"))  # fresh planner statistics (works on PostgreSQL and SQLite)


def _queries(org_id: int, project_id: int, user_id: int) -> dict[str, object]:
    today = date.today()
    return {
        "Board (one project, by column)": select(Task.id)
        .where(Task.organization_id == org_id, Task.project_id == project_id)
        .order_by(Task.status, Task.position)
        .limit(1000),
        "Assigned to me (open)": select(Task.id)
        .where(Task.organization_id == org_id, Task.assignee_id == user_id, Task.status != TaskStatus.DONE)
        .limit(50),
        "Overdue count": select(func.count())
        .select_from(Task)
        .where(Task.organization_id == org_id, Task.due_date < today, Task.status != TaskStatus.DONE),
    }


def _measure(queries: dict[str, object], runs: int) -> dict[str, tuple[float, float]]:
    results = {}
    with engine.connect() as conn:
        for name, query in queries.items():
            conn.execute(query).all()  # warm-up
            times = []
            for _ in range(runs):
                start = time.perf_counter()
                conn.execute(query).all()
                times.append((time.perf_counter() - start) * 1000)
            times.sort()
            results[name] = (statistics.median(times), times[int(len(times) * 0.95) - 1])
    return results


def _set_indexes(present: bool) -> None:
    with engine.begin() as conn:
        for name, columns in INDEXES.items():
            if present:
                conn.execute(text(f"CREATE INDEX IF NOT EXISTS {name} ON tasks ({columns})"))
            else:
                conn.execute(text(f"DROP INDEX IF EXISTS {name}"))
    _analyze(engine)


def main() -> None:
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument("--tasks", type=int, default=100_000, help="tasks per organization (default 100000)")
    parser.add_argument("--runs", type=int, default=30, help="timed runs per query (default 30)")
    parser.add_argument("--compare", action="store_true", help="also measure with the indexes dropped")
    args = parser.parse_args()

    with SessionLocal() as db:
        ids = _seed(db, args.tasks)
        total = db.scalar(select(func.count()).select_from(Task))
    queries = _queries(*ids)
    print(f"Database: {engine.dialect.name} · {total:,} tasks in total · {args.runs} runs per query\n")

    before = None
    if args.compare:
        _set_indexes(False)
        try:
            before = _measure(queries, args.runs)
        finally:
            _set_indexes(True)
    after = _measure(queries, args.runs)

    if before:
        print("| Query | Without indexes p50 / p95 (ms) | With indexes p50 / p95 (ms) |")
        print("|---|---|---|")
        for name in queries:
            b, a = before[name], after[name]
            print(f"| {name} | {b[0]:.2f} / {b[1]:.2f} | {a[0]:.2f} / {a[1]:.2f} |")
    else:
        print("| Query | p50 (ms) | p95 (ms) |")
        print("|---|---|---|")
        for name, (p50, p95) in after.items():
            print(f"| {name} | {p50:.2f} | {p95:.2f} |")


if __name__ == "__main__":
    main()
