-- ============================================================================
-- LABOUR EDU REPORT SYSTEM - CONSOLIDATED SQL SCRIPT
-- RUN THIS IN THE SUPABASE SQL EDITOR (Dashboard -> SQL Editor -> New Query -> Run)
-- ============================================================================

-- ─── 1. FIX REVERT TERM BILLING CYCLE (Fixes 409 Conflict Error) ─────────────
CREATE OR REPLACE FUNCTION public.revert_term_billing_cycle(
  p_academic_year TEXT,
  p_term TEXT,
  p_reverted_by TEXT DEFAULT 'Labour Admin'
)
RETURNS JSONB AS $$
DECLARE
  v_cycle_id UUID;
  v_deleted_bills INTEGER := 0;
  v_audit_school_id TEXT;
BEGIN
  -- Find billing cycle
  SELECT id INTO v_cycle_id
  FROM public.billing_cycles
  WHERE academic_year = p_academic_year AND term = p_term;

  -- Delete unpaid term bills for this cycle
  DELETE FROM public.school_term_bills
  WHERE (billing_cycle_id = v_cycle_id OR (academic_year = p_academic_year AND term = p_term))
    AND status != 'PAID';

  GET DIAGNOSTICS v_deleted_bills = ROW_COUNT;

  -- Delete or update billing cycle status (prevents 409 foreign key RESTRICT conflict)
  IF v_cycle_id IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM public.school_term_bills WHERE billing_cycle_id = v_cycle_id) THEN
      UPDATE public.billing_cycles SET status = 'CANCELLED' WHERE id = v_cycle_id;
    ELSE
      BEGIN
        DELETE FROM public.billing_cycles WHERE id = v_cycle_id;
      EXCEPTION WHEN foreign_key_violation THEN
        UPDATE public.billing_cycles SET status = 'CANCELLED' WHERE id = v_cycle_id;
      END;
    END IF;
  END IF;

  -- Safely log audit event without foreign key violation
  BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'platform_subscription_audit') THEN
      SELECT id INTO v_audit_school_id FROM public.report_schools LIMIT 1;
      IF v_audit_school_id IS NOT NULL THEN
        INSERT INTO public.platform_subscription_audit (
          school_id, academic_year, term, event, details, performed_by
        ) VALUES (
          v_audit_school_id,
          p_academic_year,
          p_term,
          'TERM_BILLING_CYCLE_REVERTED',
          jsonb_build_object(
            'academic_year', p_academic_year,
            'term', p_term,
            'deleted_bills_count', v_deleted_bills
          ),
          p_reverted_by
        );
      END IF;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  RETURN jsonb_build_object(
    'success', true,
    'academic_year', p_academic_year,
    'term', p_term,
    'deleted_bills_count', v_deleted_bills,
    'message', 'Term billing cycle successfully reverted.'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

GRANT EXECUTE ON FUNCTION public.revert_term_billing_cycle(TEXT, TEXT, TEXT) TO authenticated, service_role;


-- ─── 2. MASTER ACADEMIC CALENDAR & TERM SYNCHRONIZER ─────────────────────────
-- Updates Academic Year, Term, Vacation Date & Resumption Date across all schools.
-- Decoupled from billing: does NOT terminate trials, does NOT trigger payment prompts.
CREATE OR REPLACE FUNCTION public.sync_master_academic_term(
  p_academic_year TEXT,
  p_term TEXT,
  p_vacation_date TEXT DEFAULT NULL,
  p_next_term_begins TEXT DEFAULT NULL,
  p_performed_by TEXT DEFAULT 'Labour Admin'
)
RETURNS JSONB AS $$
DECLARE
  v_updated_schools INTEGER := 0;
  v_audit_school_id TEXT;
BEGIN
  IF p_academic_year IS NULL OR TRIM(p_academic_year) = '' THEN
    RAISE EXCEPTION 'Academic Year is required (e.g. 2025/2026).';
  END IF;

  IF p_term IS NULL OR TRIM(p_term) = '' THEN
    RAISE EXCEPTION 'Active Term is required (e.g. Term 1, Term 2, Term 3).';
  END IF;

  -- Update all schools with the master term, academic year, vacation date, and resumption date
  UPDATE public.report_schools
  SET current_academic_year = TRIM(p_academic_year),
      current_term = TRIM(p_term),
      vacation_date = COALESCE(NULLIF(TRIM(p_vacation_date), ''), vacation_date),
      next_term_begins = COALESCE(NULLIF(TRIM(p_next_term_begins), ''), next_term_begins),
      updated_at = NOW();

  GET DIAGNOSTICS v_updated_schools = ROW_COUNT;

  -- Synchronize with platform_academic_calendars
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

  -- Safely log audit event
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
            'note', 'Academic calendar updated. Payment prompts and billing NOT triggered (controlled separately from billing page).'
          ),
          COALESCE(p_performed_by, 'Labour Admin')
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
    'message', format('Successfully synchronized %s (%s) across %s schools without triggering billing.', TRIM(p_academic_year), TRIM(p_term), v_updated_schools)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- Signature with optional parameter for backwards compatibility
CREATE OR REPLACE FUNCTION public.sync_master_academic_term(
  p_academic_year TEXT,
  p_term TEXT,
  p_vacation_date TEXT,
  p_next_term_begins TEXT,
  p_terminate_free_trials BOOLEAN,
  p_performed_by TEXT DEFAULT 'Labour Admin'
)
RETURNS JSONB AS $$
BEGIN
  RETURN public.sync_master_academic_term(
    p_academic_year,
    p_term,
    p_vacation_date,
    p_next_term_begins,
    p_performed_by
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

GRANT EXECUTE ON FUNCTION public.sync_master_academic_term(TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.sync_master_academic_term(TEXT, TEXT, TEXT, TEXT, BOOLEAN, TEXT) TO authenticated, service_role;
