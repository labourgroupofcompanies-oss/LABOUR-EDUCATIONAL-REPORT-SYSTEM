-- ================================================================
-- Migration: Add missing columns to report_schools and fix RLS
-- Run this in the Supabase SQL Editor
-- ================================================================

-- 1. Add missing columns that Settings.jsx expects
ALTER TABLE public.report_schools
  ADD COLUMN IF NOT EXISTS motto                  TEXT,
  ADD COLUMN IF NOT EXISTS logo_url               TEXT,
  ADD COLUMN IF NOT EXISTS current_academic_year  TEXT,
  ADD COLUMN IF NOT EXISTS current_term           TEXT DEFAULT 'Term 1',
  ADD COLUMN IF NOT EXISTS vacation_date          TEXT,
  ADD COLUMN IF NOT EXISTS next_term_begins       TEXT,
  ADD COLUMN IF NOT EXISTS updated_at             TIMESTAMPTZ DEFAULT NOW();

-- 2. Fix RLS: Allow school admins/teachers to INSERT and UPDATE their own school row
--    Drop old select policy that uses a simpler JWT path, and recreate with COALESCE
DROP POLICY IF EXISTS "report_schools_select_own_school" ON public.report_schools;
DROP POLICY IF EXISTS "report_schools_insert_own_school" ON public.report_schools;
DROP POLICY IF EXISTS "report_schools_update_own_school" ON public.report_schools;

CREATE POLICY "report_schools_select_own_school"
  ON public.report_schools FOR SELECT
  USING (
    id = COALESCE(
      auth.jwt() ->> 'school_id',
      auth.jwt() -> 'user_metadata' ->> 'school_id'
    )
  );

CREATE POLICY "report_schools_insert_own_school"
  ON public.report_schools FOR INSERT
  WITH CHECK (
    id = COALESCE(
      auth.jwt() ->> 'school_id',
      auth.jwt() -> 'user_metadata' ->> 'school_id'
    )
  );

CREATE POLICY "report_schools_update_own_school"
  ON public.report_schools FOR UPDATE
  USING (
    id = COALESCE(
      auth.jwt() ->> 'school_id',
      auth.jwt() -> 'user_metadata' ->> 'school_id'
    )
  )
  WITH CHECK (
    id = COALESCE(
      auth.jwt() ->> 'school_id',
      auth.jwt() -> 'user_metadata' ->> 'school_id'
    )
  );
