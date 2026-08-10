# Tools & Prompts

Agents can use built-in tools, workspace MCP connections, and workspace database
connections. Attach tools from an agent's **Configuration → Tools** section.

## Prompt Library

Prompt Library stores reusable system prompts and instructions in the active workspace.

1. Open **Prompt Library** and select **New prompt**.
2. Enter a name and prompt text, then save.
3. In an agent's configuration, select the saved prompt for **System prompt** or
   **Instruction**.

## Built-in tools

Some built-in entries add one function; others add a related function set. The list shown
in agent configuration comes from the runtime registry, so production hides local tools
that are disabled there.

### Computation and time

| Selector | Agent function | Purpose |
| --- | --- | --- |
| `add` | `add` | Add two numbers |
| `subtract` | `subtract` | Subtract the second number from the first |
| `multiply` | `multiply` | Multiply two numbers |
| `divide` | `divide` | Divide the first number by the second |
| `power` | `power` | Raise a base to an exponent |
| `sqrt` | `sqrt` | Calculate a square root |
| `percentage` | `percentage` | Calculate a percentage of a value |
| `get_current_time` | `get_current_time` | Return the time in an IANA timezone |
| `get_current_date` | `get_current_date` | Return the current UTC date |

### Automation and communication

| Selector | Functions added | Purpose and requirements |
| --- | --- | --- |
| `schedule` | `create_schedule`, `list_schedules`, `delete_schedule` | Manage one-time and cron schedules in the workspace |
| `workflow` | `list_workflows`, `create_workflow`, `update_workflow`, `delete_workflow` | Manage event-driven workflows in the workspace |
| `gate` | `list_gates`, `create_gate`, `update_gate`, `delete_gate` | Manage synchronous decision gates in the workspace |
| `events` | `list_event_types`, `create_event_type`, `delete_event_type` | Manage the workspace event-type registry |
| `notify` | `notify` | Send an in-app notification to the user |
| `send_email` | `send_email` | Send through the user's Gmail address and App Password configured under **Config → Email** |
| `slack` | `send_slack_message` | Post through the user's Slack bot configured under **Config → Slack** |
| `call_api` | `call_api` | Call a public HTTP endpoint with optional headers, query parameters, and body |
| `web_search` | `google_search` | Search the web through the Google ADK search tool |
| `analyze_document` | `analyze_document` | List or analyze workspace documents, or analyze a public document URL, using the configured Google model |
| `analyze_image` | `analyze_image` | List or analyze workspace images, or analyze a public image URL, using the configured Google model |
| `self_learning` | `save_skill`, `update_skill`, `list_learned_skills` | Save reusable instructions as skills attached to the current agent |
| `ui` | `plan`, `todo_write`, `show_card` | Render plan, checklist, and information cards in chat; these functions do not perform external actions |

`call_api` always blocks cloud-metadata destinations. In production it also rejects
private, loopback, link-local, reserved, multicast, and unspecified addresses; local URLs
remain available in development. It does not follow redirects, times out after 60
seconds, and truncates large text responses.

Assign management and communication tools deliberately. For example, `gate` can weaken
guardrails, while `send_email`, `slack`, and `call_api` can send data outside KRIY.

See [Schedules](using-schedules.md), [Triggers](using-event-workflows.md),
[Gates](using-gates.md), [Notifications](using-notifications.md), and
[Skills](using-skills.md) for their corresponding features.

### Local execution tools

The following selectors are available only when `ENVIRONMENT` is not `production` or
`prod`. They execute on the KRIY host and should remain disabled for untrusted users
unless the deployment provides an isolated sandbox.

| Selector | Purpose |
| --- | --- |
| `bash` | Run a shell command in the session workspace; 600-second timeout |
| `run_python` | Run Python in a persistent managed virtual environment; missing packages are installed automatically and generated files are returned as signed workspace URLs |
| `read_file` | Read a file with line numbers; maximum 10 MB |
| `write_file` | Create or replace a file |
| `edit_file` | Replace one unique exact text match |
| `glob_files` | Find files by glob pattern; maximum 500 results |
| `grep_files` | Search text with a regular expression; maximum 100 matching lines by default |
| `claude_code` | Delegate a coding task to the locally installed Claude Code CLI |

The file selectors only accept paths that resolve under `~/Desktop`. `bash` and
`run_python` use the session-specific directory under `KRIY_WORKSPACE_DIR`, or `temp/`
when that setting is absent. `claude_code` requires the `claude` executable on the host;
its working directory must also resolve under `~/Desktop` when explicitly supplied.

## MCP connections

MCP connections expose tools from external Model Context Protocol servers.

1. Open **MCP Connections** and add the server URL and transport.
2. Test the connection in **MCP Tester**.
3. Open an agent's configuration, add **MCP**, select the connection, and optionally
   restrict which server tools the agent may use.

MCP connections and their credentials are scoped to the active workspace.

## Database connections

Database connections let agents query PostgreSQL through an attached database tool.

1. Open **Database Connections** and add the PostgreSQL connection URL.
2. Enable **Read-only** if the agent should be restricted to `SELECT` queries.
3. Attach the connection from the agent's **Configuration → Tools** section.

Database connections are workspace-scoped. Read-only mode rejects writes, and query
results are limited to prevent oversized responses.

## Workspace scope

Prompt Library entries, MCP connections, database connections, schedules, workflows,
gates, event types, notifications, and learned skills use the active workspace. Personal
communication settings such as Gmail and Slack belong to the authenticated user.

Workspace resources can be moved through [Workspace Transfer](workspace-transfer.md).
