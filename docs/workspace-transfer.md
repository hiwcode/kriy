# Workspace Transfer

Transfer resources between workspaces owned by the same user.

## Overview

The workspace transfer feature allows you to move resources (agents, prompts, MCP connections, and database connections) from one workspace to another. This is useful when you want to:

- Organize resources differently across workspaces
- Move resources from your personal workspace to a team workspace
- Consolidate resources from multiple workspaces

## Prerequisites

- You must be a member of both the source and target workspaces
- Both workspaces must be owned by the same user
- You need valid authentication credentials

## API Endpoint

```
POST /api/v1/workspaces/transfer
```

### Request Body

```json
{
  "source_workspace_id": 1,
  "target_workspace_id": 2,
  "resource_type": "agents",
  "resource_ids": [1, 2, 3]  // Optional
}
```

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `source_workspace_id` | integer | Yes | ID of the workspace to transfer from |
| `target_workspace_id` | integer | Yes | ID of the workspace to transfer to |
| `resource_type` | string | Yes | Type of resources: `agents`, `prompts`, `mcp_connections`, `database_connections`, or `all` |
| `resource_ids` | array of integers | No | Specific resource IDs to transfer. If omitted, all resources of the specified type will be transferred |

### Response

```json
{
  "success": true,
  "message": "Successfully transferred 5 resource(s)",
  "data": {
    "transferred_agents": 3,
    "transferred_prompts": 2,
    "transferred_mcp_connections": 0,
    "transferred_database_connections": 0,
    "total_transferred": 5
  },
  "pagination": null
}
```

## Examples

### Transfer All Agents

Transfer all agents from workspace 1 (personal) to workspace 2 (next):

```bash
curl -X POST http://localhost:8000/api/v1/workspaces/transfer \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-api-key" \
  -d '{
    "source_workspace_id": 1,
    "target_workspace_id": 2,
    "resource_type": "agents"
  }'
```

### Transfer Specific Prompts

Transfer only specific prompts by ID:

```bash
curl -X POST http://localhost:8000/api/v1/workspaces/transfer \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-api-key" \
  -d '{
    "source_workspace_id": 1,
    "target_workspace_id": 2,
    "resource_type": "prompts",
    "resource_ids": [10, 15, 20]
  }'
```

### Transfer All Resources

Transfer all resources from one workspace to another:

```bash
curl -X POST http://localhost:8000/api/v1/workspaces/transfer \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-api-key" \
  -d '{
    "source_workspace_id": 1,
    "target_workspace_id": 2,
    "resource_type": "all"
  }'
```

## Using with Frontend

If you're using the web interface, you would typically make this request from your workspace management UI:

```typescript
async function transferResources(
  sourceWorkspaceId: number,
  targetWorkspaceId: number,
  resourceType: string,
  resourceIds?: number[]
) {
  const response = await fetch('/api/v1/workspaces/transfer', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': apiKey,
    },
    body: JSON.stringify({
      source_workspace_id: sourceWorkspaceId,
      target_workspace_id: targetWorkspaceId,
      resource_type: resourceType,
      resource_ids: resourceIds,
    }),
  });
  
  return await response.json();
}

// Example usage: Transfer from personal to next workspace
const result = await transferResources(
  1,  // personal workspace
  2,  // next workspace
  'agents'
);

console.log(`Transferred ${result.data.total_transferred} resources`);
```

## Error Handling

The endpoint will return appropriate error codes:

- `404 Not Found` - Source or target workspace doesn't exist
- `403 Forbidden` - User is not a member of one or both workspaces, or workspaces don't belong to the same user
- `400 Bad Request` - Invalid request parameters

## Notes

- Transfers are atomic - either all specified resources are transferred, or none are
- Resources maintain their original metadata (created_by, timestamps, etc.)
- Only the workspace_id field is updated
- Related resources (like agents referencing prompts) will still work after transfer
- **When you transfer agents**, their **sessions** (conversation history), **traces** (session tool/usage data), and **fact memory** are transferred with them: their `workspace_id` is updated to the target workspace so they appear in the target workspace’s dashboard and session/memory views
- The transfer operation is logged in the database transaction
