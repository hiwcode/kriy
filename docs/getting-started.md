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

# Install Python dependencies (backend)
uv sync

# Install Node dependencies (frontend)
cd web && npm install
```

---

## 2. Environment Variables

### Backend `.env` (project root)

Create a `.env` file in the project root:

```env
# Required: PostgreSQL connection
DATABASE_URL=postgresql://user:password@localhost:5432/kriy

# LLM API keys (set for providers you want to use)
GOOGLE_API_KEY=your-google-api-key       # Gemini models
OPENAI_API_KEY=your-openai-api-key       # GPT / o-series models (optional)
ANTHROPIC_API_KEY=your-anthropic-api-key  # Claude models (optional)

# Optional: Auth
# For API key auth (scripts, CI)
API_KEYS=key1,key2

# For Google OAuth (web users)
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com

# Optional: CORS (default allows all)
CORS_ORIGINS=http://localhost:3004
```

### Frontend `web/.env.local`

```env
# Backend API URL (default: http://localhost:8000)
NEXT_PUBLIC_API_BASE_URL=http://localhost:8000

# Development only: this value is exposed to the browser; never use a personal key here
NEXT_PUBLIC_API_KEY=your-api-key

# Optional: Google OAuth
NEXT_PUBLIC_GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
```

---

## 3. Database Setup

Create the database referenced by `DATABASE_URL`. KRIY applies pending SQL migrations
from `app/db/migrations/` when the backend starts.

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
