-- ============================================================================
-- Migration: 20260818_tighten_term_status_and_free_term_check.sql
-- Date: 2026-08-18
-- Description: Tighten the mechanism that checks the term a school is running
--              on and determines whether it enjoys a free term or must pay.
--
-- Changes:
--   1. HELPER RPC: resolve_school_running_term(p_school_id)
--      - Returns the definitive (year, term) the school is currently on:
--        Priority order:
--        a) Active billing cycle (billing_cycles WHERE status='ACTIVE')
--        b) Active academic calendar entry for the school's category
--           (platform_academic_calendars WHERE is_active=true AND
--            start_date <= NOW() <= end_date)
--        c) School profile: current_academic_year / current_term
--        d) Hard-coded safe default: '2025/2026', 'Term 1'
--
--   2. HARDENED RPC: evaluate_free_term_eligibility(p_school_id, p_academic_year, p_term)
--      - Case-insensitive, trimmed comparisons to prevent whitespace or casing bypass.
--      - Explicitly returns is_onboarding_term field.
--      - If year+term not supplied, resolves using resolve_school_running_term.
--      - Subsequent terms from onboarding term are strictly NOT free.
--
--   3. HARDENED RPC: get_school_subscription_status(p_school_id, p_academic_year, p_term)
--      - When explicit year+term are supplied (e.g. for report-card generation),
--        uses them directly; does NOT override with active billing cycle.
--      - When no year+term supplied, resolves via resolve_school_running_term.
--      - Correctly locks reports for unpaid bills when deadline has passed.
--      - Returns is_onboarding_term in the response payload.
-- ============================================================================


-- ─── 1. HELPER RPC: resolve_school_running_term ───────────────────────────────
CREATE OR REPLACE FUNCTION public.resolve_school_running_term(
  p_school_id TEXT
)
RETURNS TABLE (
  resolved_year TEXT,
  resolved_term TEXT,
  resolution_source TEXT
) AS $$
DECLARE
  v_school RECORD;
  v_cycle  RECORD;
  v_cal    RECORD;
BEGIN
  -- Fetch school record once
  SELECT * INTO v_school FROM public.report_schools WHERE id = p_school_id;

  -- Priority 1: Active billing cycle created by Labour Admin
  SELECT * INTO v_cycle
  FROM public.billing_cycles
  WHERE LOWER(status) = 'active'
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_cycle.id IS NOT NULL THEN
    resolved_year      := v_cycle.academic_year;
    resolved_term      := v_cycle.term;
    resolution_source  := 'ACTIVE_BILLING_CYCLE';
    RETURN NEXT;
    RETURN;
  END IF;

  -- Priority 2: Active academic calendar for this school's category
  SELECT * INTO v_cal
  FROM public.platform_academic_calendars
  WHERE is_active = TRUE
    AND LOWER(TRIM(school_category)) = LOWER(TRIM(COALESCE(v_school.school_category, v_school.school_type, 'GES')))
    AND start_date  <= CURRENT_DATE
    AND end_date    >= CURRENT_DATE
  ORDER BY start_date DESC
  LIMIT 1;

  IF v_cal.id IS NULL THEN
    -- Fallback: any active calendar (category-agnostic) overlapping today
    SELECT * INTO v_cal
    FROM public.platform_academic_calendars
    WHERE is_active = TRUE
      AND start_date  <= CURRENT_DATE
      AND end_date    >= CURRENT_DATE
    ORDER BY start_date DESC
    LIMIT 1;
  END IF;

  IF v_cal.id IS NOT NULL THEN
    resolved_year      := v_cal.academic_year;
    resolved_term      := v_cal.term;
    resolution_source  := 'ACTIVE_ACADEMIC_CALENDAR';
    RETURN NEXT;
    RETURN;
  END IF;

  -- Priority 3: School profile current term/year
  IF v_school.current_academic_year IS NOT NULL AND v_school.current_term IS NOT NULL THEN
    resolved_year      := v_school.current_academic_year;
    resolved_term      := v_school.current_term;
    resolution_source  := 'SCHOOL_PROFILE';
    RETURN NEXT;
    RETURN;
  END IF;

  -- Priority 4: Safe default
  resolved_year      := '2025/2026';
  resolved_term      := 'Term 1';
  resolution_source  := 'SAFE_DEFAULT';
  RETURN NEXT;
  RETURN;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

GRANT EXECUTE ON FUNCTION public.resolve_school_running_term(TEXT) TO authenticated, service_role;


-- ─── 2. HARDENED RPC: evaluate_free_term_eligibility ────────────────────────
CREATE OR REPLACE FUNCTION public.evaluate_free_term_eligibility(
  p_school_id    TEXT,
  p_academic_year TEXT DEFAULT NULL,
  p_term          TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_school        RECORD;
  v_history       RECORD;
  v_is_free       BOOLEAN := FALSE;
  v_reason        TEXT    := 'Not onboarding term';
  v_is_onboarding BOOLEAN := FALSE;
  v_now           TIMESTAMPTZ := NOW();
  v_year          TEXT;
  v_term          TEXT;
  v_src           TEXT;
BEGIN
  -- Fetch school
  SELECT * INTO v_school FROM public.report_schools WHERE id = p_school_id;
  IF v_school.id IS NULL THEN
    RETURN json_build_object(
      'eligible', false,
      'reason', 'School not found',
      'is_onboarding_term', false
    )::jsonb;
  END IF;

  -- Hard stop: developer has explicitly terminated the free trial
  IF v_school.first_term_free_terminated = TRUE THEN
    RETURN json_build_object(
      'eligible', false,
      'reason', 'Free trial manually terminated by developer',
      'is_onboarding_term', false,
      'first_term_free_terminated', true
    )::jsonb;
  END IF;

  -- Resolve the requested year/term: if not supplied, use the school's running term
  IF p_academic_year IS NULL OR p_term IS NULL THEN
    SELECT resolved_year, resolved_term, resolution_source
    INTO v_year, v_term, v_src
    FROM public.resolve_school_running_term(p_school_id)
    LIMIT 1;
  ELSE
    v_year := TRIM(p_academic_year);
    v_term := TRIM(p_term);
    v_src  := 'EXPLICIT_REQUEST';
  END IF;

  -- Fetch or auto-seed free term history record
  SELECT * INTO v_history FROM public.school_free_term_history WHERE school_id = p_school_id;
  IF v_history.id IS NULL THEN
    INSERT INTO public.school_free_term_history (
      school_id, onboarding_academic_year, onboarding_term, onboarding_date, max_free_until_date
    ) VALUES (
      p_school_id,
      COALESCE(v_school.initial_academic_year, v_year, '2025/2026'),
      COALESCE(v_school.initial_term,          v_term, 'Term 1'),
      COALESCE(v_school.created_at,            NOW()),
      COALESCE(v_school.created_at,            NOW()) + INTERVAL '16 weeks'
    )
    ON CONFLICT (school_id) DO NOTHING;

    SELECT * INTO v_history FROM public.school_free_term_history WHERE school_id = p_school_id;
  END IF;

  -- Rule A: 16-week maximum wall-clock duration
  IF v_now > v_history.max_free_until_date THEN
    IF NOT v_history.is_expired THEN
      UPDATE public.school_free_term_history
      SET is_expired = TRUE, expired_reason = '16-week maximum duration exceeded'
      WHERE id = v_history.id;
    END IF;
    RETURN json_build_object(
      'eligible', false,
      'reason', '16-week maximum free duration exceeded',
      'is_onboarding_term', (
        LOWER(TRIM(v_history.onboarding_academic_year)) = LOWER(v_year) AND
        LOWER(TRIM(v_history.onboarding_term))          = LOWER(v_term)
      ),
      'onboarding_year', v_history.onboarding_academic_year,
      'onboarding_term', v_history.onboarding_term,
      'max_free_until_date', v_history.max_free_until_date,
      'is_expired', true
    )::jsonb;
  END IF;

  -- Rule B: Exact match of onboarding year AND term (case-insensitive, trimmed)
  v_is_onboarding := (
    LOWER(TRIM(v_history.onboarding_academic_year)) = LOWER(TRIM(v_year)) AND
    LOWER(TRIM(v_history.onboarding_term))          = LOWER(TRIM(v_term))
  );

  IF v_is_onboarding THEN
    v_is_free := TRUE;
    v_reason  := 'Active Onboarding Free Term — exact match with registered onboarding term';
  ELSE
    v_is_free := FALSE;
    v_reason  := format(
      'Subsequent term (%s %s) — free entitlement is only for onboarding term (%s %s)',
      v_term, v_year,
      v_history.onboarding_term, v_history.onboarding_academic_year
    );
  END IF;

  RETURN json_build_object(
    'eligible',            v_is_free,
    'reason',              v_reason,
    'is_onboarding_term',  v_is_onboarding,
    'onboarding_year',     v_history.onboarding_academic_year,
    'onboarding_term',     v_history.onboarding_term,
    'resolved_year',       v_year,
    'resolved_term',       v_term,
    'resolution_source',   v_src,
    'max_free_until_date', v_history.max_free_until_date,
    'is_expired',          v_history.is_expired
  )::jsonb;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- evaluate_free_term_eligibility is internal; only service_role should call it directly
REVOKE EXECUTE ON FUNCTION public.evaluate_free_term_eligibility(TEXT, TEXT, TEXT) FROM PUBLIC, authenticated, anon;
GRANT  EXECUTE ON FUNCTION public.evaluate_free_term_eligibility(TEXT, TEXT, TEXT) TO service_role;


-- ─── 3. HARDENED RPC: get_school_subscription_status ────────────────────────
CREATE OR REPLACE FUNCTION public.get_school_subscription_status(
  p_school_id     TEXT DEFAULT NULL,
  p_academic_year TEXT DEFAULT NULL,
  p_term          TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_caller_id      UUID := auth.uid();
  v_caller_school  TEXT;
  v_target_school  TEXT;
  v_caller_role    TEXT;
  v_school         RECORD;
  v_cycle          RECORD;
  v_bill           RECORD;
  v_year           TEXT;
  v_term           TEXT;
  v_resolution_src TEXT;
  v_free_eval      JSONB;
  v_is_free        BOOLEAN := FALSE;
  v_is_onboarding  BOOLEAN := FALSE;
  v_is_unlocked    BOOLEAN := FALSE;
  v_status         TEXT    := 'NO_BILLING_CYCLE';
  v_deadline       TIMESTAMPTZ;
  v_reports_locked BOOLEAN := FALSE;
  v_lock_reason    TEXT    := NULL;
  v_learner_cnt    INTEGER := 0;
  v_rate           NUMERIC(10,2) := 5.00;
  v_amount_due     NUMERIC(12,2) := 0.00;
  v_wallet_bal     NUMERIC(12,2) := 0.00;
BEGIN
  -- ── Auth & School Resolution ──────────────────────────────────────────────
  IF v_caller_id IS NOT NULL THEN
    SELECT COALESCE(school_id,''), LOWER(COALESCE(role,''))
    INTO v_caller_school, v_caller_role
    FROM public.report_profiles
    WHERE id = v_caller_id;

    IF p_school_id IS NOT NULL
       AND v_caller_school IS NOT NULL
       AND p_school_id != v_caller_school
       AND v_caller_role NOT IN (
             'super_admin','admin','administrator','platform_admin',
             'platform_developer','developer','headteacher'
           )
    THEN
      RAISE EXCEPTION 'Access Denied: You cannot view subscription status for another school.';
    END IF;

    v_target_school := COALESCE(p_school_id, v_caller_school);
  ELSE
    v_target_school := p_school_id;
  END IF;

  SELECT * INTO v_school FROM public.report_schools WHERE id = v_target_school;
  IF v_school.id IS NULL THEN
    RETURN json_build_object('is_unlocked', false, 'lock_reason', 'School not found')::jsonb;
  END IF;

  v_wallet_bal := COALESCE(v_school.wallet_balance, 0.00);

  -- ── Resolve the Active Term ───────────────────────────────────────────────
  -- If caller explicitly supplies year+term (e.g. generating reports for a specific term),
  -- honour that directly without overwriting with the billing cycle.
  -- If they supply neither, resolve via the priority chain.
  IF p_academic_year IS NOT NULL AND p_term IS NOT NULL THEN
    v_year           := TRIM(p_academic_year);
    v_term           := TRIM(p_term);
    v_resolution_src := 'EXPLICIT_REQUEST';

    -- Still fetch deadline from active billing cycle if it matches this year+term
    SELECT * INTO v_cycle
    FROM public.billing_cycles
    WHERE LOWER(status) = 'active'
      AND LOWER(TRIM(academic_year)) = LOWER(v_year)
      AND LOWER(TRIM(term))          = LOWER(v_term)
    ORDER BY created_at DESC
    LIMIT 1;

    IF v_cycle.id IS NOT NULL THEN
      v_deadline := v_cycle.billing_deadline;
    END IF;
  ELSE
    -- No explicit request — resolve via priority chain
    SELECT resolved_year, resolved_term, resolution_source
    INTO v_year, v_term, v_resolution_src
    FROM public.resolve_school_running_term(v_target_school)
    LIMIT 1;

    -- Also fetch the active billing cycle for deadline
    SELECT * INTO v_cycle
    FROM public.billing_cycles
    WHERE LOWER(status) = 'active'
    ORDER BY created_at DESC
    LIMIT 1;

    IF v_cycle.id IS NOT NULL THEN
      v_deadline := v_cycle.billing_deadline;
    END IF;
  END IF;

  -- ── Free-Term Evaluation ──────────────────────────────────────────────────
  v_free_eval     := public.evaluate_free_term_eligibility(v_target_school, v_year, v_term);
  v_is_free       := COALESCE((v_free_eval->>'eligible')::boolean,       false);
  v_is_onboarding := COALESCE((v_free_eval->>'is_onboarding_term')::boolean, false);

  -- ── Billing Bill Lookup ───────────────────────────────────────────────────
  SELECT * INTO v_bill
  FROM public.school_term_bills
  WHERE school_id    = v_target_school
    AND LOWER(TRIM(academic_year)) = LOWER(TRIM(v_year))
    AND LOWER(TRIM(term))          = LOWER(TRIM(v_term));

  -- ── Entitlement Decision ──────────────────────────────────────────────────
  IF v_school.subscription_exempt_until IS NOT NULL
     AND v_school.subscription_exempt_until >= NOW()
  THEN
    -- Admin-granted exemption takes priority after free term
    v_is_unlocked    := TRUE;
    v_status         := 'EXEMPT';
    v_reports_locked := FALSE;

  ELSIF v_is_free THEN
    -- Onboarding free term
    v_is_unlocked    := TRUE;
    v_status         := 'FIRST_TERM_FREE';
    v_reports_locked := FALSE;

  ELSIF v_bill.id IS NOT NULL THEN
    v_status      := v_bill.status;
    v_learner_cnt := v_bill.active_learner_count;
    v_rate        := v_bill.rate_per_learner;
    v_amount_due  := v_bill.amount_due;

    IF v_bill.status = 'PAID' THEN
      v_is_unlocked    := TRUE;
      v_reports_locked := FALSE;

    ELSIF v_bill.status IN ('FIRST_TERM_FREE', 'EXEMPT') THEN
      v_is_unlocked    := TRUE;
      v_reports_locked := FALSE;

    ELSIF v_deadline IS NOT NULL AND NOW() > v_deadline THEN
      -- Bill exists but unpaid AND billing deadline has passed: LOCK
      v_is_unlocked    := FALSE;
      v_reports_locked := TRUE;
      v_lock_reason    := format(
        'Term Subscription bill for %s (%s) is unpaid. Billing deadline (%s) has passed. Please approve payment or top up school wallet.',
        v_term, v_year,
        to_char(v_deadline, 'DD Mon YYYY')
      );

    ELSE
      -- Bill exists, unpaid, but deadline not yet passed — keep open
      v_is_unlocked    := TRUE;
      v_reports_locked := FALSE;
      v_lock_reason    := format(
        'Term Subscription bill for %s (%s) is pending payment. Please approve before billing deadline (%s).',
        v_term, v_year,
        CASE WHEN v_deadline IS NOT NULL THEN to_char(v_deadline, 'DD Mon YYYY') ELSE 'N/A' END
      );
    END IF;

  ELSE
    -- No bill created yet for this term: grant access (billing cycle not yet triggered)
    v_is_unlocked    := TRUE;
    v_status         := 'NO_BILL';
    v_reports_locked := FALSE;
  END IF;

  -- ── Response Payload ──────────────────────────────────────────────────────
  RETURN json_build_object(
    -- Core entitlement flags
    'is_unlocked',           v_is_unlocked,
    'billing_status',        v_status,
    'reports_locked',        v_reports_locked,
    'lock_reason',           v_lock_reason,

    -- Feature flags
    'can_view_data',         true,
    'can_enter_results',     true,
    'can_edit_results',      true,
    'can_generate_reports',  NOT v_reports_locked,
    'can_download_reports',  NOT v_reports_locked,
    'can_print_reports',     NOT v_reports_locked,
    'can_export_reports',    NOT v_reports_locked,

    -- Financial snapshot
    'wallet_balance',        v_wallet_bal,
    'bill_id',               v_bill.id,
    'amount_due',            COALESCE(v_bill.amount_due,       v_amount_due),
    'amount_paid',           COALESCE(v_bill.amount_paid,      0.00),
    'outstanding_amount',    CASE
                               WHEN v_is_unlocked AND v_status = 'PAID' THEN 0.00
                               ELSE COALESCE(v_bill.outstanding_amount, v_amount_due)
                             END,
    'approval_status',       COALESCE(v_bill.approval_status, 'PENDING'),
    'billing_deadline',      v_deadline,

    -- Term info
    'academic_year',         v_year,
    'term',                  v_term,
    'resolution_source',     v_resolution_src,
    'active_learner_count',  COALESCE(v_bill.active_learner_count, v_learner_cnt),
    'rate_per_learner',      COALESCE(v_bill.rate_per_learner,     v_rate),

    -- Free-term metadata
    'is_first_term_free',    v_is_free,
    'is_onboarding_term',    v_is_onboarding,
    'free_term_reason',      v_free_eval->>'reason',
    'onboarding_year',       v_free_eval->>'onboarding_year',
    'onboarding_term',       v_free_eval->>'onboarding_term',
    'max_free_until_date',   v_free_eval->>'max_free_until_date'
  )::jsonb;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

GRANT EXECUTE ON FUNCTION public.get_school_subscription_status(TEXT, TEXT, TEXT) TO authenticated, service_role;


-- ─── 4. Server-side entitlement enforcement (unchanged signature) ─────────────
CREATE OR REPLACE FUNCTION public.check_report_entitlement(
  p_school_id TEXT
)
RETURNS BOOLEAN AS $$
DECLARE
  v_status JSONB;
BEGIN
  v_status := public.get_school_subscription_status(p_school_id);
  RETURN COALESCE((v_status->>'can_download_reports')::boolean, FALSE);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

GRANT EXECUTE ON FUNCTION public.check_report_entitlement(TEXT) TO authenticated, service_role;
