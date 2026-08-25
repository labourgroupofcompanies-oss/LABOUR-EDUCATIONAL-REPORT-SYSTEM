-- ============================================================================
-- Migration: Revert Term Billing Trigger & Individual School Exemption RPCs
-- ============================================================================

-- ─── 1. RPC: REVERT TERM BILLING CYCLE ───────────────────────────────────────
CREATE OR REPLACE FUNCTION public.revert_term_billing_cycle(
  p_academic_year TEXT,
  p_term TEXT,
  p_reverted_by TEXT DEFAULT 'Labour Admin'
)
RETURNS JSONB AS $$
DECLARE
  v_cycle_id UUID;
  v_deleted_bills INTEGER := 0;
BEGIN
  -- 1. Find billing cycle
  SELECT id INTO v_cycle_id
  FROM public.billing_cycles
  WHERE academic_year = p_academic_year AND term = p_term;

  -- 2. Delete unpaid term bills for this cycle
  DELETE FROM public.school_term_bills
  WHERE academic_year = p_academic_year 
    AND term = p_term
    AND status != 'PAID';

  GET DIAGNOSTICS v_deleted_bills = ROW_COUNT;

  -- 3. Delete or update billing cycle status
  IF v_cycle_id IS NOT NULL THEN
    DELETE FROM public.billing_cycles WHERE id = v_cycle_id;
  END IF;

  -- 4. Log Audit Event
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'platform_subscription_audit') THEN
    INSERT INTO public.platform_subscription_audit (
      school_id, event, details, performed_by
    ) VALUES (
      'SYSTEM',
      'TERM_BILLING_CYCLE_REVERTED',
      jsonb_build_object(
        'academic_year', p_academic_year,
        'term', p_term,
        'deleted_bills_count', v_deleted_bills
      ),
      p_reverted_by
    );
  END IF;

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

-- ─── 2. RPC: TOGGLE SCHOOL TERM EXEMPTION ────────────────────────────────────
CREATE OR REPLACE FUNCTION public.toggle_school_term_exemption(
  p_school_id TEXT,
  p_academic_year TEXT,
  p_term TEXT,
  p_exempt BOOLEAN,
  p_performed_by TEXT DEFAULT 'Labour Admin'
)
RETURNS JSONB AS $$
DECLARE
  v_learner_cnt INTEGER := 0;
  v_cat_rate NUMERIC(10, 2) := 5.00;
  v_rate NUMERIC(10, 2) := 5.00;
  v_amount_due NUMERIC(12, 2) := 0.00;
  v_school RECORD;
BEGIN
  -- Get school
  SELECT * INTO v_school FROM public.report_schools WHERE id = p_school_id;
  IF v_school.id IS NULL THEN
    RAISE EXCEPTION 'School not found with ID: %', p_school_id;
  END IF;

  IF p_exempt THEN
    -- Set school exemption until 1 year from now
    UPDATE public.report_schools
    SET subscription_exempt_until = (NOW() + INTERVAL '1 year')
    WHERE id = p_school_id;

    -- Update existing term bill for this term to EXEMPT
    UPDATE public.school_term_bills
    SET status = 'EXEMPT',
        approval_status = 'EXEMPT',
        amount_due = 0.00,
        outstanding_amount = 0.00
    WHERE school_id = p_school_id
      AND academic_year = p_academic_year
      AND term = p_term;

  ELSE
    -- Remove exemption
    UPDATE public.report_schools
    SET subscription_exempt_until = NULL
    WHERE id = p_school_id;

    -- Recalculate bill
    SELECT COUNT(*) INTO v_learner_cnt
    FROM public.report_learners
    WHERE school_id = p_school_id
      AND LOWER(COALESCE(status, 'active')) NOT IN ('alumni', 'graduated', 'transferred', 'inactive');

    SELECT amount_per_learner INTO v_cat_rate
    FROM public.platform_subscription_pricing
    WHERE LOWER(school_category) = LOWER(COALESCE(v_school.school_category, v_school.school_type, 'GES'))
    LIMIT 1;

    v_rate := COALESCE(v_school.per_learner_rate_override, v_cat_rate, 5.00);
    v_amount_due := v_learner_cnt * v_rate;

    UPDATE public.school_term_bills
    SET status = 'AWAITING_APPROVAL',
        approval_status = 'PENDING',
        active_learner_count = v_learner_cnt,
        rate_per_learner = v_rate,
        amount_due = v_amount_due,
        outstanding_amount = v_amount_due
    WHERE school_id = p_school_id
      AND academic_year = p_academic_year
      AND term = p_term;
  END IF;

  -- Log Audit Event
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'platform_subscription_audit') THEN
    INSERT INTO public.platform_subscription_audit (
      school_id, event, details, performed_by
    ) VALUES (
      p_school_id,
      CASE WHEN p_exempt THEN 'SCHOOL_EXEMPTION_GRANTED' ELSE 'SCHOOL_EXEMPTION_REVOKED' END,
      jsonb_build_object(
        'school_id', p_school_id,
        'academic_year', p_academic_year,
        'term', p_term,
        'is_exempt', p_exempt
      ),
      p_performed_by
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'school_id', p_school_id,
    'is_exempt', p_exempt,
    'message', CASE WHEN p_exempt THEN 'School successfully exempted from term bill.' ELSE 'School exemption removed.' END
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

GRANT EXECUTE ON FUNCTION public.toggle_school_term_exemption(TEXT, TEXT, TEXT, BOOLEAN, TEXT) TO authenticated, service_role;
