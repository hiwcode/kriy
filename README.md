# Atelier — AI Workspace Platform

[License: FSL-1.1-MIT](LICENSE.md)
[GitHub stars](https://github.com/hiwcode/atelier/stargazers)

> **Atelier** is a full-stack AI agent orchestration platform for building, configuring, and managing AI agents with streaming chat, tool integrations, persistent memory, and collaborative workspaces.

**📖 [Read the Docs →](docs/README.md)** — setup, usage, and everything else lives here.

[Click to Watch demo](web/public/demo.MOV)
Orchestrator
Agent Configurations

---

## What is Atelier?

An **AI Workspace** for creating and managing AI agents across multiple LLM providers (Google Gemini, OpenAI GPT, Anthropic Claude). Configure agents, connect external tools, schedule automated runs, orchestrate multi-agent workflows, and keep conversation history with semantic memory — all organized into collaborative workspaces for teams and individuals.

**Highlights:** multi-LLM support · team workspaces with RBAC · agent + skill builder · streaming chat · visual multi-agent orchestrator · MCP / database / file / Claude Code tools · cron scheduling · session & facts memory · Slack integration · Opik observability.

Full architecture, tech stack, feature reference, and project layout are in the **[docs](docs/README.md)**.

---

## Quick Start

See the **[User Guide](docs/README.md)** for full setup instructions.

```bash
# Backend (FastAPI)
uv sync && uv run uvicorn app.main:app --reload

# Frontend (Next.js)
cd web && npm install && npm run dev
```

---

## ⭐ Support the Project

If Atelier is useful to you, please **[star it on GitHub](https://github.com/hiwcode/atelier)** — it helps others find the project and keeps development going.

Want to **donate**, sponsor a feature, discuss commercial use, or reach out for anything else? Get in touch:

📧 **[contract@gethowitworks.com](mailto:contract@gethowitworks.com)**

---

## License

Atelier is **source-available** under the **Functional Source License (FSL-1.1-MIT)** — see [LICENSE.md](LICENSE.md) for full terms.

- ✅ Use, self-host, modify, contribute, and use internally (including at a company) — free of charge.
- ❌ Do **not** sell it or offer it as a competing commercial product/service (e.g. a hosted version of Atelier).
- 🕓 Two years after each release, that version converts to the **MIT License**.

It's *source-available*, not OSI "open source," because it restricts competing commercial use. For commercial licensing, email **[contract@gethowitworks.com](mailto:contract@gethowitworks.com)**.

---

