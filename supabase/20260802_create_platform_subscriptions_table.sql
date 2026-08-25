-- ============================================================================
-- Migration: Create platform_school_subscriptions Table
-- Run in Supabase Dashboard -> SQL Editor -> Run
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.platform_school_subscriptions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id         TEXT UNIQUE NOT NULL,
  school_name       TEXT,
  tier              TEXT NOT NULL DEFAULT 'Standard',
  status            TEXT NOT NULL DEFAULT 'Active',
  is_read_only      BOOLEAN DEFAULT FALSE,
  price_ghs         NUMERIC DEFAULT 0,
  renewal_date      TIMESTAMPTZ,
  next_billing_date TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Fast lookup index
CREATE INDEX IF NOT EXISTS idx_platform_subscriptions_school 
  ON public.platform_school_subscriptions(school_id);

-- Enable RLS with open access policies for authenticated users & platform operations
ALTER TABLE public.platform_school_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pss_open" ON public.platform_school_subscriptions;
CREATE POLICY "pss_open" ON public.platform_school_subscriptions 
  FOR ALL TO authenticated, anon 
  USING (TRUE) 
  WITH CHECK (TRUE);
