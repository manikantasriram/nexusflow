"""The FastAPI application: routers, CORS, error format and a health check."""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from app.cache import get_cache
from app.config import get_settings
from app.deps import DB
from app.errors import install_error_handlers
from app.routers import auth, documents, orgs, projects, tasks

app = FastAPI(
    title="NexusFlow API",
    version="0.1.0",
    description="Multi-tenant projects, Kanban tasks and document intelligence.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=get_settings().cors_origin_list,
    allow_credentials=True,  # the refresh-token cookie
    allow_methods=["GET", "POST", "PATCH", "DELETE"],
    allow_headers=["Authorization", "Content-Type", "X-Requested-With"],
)
install_error_handlers(app)

for module in (auth, orgs, projects, tasks, documents):
    app.include_router(module.router)


@app.get("/api/health", tags=["health"])
def health(db: DB) -> dict[str, str]:
    db.execute(text("SELECT 1"))
    return {"status": "ok", "database": "ok", "cache": "ok" if get_cache().ping() else "unavailable"}
