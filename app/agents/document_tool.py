"""Document tools for agents — list, read, and extract text from uploaded documents.

Documents are scoped per-agent. Each agent only sees its own uploads.
For PDFs/text, extracts and returns the text content.
For images (and deeper document understanding), use the `analyze` tools
(analyze_image / analyze_document), which run vision-based analysis.
"""

from __future__ import annotations

import json
import logging

import asyncpg
from google.adk.tools import FunctionTool

from app.repositories import document_repo

logger = logging.getLogger(__name__)


def make_document_tools(pool: asyncpg.Pool, workspace_id: int | None = None, agent_id: int | None = None, session_id: str | None = None) -> list[FunctionTool]:
    """Create document tools scoped to a specific agent + session."""

    async def list_documents(limit: int = 20) -> str:
        """List uploaded documents for the current session.

        Returns document names, types, sizes, and IDs. Use the ID with
        get_document or extract_document_text to read content.

        Args:
            limit: Maximum number of documents to return (default 20).
        """
        if not agent_id:
            return json.dumps({"error": "No agent context"})
        # Session-scoped: this session's uploads + agent-level (shared) docs.
        docs = await document_repo.list_for_session(pool, agent_id, session_id, limit=limit)
        items = []
        for d in docs:
            items.append({
                "id": d["id"],
                "name": d["name"],
                "mime_type": d["mime_type"],
                "size_bytes": d["size_bytes"],
                "created_at": str(d.get("created_at")),
            })
        return json.dumps({"documents": items, "total": len(items)})

    async def get_document(document_id: int) -> str:
        """Get document details and a download URL.

        Args:
            document_id: The document ID from list_documents.
        """
        doc = await document_repo.get(pool, document_id)
        if not doc or not document_repo.is_visible(doc, agent_id, session_id):
            return json.dumps({"error": "Document not found"})

        result = {
            "id": doc["id"],
            "name": doc["name"],
            "mime_type": doc["mime_type"],
            "size_bytes": doc["size_bytes"],
            "source": "uploaded" if doc.get("bucket_key") else "url",
            "created_at": str(doc.get("created_at")),
        }
        if doc.get("bucket_key"):
            from app.core import storage
            try:
                result["download_url"] = storage.get_presigned_url(doc["bucket_key"])
            except Exception:
                result["download_url"] = None
        else:
            result["download_url"] = doc.get("url")

        return json.dumps(result, default=str)

    async def extract_document_text(document_id: int) -> str:
        """Extract and return the raw text of a document.

        For PDFs and text files: returns the extracted text.
        For images: there is no text to extract — use the analyze_image tool instead.

        Args:
            document_id: The document ID from list_documents.
        """
        doc = await document_repo.get(pool, document_id)
        if not doc or not document_repo.is_visible(doc, agent_id, session_id):
            return json.dumps({"error": "Document not found"})

        mime = doc["mime_type"]

        # Images have no extractable text — defer to the vision-based analyze tool.
        if mime.startswith("image/"):
            return json.dumps({
                "document": doc["name"],
                "type": "image",
                "mime_type": mime,
                "note": "This is an image — there is no text to extract. Use the analyze_image tool to describe it or read text from it via vision.",
            })

        # For PDFs and text, download and extract
        try:
            raw = await _download_doc(doc)
        except Exception as e:
            return json.dumps({"error": f"Failed to download document: {e}"})

        if mime == "application/pdf":
            text = _extract_pdf(raw)
        elif mime.startswith("text/") or mime in ("application/json", "application/xml", "text/csv"):
            text = raw.decode("utf-8", errors="replace")
        else:
            text = f"[Unsupported file type for text extraction: {mime}]"

        return json.dumps({
            "document": doc["name"],
            "type": "text",
            "text": text,
        })

    return [
        FunctionTool(func=list_documents),
        FunctionTool(func=get_document),
        FunctionTool(func=extract_document_text),
    ]


async def _download_doc(doc: dict) -> bytes:
    """Download document bytes from Spaces or external URL."""
    if doc.get("bucket_key"):
        from app.core import storage
        return storage.download_bytes(doc["bucket_key"])
    if doc.get("url"):
        import httpx
        from app.core.net_guard import assert_public_url
        assert_public_url(doc["url"])  # SSRF guard: block internal/metadata hosts
        async with httpx.AsyncClient(timeout=60, follow_redirects=False) as client:
            resp = await client.get(doc["url"])
            resp.raise_for_status()
            return resp.content
    raise ValueError("Document has no bucket_key or URL")


def _extract_pdf(data: bytes) -> str:
    try:
        import pdfplumber
        import io
        text_parts = []
        with pdfplumber.open(io.BytesIO(data)) as pdf:
            for page in pdf.pages:
                page_text = page.extract_text()
                if page_text:
                    text_parts.append(page_text)
        return "\n\n".join(text_parts) if text_parts else "[No text found in PDF]"
    except ImportError:
        return "[PDF extraction requires pdfplumber — install it: pip install pdfplumber]"
    except Exception as e:
        return f"[PDF extraction failed: {e}]"
