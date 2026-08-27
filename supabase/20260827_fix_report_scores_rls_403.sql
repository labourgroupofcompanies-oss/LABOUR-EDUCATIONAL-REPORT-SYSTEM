-- ============================================================================
-- Migration: 20260827_fix_report_scores_rls_403.sql
-- Date: 2026-08-27
-- Description: Comprehensive Fix for 403 Forbidden on report_scores
-- ============================================================================

-- 1. Dynamically drop EVERY existing policy on report_scores to remove conflicts
DO $$
DECLARE
  pol RECORD;
BEGIN
  FOR pol IN
    SELECT policyname
    FROM pg_policies
    WHERE tablename = 'report_scores' AND schemaname = 'public'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.report_scores', pol.policyname);
  END LOOP;
END $$;

-- 2. Make sure RLS is enabled on report_scores
ALTER TABLE public.report_scores ENABLE ROW LEVEL SECURITY;

-- 3. Grant table permissions to authenticated role
GRANT ALL ON public.report_scores TO authenticated;
GRANT ALL ON public.report_scores TO service_role;

-- 4. Create clean, robust policies for all CRUD operations

-- SELECT Policy
CREATE POLICY "report_scores_select_policy"
  ON public.report_scores
  FOR SELECT
  TO authenticated
  USING (
    school_id = COALESCE(
      (SELECT school_id FROM public.report_profiles WHERE id = auth.uid() LIMIT 1),
      auth.jwt() -> 'user_metadata' ->> 'school_id',
      auth.jwt() ->> 'school_id',
      school_id
    )
    OR EXISTS (
      SELECT 1 FROM public.report_profiles 
      WHERE id = auth.uid() AND role IN ('developer', 'platform_admin', 'super_admin')
    )
  );

-- INSERT Policy
CREATE POLICY "report_scores_insert_policy"
  ON public.report_scores
  FOR INSERT
  TO authenticated
  WITH CHECK (
    school_id = COALESCE(
      (SELECT school_id FROM public.report_profiles WHERE id = auth.uid() LIMIT 1),
      auth.jwt() -> 'user_metadata' ->> 'school_id',
      auth.jwt() ->> 'school_id',
      school_id
    )
    OR EXISTS (
      SELECT 1 FROM public.report_profiles 
      WHERE id = auth.uid() AND role IN ('developer', 'platform_admin', 'super_admin')
    )
  );

-- UPDATE Policy
CREATE POLICY "report_scores_update_policy"
  ON public.report_scores
  FOR UPDATE
  TO authenticated
  USING (
    school_id = COALESCE(
      (SELECT school_id FROM public.report_profiles WHERE id = auth.uid() LIMIT 1),
      auth.jwt() -> 'user_metadata' ->> 'school_id',
      auth.jwt() ->> 'school_id',
      school_id
    )
    OR EXISTS (
      SELECT 1 FROM public.report_profiles 
      WHERE id = auth.uid() AND role IN ('developer', 'platform_admin', 'super_admin')
    )
  )
  WITH CHECK (
    school_id = COALESCE(
      (SELECT school_id FROM public.report_profiles WHERE id = auth.uid() LIMIT 1),
      auth.jwt() -> 'user_metadata' ->> 'school_id',
      auth.jwt() ->> 'school_id',
      school_id
    )
    OR EXISTS (
      SELECT 1 FROM public.report_profiles 
      WHERE id = auth.uid() AND role IN ('developer', 'platform_admin', 'super_admin')
    )
  );

-- DELETE Policy
CREATE POLICY "report_scores_delete_policy"
  ON public.report_scores
  FOR DELETE
  TO authenticated
  USING (
    school_id = COALESCE(
      (SELECT school_id FROM public.report_profiles WHERE id = auth.uid() LIMIT 1),
      auth.jwt() -> 'user_metadata' ->> 'school_id',
      auth.jwt() ->> 'school_id',
      school_id
    )
    OR EXISTS (
      SELECT 1 FROM public.report_profiles 
      WHERE id = auth.uid() AND role IN ('developer', 'platform_admin', 'super_admin')
    )
  );

-- 5. Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
