# Workspaces

Workspaces organize your resources (agents, prompts, MCP connections, database connections) into separate scopes so teams and individuals can work independently.

---

## Personal Workspace

When you first sign in, Atelier automatically creates a **personal workspace** for you. All resources you create are associated with this workspace by default.

- Every user gets exactly one personal workspace
- The personal workspace cannot be deleted
- Resources in your personal workspace are visible only to you

---

## Team Workspaces

Create a team workspace to collaborate with others. All members of a workspace can see and manage its resources.

### Creating a Workspace

1. Click your workspace name in the sidebar
2. Select **Create Workspace**
3. Enter a name and optional description
4. You become the **owner** of the new workspace

### Switching Workspaces

Use the workspace switcher in the sidebar to change your active workspace. When you switch:

- The resource lists (agents, prompts, etc.) update to show only that workspace's resources
- New resources you create are placed in the active workspace
- The frontend sends the `X-Workspace-Id` header automatically

---

## Roles

| Role | View resources | Create/edit resources | Manage members | Delete workspace |
|------|:-:|:-:|:-:|:-:|
| **Member** | Yes | Yes | No | No |
| **Admin** | Yes | Yes | Yes | No |
| **Owner** | Yes | Yes | Yes | Yes |

- The user who creates a workspace is its **owner**
- Owners and admins can invite members and change roles
- Members can create, edit, and delete resources within the workspace

---

## Inviting Members

1. Navigate to **Workspace Settings** (gear icon next to the workspace name)
2. Click **Invite Member**
3. Enter the person's email address and choose a role
4. They receive an invite link; clicking it adds them to the workspace

### Accepting an Invite

Open the invite link in your browser while signed in. You are added to the workspace automatically and can switch to it.

---

## Resource Scoping

All resources are scoped to a workspace:

- **Agents** — each agent belongs to one workspace
- **Prompt Library** — prompts are workspace-scoped
- **MCP Connections** — connections are workspace-scoped
- **Database Connections** — connections are workspace-scoped
- **Sessions** — conversation history is workspace-scoped (via `workspace_id` on `agent_sessions`)
- **Memories** — extracted facts are workspace-scoped (via `workspace_id` on `agent_memories`)

### Access Control

- When you access a resource (get, update, delete), the system checks that you are a member of the resource's workspace
- If the resource has no workspace (legacy data), ownership falls back to `created_by` matching your user ID
- Unauthorized access returns **404 Not Found** (not 403) to avoid leaking resource existence

### Ownership

The `created_by` field is always set server-side from your authentication token. You cannot set or override it via the API request body — any `created_by` value in the payload is silently ignored.

---

## API Details

### Workspace Header

Include `X-Workspace-Id` in your API requests to target a specific workspace:

```
X-Workspace-Id: 42
```

If omitted, the API uses your personal workspace.

### Example: Create an Agent in a Specific Workspace

```bash
curl -X POST http://localhost:8000/api/v1/agents/ \
  -H "Authorization: Bearer <google_token>" \
  -H "X-Workspace-Id: 42" \
  -H "Content-Type: application/json" \
  -d '{"name": "my-agent", "label": "My Agent", "model": "gemini-2.5-flash"}'
```

The agent's `created_by` is set from your auth token and `workspace_id` is set to `42`.

---

## Workspace Transfer

You can transfer resources (agents, prompts, MCP connections, database connections) between workspaces. When agents are transferred, their sessions and memories move with them.

See [Workspace Transfer](workspace-transfer.md) for full details and API examples.

---

## Demo Data

When a new personal workspace is created, Atelier seeds it with:

- A demo **system prompt** and **instruction prompt** in the Prompt Library
- A demo **agent** configured with those prompts

This gives new users a working example to start from.
