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
from app.repositories import document_repo, user_config_repo
from app.agents.document_tool import _download_doc

logger = logging.getLogger(__name__)

# Gemini ingests these natively as a document/image part; everything else is
# decoded to text and inlined into the prompt.
_NATIVE_MIME_PREFIXES = ("image/", "application/pdf")
_MAX_INLINE_TEXT = 100_000


def _vision_model() -> str:
    model = str(settings.DEFAULT_MODEL or "")
    return model if model.startswith(("gemini", "models/gemini")) else "gemini-2.0-flash"


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

    async def _analyze(doc: dict, instruction: str, default_prompt: str) -> str:
        api_key = await _resolve_google_key(pool, user_id)
        if not api_key:
            return json.dumps({"error": "No Google API key configured for analysis"})

        try:
            raw = await _download_doc(doc)
        except Exception as e:  # noqa: BLE001
            return json.dumps({"error": f"Failed to download document: {e}"})

        prompt = instruction.strip() if instruction and instruction.strip() else default_prompt
        mime = doc["mime_type"]

        if mime.startswith(_NATIVE_MIME_PREFIXES):
            contents = [
                types.Part(inline_data=types.Blob(mime_type=mime, data=raw)),
                types.Part(text=prompt),
            ]
        else:
            text = raw.decode("utf-8", errors="replace")[:_MAX_INLINE_TEXT]
            contents = f"{prompt}\n\n--- Document: {doc['name']} ---\n{text}"

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

        return json.dumps({
            "document": doc["name"],
            "mime_type": mime,
            "analysis": response.text,
        })

    async def analyze_document(document_id: int, instruction: str = "") -> str:
        """Analyze an uploaded document (PDF, text, or image) with a vision LLM.

        Sends the document to a vision-capable model and returns an analysis.
        Prefer this over extract_document_text when you need understanding,
        summarization, or an answer to a question — not just the raw text.

        Args:
            document_id: The document ID from list_documents.
            instruction: What to do with the document — e.g. "Summarize the key
                points" or "What is the total on this invoice?". Defaults to a
                general summary if omitted.
        """
        if not agent_id:
            return json.dumps({"error": "No agent context"})
        doc, err = await _load_scoped_doc(document_id)
        if err:
            return err
        return await _analyze(doc, instruction, "Summarize this document and list its key points.")

    async def analyze_image(document_id: int, instruction: str = "") -> str:
        """Analyze an uploaded image with a vision LLM (describe, OCR, inspect).

        Args:
            document_id: The document ID from list_documents (must be an image).
            instruction: What to look for — e.g. "Describe this image", "Extract
                all text", "What objects are visible?". Defaults to a general
                description if omitted.
        """
        if not agent_id:
            return json.dumps({"error": "No agent context"})
        doc, err = await _load_scoped_doc(document_id)
        if err:
            return err
        if not doc["mime_type"].startswith("image/"):
            return json.dumps({
                "error": f"Document is not an image (mime: {doc['mime_type']}). Use analyze_document instead."
            })
        return await _analyze(doc, instruction, "Describe this image in detail, including any visible text.")

    return [
        FunctionTool(func=analyze_document),
        FunctionTool(func=analyze_image),
    ]
