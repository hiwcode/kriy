# Atelier — AI Workspace Platform

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![GitHub stars](https://img.shields.io/github/stars/hiwcode/Atelier-AI-Workspace?style=social)](https://github.com/hiwcode/Atelier-AI-Workspace/stargazers)

> **Project Atelier** is a full-stack AI agent orchestration platform for building, configuring, and managing AI agents with streaming chat, tool integrations, persistent memory, and collaborative workspaces.

**📖 [User Guide →](docs/README.md)** — How to set up and use Atelier

[![Click to Watch demo](web/public/thumbnail.png)](web/public/demo.MOV)
![Orchestrator](web/public/thumbnail_two.png)
![Agent Configurations](web/public/thumbnail_three.png)

### ⭐ Give a Star!

If you find this project useful, please consider giving it a **star** on GitHub — it helps others discover the project and motivates continued development!

[![Star this repo](https://img.shields.io/github/stars/hiwcode/Atelier-AI-Workspace?style=for-the-badge&logo=github&label=Star%20on%20GitHub)](https://github.com/hiwcode/Atelier-AI-Workspace)

---

## Project Summary

Atelier is an **AI Workspace** that enables users to create and manage AI agents powered by multiple LLM providers (Google Gemini, OpenAI GPT, Anthropic Claude). It provides a unified interface for configuring agents, connecting external tools (MCP, databases, file system, Claude Code CLI), scheduling automated runs, orchestrating multi-agent workflows, and maintaining conversation history with semantic memory extraction — all organized into collaborative **workspaces** for teams and individuals.

### Key Highlights

- **Multi-LLM support** — Google Gemini (native), OpenAI GPT, Anthropic Claude via LiteLLM — per-user API keys with env fallback
- **Workspaces** — Personal and team workspaces with role-based access control (Owner / Admin / Member), invite system, and resource transfer
- **Agent builder** — Create local or A2A (Agent-to-Agent) agents with configurable system prompts, instructions, and tools
- **Skills** — Reusable capability definitions (instructions + tools) that can be attached to multiple agents
- **Streaming chat** — Real-time SSE streaming with conversation history and session persistence
- **Orchestrator** — Visual flow editor (React Flow) for designing multi-agent workflows with sub-agents
- **Tool integrations** — MCP connections, PostgreSQL database tools, file system tools, Claude Code CLI, built-in tools (math, text, time, bash)
- **Scheduling** — One-time and recurring (cron) scheduled agent runs with background execution
- **Memory system** — Session memory, facts memory with automatic extraction from conversations
- **Slack integration** — Route Slack messages to agents, post responses back to threads
- **Observability** — Opik tracing, MCP tester, and dashboard analytics
- **Auth** — Google OAuth and API key authentication

---

## System Architecture

```mermaid
flowchart TB
    subgraph Client["Client Layer"]
        Web["Next.js 16 Web App"]
    end

    subgraph UI["Frontend Modules"]
        WorkspaceUI["Workspace Switcher"]
        Dashboard["Dashboard"]
        Agents["Agents"]
        Skills["Skills"]
        Orchestrator["Orchestrator"]
        Prompts["Prompt Library"]
        MCP["MCP Connections"]
        DBConn["Database Connections"]
        SessionMem["Session Memory"]
        FactsMem["Facts Memory"]
        Traces["Traces"]
        Config["Config"]
        WorkspaceSettings["Workspace Settings"]
    end

    subgraph API["Backend API (FastAPI)"]
        Health["Health"]
        Users["Users"]
        WorkspacesAPI["Workspaces"]
        AgentsAPI["Agents"]
        SkillsAPI["Skills"]
        PromptsAPI["Prompt Library"]
        MCPAPI["MCP Connections"]
        DBConnAPI["Database Connections"]
        DashboardAPI["Dashboard"]
        UserConfigAPI["User Config"]
        IntegrationAPI["Integration"]
        SchedulesAPI["Schedules"]
        SlackAPI["Slack"]
    end

    subgraph Services["Business Logic"]
        AgentRun["Agent Run Service"]
        AgentSvc["Agent Service"]
        SessionSvc["Session Service"]
        MemorySvc["Memory Service"]
        PostgresMem["Postgres Memory"]
        PromptSvc["Prompt Service"]
        MCPTools["MCP Tools Service"]
        LLMResolver["LLM Key Resolver"]
        Scheduler["Scheduler Runner"]
    end

    subgraph Runtime["Agent Runtime"]
        RuntimeEngine["Runtime Engine"]
        DBTool["Database Tool"]
        MCPTool["MCP Tool"]
        Builtin["Built-in Tools\n(Math, Text, Time, Bash)"]
        FileTool["File Tools\n(Read, Write, Edit, Glob, Grep)"]
        ClaudeCode["Claude Code CLI"]
        ScheduleTool["Schedule Tool"]
        MemoryTool["Memory Tool"]
    end

    subgraph Data["Data Layer"]
        Postgres["PostgreSQL"]
        subgraph WorkspaceScope["Workspace-Scoped Tables"]
            WS["workspaces"]
            Members["workspace_members"]
            Invites["workspace_invites"]
            AgentsT["agents"]
            SkillsT["skills"]
            PromptsT["prompt_library"]
            MCPT["mcp_connections"]
            DBConnT["database_connections"]
            SessionsT["agent_sessions"]
            MemoriesT["agent_memories"]
            SchedulesT["schedules"]
            UserConfigT["user_config"]
        end
    end

    subgraph External["External Services"]
        Gemini["Google Gemini API"]
        OpenAI["OpenAI API\n(via LiteLLM)"]
        Anthropic["Anthropic API\n(via LiteLLM)"]
        MCPServers["MCP Servers"]
        UserDBs["User Databases"]
    end

    Web --> WorkspaceUI
    WorkspaceUI --> Dashboard
    WorkspaceUI --> Agents
    WorkspaceUI --> Skills
    WorkspaceUI --> Orchestrator
    WorkspaceUI --> Prompts
    WorkspaceUI --> MCP
    WorkspaceUI --> DBConn
    WorkspaceUI --> SessionMem
    WorkspaceUI --> FactsMem
    WorkspaceUI --> Traces
    WorkspaceUI --> Config
    WorkspaceUI --> WorkspaceSettings

    Dashboard --> DashboardAPI
    Agents --> AgentsAPI
    Skills --> SkillsAPI
    Prompts --> PromptsAPI
    MCP --> MCPAPI
    DBConn --> DBConnAPI
    Config --> UserConfigAPI
    WorkspaceSettings --> WorkspacesAPI

    WorkspacesAPI --> Postgres
    SkillsAPI --> Postgres
    AgentsAPI --> AgentRun
    AgentsAPI --> AgentSvc
    AgentsAPI --> SessionSvc
    AgentsAPI --> MemorySvc

    AgentRun --> RuntimeEngine
    RuntimeEngine --> DBTool
    RuntimeEngine --> MCPTool
    RuntimeEngine --> Builtin
    RuntimeEngine --> MemoryTool

    AgentRun --> Gemini
    AgentRun --> OpenAI
    AgentRun --> Anthropic
    DBTool --> UserDBs
    MCPTool --> MCPServers
    MemoryTool --> PostgresMem
    PostgresMem --> Postgres

    AgentSvc --> Postgres
    SessionSvc --> Postgres
    MemorySvc --> Postgres
```

---

## Component Diagram

```mermaid
flowchart LR
    subgraph "Frontend (Next.js + React 19)"
        A[App Layout]
        WP[Workspace Provider]
        B[Agent Pages]
        C[Chat Tab]
        D[Orchestrator Flow]
        E[Data Tables]
        WS[Workspace Settings]
    end

    subgraph "API Layer"
        F[REST API]
        G[SSE Stream]
        WH["X-Workspace-Id Header"]
    end

    subgraph "Core Services"
        H[Agent Run]
        I[Session]
        J[Memory]
        WR[Workspace Repo]
    end

    subgraph "Data"
        K[(PostgreSQL)]
    end

    A --> WP
    WP --> B
    WP --> WS
    B --> C
    B --> D
    C --> G
    WP --> WH
    WH --> F
    G --> H
    H --> I
    H --> J
    F --> WR
    WR --> K
    I --> K
    J --> K
```

---

## Data Flow: Chat & Agent Execution

```mermaid
sequenceDiagram
    participant User
    participant Web as Web App
    participant API as FastAPI
    participant AgentRun as Agent Run Service
    participant Runtime as Agent Runtime
    participant LLM as LLM API\n(Gemini/GPT/Claude)
    participant DB as PostgreSQL

    User->>Web: Send message
    Web->>API: POST /agents/{id}/run (SSE) + X-Workspace-Id header
    API->>DB: Verify workspace membership
    API->>AgentRun: run_agent_stream()
    AgentRun->>DB: Load agent config, session (workspace-scoped)
    AgentRun->>AgentRun: Resolve API key for provider
    AgentRun->>Runtime: build_agent_from_config()
    Runtime->>Runtime: Attach tools (MCP, DB, file, memory, schedule)
    AgentRun->>Runtime: Run agent
    Runtime->>LLM: Stream request
    LLM-->>Runtime: Stream response
    Runtime-->>AgentRun: Yield chunks
    AgentRun-->>API: SSE events
    API-->>Web: data: {type, text, session}
    Web->>User: Display streamed text
    AgentRun->>DB: Save session history (workspace-scoped)
```

---

## Workspace & Multi-Tenancy Architecture

All resources are scoped to **workspaces** — isolated containers for collaboration.

```mermaid
flowchart TB
    subgraph Users["Users"]
        U1["User A"]
        U2["User B"]
    end

    subgraph Workspaces["Workspaces"]
        PW1["Personal Workspace\n(User A)"]
        PW2["Personal Workspace\n(User B)"]
        TW["Team Workspace\n(Owner: A, Member: B)"]
    end

    subgraph Resources["Workspace-Scoped Resources"]
        Agents["Agents"]
        Skills["Skills"]
        Prompts["Prompts"]
        MCPConn["MCP Connections"]
        DBConn["Database Connections"]
        Sessions["Sessions"]
        Memories["Memories"]
    end

    U1 -->|owner| PW1
    U2 -->|owner| PW2
    U1 -->|owner| TW
    U2 -->|member| TW

    PW1 --> Resources
    PW2 --> Resources
    TW --> Resources
```

| Concept | Details |
|---------|---------|
| **Personal workspace** | Auto-created on first sign-in; one per user; cannot be deleted |
| **Team workspace** | Created manually; supports Owner / Admin / Member roles |
| **Workspace scoping** | All CRUD operations filter by the active workspace (`X-Workspace-Id` header) |
| **Invite system** | Email-based invites with expiry; accept via token link |
| **Resource transfer** | Atomic transfer of resources (agents, prompts, connections) between workspaces |
| **Access control** | Membership checked on every request; non-members get 404 |

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| **Frontend** | Next.js 16, React 19, TypeScript, Tailwind CSS, Radix UI, React Flow (@xyflow/react), Recharts |
| **Backend** | FastAPI, Python 3.10+ |
| **AI/LLM** | Google ADK (Agent Development Kit), Gemini API, LiteLLM (OpenAI, Anthropic) |
| **Database** | PostgreSQL, asyncpg |
| **Auth** | Google OAuth (@react-oauth/google), JWT, API keys |
| **Tools** | FastMCP (MCP connections), database tool, file system tools, Claude Code CLI, croniter (scheduling) |

---

## Feature Breakdown

| Feature | Description |
|---------|-------------|
| **Workspaces** | Personal and team workspaces with role-based access (Owner/Admin/Member), invite system, and resource transfer between workspaces |
| **Agents** | Create local agents (Gemini, GPT, Claude) or A2A agents; configure model, system prompt, instructions, and tools — all workspace-scoped |
| **Skills** | Reusable capability definitions (instructions + tools) attachable to agents; workspace-scoped and shareable across agents |
| **Chat** | Streaming chat with session history, auto-select first session, delete sessions |
| **Orchestrator** | Visual editor for orchestrator agents; add/remove sub-agents (local or external A2A) |
| **Prompt Library** | Reusable prompt templates referenced by agents — workspace-scoped |
| **MCP Connections** | Connect to MCP servers (GitHub, Jira, Slack, etc.); select tools per agent — workspace-scoped |
| **Database Connections** | PostgreSQL connections for SQL tools (read-only or read-write) — workspace-scoped |
| **File Tools** | Read, write, edit, search files on the host machine (restricted to ~/Desktop) |
| **Claude Code** | Delegate complex coding tasks to local Claude Code CLI (no API cost) |
| **Schedules** | One-time and recurring (cron) scheduled agent runs with background execution — workspace-scoped |
| **Slack** | Route Slack messages to agents, auto-respond in threads |
| **Session Memory** | Browse and search conversation history — workspace-scoped |
| **Facts Memory** | Extract and store user preferences/facts from conversations — workspace-scoped |
| **Traces** | View execution traces |
| **MCP Tester** | Test MCP connections and tools |
| **Dashboard** | Overview with token usage, session counts, agent stats — per workspace |
| **Config** | Multi-provider API keys (Google, OpenAI, Anthropic), Opik observability, Slack integration |

---

## Project Structure

```
Atelier/
├── app/                        # FastAPI backend
│   ├── api/v1/endpoints/       # REST endpoints
│   │   ├── workspaces.py       # Workspace CRUD, members, invites, transfer
│   │   ├── agents.py           # Agents (workspace-scoped)
│   │   ├── skills.py           # Skills (workspace-scoped)
│   │   ├── integration.py      # Integration API for agent/session management
│   │   └── ...                 # Other endpoints
│   ├── agents/                 # Agent runtime, tools (DB, MCP, file, schedule, Claude Code)
│   ├── core/                   # Config, security, access control
│   ├── db/migrations/          # SQL migrations (001-027)
│   ├── repositories/           # Data access layer
│   │   ├── workspace_repo.py   # Workspace data access
│   │   └── ...                 # Other repos
│   ├── schemas/                # Pydantic request/response schemas
│   │   ├── workspace.py        # Workspace DTOs
│   │   └── ...
│   └── services/               # Business logic
├── web/                        # Next.js frontend
│   ├── app/(protected)/        # Auth-protected routes
│   │   ├── workspace/settings/ # Workspace management UI
│   │   ├── invite/             # Invite acceptance flow
│   │   └── ...                 # Other pages
│   ├── components/
│   │   ├── workspace/          # Workspace provider, transfer dialog
│   │   └── ...                 # Other components
│   └── lib/api/
│       ├── workspaces.ts       # Workspace API client
│       └── ...
├── docs/                       # Documentation & guides
└── pyproject.toml              # Python deps (uv)
```

---

## License

This project is licensed under the **MIT License** — see the [LICENSE](LICENSE) file for details.

---

<p align="center">
  Made with ❤️ by <a href="https://github.com/hiwcode">hiwcode</a>
</p>


<!-- Handy commands:
- Logs: docker compose logs -f api
- Stop: docker compose down (add -v to also wipe the DB volume)
- Rebuild after code changes: docker compose up -d --build -->