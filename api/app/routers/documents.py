"""Project documents and their analysis."""

from fastapi import APIRouter, Response, UploadFile

from app.config import get_settings
from app.deps import DB, OrgMember
from app.schemas import DocTasksIn, DocumentOut, DocumentSummaryOut, TaskOut
from app.services import documents

router = APIRouter(prefix="/api/orgs/{org_id}", tags=["documents"])


@router.get("/projects/{project_id}/documents")
def list_documents(project_id: int, tenant: OrgMember, db: DB) -> list[DocumentSummaryOut]:
    return [DocumentSummaryOut.model_validate(d) for d in documents.list_documents(db, tenant, project_id)]


@router.post("/projects/{project_id}/documents", status_code=201)
def upload_document(project_id: int, file: UploadFile, tenant: OrgMember, db: DB) -> DocumentOut:
    # Read one byte past the limit: enough to know the file is too big without reading all of it.
    data = file.file.read(get_settings().max_upload_bytes + 1)
    doc = documents.upload_document(
        db, tenant, project_id, file.filename or "document.txt", file.content_type or "", data
    )
    db.commit()
    return documents.document_out(doc)


@router.get("/documents/{doc_id}")
def get_document(doc_id: int, tenant: OrgMember, db: DB) -> DocumentOut:
    return documents.document_out(documents.get_document(db, tenant, doc_id))


@router.delete("/documents/{doc_id}", status_code=204)
def delete_document(doc_id: int, tenant: OrgMember, db: DB) -> Response:
    documents.delete_document(db, tenant, doc_id)
    db.commit()
    return Response(status_code=204)


@router.post("/documents/{doc_id}/tasks", status_code=201)
def create_tasks(doc_id: int, data: DocTasksIn, tenant: OrgMember, db: DB) -> list[TaskOut]:
    created = documents.tasks_from_document(db, tenant, doc_id, data.items)
    db.commit()
    return [TaskOut.model_validate(t) for t in created]
