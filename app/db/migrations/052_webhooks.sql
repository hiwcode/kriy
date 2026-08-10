-- Outbound webhooks (Phase 1): subscriptions + a delivery log.
-- KRIY POSTs platform events (e.g. run.completed) to subscribed URLs, signed
-- and retried, so external systems get async results back. See
-- docs/outbound-webhooks-design.md.
CREATE TABLE IF NOT EXISTS webhook_subscriptions (
    id           SERIAL PRIMARY KEY,
    workspace_id INTEGER,
    user_id      INTEGER,
    url          TEXT    NOT NULL,
    secret       TEXT    NOT NULL,
    event_glob   TEXT    NOT NULL DEFAULT 'run.completed',  -- matched against event type
    enabled      BOOLEAN NOT NULL DEFAULT TRUE,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS webhook_deliveries (
    id              SERIAL PRIMARY KEY,
    subscription_id INTEGER NOT NULL REFERENCES webhook_subscriptions(id) ON DELETE CASCADE,
    event_id        TEXT    NOT NULL,                 -- the delivered event's id (dedupe key)
    type            TEXT    NOT NULL,
    payload         JSONB,                            -- the full signed envelope
    status          TEXT    NOT NULL DEFAULT 'pending',  -- pending | success | failed
    attempts        INTEGER NOT NULL DEFAULT 0,
    response_code   INTEGER,
    error           TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    delivered_at    TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_webhook_subs_ws ON webhook_subscriptions (workspace_id, enabled);
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_sub ON webhook_deliveries (subscription_id, created_at DESC);
