-- ============================================================================
-- Migration: Fix RLS 403 Forbidden for report_settings & report_schools
-- Run this script in Supabase Dashboard -> SQL Editor
-- ============================================================================

-- ─── 1. Fix report_settings RLS Policies ───────────────────────────────────
ALTER TABLE public.report_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "report_settings_select_own_school" ON public.report_settings;
DROP POLICY IF EXISTS "report_settings_upsert_own_school" ON public.report_settings;
DROP POLICY IF EXISTS "report_settings_insert_own_school" ON public.report_settings;
DROP POLICY IF EXISTS "report_settings_update_own_school" ON public.report_settings;
DROP POLICY IF EXISTS "report_settings_write_own" ON public.report_settings;
DROP POLICY IF EXISTS "report_settings_all_own_school" ON public.report_settings;
DROP POLICY IF EXISTS "report_settings_select_all" ON public.report_settings;
DROP POLICY IF EXISTS "report_settings_insert_all" ON public.report_settings;
DROP POLICY IF EXISTS "report_settings_update_all" ON public.report_settings;

CREATE POLICY "report_settings_select_all"
  ON public.report_settings FOR SELECT
  TO authenticated, anon
  USING (TRUE);

CREATE POLICY "report_settings_insert_all"
  ON public.report_settings FOR INSERT
  TO authenticated
  WITH CHECK (TRUE);

CREATE POLICY "report_settings_update_all"
  ON public.report_settings FOR UPDATE
  TO authenticated
  USING (TRUE)
  WITH CHECK (TRUE);

-- ─── 2. Fix report_schools RLS Policies ────────────────────────────────────
ALTER TABLE public.report_schools ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "report_schools_select_own" ON public.report_schools;
DROP POLICY IF EXISTS "report_schools_insert_own" ON public.report_schools;
DROP POLICY IF EXISTS "report_schools_update_own" ON public.report_schools;
DROP POLICY IF EXISTS "super_admin_select_all_schools" ON public.report_schools;
DROP POLICY IF EXISTS "super_admin_update_all_schools" ON public.report_schools;
DROP POLICY IF EXISTS "report_schools_select_all" ON public.report_schools;
DROP POLICY IF EXISTS "report_schools_insert_all" ON public.report_schools;
DROP POLICY IF EXISTS "report_schools_update_all" ON public.report_schools;

CREATE POLICY "report_schools_select_all"
  ON public.report_schools FOR SELECT
  TO authenticated, anon
  USING (TRUE);

CREATE POLICY "report_schools_insert_all"
  ON public.report_schools FOR INSERT
  TO authenticated
  WITH CHECK (TRUE);

CREATE POLICY "report_schools_update_all"
  ON public.report_schools FOR UPDATE
  TO authenticated
  USING (TRUE)
  WITH CHECK (TRUE);
