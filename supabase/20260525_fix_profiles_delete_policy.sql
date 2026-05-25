-- ================================================================
-- Migration to add missing RLS delete policy to report_profiles
-- Run this in your Supabase SQL Editor
-- ================================================================

DROP POLICY IF EXISTS "report_profiles_delete_own_school" ON public.report_profiles;

CREATE POLICY "report_profiles_delete_own_school"
  ON public.report_profiles FOR DELETE
  USING (school_id = COALESCE(
    auth.jwt() ->> 'school_id',
    auth.jwt() -> 'user_metadata' ->> 'school_id'
  ));
