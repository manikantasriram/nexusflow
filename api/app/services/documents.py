"""Project documents: upload, analyse, list, and turn action items into tasks."""

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.deps import Tenant
from app.errors import AppError, not_found
from app.models import Document, Role, Task
from app.schemas import DocumentOut, DocumentSummaryOut, TaskIn
from app.services.projects import get_project
from app.services.tasks import create_task
from app.services.text_analysis import analyze, extract_text

PREVIEW_CHARS = 5000


def upload_document(
    db: Session, tenant: Tenant, project_id: int, filename: str, content_type: str, data: bytes
) -> Document:
    project = get_project(db, tenant, project_id)
    if len(data) > get_settings().max_upload_bytes:
        raise AppError(413, f"Files can be at most {get_settings().max_upload_bytes // 1_000_000} MB")
    if not data:
        raise AppError(422, "That file is empty", code="validation_error")
    text = extract_text(filename, content_type, data).replace("\x00", "")
    if not text.strip():
        raise AppError(422, "No readable text was found in that file", code="validation_error")
    result = analyze(text)
    doc = Document(
        organization_id=tenant.org_id,
        project_id=project.id,
        filename=filename[:255],
        content_type=(content_type or "application/octet-stream")[:100],
        size_bytes=len(data),
        text=text,
        word_count=result.word_count,
        summary=result.summary,
        keywords=result.keywords,
        action_items=result.action_items,
        uploaded_by_id=tenant.user.id,
    )
    db.add(doc)
    db.flush()
    return doc


def list_documents(db: Session, tenant: Tenant, project_id: int) -> list[Document]:
    get_project(db, tenant, project_id)
    return list(
        db.scalars(
            select(Document)
            .where(Document.organization_id == tenant.org_id, Document.project_id == project_id)
            .order_by(Document.created_at.desc(), Document.id.desc())
        )
    )


def get_document(db: Session, tenant: Tenant, doc_id: int) -> Document:
    doc = db.scalar(select(Document).where(Document.id == doc_id, Document.organization_id == tenant.org_id))
    if doc is None:
        raise not_found("Document")
    return doc


def document_out(doc: Document) -> DocumentOut:
    return DocumentOut(
        **DocumentSummaryOut.model_validate(doc).model_dump(),
        summary=doc.summary,
        action_items=doc.action_items,
        text_preview=doc.text[:PREVIEW_CHARS],
    )


def delete_document(db: Session, tenant: Tenant, doc_id: int) -> None:
    doc = get_document(db, tenant, doc_id)
    if doc.uploaded_by_id != tenant.user.id and not tenant.at_least(Role.ADMIN):
        raise AppError(403, "Only the uploader or an admin can delete this document")
    db.delete(doc)
    db.flush()


def tasks_from_document(db: Session, tenant: Tenant, doc_id: int, items: list[str]) -> list[Task]:
    doc = get_document(db, tenant, doc_id)
    description = f"Created from the document “{doc.filename}”."
    return [
        create_task(db, tenant, doc.project_id, TaskIn(title=item, description=description)) for item in items
    ]
