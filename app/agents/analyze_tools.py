"""Analyze tools for agents — deep analysis of uploaded documents and images.

Unlike the `documents` tools (which list docs and extract raw text), these send
the document/image to a vision-capable LLM and return an *analysis* or answer:

- analyze_document: summarize / answer a question about a PDF, text file, or image.
- analyze_image:   describe / OCR / inspect an image via vision.

Both are scoped to the current agent + session, exactly like the document tools.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os

import asyncpg
from google import genai
from google.adk.tools import FunctionTool
from google.genai import types

from app.core.config import settings
from app.core.net_guard import assert_public_url
from app.repositories import document_repo, user_config_repo

logger = logging.getLogger(__name__)


async def _download_doc(doc: dict) -> bytes:
    """Fetch a document's bytes from object storage (uploaded) or its URL."""
    if doc.get("bucket_key"):
        from app.core import storage
        return storage.download_bytes(doc["bucket_key"])
    if doc.get("url"):
        raw, _ = await _download_url(doc["url"])
        return raw
    raise ValueError("Document has no bucket_key or URL")


async def _download_url(url: str) -> tuple[bytes, str]:
    """Fetch bytes from an arbitrary URL (SSRF-guarded) and return (content, mime_type).
    The mime type comes from the response Content-Type header."""
    import httpx
    assert_public_url(url)  # SSRF guard: blocks metadata always, private/loopback in prod
    async with httpx.AsyncClient(timeout=60, follow_redirects=False) as client:
        resp = await client.get(url)
        resp.raise_for_status()
        mime = (resp.headers.get("content-type") or "").split(";")[0].strip() or "application/octet-stream"
        return resp.content, mime

# Gemini ingests these natively as a document/image part; everything else is
# decoded to text and inlined into the prompt.
_NATIVE_MIME_PREFIXES = ("image/", "application/pdf")
_MAX_INLINE_TEXT = 100_000


def _vision_model() -> str:
    model = str(settings.DEFAULT_MODEL or "")
    return model if model.startswith(("gemini", "models/gemini")) else "gemini-3.1-flash-lite"


async def _resolve_google_key(pool: asyncpg.Pool | None, user_id: int | None) -> str | None:
    """Resolve Google API key: user config > env. Mirrors memory_service."""
    if pool and user_id:
        cfg = await user_config_repo.get_config(pool, user_id)
        if cfg and cfg.get("google_api_key"):
            return cfg["google_api_key"]
    return settings.GOOGLE_API_KEY or os.environ.get("GOOGLE_API_KEY")


def make_analyze_tools(
    pool: asyncpg.Pool,
    user_id: int | None = None,
    workspace_id: int | None = None,
    agent_id: int | None = None,
    session_id: str | None = None,
) -> list[FunctionTool]:
    """Create analyze_document / analyze_image tools scoped to agent + session."""

    async def _load_scoped_doc(document_id: int) -> tuple[dict | None, str | None]:
        doc = await document_repo.get(pool, document_id)
        if not doc or not document_repo.is_visible(doc, agent_id, session_id):
            return None, json.dumps({"error": "Document not found"})
        return doc, None

    async def _list(images: bool, hint_tool: str) -> str:
        """List the docs the agent can see, filtered to images or non-images."""
        docs = await document_repo.list_for_session(pool, agent_id, session_id, limit=50)
        items = [
            {
                "id": d["id"],
                "name": d["name"],
                "mime_type": d["mime_type"],
                "source": "uploaded" if d.get("bucket_key") else "url",
            }
            for d in docs
            if d.get("mime_type", "").startswith("image/") == images
        ]
        return json.dumps({
            "documents": items,
            "total": len(items),
            "hint": f"Call {hint_tool} again with one of these `document_id`s to analyze it.",
        })

    async def _run_vision(raw: bytes, mime: str, name: str, instruction: str, default_prompt: str) -> str:
        api_key = await _resolve_google_key(pool, user_id)
        if not api_key:
            return json.dumps({"error": "No Google API key configured for analysis"})

        prompt = instruction.strip() if instruction and instruction.strip() else default_prompt
        if mime.startswith(_NATIVE_MIME_PREFIXES):
            contents = [
                types.Part(inline_data=types.Blob(mime_type=mime, data=raw)),
                types.Part(text=prompt),
            ]
        else:
            text = raw.decode("utf-8", errors="replace")[:_MAX_INLINE_TEXT]
            contents = f"{prompt}\n\n--- Document: {name} ---\n{text}"

        try:
            client = genai.Client(api_key=api_key)
            # generate_content is sync; keep it off the event loop.
            response = await asyncio.to_thread(
                client.models.generate_content,
                model=_vision_model(),
                contents=contents,
            )
        except Exception as e:  # noqa: BLE001
            logger.warning("Document analysis failed: %s", e)
            return json.dumps({"error": f"Analysis failed: {e}"})

        return json.dumps({"document": name, "mime_type": mime, "analysis": response.text})

    async def _analyze(doc: dict, instruction: str, default_prompt: str) -> str:
        try:
            raw = await _download_doc(doc)
        except Exception as e:  # noqa: BLE001
            return json.dumps({"error": f"Failed to download document: {e}"})
        return await _run_vision(raw, doc["mime_type"], doc["name"], instruction, default_prompt)

    async def _analyze_url(url: str, instruction: str, default_prompt: str) -> str:
        try:
            raw, mime = await _download_url(url)
        except Exception as e:  # noqa: BLE001
            return json.dumps({"error": f"Failed to fetch URL: {e}"})
        return await _run_vision(raw, mime, url.rsplit("/", 1)[-1] or url, instruction, default_prompt)

    async def analyze_document(document_id: int = 0, url: str = "", instruction: str = "") -> str:
        """Work with documents (PDF, text, etc.) via a vision LLM.

        Three ways to call it:
        - No document_id and no url → LIST the documents available in this
          conversation, each with its `id`.
        - document_id → ANALYZE that registered/uploaded document.
        - url → FETCH and ANALYZE a document at an http(s) URL directly (e.g. a
          `file_url` from an event payload). Use this when the file lives in another
          app rather than in this workspace.

        Args:
            document_id: The document's id (from the list call). Omit to list.
            url: An http(s) URL to fetch and analyze instead of a document_id.
            instruction: What to do with the document — e.g. "Summarize the key
                points" or "What is the total on this invoice?". Defaults to a
                general summary.
        """
        if not agent_id:
            return json.dumps({"error": "No agent context"})
        if url and url.strip():
            return await _analyze_url(url.strip(), instruction, "Summarize this document and list its key points.")
        if not document_id:
            return await _list(images=False, hint_tool="analyze_document")
        doc, err = await _load_scoped_doc(document_id)
        if err:
            return err
        if doc["mime_type"].startswith("image/"):
            return json.dumps({
                "error": f"'{doc['name']}' is an image — use analyze_image instead."
            })
        return await _analyze(doc, instruction, "Summarize this document and list its key points.")

    async def analyze_image(document_id: int = 0, url: str = "", instruction: str = "") -> str:
        """Work with images via a vision LLM.

        Three ways to call it:
        - No document_id and no url → LIST the images available in this conversation.
        - document_id → ANALYZE that registered/uploaded image.
        - url → FETCH and ANALYZE an image at an http(s) URL directly (e.g. a
          `file_url` from an event payload). Use this when the image lives in
          another app rather than in this workspace.

        Args:
            document_id: The image's id (from the list call). Omit to list.
            url: An http(s) URL to fetch and analyze instead of a document_id.
            instruction: What to look for — e.g. "Describe this image", "Extract
                all text", "What objects are visible?". Defaults to a general
                description.
        """
        if not agent_id:
            return json.dumps({"error": "No agent context"})
        if url and url.strip():
            return await _analyze_url(url.strip(), instruction, "Describe this image in detail, including any visible text.")
        if not document_id:
            return await _list(images=True, hint_tool="analyze_image")
        doc, err = await _load_scoped_doc(document_id)
        if err:
            return err
        if not doc["mime_type"].startswith("image/"):
            return json.dumps({
                "error": f"'{doc['name']}' is not an image — use analyze_document instead."
            })
        return await _analyze(doc, instruction, "Describe this image in detail, including any visible text.")

    return [
        FunctionTool(func=analyze_document),
        FunctionTool(func=analyze_image),
    ]
