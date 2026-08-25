-- ============================================================================
-- Migration: Create platform_school_timeline_events Table
-- Run in Supabase Dashboard -> SQL Editor -> Run
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.platform_school_timeline_events (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id    TEXT NOT NULL,
  event_type   TEXT NOT NULL,
  title        TEXT NOT NULL,
  description  TEXT,
  actor_name   TEXT DEFAULT 'Super Admin',
  metadata     JSONB DEFAULT '{}'::jsonb,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Fast lookup index
CREATE INDEX IF NOT EXISTS idx_timeline_events_school 
  ON public.platform_school_timeline_events(school_id, created_at DESC);

-- Enable RLS with open access policies for authenticated users & platform operations
ALTER TABLE public.platform_school_timeline_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pste_open" ON public.platform_school_timeline_events;
CREATE POLICY "pste_open" ON public.platform_school_timeline_events 
  FOR ALL TO authenticated, anon 
  USING (TRUE) 
  WITH CHECK (TRUE);
