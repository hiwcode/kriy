# Atelier

An open-source workspace for building, managing, and orchestrating AI agents. Atelier gives teams a unified platform to create agents powered by **Google Gemini**, **OpenAI GPT**, and **Anthropic Claude** — with collaborative workspaces, scheduling, memory, and extensible tooling.

It works in **two directions**:

- **Build agents** — give an agent the tools to *do* work (MCP tools, skills, orchestration, schedules). The agent is the driver.
- **Embed agents** — drop an agent into code you already have. Your app's API calls, DB writes, and function calls flow through the agent, which can **observe**, **modify**, or **deny** them. Your code is the driver. → [Embedding Agents (SDK)](embedding-agents.md)

---

## Key Capabilities

| Capability | What it does |
|------------|-------------|
| **Multi-LLM Agents** | Create agents with Gemini, GPT-4o, Claude, and more — switch models per agent |
| **Skills** | Bundle reusable instructions and tools into shareable skill packs |
| **Orchestrator** | Design multi-agent workflows with a visual canvas |
| **Tools & MCP** | Built-in tools, file system access, Claude Code, shell, MCP servers, databases |
| **Schedules** | Run agents on cron schedules or one-time triggers |
| **Memory** | Short-term session context plus auto-extracted long-term facts |
| **Embed (SDK)** | Python & Node SDKs put an agent in the path of your existing code |
| **Policies & Decisions** | Deterministic guardrails on intercepted actions, with a shadow-mode decision log |
| **Workspaces** | Personal and team workspaces with role-based access |

---

## Documentation

### Getting Started

| Guide | Description |
|-------|-------------|
| [Setup Guide](getting-started.md) | Prerequisites, installation, environment variables, and first run |

### Core Features

| Guide | Description |
|-------|-------------|
| [Agents](using-agents.md) | Create agents, configure models, chat, and manage sessions |
| [Skills](using-skills.md) | Create reusable skill definitions and attach them to agents |
| [Tools & Prompts](using-tools.md) | Built-in tools, file tools, Claude Code, MCP connections, databases, prompt library |
| [Memory](using-memory.md) | Session context and intelligent long-term fact extraction |

### Embed in your code

| Guide | Description |
|-------|-------------|
| [Embedding Agents (SDK)](embedding-agents.md) | Put an agent in the path of your API calls, DB writes & functions — observe, modify, deny, with policies & a decisions log |

### Advanced

| Guide | Description |
|-------|-------------|
| [Orchestrator](using-orchestrator.md) | Build multi-agent flows with visual coordination |
| [Schedules](using-schedules.md) | One-time and recurring automated agent runs |
| [Event Workflows](using-event-workflows.md) | React to events from your app — emit an event, an agent handles it |
| [Notifications](using-notifications.md) | Live in-app notifications + the `notify` agent tool |
| [Workspaces](using-workspaces.md) | Personal and team workspaces, roles, invitations, resource scoping |
| [Workspace Transfer](workspace-transfer.md) | Move agents and resources between workspaces via API |

### Settings

| Guide | Description |
|-------|-------------|
| [Configuration](using-profile.md) | Multi-provider API keys, default model, Opik tracing, Slack integration |

---

## Quick Start

1. **Install** — Clone the repo, run `uv sync` (backend) and `npm install` (frontend)
2. **Configure** — Set `DATABASE_URL` and at least one LLM API key in `.env`
3. **Start backend** — `uv run uvicorn app.main:app --port 8000`
4. **Start frontend** — `cd web && npm run dev`
5. **Sign in** — Google OAuth or API key authentication
6. **Create an agent** — Go to Agents, create one, pick a model, and start chatting

See the [Setup Guide](getting-started.md) for detailed instructions.

---

## Architecture

```mermaid
flowchart TB
    subgraph Frontend["Frontend (Next.js)"]
        UI["Web UI"]
    end
    subgraph Backend["Backend (FastAPI)"]
        API["REST API"]
        ADK["Google ADK Runtime"]
        Sched["Scheduler"]
    end
    subgraph Providers["LLM Providers"]
        Gemini["Google Gemini"]
        GPT["OpenAI GPT"]
        Claude["Anthropic Claude"]
    end
    subgraph External["External Integrations"]
        MCP["MCP Servers"]
        DB["PostgreSQL DBs"]
        Slack["Slack"]
    end
    UI --> API
    API --> ADK
    ADK --> Gemini
    ADK -->|"via LiteLLM"| GPT
    ADK -->|"via LiteLLM"| Claude
    ADK --> MCP
    ADK --> DB
    Sched --> ADK
    API --> Slack
```
