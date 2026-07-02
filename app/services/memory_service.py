"""Memory extraction from sessions using LLM for intelligent filtering."""

from __future__ import annotations

import logging
import os
from typing import Any

import asyncpg
from google import genai

from app.core.config import settings
from app.repositories import memory_repo, session_repo, user_config_repo

logger = logging.getLogger(__name__)

_EXTRACTION_PROMPT = """Analyze this conversation between a user and an AI assistant.
Extract ONLY meaningful, long-term facts about the USER (not the assistant).

Rules:
- Only extract facts FROM USER MESSAGES (not what the assistant said)
- Only extract things worth remembering across conversations
- Skip: greetings, casual remarks, task instructions, debugging output, code snippets
- Skip: anything the AI said about itself
- Skip: temporary states ("I'm working on X right now")
- Keep: personal info, preferences, roles, goals, tools they use, team info, recurring needs

For each fact, output one line in this format:
TYPE: content

Where TYPE is one of:
- FACT: personal info (name, role, company, location, tech stack)
- PREFERENCE: likes, dislikes, preferred ways of working
- GOAL: long-term objectives or recurring needs

If there are NO meaningful facts to extract, output exactly: NONE

Conversation:
{conversation}"""

# Fallback regex patterns (used when LLM is unavailable)
_FALLBACK_PATTERNS = {
    "fact": ["my name is", "i work at", "i live in", "call me", "i'm a ", "i am a "],
    "preference": ["i prefer", "i always use", "i don't like", "my favorite"],
    "goal": ["my goal is", "i'm trying to", "i need to regularly"],
}


def _extract_user_messages(events: list[dict]) -> str:
    """Extract only USER messages from session events."""
    parts = []
    for event in events:
        # Only include user-authored messages
        author = event.get("author") or ""
        role = (event.get("content") or {}).get("role") or ""

        if author == "user" or role == "user":
            content = event.get("content") or {}
            for p in content.get("parts") or []:
                text = p.get("text") if isinstance(p, dict) else getattr(p, "text", None)
                if text and len(text.strip()) > 10:
                    parts.append(f"User: {text.strip()}")
        elif not author or author != "user":
            # Include brief assistant context so LLM understands the conversation
            content = event.get("content") or {}
            for p in content.get("parts") or []:
                text = p.get("text") if isinstance(p, dict) else getattr(p, "text", None)
                if text and len(text.strip()) > 10:
                    # Truncate assistant messages to save tokens
                    truncated = text.strip()[:200]
                    parts.append(f"Assistant: {truncated}")

    return "\n".join(parts)


def _parse_llm_response(response_text: str) -> list[tuple[str, str]]:
    """Parse LLM extraction response into (content, memory_type) tuples."""
    results = []
    if not response_text or "NONE" in response_text.strip().upper():
        return results

    type_map = {
        "FACT": "fact",
        "PREFERENCE": "preference",
        "GOAL": "goal",
    }

    for line in response_text.strip().split("\n"):
        line = line.strip()
        if not line or line.upper() == "NONE":
            continue
        for prefix, mem_type in type_map.items():
            if line.upper().startswith(prefix + ":"):
                content = line[len(prefix) + 1:].strip()
                if content and 10 < len(content) < 500:
                    results.append((content, mem_type))
                break

    return results


async def _resolve_google_key(
    pool: asyncpg.Pool | None, db_user_id: int | None
) -> str | None:
    """Resolve Google API key: user config > env."""
    if pool and db_user_id:
        user_config = await user_config_repo.get_config(pool, db_user_id)
        if user_config and user_config.get("google_api_key"):
            return user_config["google_api_key"]
    return settings.GOOGLE_API_KEY or os.environ.get("GOOGLE_API_KEY")


async def _extract_with_llm(
    conversation_text: str,
    pool: asyncpg.Pool | None = None,
    db_user_id: int | None = None,
) -> list[tuple[str, str]]:
    """Use LLM to intelligently extract memories from conversation."""
    api_key = await _resolve_google_key(pool, db_user_id)
    if not api_key:
        logger.warning("No Google API key for LLM extraction, skipping")
        return []

    try:
        client = genai.Client(api_key=api_key)
        prompt = _EXTRACTION_PROMPT.format(conversation=conversation_text[:8000])

        response = client.models.generate_content(
            model="gemini-2.0-flash",
            contents=prompt,
        )

        return _parse_llm_response(response.text)
    except Exception as e:
        logger.warning("LLM extraction failed: %s", e)
        return []


def _extract_fallback(conversation_text: str) -> list[tuple[str, str]]:
    """Fallback regex extraction — only from user-prefixed lines, stricter patterns."""
    import re

    results = []
    seen = set()
    # Only look at user lines
    user_lines = [
        line[5:].strip()  # strip "User: " prefix
        for line in conversation_text.split("\n")
        if line.startswith("User: ")
    ]
    text = "\n".join(user_lines)
    text_lower = text.lower()
    sentences = re.split(r"[.!?\n]+", text)

    for memory_type, keywords in _FALLBACK_PATTERNS.items():
        for keyword in keywords:
            if keyword in text_lower:
                for sentence in sentences:
                    s = sentence.strip()
                    if len(s) < 15 or len(s) > 300:
                        continue
                    if keyword in s.lower():
                        normalized = s.lower().strip()
                        if normalized not in seen:
                            seen.add(normalized)
                            results.append((s, memory_type))
    return results


async def extract_and_store_memories(
    pool: asyncpg.Pool,
    agent_id: int,
    user_id: str | None = None,
    replace_existing: bool = False,
    db_user_id: int | None = None,
) -> int:
    """Extract memories from sessions using LLM and store them.

    - Only extracts from user messages
    - Uses LLM for intelligent filtering (falls back to regex if unavailable)
    - Respects dismissed memories (won't re-create them)
    - Returns the number of new memories created
    """
    store_user_id = user_id or "workspace"

    if replace_existing:
        # Only delete non-dismissed memories (keep dismissed as blocklist)
        await memory_repo.delete_active_memories_for_agent(pool, agent_id, user_id)

    # Load existing + dismissed content to avoid duplicates and re-creation
    existing_keys = await memory_repo.get_existing_memory_keys(pool, agent_id, store_user_id)
    dismissed_keys = await memory_repo.get_dismissed_memory_keys(pool, agent_id, store_user_id)
    blocked = existing_keys | dismissed_keys

    # Deduplicate any pre-existing duplicate rows
    await memory_repo.deduplicate_memories(pool, agent_id, store_user_id)

    sessions = await session_repo.get_sessions_with_data(pool, agent_id, user_id)

    # Skip sessions that already have memories extracted (unless replacing)
    if not replace_existing:
        extracted_session_ids = await memory_repo.get_extracted_session_ids(
            pool, agent_id, store_user_id
        )
        sessions = [
            (sid, data) for sid, data in sessions if sid not in extracted_session_ids
        ]

    if not sessions:
        return 0

    count = 0

    for session_id, data in sessions:
        events = data.get("events", [])
        conversation_text = _extract_user_messages(events)
        if not conversation_text.strip():
            continue

        # Try LLM extraction first, fall back to regex
        extracted = await _extract_with_llm(conversation_text, pool, db_user_id)
        if not extracted:
            extracted = _extract_fallback(conversation_text)

        for content, memory_type in extracted:
            key = (content.lower().strip(), memory_type)
            if key in blocked:
                continue
            blocked.add(key)
            try:
                new_id = await memory_repo.create_memory(
                    pool,
                    agent_id=agent_id,
                    user_id=store_user_id,
                    content=content,
                    session_id=session_id,
                    memory_type=memory_type,
                    confidence=0.9,
                )
                if new_id:
                    count += 1
            except Exception:
                pass

    return count
