-- The synchronous policy-guard / interception feature was removed. Drop its
-- decisions log table; nothing writes to or reads from it anymore.
DROP TABLE IF EXISTS interception_decisions;
