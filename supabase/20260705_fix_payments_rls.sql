-- ================================================================
-- Migration: Fix report_payments RLS policies
-- Run this in your Supabase SQL Editor
-- ================================================================

DROP POLICY IF EXISTS "report_payments_select" ON public.report_payments;
CREATE POLICY "report_payments_select"
  ON public.report_payments FOR SELECT
  USING (
    school_id = public.jwt_school_id()
    AND public.jwt_role() = 'super_admin'
  );

DROP POLICY IF EXISTS "report_payments_insert" ON public.report_payments;
CREATE POLICY "report_payments_insert"
  ON public.report_payments FOR INSERT
  WITH CHECK (
    school_id = public.jwt_school_id()
    AND public.jwt_role() = 'super_admin'
  );

DROP POLICY IF EXISTS "report_payments_update" ON public.report_payments;
CREATE POLICY "report_payments_update"
  ON public.report_payments FOR UPDATE
  USING (
    school_id = public.jwt_school_id()
    AND public.jwt_role() = 'super_admin'
  );

DROP POLICY IF EXISTS "report_payments_delete" ON public.report_payments;
CREATE POLICY "report_payments_delete"
  ON public.report_payments FOR DELETE
  USING (
    school_id = public.jwt_school_id()
    AND public.jwt_role() = 'super_admin'
  );
