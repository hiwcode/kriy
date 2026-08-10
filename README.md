<p align="center">
  <img src="web/public/kriy-transparent.png" alt="KRIY" width="96" height="96" />
</p>

<h1 align="center">KRIY</h1>

<p align="center">
  <strong>Build and govern AI agents that work inside your product.</strong>
</p>

<p align="center">
  KRIY is an AI agent control plane for creating agents, connecting tools, automating
  work from product events, protecting sensitive actions, and returning trusted results.
</p>

<p align="center">
  <a href="https://ai.gethowitworks.com/docs">Documentation</a>
  ·
  <a href="docs/getting-started.md">Setup</a>
  ·
  <a href="docs/integration-quickstart.md">Integration quickstart</a>
  ·
  <a href="LICENSE.md">License</a>
</p>

---

## Why KRIY

Most agent frameworks help you build a demo. KRIY provides the operational layer needed
to put agents behind a real application:

| | |
|---|---|
| **Build** | Create agents across Gemini, GPT, and Claude models; attach reusable skills and prompts. |
| **Connect** | Give agents MCP, database, file, shell, and application tools. |
| **Automate** | Trigger agents from application events, schedules, or multi-agent workflows. |
| **Govern** | Enforce synchronous decision gates, workspace isolation, and role-based access. |
| **Remember** | Keep session context and extract durable facts for future runs. |
| **Deliver** | Stream direct runs or return asynchronous results through signed webhooks. |

KRIY sits beside your application. Your backend can stream an agent directly, submit an
event for asynchronous work, or request an allow/deny decision before performing a
sensitive action. Integrations use the HTTP API directly—there is no KRIY SDK to install.

## Quick start

Requirements: Python 3.10+, Node.js 20.9+, PostgreSQL, and
[`uv`](https://docs.astral.sh/uv/).

```bash
git clone https://github.com/hiwcode/kriy.git
cd kriy
cp .env.example .env
cp web/.env.example web/.env.local
docker compose up -d db
uv sync
uv run uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

In another terminal:

```bash
cd web
npm install
npm run dev
```

Open `http://localhost:3004`. Before creating an agent, configure authentication and at
least one model provider in `.env` or through **Configuration** in the app. KRIY applies
pending database migrations when the backend starts.

See the [setup guide](docs/getting-started.md) for environment variables, authentication,
provider configuration, and production notes.

## Integrate KRIY into a backend

### Use an AI coding agent

Install KRIY's portable integration skill from GitHub:

```bash
npx skills add hiwcode/kriy --skill integrate-kriy
```

Then open Codex, Claude Code, Cursor, or another compatible coding agent in your backend
repository and prompt:

```text
Use $integrate-kriy to integrate KRIY into this backend and verify the result.
```

The skill selects the appropriate synchronous, asynchronous, streaming, or webhook flow,
implements it using your backend's existing conventions, and adds focused verification.
Review the [AI integration guide](docs/ai-integration-skill.md) for project and global
installation options.

### Integrate manually

- [Integration quickstart](docs/integration-quickstart.md) — connect an application end to end.
- [Integration API reference](docs/integration-api-reference.md) — authentication, contracts, errors, retries, and webhooks.
- [OpenAPI](http://localhost:8000/api/docs) — interactive endpoint documentation when `ENABLE_API_DOCS=true`.

## Development checks

```bash
# Backend
uv run pytest

# Frontend
cd web
npm run typecheck
npm run lint
```

## Documentation

The complete documentation is available at
[`ai.gethowitworks.com/docs`](https://ai.gethowitworks.com/docs) and in the
[`docs/`](docs/) directory. It covers agents, tools, skills, memory, orchestration,
schedules, triggers, gates, webhooks, workspaces, and configuration.

## License

KRIY is source-available under the
[Functional Source License 1.1, MIT Future License](LICENSE.md).

- You may use, self-host, modify, and contribute to KRIY, including for internal company use.
- You may not sell KRIY or offer it as a competing commercial product or hosted service.
- Each released version converts to the MIT License two years after its release date.

For commercial licensing, sponsorship, or other questions, contact
[`contract@gethowitworks.com`](mailto:contract@gethowitworks.com).

If KRIY is useful to you, consider [starring the repository](https://github.com/hiwcode/kriy).
