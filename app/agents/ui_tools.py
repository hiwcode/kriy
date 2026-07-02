"""Presentational builtin tools — the agent renders rich cards in the chat UI.

These tools have no side effects. Calling one simply streams a UI *card*
(a plan, a todo checklist, or an info card) to the frontend. The card content
is taken straight from the tool-call arguments, so it renders the instant the
model decides to call the tool — see ``agent_run_service._process_events``,
which watches for :data:`UI_TOOL_NAMES` and emits ``card`` SSE events.

All arguments are primitives or lists of strings on purpose: nested object
schemas are unreliable with gemini-2.5-flash function calling.
"""

from __future__ import annotations

from google.adk.tools import FunctionTool

# Tool names the streaming layer watches for to emit `card` events.
UI_TOOL_NAMES = {"plan", "todo_write", "show_card"}


def build_ui_card(name: str, args: dict | None) -> dict | None:
    """Turn a UI tool call's args into a card payload for the frontend."""
    a = dict(args or {})
    if name == "plan":
        return {
            "type": "plan",
            "title": a.get("title") or "Plan",
            "steps": [str(s) for s in (a.get("steps") or [])],
        }
    if name == "todo_write":
        return {
            "type": "todo",
            "title": a.get("title") or "To-dos",
            "todos": [str(s) for s in (a.get("todos") or [])],
            "done": [str(s) for s in (a.get("done") or [])],
            "in_progress": a.get("in_progress") or "",
        }
    if name == "show_card":
        return {
            "type": "card",
            "title": a.get("title") or "",
            "body": a.get("body") or "",
            "footer": a.get("footer") or "",
            "variant": a.get("variant") or "info",
        }
    return None


def make_ui_tools() -> list[FunctionTool]:
    """Return the presentational (chat-UI) tools."""

    def plan(title: str, steps: list[str]) -> str:
        """Show a PLAN card in the chat: an ordered list of steps you will take.

        Use this to outline your approach BEFORE starting multi-step work, so the
        user can see the plan. Purely visual — it performs no actions.

        Args:
            title: Short heading for the plan.
            steps: Ordered list of step descriptions.
        """
        return f"Rendered a plan card with {len(steps)} step(s)."

    def todo_write(
        title: str,
        todos: list[str],
        done: list[str] | None = None,
        in_progress: str = "",
    ) -> str:
        """Show a TODO checklist card in the chat and track progress.

        Call it again during the turn with the SAME ``todos`` and an updated
        ``done`` / ``in_progress`` to reflect progress. Purely visual.

        Args:
            title: Heading for the checklist.
            todos: All task descriptions, in order.
            done: Subset of ``todos`` already completed (shown checked off).
            in_progress: The single task currently being worked on, if any.
        """
        return f"Rendered a todo card ({len(done or [])}/{len(todos)} done)."

    def show_card(
        title: str,
        body: str = "",
        footer: str = "",
        variant: str = "info",
    ) -> str:
        """Show a generic INFO card in the chat (title + markdown body).

        Use for summaries, results, or highlighted callouts.

        Args:
            title: Card heading.
            body: Markdown body content (supports lists, bold, code, etc.).
            footer: Optional small footer text.
            variant: One of ``info`` | ``success`` | ``warning`` | ``error``.
        """
        return f"Rendered a {variant} card."

    return [
        FunctionTool(func=plan),
        FunctionTool(func=todo_write),
        FunctionTool(func=show_card),
    ]
