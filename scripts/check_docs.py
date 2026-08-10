#!/usr/bin/env python3
"""Fail CI on broken local Markdown links or stale public integration vocabulary."""

from __future__ import annotations

import re
import sys
from pathlib import Path
from urllib.parse import unquote

ROOT = Path(__file__).resolve().parents[1]
MARKDOWN_FILES = [
    ROOT / "README.md",
    ROOT / "web" / "README.md",
    *sorted((ROOT / "docs").glob("*.md")),
]
LINK_RE = re.compile(r"\[[^\]]*\]\(([^)]+)\)")
STALE_TERMS = (
    "Atelier",
    "ATELIER_",
    "X-Atelier",
    "ate-...",
    "KriyClient",
    "kriy_agentic",
    "kriy-agentic",
)
REQUIRED_INTEGRATION_SNIPPETS = {
    "docs/integration-quickstart.md": (
        '"event_types": ["order.created"]',
        'POST "$KRIY_BASE_URL/api/v1/events"',
        'POST "$KRIY_BASE_URL/api/v1/events/decide"',
        "from urllib.request import Request, urlopen",
    ),
    "docs/integration-api-reference.md": (
        "/api/openapi.json",
        "X-Workspace-Id",
        "X-KRIY-Signature",
        "Retry-After",
    ),
}


def _local_target(source: Path, raw: str) -> Path | None:
    target = raw.strip().strip("<>")
    if not target or target.startswith(("#", "http://", "https://", "mailto:", "data:")):
        return None
    target = unquote(target.split("#", 1)[0].split("?", 1)[0])
    if not target:
        return None
    return (source.parent / target).resolve()


def main() -> int:
    failures: list[str] = []
    for source in MARKDOWN_FILES:
        text = source.read_text(encoding="utf-8")
        for raw in LINK_RE.findall(text):
            target = _local_target(source, raw)
            if target is not None and not target.exists():
                failures.append(f"{source.relative_to(ROOT)}: broken link {raw!r}")
        for term in STALE_TERMS:
            if term.lower() in text.lower():
                failures.append(f"{source.relative_to(ROOT)}: stale term {term!r}")

    for relative, snippets in REQUIRED_INTEGRATION_SNIPPETS.items():
        text = (ROOT / relative).read_text(encoding="utf-8")
        for snippet in snippets:
            if snippet not in text:
                failures.append(f"{relative}: missing contract snippet {snippet!r}")

    if failures:
        print("Documentation validation failed:", file=sys.stderr)
        for failure in failures:
            print(f"- {failure}", file=sys.stderr)
        return 1
    print(f"Documentation validation passed ({len(MARKDOWN_FILES)} Markdown files).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
