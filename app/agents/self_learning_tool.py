"""Self-learning tools — let an agent turn experience into reusable skills.

When enabled, the agent can save a SKILL from a conversation. The skill is stored
in the workspace skills catalog (tagged ``source='self-learned'``) and attached to
THIS agent, so on the next session ADK's SkillToolset loads it and the capability
compounds. Guardrails: names are unique per workspace (dedupe), and a per-agent cap
keeps the skill set from sprawling.
"""

from __future__ import annotations

import json
import logging

import asyncpg
from google.adk.tools import FunctionTool

from app.repositories import skill_repo
from app.schemas.agent import AgentUpdate
from app.services import agent_service

logger = logging.getLogger(__name__)

# Cap on self-learned skills attached to one agent (keeps context + quality in check).
_MAX_LEARNED_PER_AGENT = 30


def make_self_learning_tools(
    pool: asyncpg.Pool,
    user_id: int | None,
    workspace_id: int | None = None,
    agent_id: int | None = None,
) -> list[FunctionTool]:
    """Create self-learning tools bound to a specific agent."""

    async def _agent_skills() -> tuple[dict, list[dict]]:
        agent = await agent_service.get_agent(pool, agent_id) if agent_id else None
        ids = list((agent or {}).get("skill_ids") or [])
        skills = await skill_repo.get_skills_by_ids(pool, ids) if ids else []
        return agent or {}, skills

    async def save_skill(name: str, description: str, instructions: str) -> str:
        """Save what you just did as a reusable skill for next time.

        Call this when you've completed something you'd likely be asked to do again
        (a way to draft a certain email, a debugging procedure, a report format).
        The skill is attached to you and becomes a first-class capability next session.

        Args:
            name: short, memorable name (e.g. "reset-todo-list").
            description: ONE sentence on WHEN to use it (the trigger situation), not what it does.
            instructions: the step-by-step procedure to follow when this skill applies.
        """
        if agent_id is None:
            return json.dumps({"error": "no agent context"})
        agent, learned_and_manual = await _agent_skills()
        learned = [s for s in learned_and_manual if s.get("source") == "self-learned"]
        if len(learned) >= _MAX_LEARNED_PER_AGENT:
            return json.dumps({
                "error": f"You already have {len(learned)} self-learned skills "
                         f"(cap {_MAX_LEARNED_PER_AGENT}). Refine an existing one with "
                         f"update_skill instead of adding more.",
            })
        try:
            skill = await skill_repo.create_skill(
                pool,
                name=name,
                instructions=instructions,
                description=description,
                created_by=user_id,
                workspace_id=workspace_id,
                source="self-learned",
            )
        except Exception as e:  # unique(name, workspace) etc.
            return json.dumps({
                "error": f"Couldn't create skill '{name}' — it may already exist. "
                         f"Use update_skill to refine it.",
                "detail": str(e)[:200],
            })

        ids = list(agent.get("skill_ids") or [])
        if skill["id"] not in ids:
            ids.append(skill["id"])
            await agent_service.update_agent(pool, agent_id, AgentUpdate(skill_ids=ids))
        return json.dumps({"success": True, "skill_id": skill["id"], "name": skill["name"]})

    async def update_skill(name: str, instructions: str, description: str | None = None) -> str:
        """Refine one of your existing self-learned skills (found by name)."""
        if agent_id is None:
            return json.dumps({"error": "no agent context"})
        _, skills = await _agent_skills()
        target = next(
            (s for s in skills if s.get("name") == name and s.get("source") == "self-learned"),
            None,
        )
        if not target:
            return json.dumps({"error": f"No self-learned skill named '{name}'. Use save_skill to create it."})
        payload: dict = {"instructions": instructions}
        if description is not None:
            payload["description"] = description
        await skill_repo.update_skill(pool, target["id"], payload)
        return json.dumps({"success": True, "skill_id": target["id"], "name": name})

    async def list_learned_skills() -> str:
        """List the skills you've taught yourself so far."""
        if agent_id is None:
            return json.dumps({"error": "no agent context"})
        _, skills = await _agent_skills()
        learned = [
            {"name": s["name"], "description": s.get("description")}
            for s in skills if s.get("source") == "self-learned"
        ]
        return json.dumps({"learned_skills": learned, "count": len(learned)})

    return [
        FunctionTool(func=save_skill),
        FunctionTool(func=update_skill),
        FunctionTool(func=list_learned_skills),
    ]
