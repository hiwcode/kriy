# Tools & Prompts

Atelier provides a rich set of tools that agents can use during conversations — from basic math to file system access, external MCP servers, and database queries. All tools and prompts are **workspace-scoped** and shared with all workspace members. See [Workspaces](using-workspaces.md) for details.

## Prompt Library

```mermaid
flowchart LR
    subgraph Workspace["Active Workspace"]
        subgraph Tools["Available Tools"]
            Prompt["Prompt Library"]
            MCP["MCP Connections"]
            DB["Database Connections"]
            Builtin["Built-in Tools"]
        end
        Tools --> Agent["Agent Configuration"]
        Agent --> Chat["Agent can use\nin chat"]
    end
```

Reusable prompt templates that agents can reference.

### Create a Prompt

1. Go to **Prompt Library**
2. Click **New prompt**
3. Enter **Name** and **Prompt** text
4. Save

### Use in Agents

- In the agent **Configuration** tab, for System prompt or Instruction, choose a prompt from the Prompt Library instead of typing raw text

---

## Built-in Tools

Built-in tools are ready to use without any setup. Add them to an agent under **Configuration > Tools > Built-in**.

### Math Tools

| Tool | Description |
|------|-------------|
| `add` | Add two numbers |
| `subtract` | Subtract two numbers |
| `multiply` | Multiply two numbers |
| `divide` | Divide two numbers |
| `power` | Raise base to exponent |
| `sqrt` | Square root |
| `percentage` | Calculate percentage of a value |

### Time Tools

| Tool | Description |
|------|-------------|
| `get_current_time` | Current time in a specific timezone |
| `get_current_date` | Current date (UTC) |
| `days_between` | Days between two dates |
| `add_days` | Add days to a date |
| `get_weekday` | Get weekday name for a date |
| `time_until` | Time remaining until a target date |

### Text Tools

| Tool | Description |
|------|-------------|
| `to_uppercase` | Convert text to uppercase |
| `to_lowercase` | Convert text to lowercase |
| `word_count` | Count words in text |
| `char_count` | Count characters (excluding spaces) |
| `reverse_text` | Reverse the text |
| `title_case` | Convert to title case |
| `replace_text` | Replace occurrences in text |
| `extract_numbers` | Extract all numbers from text |

### Shell Tool

| Tool | Description |
|------|-------------|
| `bash` | Execute a shell command and return stdout + stderr. Working directory: `temp/` in project root. 600s timeout. |

### Code Interpreter

| Tool | Description |
|------|-------------|
| `run_python` | Run Python code **on the fly** and return its output — a code interpreter for computation, data wrangling, or quick scripts. |

The agent writes real Python and gets `stdout` back. Missing third-party packages
are **auto-installed on first use** (`import requests`, `import pandas`,
`import matplotlib` all just work), and installs persist across calls in a
dedicated virtual environment. 300s timeout.

**Files become URLs.** Anything the code saves (a chart, a CSV) is kept in the
shared workspace and returned as a link — `run_python` reports each new file as
`/api/v1/agents/workspace-file/<name>`. Images are rendered **inline in the chat**
when the agent mentions the filename. This is what powers requests like
*"pull this data and chart it"* or *"fetch from API A and post to API B"*:

1. The agent gathers data (an MCP tool, a DB tool, or `requests` inside the code).
2. It calls `run_python` to transform the data / plot a chart / call the other API.
3. The chart (`chart.png`) comes back as a URL and shows up in the conversation.

Prefer `run_python` over `bash` for anything compute/data-oriented — it handles
dependencies and artifacts for you.

> **Hosting note.** `run_python`, `bash`, and `claude_code` execute code on the
> server host. That's fine for your own/self-hosted instance, but before opening a
> deployment to untrusted users, run these behind a sandbox (container per run /
> a managed sandbox) or disable them.

### File System Tools

These tools let agents read, write, and search files on the host machine. All paths are restricted to `~/Desktop` for safety.

| Tool | Description |
|------|-------------|
| `read_file` | Read a file with line numbers. Supports `offset` and `limit` params. Max 10MB. |
| `write_file` | Create or overwrite a file. |
| `edit_file` | Surgical text replacement — `old_text` must be unique in the file. |
| `glob_files` | Find files by glob pattern (e.g. `**/*.py`). Max 500 results. |
| `grep_files` | Search file contents with regex. Skips `.git`, `node_modules`, etc. Max 100 results. |

**Safety features:**
- Path traversal protection — all paths resolve under `~/Desktop`
- Large file guards (10MB read limit, 2MB grep limit)
- Auto-skips binary and common non-code directories
- `edit_file` requires the match to be unique (prevents accidental bulk edits)

### Claude Code Tool

| Tool | Description |
|------|-------------|
| `claude_code` | Delegate complex coding tasks to your local Claude Code CLI. No API cost — uses your installed `claude` command. |

**Parameters:**
- `prompt` — The task description
- `working_directory` — Directory to run in (must be under `~/Desktop`, defaults to workspace)
- `allowed_tools` — Comma-separated list (e.g. `"Read,Edit,Bash,Grep,Glob"`). Leave empty to allow all.
- `max_turns` — Maximum agentic turns (default 25)

**Requirements:** Claude Code CLI must be installed on the host machine. Install from [claude.ai/code](https://claude.ai/code).

### Schedule Tool

| Tool | Description |
|------|-------------|
| `schedule` | Let agents create, list, and delete scheduled tasks. Supports one-time and recurring (cron) schedules. |

When you add `schedule` as a built-in tool, the agent gets three functions:
- `create_schedule` — Create a new scheduled task with cron expression or one-time datetime
- `list_schedules` — List all schedules in the workspace
- `delete_schedule` — Delete a schedule by ID

See [Using Schedules](using-schedules.md) for more details.

### Workflow Tool

| Tool | Description |
|------|-------------|
| `workflow` | Let an agent manage its Triggers: `list_workflows`, `create_workflow` (defaults to running this agent), `update_workflow`, `delete_workflow`. Workspace-scoped. |

### Events Tool

| Tool | Description |
|------|-------------|
| `events` | Manage the event-type registry: `list_event_types`, `create_event_type`, `delete_event_type`. Workspace-scoped. |

Together, `workflow` + `events` let an agent set up its own event-driven automations from
chat. See [Triggers](using-event-workflows.md).

### Notify Tool

| Tool | Description |
|------|-------------|
| `notify` | Send the user an in-app notification (`notify(title, body, level)`), delivered live to the notification bell. |

See [Notifications](using-notifications.md).

### Self-Learning Tool

| Tool | Description |
|------|-------------|
| `self_learning` | Let an agent turn experience into reusable skills it can reuse later. |

When enabled, the agent gets three functions:
- `save_skill(name, description, instructions)` — save what it just figured out as a reusable skill
- `update_skill(name, instructions, description?)` — refine an existing self-learned skill
- `list_learned_skills()` — list the skills it has taught itself

Skills are attached to that agent and available on its next runs. See [Using Skills](using-skills.md).

### UI Cards Tool

| Tool | Description |
|------|-------------|
| `ui` | Let an agent render rich **cards** in the chat instead of plain text — a plan, a live to-do checklist, or an info card. |

When you add `ui`, the agent gets three presentational functions (they take no
action — they only render a card from their arguments):

- `plan(title, steps)` — an ordered plan, shown before starting multi-step work
- `todo_write(title, todos, done, in_progress)` — a to-do checklist; call it again with an updated `done` / `in_progress` to show progress
- `show_card(title, body, footer, variant)` — a summary or callout card (`variant`: `info` | `success` | `warning` | `error`)

Once enabled, the agent is automatically instructed to use these — no prompt changes
needed. Cards stream live in the chat and are restored when you reopen the session.

---

## MCP Connections

MCP (Model Context Protocol) lets agents use tools from external MCP servers (GitHub, Jira, Slack, etc.).

### Add an MCP Connection

1. Go to **MCP Connections**
2. Add a connection with:
   - **Name** — Display name
   - **URL** — MCP server URL (e.g. `http://localhost:8000` or `stdio://...`)
   - **Transport** — SSE, Streamable HTTP, or Stdio
3. Save

### Attach to an Agent

1. Open an agent > **Configuration**
2. Under **Tools**, add **MCP**
3. Select the connection and choose which tools to enable

### Test MCP

- Go to **MCP Tester** to test connections and tools before using them in agents

---

## Database Connections

Agents can run SQL against PostgreSQL databases.

### Add a Database Connection

1. Go to **Database Connections**
2. Add a connection with:
   - **Name** — Display name
   - **Connection URL** — `postgresql://user:pass@host:port/dbname`
   - **Read-only** — If checked, only `SELECT` queries are allowed
3. Save

### Attach to an Agent

1. Open an agent > **Configuration**
2. Under **Tools**, add **Database**
3. Select the connection

### Behavior

- The agent receives a tool to run SQL
- Read-only connections restrict to `SELECT`
- Row limits apply to avoid large result sets

---

## Workspace Scoping

- **Prompts**, **MCP connections**, and **database connections** are all scoped to the active workspace
- When you switch workspaces, the available tools and prompts change accordingly
- You can [transfer resources](workspace-transfer.md) (prompts, MCP connections, database connections) between workspaces
