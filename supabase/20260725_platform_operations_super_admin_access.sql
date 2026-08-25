-- ============================================================================
-- Migration: Super Admin Platform Operations Access Policies
-- Allows Super Admin to read all schools, learners, profiles, scores & summaries
-- Run in Supabase SQL Editor
-- ============================================================================

-- ─── 1. Add Platform Control Columns to report_schools ───────────────────────
ALTER TABLE public.report_schools
  ADD COLUMN IF NOT EXISTS is_read_only        BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS reports_released    BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS subscription_tier   VARCHAR(20)  DEFAULT 'Standard',
  ADD COLUMN IF NOT EXISTS subscription_status VARCHAR(20)  DEFAULT 'Active',
  ADD COLUMN IF NOT EXISTS headteacher_name    TEXT,
  ADD COLUMN IF NOT EXISTS learners_count      INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS staff_count         INTEGER DEFAULT 0;

-- ─── 2. Add is_released column to report_summaries (if missing) ──────────────
ALTER TABLE public.report_summaries
  ADD COLUMN IF NOT EXISTS is_released BOOLEAN NOT NULL DEFAULT FALSE;

-- ─── 3. is_super_admin() Helper Function ─────────────────────────────────────
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(
    (auth.jwt() -> 'user_metadata' ->> 'role'),
    (auth.jwt() ->> 'user_role'),
    (auth.jwt() ->> 'role'),
    (SELECT role FROM public.report_profiles WHERE id = auth.uid() LIMIT 1)
  ) = 'super_admin';
$$;

GRANT EXECUTE ON FUNCTION public.is_super_admin() TO authenticated;

-- ─── 4. Super Admin policies on report_schools ───────────────────────────────
DROP POLICY IF EXISTS "super_admin_select_all_schools" ON public.report_schools;
CREATE POLICY "super_admin_select_all_schools"
  ON public.report_schools FOR SELECT
  USING (public.is_super_admin() OR id = public.jwt_school_id());

DROP POLICY IF EXISTS "super_admin_update_all_schools" ON public.report_schools;
CREATE POLICY "super_admin_update_all_schools"
  ON public.report_schools FOR UPDATE
  USING (public.is_super_admin() OR (id = public.jwt_school_id() AND public.jwt_role() = 'super_admin'));

-- ─── 5. Super Admin policies on report_profiles ──────────────────────────────
DROP POLICY IF EXISTS "super_admin_select_all_profiles" ON public.report_profiles;
CREATE POLICY "super_admin_select_all_profiles"
  ON public.report_profiles FOR SELECT
  USING (public.is_super_admin() OR school_id = public.jwt_school_id() OR id = auth.uid());

-- ─── 6. Super Admin policies on report_learners ──────────────────────────────
DROP POLICY IF EXISTS "super_admin_select_all_learners" ON public.report_learners;
CREATE POLICY "super_admin_select_all_learners"
  ON public.report_learners FOR SELECT
  USING (public.is_super_admin() OR school_id = public.jwt_school_id());

-- ─── 7. Super Admin policies on report_summaries ─────────────────────────────
DROP POLICY IF EXISTS "super_admin_select_all_summaries" ON public.report_summaries;
CREATE POLICY "super_admin_select_all_summaries"
  ON public.report_summaries FOR SELECT
  USING (public.is_super_admin() OR school_id = public.jwt_school_id());

DROP POLICY IF EXISTS "super_admin_update_all_summaries" ON public.report_summaries;
CREATE POLICY "super_admin_update_all_summaries"
  ON public.report_summaries FOR UPDATE
  USING (public.is_super_admin() OR school_id = public.jwt_school_id());

-- ─── 8. Super Admin policies on report_classes ───────────────────────────────
DROP POLICY IF EXISTS "super_admin_select_all_classes" ON public.report_classes;
CREATE POLICY "super_admin_select_all_classes"
  ON public.report_classes FOR SELECT
  USING (public.is_super_admin() OR school_id = public.jwt_school_id());

-- ─── 9. Super Admin policies on report_scores (if table exists) ──────────────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'report_scores'
  ) THEN
    EXECUTE '
      DROP POLICY IF EXISTS "super_admin_select_all_scores" ON public.report_scores;
      CREATE POLICY "super_admin_select_all_scores"
        ON public.report_scores FOR SELECT
        USING (public.is_super_admin() OR school_id = public.jwt_school_id())
    ';
  END IF;
END $$;

-- ─── 10. Super Admin ALL policies on platform operations tables ───────────────
DO $$
DECLARE
  tbl text;
  tables text[] := ARRAY[
    'platform_school_subscriptions',
    'platform_school_timeline_events',
    'platform_support_tickets',
    'platform_support_interventions',
    'platform_school_health_scores',
    'platform_api_keys',
    'platform_webhooks',
    'platform_api_versions',
    'platform_api_analytics',
    'platform_security_logs',
    'platform_developer_activity_logs',
    'platform_sandbox_data',
    'platform_webhook_deliveries'
  ];
BEGIN
  FOREACH tbl IN ARRAY tables
  LOOP
    BEGIN
      EXECUTE format(
        'DROP POLICY IF EXISTS "super_admin_all_%1$s" ON public.%1$I;
         CREATE POLICY "super_admin_all_%1$s" ON public.%1$I FOR ALL USING (public.is_super_admin());',
        tbl
      );
    EXCEPTION WHEN undefined_table THEN
      NULL;
    END;
  END LOOP;
END $$;

-- ─── 11. Lightweight Aggregate View for Platform Operations ──────────────────
-- Uses simple LEFT JOINs — no correlated subqueries, no optional columns
CREATE OR REPLACE VIEW public.platform_school_stats AS
SELECT
  rs.id                                                       AS school_id,
  rs.name                                                     AS school_name,
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
  WHERE role = 'super_admin'
  ORDER BY school_id, created_at ASC
) headteachers ON headteachers.school_id = rs.id

-- Count report summaries and released reports
LEFT JOIN (
  SELECT
    school_id,
    COUNT(*)                            AS total_cnt,
    COUNT(*) FILTER (WHERE is_released) AS released_cnt
  FROM public.report_summaries
  GROUP BY school_id
) summary_counts ON summary_counts.school_id = rs.id;

GRANT SELECT ON public.platform_school_stats TO authenticated;
