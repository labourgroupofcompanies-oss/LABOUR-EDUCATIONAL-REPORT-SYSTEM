-- ============================================================================
-- Migration: 20260917_add_master_academic_term_sync.sql
-- Description: Master Platform Academic Calendar & Term Synchronizer RPC
--
-- Features:
-- 1. Updates current_academic_year, current_term, vacation_date, and next_term_begins
--    across all schools in 'report_schools' simultaneously.
-- 2. Prevents schools from running on one term indefinitely and exploiting free plan.
-- 3. Automatically terminates first-term-free promotions when advancing beyond Term 1.
-- 4. Synchronizes with platform_academic_calendars for national calendar integrity.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.sync_master_academic_term(
  p_academic_year TEXT,
  p_term TEXT,
  p_vacation_date TEXT DEFAULT NULL,
  p_next_term_begins TEXT DEFAULT NULL,
  p_terminate_free_trials BOOLEAN DEFAULT TRUE,
  p_performed_by TEXT DEFAULT 'Labour Admin'
)
RETURNS JSONB AS $$
DECLARE
  v_updated_schools INTEGER := 0;
  v_terminated_trials INTEGER := 0;
  v_audit_school_id TEXT;
BEGIN
  -- 1. Validate inputs
  IF p_academic_year IS NULL OR TRIM(p_academic_year) = '' THEN
    RAISE EXCEPTION 'Academic Year is required (e.g. 2025/2026).';
  END IF;

  IF p_term IS NULL OR TRIM(p_term) = '' THEN
    RAISE EXCEPTION 'Active Term is required (e.g. Term 1, Term 2, Term 3).';
  END IF;

  -- 2. Update all schools with the master term, academic year, vacation date, and resumption date
  UPDATE public.report_schools
  SET current_academic_year = TRIM(p_academic_year),
      current_term = TRIM(p_term),
      vacation_date = COALESCE(NULLIF(TRIM(p_vacation_date), ''), vacation_date),
      next_term_begins = COALESCE(NULLIF(TRIM(p_next_term_begins), ''), next_term_begins),
      updated_at = NOW();

  GET DIAGNOSTICS v_updated_schools = ROW_COUNT;

  -- 3. If terminating free trials when advancing beyond Term 1
  IF p_terminate_free_trials AND TRIM(p_term) != 'Term 1' THEN
    -- Any school whose first term free was active has it terminated
    UPDATE public.report_schools
    SET first_term_free_terminated = TRUE
    WHERE is_first_term_free = TRUE
      AND (first_term_free_terminated IS NULL OR first_term_free_terminated = FALSE);

    GET DIAGNOSTICS v_terminated_trials = ROW_COUNT;

    -- Also expire free term history records if table exists
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'school_free_term_history') THEN
      UPDATE public.school_free_term_history
      SET is_expired = TRUE,
          expired_reason = 'Terminated by Master Platform Calendar advancement to ' || TRIM(p_term)
      WHERE is_expired = FALSE;
    END IF;
  END IF;

  -- 4. Synchronize or record in platform_academic_calendars
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'platform_academic_calendars') THEN
    UPDATE public.platform_academic_calendars
    SET is_active = FALSE
    WHERE academic_year != TRIM(p_academic_year) OR term != TRIM(p_term);

    INSERT INTO public.platform_academic_calendars (
      calendar_name, academic_year, term, school_category,
      start_date, end_date, is_active, updated_at
    ) VALUES (
      'National Calendar ' || TRIM(p_academic_year) || ' (' || TRIM(p_term) || ')',
      TRIM(p_academic_year),
      TRIM(p_term),
      'GES',
      COALESCE(NULLIF(TRIM(p_next_term_begins), '')::date, CURRENT_DATE),
      COALESCE(NULLIF(TRIM(p_vacation_date), '')::date, CURRENT_DATE + INTERVAL '90 days'),
      TRUE,
      NOW()
    )
    ON CONFLICT (id) DO NOTHING;
  END IF;

  -- 5. Safely log audit event without foreign key violation
  BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'platform_subscription_audit') THEN
      SELECT id INTO v_audit_school_id FROM public.report_schools LIMIT 1;
      IF v_audit_school_id IS NOT NULL THEN
        INSERT INTO public.platform_subscription_audit (
          school_id, academic_year, term, event, details, performed_by
        ) VALUES (
          v_audit_school_id,
          TRIM(p_academic_year),
          TRIM(p_term),
          'MASTER_TERM_SYNCHRONIZED',
          jsonb_build_object(
            'academic_year', TRIM(p_academic_year),
            'term', TRIM(p_term),
            'vacation_date', p_vacation_date,
            'next_term_begins', p_next_term_begins,
            'updated_schools_count', v_updated_schools,
            'terminated_trials_count', v_terminated_trials
          ),
          p_performed_by
        );
      END IF;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  RETURN jsonb_build_object(
    'success', true,
    'academic_year', TRIM(p_academic_year),
    'term', TRIM(p_term),
    'vacation_date', p_vacation_date,
    'next_term_begins', p_next_term_begins,
    'updated_schools_count', v_updated_schools,
    'terminated_trials_count', v_terminated_trials,
    'message', 'Master academic term (' || TRIM(p_academic_year) || ' ' || TRIM(p_term) || ') synchronized across ' || v_updated_schools || ' school(s).'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

GRANT EXECUTE ON FUNCTION public.sync_master_academic_term(TEXT, TEXT, TEXT, TEXT, BOOLEAN, TEXT) TO authenticated, service_role;
