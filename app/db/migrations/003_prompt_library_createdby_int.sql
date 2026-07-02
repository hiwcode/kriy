-- Alter createdby to integer and add foreign key to users(id)
DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'prompt_library' AND column_name = 'createdby'
              AND data_type <> 'integer'
    ) THEN
        ALTER TABLE prompt_library
            ALTER COLUMN createdby TYPE INTEGER USING createdby::integer;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'prompt_library_createdby_fkey'
    ) THEN
        ALTER TABLE prompt_library
            ADD CONSTRAINT prompt_library_createdby_fkey
            FOREIGN KEY (createdby) REFERENCES users(id);
    END IF;
END $$;
