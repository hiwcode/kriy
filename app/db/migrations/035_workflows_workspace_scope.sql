-- Make workflows + event types workspace-scoped (consistent with schedules),
-- instead of per-user. Event-type uniqueness moves to (workspace_id, name), and
-- existing workflows inherit their agent's workspace so they stay visible.
DROP INDEX IF EXISTS idx_event_types_user_name;
CREATE UNIQUE INDEX IF NOT EXISTS idx_event_types_ws_name
    ON event_types (workspace_id, name);

UPDATE workflows w
   SET workspace_id = a.workspace_id
  FROM agents a
 WHERE w.agent_id = a.id
   AND w.workspace_id IS NULL;
