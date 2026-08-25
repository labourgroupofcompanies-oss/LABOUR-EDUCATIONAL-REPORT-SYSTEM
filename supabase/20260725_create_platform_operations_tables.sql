-- ============================================================================
-- Migration: Create Platform Operations Center Tables & Views
-- Run each command in Supabase SQL Editor
-- ============================================================================

-- 1. Create platform_support_tickets
CREATE TABLE IF NOT EXISTS public.platform_support_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id TEXT NOT NULL,
  school_name TEXT,
  title TEXT NOT NULL,
  description TEXT,
  priority TEXT NOT NULL DEFAULT 'medium',
  status TEXT NOT NULL DEFAULT 'Open',
  assigned_to TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Create platform_support_interventions
CREATE TABLE IF NOT EXISTS public.platform_support_interventions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID,
  admin_name TEXT,
  school_id TEXT NOT NULL,
  school_name TEXT,
  action_type TEXT NOT NULL,
  description TEXT,
  previous_state JSONB DEFAULT '{}',
  new_state JSONB DEFAULT '{}',
  result TEXT DEFAULT 'success',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Create platform_school_timeline_events
CREATE TABLE IF NOT EXISTS public.platform_school_timeline_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  actor_name TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Create platform_school_subscriptions
CREATE TABLE IF NOT EXISTS public.platform_school_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id TEXT NOT NULL,
  tier TEXT NOT NULL DEFAULT 'Standard',
  status TEXT NOT NULL DEFAULT 'Active',
  price NUMERIC DEFAULT 0,
  billing_cycle TEXT DEFAULT 'Annual',
  next_billing_date TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. Create platform_school_health_scores
CREATE TABLE IF NOT EXISTS public.platform_school_health_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id TEXT NOT NULL,
  health_score INTEGER DEFAULT 100,
  sync_score INTEGER DEFAULT 100,
  completion_score INTEGER DEFAULT 100,
  report_score INTEGER DEFAULT 100,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. Enable RLS on all platform operations tables
ALTER TABLE public.platform_support_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_support_interventions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_school_timeline_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_school_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_school_health_scores ENABLE ROW LEVEL SECURITY;

-- 7. Grant access to authenticated users
CREATE POLICY "pst_open" ON public.platform_support_tickets FOR ALL TO authenticated USING (TRUE);
CREATE POLICY "psi_open" ON public.platform_support_interventions FOR ALL TO authenticated USING (TRUE);
CREATE POLICY "pste_open" ON public.platform_school_timeline_events FOR ALL TO authenticated USING (TRUE);
CREATE POLICY "pss_open" ON public.platform_school_subscriptions FOR ALL TO authenticated USING (TRUE);
CREATE POLICY "pshs_open" ON public.platform_school_health_scores FOR ALL TO authenticated USING (TRUE);

-- 8. Create platform_school_stats View
CREATE OR REPLACE VIEW public.platform_school_stats AS
SELECT
  rs.id AS school_id,
  rs.name AS school_name,
  COALESCE(rs.district, '') AS district,
  COALESCE(rs.region, '') AS region,
  COALESCE(rs.circuit, '') AS circuit,
  COALESCE(rs.current_academic_year, '') AS current_academic_year,
  COALESCE(rs.current_term, 'Term 1') AS current_term,
  COALESCE(rs.is_read_only, FALSE) AS is_read_only,
  COALESCE(rs.reports_released, FALSE) AS reports_released,
  COALESCE(rs.subscription_tier, 'Standard') AS subscription_tier,
  COALESCE(rs.subscription_status, 'Active') AS subscription_status,
  COALESCE(learner_counts.cnt, 0) AS learners_count,
  COALESCE(staff_counts.cnt, 0) AS staff_count,
  headteachers.full_name AS headteacher_name,
  COALESCE(summary_counts.total_cnt, 0) AS reports_count,
  COALESCE(summary_counts.released_cnt, 0) AS released_reports_count,
  rs.created_at,
  rs.updated_at
FROM public.report_schools rs
LEFT JOIN (
  SELECT school_id, COUNT(*) AS cnt
  FROM public.report_learners
  GROUP BY school_id
) learner_counts ON learner_counts.school_id = rs.id
LEFT JOIN (
  SELECT school_id, COUNT(*) AS cnt
  FROM public.report_profiles
  WHERE role IN ('teacher', 'class_teacher')
  GROUP BY school_id
) staff_counts ON staff_counts.school_id = rs.id
LEFT JOIN (
  SELECT DISTINCT ON (school_id) school_id, full_name
  FROM public.report_profiles
  WHERE role = 'super_admin'
  ORDER BY school_id, created_at ASC
) headteachers ON headteachers.school_id = rs.id
LEFT JOIN (
  SELECT
    school_id,
    COUNT(*) AS total_cnt,
    COUNT(*) FILTER (WHERE is_released = TRUE) AS released_cnt
  FROM public.report_summaries
  GROUP BY school_id
) summary_counts ON summary_counts.school_id = rs.id;

GRANT SELECT ON public.platform_school_stats TO authenticated;
