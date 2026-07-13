"""Builtin tools registry for dynamic agent configuration."""

from __future__ import annotations

import re
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from google.adk.tools import FunctionTool


# ============================================================
# MATH TOOLS
# ============================================================


def add(a: float, b: float) -> float:
    """Add two numbers together."""
    return a + b


def subtract(a: float, b: float) -> float:
    """Subtract second number from first."""
    return a - b


def multiply(a: float, b: float) -> float:
    """Multiply two numbers."""
    return a * b


def divide(a: float, b: float) -> float:
    """Divide first number by second."""
    if b == 0:
        return float("inf")
    return a / b


def power(base: float, exponent: float) -> float:
    """Raise base to the power of exponent."""
    return base**exponent


def sqrt(n: float) -> float:
    """Calculate square root of a number."""
    if n < 0:
        return float("nan")
    return n**0.5


def percentage(value: float, percent: float) -> float:
    """Calculate percentage of a value."""
    return (value * percent) / 100


# ============================================================
# TIME TOOLS
# ============================================================


def get_current_time(timezone: str = "UTC") -> str:
    """Get the current time in a specific timezone."""
    try:
        tz = ZoneInfo(timezone)
        now = datetime.now(tz)
        return now.strftime("%Y-%m-%d %H:%M:%S %Z")
    except Exception:
        return f"Error: Invalid timezone '{timezone}'"


def get_current_date() -> str:
    """Get the current date in UTC."""
    return datetime.utcnow().strftime("%Y-%m-%d")


# ============================================================
# SHELL / BASH TOOL
# ============================================================

import os
import contextvars
import subprocess
import time
import pathlib

# Resolve project root dynamically from this file path.
_PROJECT_ROOT = pathlib.Path(__file__).resolve().parents[2]
# Canonical workspace/artifacts dir — shared by bash, run_python, the file tools,
# AND the file server that serves generated artifacts (charts, CSVs) back as URLs.
# Override with ATELIER_WORKSPACE_DIR when deploying.
WORKSPACE_DIR = pathlib.Path(os.getenv("ATELIER_WORKSPACE_DIR") or (_PROJECT_ROOT / "temp"))
WORKSPACE_DIR.mkdir(parents=True, exist_ok=True)
_BASH_WORKSPACE = WORKSPACE_DIR

# Per-run session id, set by the agent runner so code-exec/file tools write into
# a session-private subdirectory instead of one shared global dir.
current_session: contextvars.ContextVar[str | None] = contextvars.ContextVar(
    "workspace_session", default=None
)


def _sanitize_session(session: str) -> str:
    """Keep only path-safe chars so a session id can't escape the workspace dir."""
    return "".join(c for c in session if c.isalnum() or c in "-_")[:128]


def session_workspace() -> pathlib.Path:
    """Return this run's private workspace dir (a subdir per session), or the
    base dir when there is no session context."""
    session = current_session.get()
    if not session:
        return WORKSPACE_DIR
    safe = _sanitize_session(session)
    if not safe:
        return WORKSPACE_DIR
    ws = WORKSPACE_DIR / safe
    ws.mkdir(parents=True, exist_ok=True)
    return ws


def run_bash(command: str) -> str:
    """Execute a bash command in the workspace directory and return stdout + stderr.

    Use this tool to run CLI commands like agent-browser, curl, npm, python, etc.
    The working directory is a dedicated temp workspace.
    """
    try:
        result = subprocess.run(
            command,
            shell=True,
            capture_output=True,
            text=True,
            timeout=600,
            cwd=str(session_workspace()),
        )
        output = ""
        if result.stdout:
            output += result.stdout
        if result.stderr:
            output += ("\n" if output else "") + result.stderr
        if result.returncode != 0 and not output:
            output = f"[exit code: {result.returncode}]"
        return output.strip() or "[completed with no output]"
    except subprocess.TimeoutExpired:
        return "[error: command timed out after 600s]"
    except Exception as e:
        return f"[error: {e}]"


def run_python(code: str) -> str:
    """Run Python code on the fly and return its output — a code interpreter.

    Use this to actually *do* data work: fetch from an API, transform data, POST
    to another API, or generate a chart/file. Write real Python and print what
    you want to see; stdout is returned.

    - Missing third-party packages auto-install on first use (`import requests`,
      `import pandas`, `import matplotlib` all just work) and persist across calls.
    - **Any file you save (e.g. a chart) is kept in the shared workspace and
      returned as a URL.** To show a chart: save it (e.g.
      `plt.savefig("chart.png")`) and then include that filename in your reply —
      the app renders workspace images inline for the user.
    """
    # Lazy import to avoid pulling ADK code-executor deps at module load.
    from app.agents.skill_code_executor import AutoVenvSkillCodeExecutor

    ws = session_workspace()
    rel_prefix = f"{ws.name}/" if ws != WORKSPACE_DIR else ""
    script = ws / f"_interp_{time.time_ns()}.py"
    try:
        before = {p.name for p in ws.iterdir() if p.is_file()}
        script.write_text(code, encoding="utf-8")

        executor = AutoVenvSkillCodeExecutor()
        # Run WITH cwd=workspace so files the code writes persist (and are servable).
        result = executor.run_python_file(script, cwd=ws)

        after = {p.name for p in ws.iterdir() if p.is_file()}
        created = sorted(after - before - {script.name})

        out = (result.get("stdout") or "").strip()
        err = (result.get("stderr") or "").strip()
        installed = result.get("installed_packages") or []

        parts: list[str] = []
        if installed:
            parts.append(f"[auto-installed: {', '.join(installed)}]")
        if out:
            parts.append(out)
        if err:
            parts.append(f"[stderr]\n{err}")
        if created:
            from app.core.workspace_signing import sign_path
            def _url(name: str) -> str:
                rel = f"{rel_prefix}{name}"
                return f"/api/v1/agents/workspace-file/{rel}?sig={sign_path(rel)}"
            lines = "\n".join(f"- {name}  ->  {_url(name)}" for name in created)
            parts.append(
                "[files created — include the filename in your reply so the user sees it]\n"
                + lines
            )
        return "\n\n".join(parts) or "[completed with no output]"
    except Exception as e:  # pragma: no cover - safety net
        return f"[error: {e}]"
    finally:
        try:
            script.unlink()
        except OSError:
            pass


# ============================================================
# FILE SYSTEM TOOLS
# ============================================================

# All file tools operate relative to _BASH_WORKSPACE by default.
# Absolute paths are allowed as long as they're under _ALLOWED_ROOT (~/Desktop).
_ALLOWED_ROOT = pathlib.Path.home() / "Desktop"

def _safe_resolve(path: str) -> pathlib.Path:
    """Resolve a path safely, preventing traversal outside ~/Desktop."""
    p = pathlib.Path(path)
    if p.is_absolute():
        resolved = p.resolve()
    else:
        resolved = (_BASH_WORKSPACE / p).resolve()
    # Allow access anywhere under ~/Desktop
    allowed = _ALLOWED_ROOT.resolve()
    if not (str(resolved).startswith(str(allowed)) or str(resolved) == str(allowed)):
        raise ValueError(
            f"Access denied: path '{path}' resolves outside ~/Desktop"
        )
    return resolved


def read_file(path: str, offset: int = 0, limit: int = 2000) -> str:
    """Read a file and return its contents with line numbers.

    Args:
        path: File path (relative to workspace, or absolute within the project).
        offset: Line number to start reading from (0-based, default 0).
        limit: Maximum number of lines to read (default 2000).

    Returns:
        File contents with line numbers, e.g. "1\\tline one\\n2\\tline two\\n..."
    """
    try:
        resolved = _safe_resolve(path)
        if not resolved.exists():
            return f"[error: file not found: {path}]"
        if not resolved.is_file():
            return f"[error: not a file: {path}]"
        # Check file size to avoid reading huge binaries
        size = resolved.stat().st_size
        if size > 10 * 1024 * 1024:  # 10MB
            return f"[error: file too large ({size} bytes). Use grep_files to search or read specific sections]"
        lines = resolved.read_text(encoding="utf-8", errors="replace").splitlines()
        total = len(lines)
        selected = lines[offset : offset + limit]
        numbered = []
        for i, line in enumerate(selected, start=offset + 1):
            numbered.append(f"{i}\t{line}")
        result = "\n".join(numbered)
        if offset + limit < total:
            result += f"\n\n[... {total - offset - limit} more lines. Use offset={offset + limit} to continue reading]"
        return result or "[empty file]"
    except ValueError as e:
        return f"[error: {e}]"
    except Exception as e:
        return f"[error reading file: {e}]"


def write_file(path: str, content: str) -> str:
    """Create or overwrite a file with the given content.

    Prefer edit_file for modifying existing files — it only changes what's needed.
    Use write_file only for creating new files or complete rewrites.

    Args:
        path: File path (relative to workspace, or absolute within the project).
        content: The full content to write to the file.
    """
    try:
        resolved = _safe_resolve(path)
        resolved.parent.mkdir(parents=True, exist_ok=True)
        resolved.write_text(content, encoding="utf-8")
        return f"[wrote {len(content)} bytes to {resolved}]"
    except ValueError as e:
        return f"[error: {e}]"
    except Exception as e:
        return f"[error writing file: {e}]"


def edit_file(path: str, old_text: str, new_text: str) -> str:
    """Edit a file by replacing an exact text match with new text.

    This is a surgical edit — only the matched text is changed. The old_text
    must appear exactly once in the file. If it appears multiple times, provide
    more surrounding context to make it unique.

    Args:
        path: File path (relative to workspace, or absolute within the project).
        old_text: The exact text to find and replace (must be unique in the file).
        new_text: The replacement text.
    """
    try:
        resolved = _safe_resolve(path)
        if not resolved.exists():
            return f"[error: file not found: {path}]"
        if not resolved.is_file():
            return f"[error: not a file: {path}]"
        content = resolved.read_text(encoding="utf-8")
        count = content.count(old_text)
        if count == 0:
            return "[error: old_text not found in file. Make sure it matches exactly, including whitespace and indentation]"
        if count > 1:
            return f"[error: old_text found {count} times. Provide more surrounding context to make it unique]"
        new_content = content.replace(old_text, new_text, 1)
        resolved.write_text(new_content, encoding="utf-8")
        return f"[edited {resolved} — replaced {len(old_text)} chars with {len(new_text)} chars]"
    except ValueError as e:
        return f"[error: {e}]"
    except Exception as e:
        return f"[error editing file: {e}]"


def glob_files(pattern: str, directory: str = ".") -> str:
    """Find files matching a glob pattern recursively.

    Args:
        pattern: Glob pattern, e.g. '**/*.py', '*.ts', 'src/**/*.js'.
        directory: Directory to search in (relative to workspace or absolute). Default is workspace root.

    Returns:
        Newline-separated list of matching file paths (relative to the search directory).
    """
    try:
        resolved_dir = _safe_resolve(directory)
        if not resolved_dir.is_dir():
            return f"[error: not a directory: {directory}]"
        matches = sorted(resolved_dir.glob(pattern))
        # Filter to files only, limit results
        files = [str(m.relative_to(resolved_dir)) for m in matches if m.is_file()]
        if not files:
            return f"[no files matching '{pattern}' in {directory}]"
        if len(files) > 500:
            return "\n".join(files[:500]) + f"\n\n[... {len(files) - 500} more files. Narrow your pattern]"
        return "\n".join(files)
    except ValueError as e:
        return f"[error: {e}]"
    except Exception as e:
        return f"[error in glob: {e}]"


def grep_files(pattern: str, directory: str = ".", file_glob: str = "", max_results: int = 100) -> str:
    """Search file contents for a regex pattern.

    Args:
        pattern: Regular expression to search for (Python re syntax).
        directory: Directory to search in (relative to workspace or absolute). Default is workspace root.
        file_glob: Optional glob to filter which files to search, e.g. '*.py', '**/*.ts'.
        max_results: Maximum number of matching lines to return (default 100).

    Returns:
        Matching lines formatted as 'filepath:line_number: content'.
    """
    try:
        resolved_dir = _safe_resolve(directory)
        if not resolved_dir.is_dir():
            return f"[error: not a directory: {directory}]"

        compiled = re.compile(pattern)

        # Collect files to search
        if file_glob:
            files = sorted(resolved_dir.glob(file_glob))
        else:
            files = sorted(resolved_dir.rglob("*"))
        files = [f for f in files if f.is_file()]

        # Skip binary / very large files
        _SKIP_DIRS = {".git", "node_modules", "__pycache__", ".venv", "venv", ".next", "dist", "build"}
        results = []
        for fpath in files:
            # Skip common non-code directories
            parts = fpath.relative_to(resolved_dir).parts
            if any(d in _SKIP_DIRS for d in parts):
                continue
            if fpath.stat().st_size > 2 * 1024 * 1024:  # skip > 2MB
                continue
            try:
                text = fpath.read_text(encoding="utf-8", errors="replace")
            except Exception:
                continue
            for line_num, line in enumerate(text.splitlines(), 1):
                if compiled.search(line):
                    rel = str(fpath.relative_to(resolved_dir))
                    results.append(f"{rel}:{line_num}: {line.rstrip()}")
                    if len(results) >= max_results:
                        break
            if len(results) >= max_results:
                break

        if not results:
            return f"[no matches for '{pattern}' in {directory}]"
        output = "\n".join(results)
        if len(results) >= max_results:
            output += f"\n\n[... results truncated at {max_results}. Use file_glob to narrow search]"
        return output
    except re.error as e:
        return f"[error: invalid regex: {e}]"
    except ValueError as e:
        return f"[error: {e}]"
    except Exception as e:
        return f"[error in grep: {e}]"


# ============================================================
# CLAUDE CODE TOOL
# ============================================================

import json as _json
import shutil


def claude_code(
    prompt: str,
    working_directory: str = "",
    allowed_tools: str = "",
    max_turns: int = 25,
) -> str:
    """Run a task using Claude Code CLI (local, no API cost).

    Claude Code is a powerful AI coding assistant that can read, write, and edit
    files, run shell commands, search codebases, and much more. Use this tool to
    delegate complex multi-step coding tasks.

    Each call starts a fresh session. Include ALL context in the prompt — describe
    the full task (e.g. "find the bug, fix it, and write tests") in one call
    rather than splitting across multiple calls.

    Args:
        prompt: The complete task description. Be specific — include file paths,
                ticket IDs, what to fix, and what deliverables to produce.
        working_directory: Directory to run in (must be under ~/Desktop). Defaults to workspace.
        allowed_tools: Comma-separated list of tools to allow, e.g. "Read,Edit,Bash,Grep,Glob".
                       Leave empty to allow all tools.
        max_turns: Maximum number of agentic turns (default 25).

    Returns:
        Claude Code's response text, or an error message.
    """
    if not shutil.which("claude"):
        return "[error: Claude Code CLI not found. Install it from https://claude.ai/code]"

    # Resolve working directory
    if working_directory:
        try:
            cwd = _safe_resolve(working_directory)
            if not cwd.is_dir():
                return f"[error: not a directory: {working_directory}]"
        except ValueError as e:
            return f"[error: {e}]"
        cwd_str = str(cwd)
    else:
        cwd_str = str(_BASH_WORKSPACE)

    cmd = ["claude", "-p", prompt, "--output-format", "json", "--dangerously-skip-permissions"]

    if allowed_tools:
        cmd.extend(["--allowedTools", allowed_tools.strip()])

    if max_turns and max_turns > 0:
        cmd.extend(["--max-turns", str(max_turns)])

    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=600,
            cwd=cwd_str,
        )

        output = result.stdout.strip()
        if not output:
            if result.stderr:
                return f"[error: {result.stderr.strip()}]"
            return f"[error: Claude Code exited with code {result.returncode}]"

        # Try to parse JSON response and extract the result text
        try:
            data = _json.loads(output)
            if isinstance(data, dict) and "result" in data:
                return data["result"]
            return output
        except _json.JSONDecodeError:
            return output

    except subprocess.TimeoutExpired:
        return "[error: Claude Code timed out after 600s]"
    except Exception as e:
        return f"[error: {e}]"


# ============================================================
# REGISTRY
# ============================================================

_BUILTIN_TOOLS: dict[str, FunctionTool] = {
    "add": FunctionTool(func=add),
    "subtract": FunctionTool(func=subtract),
    "multiply": FunctionTool(func=multiply),
    "divide": FunctionTool(func=divide),
    "power": FunctionTool(func=power),
    "sqrt": FunctionTool(func=sqrt),
    "percentage": FunctionTool(func=percentage),
    "get_current_time": FunctionTool(func=get_current_time),
    "get_current_date": FunctionTool(func=get_current_date),
    "bash": FunctionTool(func=run_bash),
    "run_python": FunctionTool(func=run_python),
    "read_file": FunctionTool(func=read_file),
    "write_file": FunctionTool(func=write_file),
    "edit_file": FunctionTool(func=edit_file),
    "glob_files": FunctionTool(func=glob_files),
    "grep_files": FunctionTool(func=grep_files),
    "claude_code": FunctionTool(func=claude_code),
}

# Tools that touch the host machine (shell, filesystem, code execution). These
# are only available outside production — see settings.local_tools_enabled.
LOCAL_ONLY_TOOLS: frozenset[str] = frozenset(
    {
        "bash",
        "run_python",
        "read_file",
        "write_file",
        "edit_file",
        "glob_files",
        "grep_files",
        "claude_code",
    }
)


def _local_tools_enabled() -> bool:
    from app.core.config import settings

    return settings.local_tools_enabled


def get_builtin_tool(name: str):
    """Get a builtin tool by name (local-only tools are None in production)."""
    if name in LOCAL_ONLY_TOOLS and not _local_tools_enabled():
        return None
    return _BUILTIN_TOOLS.get(name)


def get_all_builtin_tool_names() -> list[str]:
    """Return builtin tool names, hiding local-only tools in production."""
    allow_local = _local_tools_enabled()
    return [
        name
        for name in _BUILTIN_TOOLS
        if allow_local or name not in LOCAL_ONLY_TOOLS
    ]
