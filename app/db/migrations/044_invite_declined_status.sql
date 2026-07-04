-- Allow invites to be declined (in addition to pending/accepted/expired).
ALTER TABLE workspace_invites DROP CONSTRAINT IF EXISTS workspace_invites_status_check;
ALTER TABLE workspace_invites ADD CONSTRAINT workspace_invites_status_check
    CHECK (status IN ('pending', 'accepted', 'expired', 'declined'));
