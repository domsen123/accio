-- Hand-edited: ADD COLUMN -> ADD COLUMN IF NOT EXISTS per DESIGN-VAULT-MIGRATION.
-- The drizzle snapshot still describes the target state (column present, nullable jsonb).
ALTER TABLE "orchestrator_actions" ADD COLUMN IF NOT EXISTS "meta" jsonb;
