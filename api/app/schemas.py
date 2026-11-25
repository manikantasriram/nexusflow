"""Request and response shapes (the API contract). FastAPI validates input against these and
documents them at /docs."""

import math
from datetime import date, datetime
from typing import Annotated

from pydantic import (
    BaseModel,
    BeforeValidator,
    ConfigDict,
    EmailStr,
    Field,
    StringConstraints,
    field_validator,
)

from app.models import Priority, Role, TaskStatus

Name = Annotated[str, StringConstraints(strip_whitespace=True, min_length=2, max_length=100)]
Title = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]
# Upper-cased *before* the pattern check, so "web" is accepted as "WEB".
ProjectKey = Annotated[
    str,
    BeforeValidator(lambda v: v.strip().upper() if isinstance(v, str) else v),
    StringConstraints(pattern=r"^[A-Z][A-Z0-9]{1,9}$"),
]
Password = Annotated[str, Field(min_length=8, max_length=128)]


class ORM(BaseModel):
    model_config = ConfigDict(from_attributes=True)


# --- users, auth, organizations ---------------------------------------------------------------


class UserOut(ORM):
    id: int
    email: str
    full_name: str


class OrgOut(ORM):
    id: int
    name: str
    slug: str


class MembershipOut(ORM):
    organization: OrgOut
    role: Role


class MeOut(BaseModel):
    user: UserOut
    memberships: list[MembershipOut]


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int


class RegisterIn(BaseModel):
    email: EmailStr
    password: Password
    full_name: Name
    organization_name: Name


class LoginIn(BaseModel):
    email: EmailStr
    password: Annotated[str, Field(min_length=1, max_length=128)]


class OrgIn(BaseModel):
    name: Name


class MemberOut(BaseModel):
    user: UserOut
    role: Role
    joined_at: datetime


class MemberAddIn(BaseModel):
    email: EmailStr
    role: Role = Role.MEMBER


class MemberRoleIn(BaseModel):
    role: Role


# --- projects ---------------------------------------------------------------------------------


class ProjectIn(BaseModel):
    name: Name
    key: ProjectKey
    description: Annotated[str, Field(max_length=2000)] = ""


class ProjectUpdate(BaseModel):
    name: Name | None = None
    description: Annotated[str, Field(max_length=2000)] | None = None


class ProjectOut(ORM):
    id: int
    name: str
    key: str
    description: str
    created_at: datetime
    task_count: int = 0
    done_count: int = 0


# --- tasks ------------------------------------------------------------------------------------


class TaskIn(BaseModel):
    title: Title
    description: Annotated[str, Field(max_length=10_000)] = ""
    status: TaskStatus = TaskStatus.TODO
    priority: Priority = Priority.MEDIUM
    assignee_id: int | None = None
    due_date: date | None = None


class TaskUpdate(BaseModel):
    """Only the fields sent are changed. Send `"assignee_id": null` to unassign."""

    title: Title | None = None
    description: Annotated[str, Field(max_length=10_000)] | None = None
    status: TaskStatus | None = None
    priority: Priority | None = None
    assignee_id: int | None = None
    due_date: date | None = None


class TaskMoveIn(BaseModel):
    status: TaskStatus
    # Where to put the card in the target column: 0 is the top. Past the end means "last".
    index: Annotated[int, Field(ge=0)]


class TaskOut(ORM):
    id: int
    key: str
    number: int
    project_id: int
    title: str
    description: str
    status: TaskStatus
    priority: Priority
    assignee_id: int | None
    due_date: date | None
    position: float
    created_at: datetime
    updated_at: datetime
    completed_at: datetime | None

    @field_validator("position")
    @classmethod
    def finite(cls, v: float) -> float:
        return v if math.isfinite(v) else 0.0


# --- dashboard --------------------------------------------------------------------------------


class ProjectProgress(BaseModel):
    id: int
    name: str
    key: str
    total: int
    done: int


class StatsOut(BaseModel):
    total_tasks: int
    by_status: dict[TaskStatus, int]
    by_priority: dict[Priority, int]
    overdue: int
    due_this_week: int
    completed_last_7_days: int
    projects: list[ProjectProgress]
    generated_at: datetime
    cached: bool = False


# --- documents --------------------------------------------------------------------------------


class DocumentSummaryOut(ORM):
    id: int
    project_id: int
    filename: str
    content_type: str
    size_bytes: int
    word_count: int
    keywords: list[str]
    created_at: datetime


class DocumentOut(DocumentSummaryOut):
    summary: str
    action_items: list[str]
    text_preview: str


class DocTasksIn(BaseModel):
    items: Annotated[list[Title], Field(min_length=1, max_length=20)]
