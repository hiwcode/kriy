# Memory

KRIY has two complementary layers of memory:

- **Session context (short-term)** — the conversation itself. Within a single chat, the agent remembers earlier turns. The transcript *is* the session memory.
- **Facts Memory (long-term)** — persistent knowledge extracted from conversations that an agent can use across *any* future conversation.

Both are scoped to the active workspace.

## Session context

Every chat with an agent creates a **session** that stores the full conversation, and the agent keeps context *within* that session.

- Each conversation thread is a session with a unique ID; it stores all messages, tool calls, and responses.
- Sessions persist across reloads — reopening one resumes the conversation.
- Browse and reopen sessions from the agent's **Chat** and **History** tabs (open an agent → *History* lists its conversations; click one to resume it in *Chat*).
- When agents are transferred between workspaces, their sessions move with them.

> There is no separate "Session Memory" page — a session *is* its chat transcript, so you browse it where the chats live (per agent). Long-term memory that crosses conversations is **Facts Memory**, below.

---

## Facts Memory

Facts are persistent pieces of knowledge about the user — extracted automatically from conversations and available to agents across all sessions.

### What Gets Extracted

The system uses an LLM (Gemini Flash) to intelligently analyze user messages and extract meaningful, long-term facts:

| Type | Examples |
|------|----------|
| **Fact** | Name, role, company, location, tech stack, team structure |
| **Preference** | Preferred tools, coding style, communication preferences |
| **Goal** | Long-term objectives, recurring needs, projects |

The extraction is selective — it deliberately skips greetings, casual remarks, task-specific instructions, debugging output, and anything the assistant said about itself.

### How Extraction Works

1. When you click **Sync** on the Facts Memory page, the system processes conversation sessions
2. Only **user messages** are analyzed — assistant responses are included only as brief context
3. An LLM (Gemini 2.0 Flash) evaluates each conversation and extracts facts worth remembering
4. If the LLM is unavailable, a regex-based fallback catches common patterns like "my name is..." or "I prefer..."
5. Only **new sessions** are processed — sessions that were already extracted are skipped
6. Extracted facts are deduplicated against existing facts

### Managing Facts

1. Go to **Facts Memory** in the sidebar
2. Browse facts grouped by agent
3. Search by keyword
4. **Delete** a fact you don't want — it gets soft-deleted (dismissed)
5. Dismissed facts are permanently blocked from being re-created on future syncs

> Deleting a fact doesn't just hide it — it adds the fact to a blocklist so the next sync won't bring it back.

### How Agents Use Facts

When an agent runs, the memory service searches stored facts relevant to the user's query. These facts are injected as context, helping the agent personalize responses. For example, if the system knows "User prefers Python over JavaScript," the agent can tailor code suggestions accordingly.

---

## API Key for Extraction

Fact extraction uses your **personal Google API key** from the Config page. If no personal key is set, it falls back to the server's `.env` key. Make sure at least one is configured for extraction to work.

---

## Workspace Scoping

- Both session memory and facts memory are scoped to the active workspace
- Switching workspaces shows only that workspace's data
- When you [transfer agents](workspace-transfer.md) between workspaces, their sessions and memories move with them
- In team workspaces, agents can access all team members' facts for better context
