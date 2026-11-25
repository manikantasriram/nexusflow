"""Demo data: two organizations, four people with different roles, three projects, ~45 tasks and
one analysed document. Run with `python -m app.seed`. It only seeds an empty database, so
running it on every container start is safe.

Demo sign-ins (password for all: demo-pass-123):
  owner@demo.nexusflow.dev   owner of Acme Robotics, and a member of Globex Labs
  admin@demo.nexusflow.dev   admin of Acme Robotics
  member@demo.nexusflow.dev  member of Acme Robotics
  other@demo.nexusflow.dev   owner of Globex Labs only (can't see anything in Acme)
"""

import random
from datetime import UTC, date, datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db import SessionLocal
from app.deps import Tenant
from app.models import Membership, Priority, Role, TaskStatus, User
from app.schemas import ProjectIn, TaskIn
from app.security import hash_password
from app.services.documents import upload_document
from app.services.orgs import create_organization
from app.services.projects import create_project
from app.services.tasks import create_task

DEMO_PASSWORD = "demo-pass-123"

PEOPLE = [
    ("owner@demo.nexusflow.dev", "Asha Rao"),
    ("admin@demo.nexusflow.dev", "Ben Carter"),
    ("member@demo.nexusflow.dev", "Chen Wei"),
    ("other@demo.nexusflow.dev", "Olivia Grant"),
]

PROJECTS = {
    ("Website relaunch", "WEB", "New marketing site with a faster checkout."): [
        "Audit current page speed",
        "Design new pricing page",
        "Migrate blog posts",
        "Set up redirects for old URLs",
        "Accessibility pass on forms",
        "Write launch announcement",
        "Add cookie consent banner",
        "Hook up analytics events",
        "Fix layout shift on hero image",
        "Translate landing page to German",
        "Load test checkout",
        "Review copy with legal",
        "Compress product images",
        "Add structured data for products",
        "Plan launch-day rollback",
    ],
    ("Mobile app v2", "MOB", "Offline mode, push notifications and a redesigned home screen."): [
        "Offline sync for task lists",
        "Push notification permissions flow",
        "Redesign home screen",
        "Crash on login with expired token",
        "Dark mode colours",
        "App store screenshots",
        "Deep links from email",
        "Biometric sign-in",
        "Reduce cold start time",
        "Beta feedback triage",
        "Security review before launch",
        "Update privacy labels",
        "Tablet layout",
        "Haptics on drag and drop",
        "Release notes for 2.0",
    ],
    ("Platform & infra", "OPS", "Keep everything fast, safe and observable."): [
        "Rotate database credentials",
        "Add p95 latency alert",
        "Move backups to a second region",
        "Upgrade PostgreSQL",
        "Rate limit public endpoints",
        "Document on-call runbook",
        "Cut CI time below five minutes",
        "Set up staging environment",
        "Enable Redis persistence",
        "Audit IAM permissions",
        "Add health checks to every service",
        "Clean up unused buckets",
        "Cost report for last quarter",
        "Trace slow dashboard queries",
        "Patch base container images",
    ],
}

MEETING_NOTES = """# Mobile app v2 launch sync

The launch of the mobile app moves to the second week of March so offline sync can ship with it.
Offline sync is the biggest risk: conflicts must be resolved without losing anyone's edits.
The beta group reported that push notifications arrive late on some Android phones.
Security wants a final review of token storage on the device before the launch.
Marketing will prepare app store screenshots once the redesigned home screen is final.

- [ ] Book the security review of on-device token storage
- [ ] Reproduce late push notifications on Android 15
TODO: Write the conflict-resolution rules for offline sync
Action item: Share final home screen designs with marketing
"""


def seed(db: Session) -> bool:
    if (db.scalar(select(func.count()).select_from(User)) or 0) > 0:
        return False
    rng = random.Random(42)
    today = datetime.now(UTC).date()

    users = []
    for email, name in PEOPLE:
        user = User(email=email, full_name=name, hashed_password=hash_password(DEMO_PASSWORD))
        db.add(user)
        users.append(user)
    db.flush()
    asha, ben, chen, olivia = users

    acme = create_organization(db, asha, "Acme Robotics")
    db.add_all(
        [
            Membership(organization_id=acme.id, user_id=ben.id, role=Role.ADMIN),
            Membership(organization_id=acme.id, user_id=chen.id, role=Role.MEMBER),
        ]
    )
    globex = create_organization(db, olivia, "Globex Labs")
    db.add(Membership(organization_id=globex.id, user_id=asha.id, role=Role.MEMBER))
    db.flush()

    acme_tenant = Tenant(org_id=acme.id, user=asha, role=Role.OWNER)
    statuses = (
        [TaskStatus.TODO] * 4
        + [TaskStatus.IN_PROGRESS] * 3
        + [TaskStatus.IN_REVIEW] * 2
        + [TaskStatus.DONE] * 3
    )
    priorities = [Priority.LOW, Priority.MEDIUM, Priority.MEDIUM, Priority.HIGH, Priority.URGENT]
    projects = {}
    for (name, key, description), titles in PROJECTS.items():
        project = create_project(db, acme_tenant, ProjectIn(name=name, key=key, description=description))
        projects[key] = project
        for title in titles:
            due: date | None = today + timedelta(days=rng.randint(-6, 21)) if rng.random() < 0.7 else None
            create_task(
                db,
                acme_tenant,
                project.id,
                TaskIn(
                    title=title,
                    status=rng.choice(statuses),
                    priority=rng.choice(priorities),
                    assignee_id=rng.choice([asha.id, ben.id, chen.id, None]),
                    due_date=due,
                ),
            )

    upload_document(
        db, acme_tenant, projects["MOB"].id, "launch-sync-notes.md", "text/markdown", MEETING_NOTES.encode()
    )

    globex_tenant = Tenant(org_id=globex.id, user=olivia, role=Role.OWNER)
    lab = create_project(
        db, globex_tenant, ProjectIn(name="Lab notebook", key="LAB", description="Globex only.")
    )
    for title in ("Calibrate sensors", "Order reagents", "Write weekly report"):
        create_task(db, globex_tenant, lab.id, TaskIn(title=title, assignee_id=olivia.id))

    db.commit()
    return True


if __name__ == "__main__":
    with SessionLocal() as session:
        print("Seeded demo data." if seed(session) else "Database already has data; nothing seeded.")
