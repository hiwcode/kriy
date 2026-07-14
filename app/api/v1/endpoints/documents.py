"""Document upload and management.

Two ways to add a document:
1. Upload files (up to 5 at once, max 5 MB each) → stored in DO Spaces under docs/
2. Register a URL → external reference (S3, public URL, etc.)

Documents are scoped to an agent — docs uploaded for one agent are not visible to another.
"""

from __future__ import annotations

import io
import os
import uuid
from typing import List

import asyncpg
from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File, Form, status
from pydantic import BaseModel

from app.core.security import AuthContext, api_key_auth, require_google_auth
from app.core.access import require_resource_access
from app.core import storage
from app.core.net_guard import is_public_url
from app.deps import get_db, get_current_workspace
from app.repositories import document_repo
from app.schemas.response import ApiResponse, Pagination
from app.services import agent_service


async def _require_agent_access(agent_id: int, pool: asyncpg.Pool, auth: AuthContext) -> dict:
    """404 unless the caller can access this agent (mirrors agents.py)."""
    agent = await agent_service.get_agent(pool, agent_id)
    if not agent:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Agent not found")
    await require_resource_access(agent, pool, auth)
    return agent

router = APIRouter(
    prefix="/documents",
    tags=["documents"],
    dependencies=[Depends(api_key_auth)],
)

MAX_FILE_SIZE = 5 * 1024 * 1024  # 5 MB per file
MAX_FILES = 5


@router.post("/upload", response_model=ApiResponse, status_code=status.HTTP_201_CREATED)
async def upload_documents(
    files: List[UploadFile] = File(...),
    agent_id: int = Form(...),
    session_id: str = Form(""),
    pool: asyncpg.Pool = Depends(get_db),
    auth: AuthContext = Depends(require_google_auth),
    workspace: dict | None = Depends(get_current_workspace),
) -> dict:
    """Upload up to 5 documents (max 5 MB each) for a specific agent."""
    if not storage.is_configured():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Document storage is not configured. Set SPACES_REGION, SPACES_ACCESS_KEY, SPACES_SECRET_KEY, and SPACES_BUCKET.",
        )

    if len(files) > MAX_FILES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Too many files. Maximum is {MAX_FILES} at once.",
        )

    await _require_agent_access(agent_id, pool, auth)
    ws_id = workspace["id"] if workspace else None
    uploaded = []

    for file in files:
        content = await file.read()
        if len(content) > MAX_FILE_SIZE:
            raise HTTPException(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                detail=f"'{file.filename}' is too large ({len(content) // 1024} KB). Maximum is {MAX_FILE_SIZE // (1024 * 1024)} MB per file.",
            )

        # Neutralize content that would execute if served inline (stored XSS /
        # MIME-sniffing). Presigned downloads echo the stored content-type.
        raw_type = file.content_type or "application/octet-stream"
        _DANGEROUS = {"text/html", "application/xhtml+xml", "image/svg+xml", "application/xml", "text/xml"}
        safe_type = "application/octet-stream" if raw_type.lower() in _DANGEROUS else raw_type

        safe_name = os.path.basename(file.filename or "upload") or "upload"
        key = f"{ws_id or 'personal'}/{agent_id}/{uuid.uuid4().hex[:12]}/{safe_name}"
        storage.upload_file(key, io.BytesIO(content), content_type=safe_type)

        doc = await document_repo.create(
            pool,
            name=safe_name,
            mime_type=safe_type,
            size_bytes=len(content),
            bucket_key=f"docs/{key}",
            agent_id=agent_id,
            session_id=session_id or None,
            user_id=auth.user_id,
            workspace_id=ws_id,
        )
        # Include a viewable URL so the chat can show a clickable attachment chip.
        doc = dict(doc)
        try:
            doc["download_url"] = storage.get_presigned_url(doc["bucket_key"])
        except Exception:
            doc["download_url"] = None
        uploaded.append(doc)

    return {
        "success": True,
        "message": f"{len(uploaded)} document(s) uploaded",
        "data": uploaded,
        "pagination": None,
    }


class DocumentUrlInput(BaseModel):
    url: str
    name: str = ""
    mime_type: str = "application/octet-stream"
    agent_id: int


@router.post("/register-url", response_model=ApiResponse, status_code=status.HTTP_201_CREATED)
async def register_document_url(
    data: DocumentUrlInput,
    pool: asyncpg.Pool = Depends(get_db),
    auth: AuthContext = Depends(require_google_auth),
    workspace: dict | None = Depends(get_current_workspace),
) -> dict:
    """Register an external document URL for a specific agent."""
    await _require_agent_access(data.agent_id, pool, auth)
    if not is_public_url(data.url):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="URL must be a public http(s) address (internal/loopback addresses are blocked).",
        )
    ws_id = workspace["id"] if workspace else None
    name = data.name or data.url.rsplit("/", 1)[-1] or "document"
    doc = await document_repo.create(
        pool,
        name=name,
        mime_type=data.mime_type,
        size_bytes=0,
        url=data.url,
        agent_id=data.agent_id,
        user_id=auth.user_id,
        workspace_id=ws_id,
    )
    return {"success": True, "message": "Document URL registered", "data": doc, "pagination": None}


@router.get("", response_model=ApiResponse)
async def list_documents(
    agent_id: int = Query(...),
    session_id: str | None = Query(None),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    pool: asyncpg.Pool = Depends(get_db),
    auth: AuthContext = Depends(require_google_auth),
) -> dict:
    """List documents for an agent, optionally scoped to a session.

    Each doc includes a viewable `download_url` so the chat can re-render
    attachment chips after a reload.
    """
    await _require_agent_access(agent_id, pool, auth)
    if session_id:
        docs = await document_repo.list_for_session(pool, agent_id, session_id, limit=limit)
        total = len(docs)
    else:
        docs = await document_repo.list_for_agent(pool, agent_id, limit=limit, offset=offset)
        total = await document_repo.count_for_agent(pool, agent_id)
    out = []
    for d in docs:
        d = dict(d)
        if d.get("bucket_key"):
            try:
                d["download_url"] = storage.get_presigned_url(d["bucket_key"])
            except Exception:
                d["download_url"] = None
        else:
            d["download_url"] = d.get("url")
        out.append(d)
    return {
        "success": True,
        "message": "Documents fetched",
        "data": out,
        "pagination": Pagination(limit=limit, offset=offset, total=total, page=1, page_size=limit),
    }


@router.get("/{doc_id}", response_model=ApiResponse)
async def get_document(
    doc_id: int,
    pool: asyncpg.Pool = Depends(get_db),
    auth: AuthContext = Depends(require_google_auth),
) -> dict:
    doc = await document_repo.get(pool, doc_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    await require_resource_access(doc, pool, auth, created_by_field="user_id")
    if doc.get("bucket_key"):
        try:
            doc["download_url"] = storage.get_presigned_url(doc["bucket_key"])
        except Exception:
            doc["download_url"] = None
    else:
        doc["download_url"] = doc.get("url")
    return {"success": True, "message": "Document fetched", "data": doc, "pagination": None}


@router.delete("/{doc_id}", response_model=ApiResponse)
async def delete_document(
    doc_id: int,
    pool: asyncpg.Pool = Depends(get_db),
    auth: AuthContext = Depends(require_google_auth),
) -> dict:
    doc = await document_repo.get(pool, doc_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    await require_resource_access(doc, pool, auth, created_by_field="user_id")
    if doc.get("bucket_key"):
        storage.delete_file(doc["bucket_key"])
    await document_repo.delete(pool, doc_id)
    return {"success": True, "message": "Document deleted", "data": None, "pagination": None}


# ---------------------------------------------------------------------------
# Local-disk dev fallback: serve uploads stored under ./bucket when Spaces is
# not configured. Unauthenticated but gated by an HMAC signature over the key
# (minted in storage.get_presigned_url), so <img>/download links work in dev.
# ---------------------------------------------------------------------------
import mimetypes

from fastapi import Response

local_files_router = APIRouter(prefix="/documents", tags=["documents"])

_ACTIVE_EXTS = {".html", ".htm", ".svg", ".xml", ".xhtml"}


@local_files_router.get("/local/{key:path}")
async def serve_local_document(key: str, sig: str | None = Query(default=None)):
    from app.core import workspace_signing

    if not workspace_signing.verify_path(key, sig):
        raise HTTPException(status_code=403, detail="Invalid or missing signature")
    try:
        data = storage.download_bytes(key)
    except Exception:
        raise HTTPException(status_code=404, detail="File not found")

    ext = os.path.splitext(key)[1].lower()
    if ext in _ACTIVE_EXTS:
        # never render active content inline (stored-XSS guard)
        return Response(content=data, media_type="application/octet-stream",
                        headers={"Content-Disposition": "attachment"})
    media_type = mimetypes.guess_type(key)[0] or "application/octet-stream"
    return Response(content=data, media_type=media_type)
