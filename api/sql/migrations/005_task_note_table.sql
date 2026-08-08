-- 003_task_note_table.sql
-- Migration: create `task_notes` table

BEGIN;

CREATE TABLE IF NOT EXISTS public.task_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  text TEXT NOT NULL,
  deadline BIGINT NOT NULL,
  notified BOOLEAN NOT NULL DEFAULT false,
  archived BOOLEAN NOT NULL DEFAULT false,
  created_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)
);

CREATE INDEX IF NOT EXISTS idx_task_notes_deadline ON public.task_notes(deadline);
CREATE INDEX IF NOT EXISTS idx_task_notes_user_id ON public.task_notes(user_id);

COMMIT;
