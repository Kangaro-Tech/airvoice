-- Add custom_modules to users table

BEGIN;

ALTER TABLE users ADD COLUMN IF NOT EXISTS custom_modules JSONB DEFAULT NULL;

COMMIT;
