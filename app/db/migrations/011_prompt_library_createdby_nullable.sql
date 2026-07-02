-- Allow createdby to be nullable for API key auth (no user context)
ALTER TABLE prompt_library ALTER COLUMN createdby DROP NOT NULL;
