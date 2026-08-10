# Setup Guide

## Prerequisites

- **Python 3.10+**
- **Node.js 20.9+** and npm
- **PostgreSQL** (running, with a database created)
- **[uv](https://docs.astral.sh/uv/)** (Python package manager)

---

## 1. Clone and Install

```bash
# Clone the repository
git clone <repo-url>
cd kriy

# Create local environment files
cp .env.example .env
cp web/.env.example web/.env.local

# Install Python dependencies (backend)
uv sync

# Install Node dependencies (frontend)
cd web && npm install
```

---

## 2. Environment Variables

### Backend `.env` (project root)

Copy the maintained template, then replace the required values:

```bash
cp .env.example .env
```

At minimum, configure `DATABASE_URL`, `ENCRYPTION_KEY`, one authentication method
(`GOOGLE_CLIENT_ID` or `API_KEYS`), and a model provider key. Generate secrets instead
of using example values:

```bash
python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
openssl rand -hex 32
```

Use the first value for `ENCRYPTION_KEY` and the second for `JWT_SECRET`. In production,
set `ENVIRONMENT=production`, use a public `BACKEND_URL`, and restrict `CORS_ORIGINS`
with JSON-array syntax such as `["https://app.example.com"]`.

### Frontend `web/.env.local`

```bash
cp web/.env.example web/.env.local
```

Set the same variables in Vercel for production. Never put a production secret in
`NEXT_PUBLIC_API_KEY`; every `NEXT_PUBLIC_*` value is included in browser JavaScript.

---

## 3. Database Setup

Create the database referenced by `DATABASE_URL`. KRIY applies pending SQL migrations
from `app/db/migrations/` when the backend starts.

For a complete local container stack, run `docker compose up --build`. The included
Compose file is for development: PostgreSQL is bound to localhost and uses local defaults.
Production deployments should use managed secrets and a private database endpoint.

---

## 4. Run the Application

### Start the backend

```bash
# From project root
uv run uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

Backend runs at `http://localhost:8000`. Interactive API documentation is available at
`http://localhost:8000/api/docs`; ReDoc is at `/api/redoc` and OpenAPI JSON at
`/api/openapi.json` when `ENABLE_API_DOCS=true`.

### Start the frontend

```bash
# From web/
cd web
npm run dev
```

Frontend runs at `http://localhost:3004`.

---

## 5. Sign In

- **Google:** Sign in with Google (requires `GOOGLE_CLIENT_ID` configured)
- **API key:** If `API_KEYS` or `NEXT_PUBLIC_API_KEY` is set, requests use the API key without a browser login

When you sign in for the first time, a **personal workspace** is automatically created for you. All your resources (agents, prompts, connections) live inside workspaces. See [Using Workspaces](using-workspaces.md) for details.

---

## 6. Add Your API Keys (Config)

1. Go to **Config** in the sidebar
2. Under **Configuration**, add API keys for the providers you want to use:
   - **Google API Key** — for Gemini models
   - **OpenAI API Key** — for GPT and reasoning models
   - **Anthropic API Key** — for Claude models
3. Save — agents will use your personal key for the matching provider

If no personal key is set, the backend falls back to the corresponding key from `.env` (`GOOGLE_API_KEY`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`).

---

## Verify Setup

- **Frontend:** Open `http://localhost:3004` — you should see the login or dashboard
- **Backend:** Open `http://localhost:8000/api/v1/health` — should return `{"status":"ok"}`
