-- ============================================================================
-- Migration: Support Tickets Table & Realtime Setup
-- Execute in Supabase Dashboard -> SQL Editor
-- ============================================================================

-- 1. Ensure platform_support_tickets table exists with all fields
CREATE TABLE IF NOT EXISTS public.platform_support_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id TEXT NOT NULL,
  school_name TEXT,
  ticket_code TEXT,
  title TEXT NOT NULL,
  category TEXT DEFAULT 'General Support',
  description TEXT,
  priority TEXT NOT NULL DEFAULT 'Medium',
  status TEXT NOT NULL DEFAULT 'Open',
  sender_name TEXT,
  sender_role TEXT DEFAULT 'headteacher',
  sender_staff_id TEXT,
  assigned_to TEXT,
  messages JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Add columns safely if table was created previously without them
ALTER TABLE public.platform_support_tickets ADD COLUMN IF NOT EXISTS ticket_code TEXT;
ALTER TABLE public.platform_support_tickets ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'General Support';
ALTER TABLE public.platform_support_tickets ADD COLUMN IF NOT EXISTS messages JSONB DEFAULT '[]'::jsonb;
ALTER TABLE public.platform_support_tickets ADD COLUMN IF NOT EXISTS sender_name TEXT;
ALTER TABLE public.platform_support_tickets ADD COLUMN IF NOT EXISTS sender_role TEXT DEFAULT 'headteacher';
ALTER TABLE public.platform_support_tickets ADD COLUMN IF NOT EXISTS sender_staff_id TEXT;

-- 3. Enable Row Level Security (RLS)
ALTER TABLE public.platform_support_tickets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pst_open" ON public.platform_support_tickets;
CREATE POLICY "pst_open" ON public.platform_support_tickets FOR ALL TO authenticated USING (TRUE) WITH CHECK (TRUE);

DROP POLICY IF EXISTS "pst_anon_open" ON public.platform_support_tickets;
CREATE POLICY "pst_anon_open" ON public.platform_support_tickets FOR ALL TO anon USING (TRUE) WITH CHECK (TRUE);

-- 4. Enable Supabase Realtime for instant messaging
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
    AND schemaname = 'public' 
    AND tablename = 'platform_support_tickets'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.platform_support_tickets;
  END IF;
END $$;
