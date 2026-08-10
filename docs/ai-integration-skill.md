# Integrate KRIY with an AI coding agent

KRIY provides a portable integration skill for AI coding agents. Install it in an
existing backend repository, then ask your agent to add and verify the KRIY HTTP API
integration. The skill uses the API directly; it does not require a KRIY SDK.

## Install

From the backend project you want to connect to KRIY, run:

```bash
npx skills add hiwcode/kriy --skill integrate-kriy
```

The Skills CLI detects compatible coding agents and installs the skill at project
scope. To make it available across projects, install it globally:

```bash
npx skills add hiwcode/kriy --skill integrate-kriy -g -y
```

The source is public in
[`skills/integrate-kriy`](https://github.com/hiwcode/kriy/tree/main/skills/integrate-kriy),
so you can review the instructions and verification script before installing it.

## Use

Open your coding agent in the backend repository and prompt it with:

```text
Use $integrate-kriy to integrate KRIY into this backend and verify the result.
```

You can also describe the exact integration you need:

```text
Use $integrate-kriy to submit order.created events after an order commits. Add focused
tests and document the required production environment variables.
```

The agent will inspect the backend's language and conventions, choose the appropriate
synchronous or asynchronous API flow, keep credentials server-side, implement the
integration, and run relevant tests. It will not require live credentials to create or
unit-test the integration.

## Configure

The generated integration normally reads these server-side variables:

```bash
KRIY_BASE_URL="https://your-kriy-host"
KRIY_API_KEY="kriy-replace-me"
# Optional for a team workspace:
KRIY_WORKSPACE_ID="17"
```

Never expose `KRIY_API_KEY` in browser code. Omit `KRIY_WORKSPACE_ID` when using the API
key owner's personal workspace.

## Update

Check for and install skill updates with:

```bash
npx skills check
npx skills update
```

For a manual implementation, continue with the
[Integration quickstart](integration-quickstart.md). For exact endpoint contracts, see
the [Integration API reference](integration-api-reference.md).
