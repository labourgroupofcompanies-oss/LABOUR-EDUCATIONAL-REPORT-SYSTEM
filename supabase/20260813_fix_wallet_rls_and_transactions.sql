-- ============================================================================
-- Migration: Fix Wallet & Payment Transaction RLS + Open Platform Read Access
-- 
-- Problem: The original RLS policies on wallet_transactions and 
--          payment_transactions reference "public.profiles" which does NOT
--          exist. The real table is "public.report_profiles".
--          This causes the SELECT query to silently return 0 rows.
--
-- This migration fixes RLS so:
--   1. School staff can read their own school's transactions
--   2. Platform super admins / developers can read ALL transactions
--   3. Authenticated users can INSERT wallet_transactions (for top-ups)
--   4. payment_transactions SELECT is also fixed
--
-- Run this ENTIRE script in your Supabase SQL Editor.
-- ============================================================================

-- ─── 1. FIX wallet_transactions SELECT POLICY ───────────────────────────────
-- Drop old broken policy referencing "public.profiles"
DROP POLICY IF EXISTS wallet_ledger_select_school ON public.wallet_transactions;

-- Create new policy referencing the CORRECT table "public.report_profiles"
CREATE POLICY wallet_ledger_select_school
  ON public.wallet_transactions FOR SELECT TO authenticated
  USING (
    -- School staff can see their own school's wallet transactions
    school_id = (
      SELECT school_id FROM public.report_profiles WHERE id = auth.uid()
    )
    OR
    -- Platform admins/developers can see ALL wallet transactions
    EXISTS (
      SELECT 1 FROM public.report_profiles
      WHERE id = auth.uid()
        AND role IN ('developer', 'accountant', 'operations', 'super_admin', 'admin')
    )
  );

-- ─── 2. ADD wallet_transactions INSERT POLICY ────────────────────────────────
-- Allow authenticated users to insert wallet transactions for their own school
-- (needed for frontend fallback top-up path when RPC is unavailable)
DROP POLICY IF EXISTS wallet_ledger_insert_school ON public.wallet_transactions;
CREATE POLICY wallet_ledger_insert_school
  ON public.wallet_transactions FOR INSERT TO authenticated
  WITH CHECK (
    school_id = (
      SELECT school_id FROM public.report_profiles WHERE id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM public.report_profiles
      WHERE id = auth.uid()
        AND role IN ('developer', 'accountant', 'operations', 'super_admin', 'admin', 'headteacher')
    )
  );

-- ─── 3. FIX payment_transactions SELECT POLICY ──────────────────────────────
DROP POLICY IF EXISTS payment_txn_select_school ON public.payment_transactions;
CREATE POLICY payment_txn_select_school
  ON public.payment_transactions FOR SELECT TO authenticated
  USING (
    school_id = (
      SELECT school_id FROM public.report_profiles WHERE id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM public.report_profiles
      WHERE id = auth.uid()
        AND role IN ('developer', 'accountant', 'operations', 'super_admin', 'admin')
    )
  );

-- ─── 4. FIX payment_events SELECT POLICY ─────────────────────────────────────
DROP POLICY IF EXISTS payment_events_select ON public.payment_events;
CREATE POLICY payment_events_select
  ON public.payment_events FOR SELECT TO authenticated
  USING (
    school_id = (
      SELECT school_id FROM public.report_profiles WHERE id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM public.report_profiles
      WHERE id = auth.uid()
        AND role IN ('developer', 'accountant', 'operations', 'super_admin', 'admin')
    )
  );

-- ─── 5. FIX report_schools UPDATE POLICY ────────────────────────────────────
-- Ensure platform admins and headteachers can update school subscription config
DROP POLICY IF EXISTS "report_schools_update_config" ON public.report_schools;
CREATE POLICY "report_schools_update_config"
  ON public.report_schools FOR UPDATE TO authenticated
  USING (
    id = (SELECT school_id FROM public.report_profiles WHERE id = auth.uid())
    OR
    EXISTS (
      SELECT 1 FROM public.report_profiles
      WHERE id = auth.uid()
        AND role IN ('developer', 'accountant', 'operations', 'super_admin', 'admin', 'headteacher')
    )
  );

-- ─── 6. FIX school_term_bills SELECT & INSERT POLICIES ─────────────────────
DROP POLICY IF EXISTS "school_term_bills_open_select" ON public.school_term_bills;
CREATE POLICY "school_term_bills_open_select"
  ON public.school_term_bills FOR SELECT TO authenticated
  USING (
    school_id = (SELECT school_id FROM public.report_profiles WHERE id = auth.uid())
    OR
    EXISTS (
      SELECT 1 FROM public.report_profiles
      WHERE id = auth.uid()
        AND role IN ('developer', 'accountant', 'operations', 'super_admin', 'admin', 'headteacher')
    )
  );

-- ─── 7. FIX platform_subscription_audit POLICIES ────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'platform_subscription_audit') THEN
    EXECUTE 'ALTER TABLE public.platform_subscription_audit ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "sub_audit_select" ON public.platform_subscription_audit';
    EXECUTE 'DROP POLICY IF EXISTS "sub_audit_insert" ON public.platform_subscription_audit';
    EXECUTE 'CREATE POLICY "sub_audit_select" ON public.platform_subscription_audit FOR SELECT TO authenticated USING (TRUE)';
    EXECUTE 'CREATE POLICY "sub_audit_insert" ON public.platform_subscription_audit FOR INSERT TO authenticated WITH CHECK (TRUE)';
  END IF;
END $$;

-- ─── 8. ALSO FIX platform_wallet_transactions (legacy table) ─────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'platform_wallet_transactions') THEN
    EXECUTE 'DROP POLICY IF EXISTS "pwt_open" ON public.platform_wallet_transactions';
    EXECUTE 'DROP POLICY IF EXISTS "pwt_select_all" ON public.platform_wallet_transactions';
    EXECUTE 'CREATE POLICY "pwt_select_all" ON public.platform_wallet_transactions FOR SELECT TO authenticated USING (TRUE)';
  END IF;
END $$;

-- ─── 9. GRANT ALL NECESSARY PERMISSIONS ──────────────────────────────────────
GRANT SELECT, UPDATE ON public.report_schools TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.wallet_transactions TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.payment_transactions TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.school_term_bills TO authenticated;
GRANT SELECT ON public.payment_events TO authenticated;

-- ─── 10. UPDATE platform_school_stats VIEW TO INCLUDE WALLET BALANCE ────────
DROP VIEW IF EXISTS public.platform_school_stats CASCADE;

CREATE VIEW public.platform_school_stats AS
SELECT
  rs.id                                                       AS school_id,
  rs.name                                                     AS school_name,
  COALESCE(rs.wallet_balance, 0.00)                           AS wallet_balance,
  rs.per_learner_rate_override,
  COALESCE(rs.is_first_term_free, TRUE)                       AS is_first_term_free,
  COALESCE(rs.first_term_free_terminated, FALSE)              AS first_term_free_terminated,
  rs.subscription_exempt_until,
  COALESCE(rs.school_category, 'Private')                     AS school_category,
  COALESCE(rs.district, '')                                   AS district,
  COALESCE(rs.region, '')                                     AS region,
  COALESCE(rs.circuit, '')                                    AS circuit,
  COALESCE(rs.current_academic_year, '')                      AS current_academic_year,
  COALESCE(rs.current_term, 'Term 1')                         AS current_term,
  COALESCE(rs.is_read_only, FALSE)                            AS is_read_only,
  COALESCE(rs.reports_released, FALSE)                        AS reports_released,
  COALESCE(rs.subscription_tier, 'Standard')                  AS subscription_tier,
  COALESCE(rs.subscription_status, 'Active')                  AS subscription_status,
  COALESCE(learner_counts.cnt, 0)                             AS learners_count,
  COALESCE(staff_counts.cnt, 0)                               AS staff_count,
  headteachers.full_name                                      AS headteacher_name,
  COALESCE(summary_counts.total_cnt, 0)                       AS reports_count,
  COALESCE(summary_counts.released_cnt, 0)                    AS released_reports_count,
  rs.created_at,
  rs.updated_at
FROM public.report_schools rs

-- Count learners per school
LEFT JOIN (
  SELECT school_id, COUNT(*) AS cnt
  FROM public.report_learners
  GROUP BY school_id
) learner_counts ON learner_counts.school_id = rs.id

-- Count teaching staff per school
LEFT JOIN (
  SELECT school_id, COUNT(*) AS cnt
  FROM public.report_profiles
  WHERE role IN ('teacher', 'class_teacher')
  GROUP BY school_id
) staff_counts ON staff_counts.school_id = rs.id

-- Get headteacher name
LEFT JOIN (
  SELECT DISTINCT ON (school_id) school_id, full_name
  FROM public.report_profiles
  WHERE role = 'headteacher'
  ORDER BY school_id, created_at DESC
) headteachers ON headteachers.school_id = rs.id

-- Count report summaries
LEFT JOIN (
  SELECT
    school_id,
    COUNT(*) AS total_cnt,
    COUNT(*) FILTER (WHERE is_released = TRUE) AS released_cnt
  FROM public.report_summaries
  GROUP BY school_id
) summary_counts ON summary_counts.school_id = rs.id;

GRANT SELECT ON public.platform_school_stats TO authenticated;

-- Confirm
DO $$
BEGIN
  RAISE NOTICE '✅ wallet_transactions, payment_transactions, and payment_events RLS policies FIXED.';
  RAISE NOTICE '✅ platform_school_stats VIEW updated to include wallet_balance.';
  RAISE NOTICE '✅ All policies now reference public.report_profiles (not the non-existent public.profiles).';
END $$;
