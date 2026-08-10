# KRIY — AI Agent Control Plane

[License: FSL-1.1-MIT](LICENSE.md)
[GitHub stars](https://github.com/hiwcode/kriy/stargazers)

> **KRIY** puts governed AI agents behind the product you already run. Build agents, connect real tools, trigger work from application events, control sensitive actions, and return signed results.

**📖 [Read the Docs →](https://ai.gethowitworks.com/docs)** — setup, usage, and everything else lives here.

---

## What is KRIY?

KRIY is an **AI agent control plane** for turning product signals into governed agent work. Create agents across multiple model providers, connect external tools, schedule and orchestrate runs, retain useful memory, enforce decisions with gates, and deliver results back to your application.

**Highlights:** multi-LLM support · team workspaces with RBAC · agent + skill builder · streaming chat · visual multi-agent orchestrator · MCP / database / file / Claude Code tools · cron scheduling · event triggers · decision gates · signed outbound webhooks · session & facts memory · Slack integration · Opik observability.

Full architecture, tech stack, feature reference, and project layout are in the **[docs](https://ai.gethowitworks.com/docs)**.

---

## Quick Start

See the **[User Guide](docs/README.md)** for full setup instructions.

```bash
# Backend (FastAPI)
uv sync && uv run uvicorn app.main:app --reload

# Frontend (Next.js)
cd web && npm install && npm run dev
```

Integrating an existing application? Follow **[Integrate KRIY in 15 Minutes](docs/integration-quickstart.md)**,
then use the **[Integration API Reference](docs/integration-api-reference.md)** for production contracts.
KRIY integrations use the HTTP API directly; there is no KRIY client SDK to install.

---

## ⭐ Support the Project

If KRIY is useful to you, please **[star it on GitHub](https://github.com/hiwcode/kriy)** — it helps others find the project and keeps development going.

Want to **donate**, sponsor a feature, discuss commercial use, or reach out for anything else? Get in touch:

📧 **[contract@gethowitworks.com](mailto:contract@gethowitworks.com)**

---

## License

KRIY is **source-available** under the **Functional Source License (FSL-1.1-MIT)** — see [LICENSE.md](LICENSE.md) for full terms.

- ✅ Use, self-host, modify, contribute, and use internally (including at a company) — free of charge.
- ❌ Do **not** sell it or offer it as a competing commercial product/service (e.g. a hosted version of KRIY).
- 🕓 Two years after each release, that version converts to the **MIT License**.

It's *source-available*, not OSI "open source," because it restricts competing commercial use. For commercial licensing, email **[contract@gethowitworks.com](mailto:contract@gethowitworks.com)**.

---
