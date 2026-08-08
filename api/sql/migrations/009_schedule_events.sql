-- ============================================================
-- 007: Schedule Events Table
-- ============================================================
CREATE TABLE IF NOT EXISTS public.schedule_events (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  title           text NOT NULL,
  description     text,
  event_date      date NOT NULL,
  event_time      time,
  event_type      text NOT NULL DEFAULT 'other' CHECK (event_type IN ('reminder', 'meeting', 'payment', 'visit', 'call', 'other')),
  customer_id     uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  application_id  uuid REFERENCES public.applications(id) ON DELETE SET NULL,
  assigned_to     uuid[] DEFAULT '{}',
  created_by      uuid REFERENCES public.users(id) ON DELETE SET NULL,
  status          text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'done', 'cancelled')),
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_schedule_events_date ON public.schedule_events(event_date);
CREATE INDEX IF NOT EXISTS idx_schedule_events_created_by ON public.schedule_events(created_by);
CREATE INDEX IF NOT EXISTS idx_schedule_events_status ON public.schedule_events(status);
