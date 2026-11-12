-- ============================================================================
-- Migration: 20261022_add_referral_free_term_rewards.sql
-- Description: Referral Free Term Reward System
--
-- Business Rules:
-- 1. When a school refers 2 schools in a term they are supposed to pay, they
--    are allowed to use the app for free for that term (100% fee waiver).
-- 2. When they refer more than 2 schools, 2 referred schools are deducted
--    for that term, leaving the rest of the referred schools in their bank
--    to be rolled over and used for subsequent / future terms.
-- 3. Onboarding free terms (first term free) are preserved and never consume
--    referrals since the school is not yet supposed to pay.
-- ============================================================================

-- ─── 1. EXTEND REPORT_REFERRALS FOR CONSUMPTION TRACKING ──────────────────────
DO $$
BEGIN
  -- consumed_for_free_term
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'report_referrals' 
      AND column_name = 'consumed_for_free_term'
  ) THEN
    ALTER TABLE public.report_referrals ADD COLUMN consumed_for_free_term BOOLEAN DEFAULT FALSE;
  END IF;

  -- consumed_academic_year
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'report_referrals' 
      AND column_name = 'consumed_academic_year'
  ) THEN
    ALTER TABLE public.report_referrals ADD COLUMN consumed_academic_year TEXT;
  END IF;

  -- consumed_term
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'report_referrals' 
      AND column_name = 'consumed_term'
  ) THEN
    ALTER TABLE public.report_referrals ADD COLUMN consumed_term TEXT;
  END IF;

  -- consumed_at
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'report_referrals' 
      AND column_name = 'consumed_at'
  ) THEN
    ALTER TABLE public.report_referrals ADD COLUMN consumed_at TIMESTAMPTZ;
  END IF;

  -- consumed_bill_id
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'report_referrals' 
      AND column_name = 'consumed_bill_id'
  ) THEN
    ALTER TABLE public.report_referrals ADD COLUMN consumed_bill_id UUID;
  END IF;

  -- Add referral_free_terms_count to report_schools if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'report_schools' 
      AND column_name = 'referral_free_terms_count'
  ) THEN
    ALTER TABLE public.report_schools ADD COLUMN referral_free_terms_count INTEGER DEFAULT 0;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_report_referrals_consumed ON public.report_referrals(referrer_school_id, consumed_for_free_term);

-- ─── 2. UPDATE CHECK CONSTRAINT ON SCHOOL_TERM_BILLS ────────────────────────
DO $$
BEGIN
  -- Drop existing status check if present
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE table_schema = 'public' 
      AND table_name = 'school_term_bills' 
      AND constraint_name = 'school_term_bills_status_check'
  ) THEN
    ALTER TABLE public.school_term_bills DROP CONSTRAINT school_term_bills_status_check;
  END IF;

  -- Re-add check constraint including REFERRAL_FREE_TERM
  ALTER TABLE public.school_term_bills ADD CONSTRAINT school_term_bills_status_check
    CHECK (status IN (
      'FIRST_TERM_FREE',
      'REFERRAL_FREE_TERM',
      'AWAITING_APPROVAL',
      'APPROVED',
      'PAID',
      'INSUFFICIENT_FUNDS',
      'EXPIRED',
      'EXEMPT'
    ));
EXCEPTION
  WHEN OTHERS THEN
    NULL;
END $$;


-- ─── 3. RPC: GET SCHOOL REFERRAL CREDITS & FREE TERM BANK ───────────────────
CREATE OR REPLACE FUNCTION public.get_school_referral_credits(
  p_school_id TEXT
)
RETURNS JSONB AS $$
DECLARE
  v_total_refs     INTEGER := 0;
  v_consumed_refs  INTEGER := 0;
  v_available_refs INTEGER := 0;
  v_free_terms     INTEGER := 0;
  v_remaining      INTEGER := 0;
BEGIN
  IF p_school_id IS NULL OR TRIM(p_school_id) = '' THEN
    RETURN jsonb_build_object(
      'total_referrals', 0,
      'consumed_referrals', 0,
      'available_referrals', 0,
      'free_terms_available', 0,
      'can_claim_free_term', false,
      'remaining_after_claim', 0
    );
  END IF;

  -- Count total non-rejected, non-fraudulent referrals
  SELECT COUNT(*) INTO v_total_refs
  FROM public.report_referrals
  WHERE referrer_school_id = TRIM(p_school_id)
    AND status != 'REJECTED'
    AND COALESCE(fraud_flag, false) = false;

  -- Count referrals already consumed for free terms
  SELECT COUNT(*) INTO v_consumed_refs
  FROM public.report_referrals
  WHERE referrer_school_id = TRIM(p_school_id)
    AND consumed_for_free_term = true;

  v_available_refs := GREATEST(0, v_total_refs - v_consumed_refs);
  v_free_terms     := FLOOR(v_available_refs / 2);
  v_remaining      := CASE WHEN v_available_refs >= 2 THEN v_available_refs - 2 ELSE v_available_refs END;

  RETURN jsonb_build_object(
    'total_referrals',         v_total_refs,
    'consumed_referrals',      v_consumed_refs,
    'available_referrals',     v_available_refs,
    'free_terms_available',    v_free_terms,
    'can_claim_free_term',     (v_available_refs >= 2),
    'remaining_after_claim',   v_remaining
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

GRANT EXECUTE ON FUNCTION public.get_school_referral_credits(TEXT) TO authenticated, anon, service_role;


-- ─── 4. RPC: CLAIM REFERRAL FREE TERM (Deducts 2 Referrals & Waives Bill) ───
CREATE OR REPLACE FUNCTION public.claim_referral_free_term(
  p_school_id     TEXT,
  p_academic_year TEXT DEFAULT NULL,
  p_term          TEXT DEFAULT NULL,
  p_claimed_by    TEXT DEFAULT 'School Admin'
)
RETURNS JSONB AS $$
DECLARE
  v_year             TEXT;
  v_term             TEXT;
  v_src              TEXT;
  v_bill             RECORD;
  v_free_eval        JSONB;
  v_is_onboarding    BOOLEAN := FALSE;
  v_available_count  INTEGER := 0;
  v_ref_ids          UUID[];
  v_remaining_count  INTEGER := 0;
  v_cycle_id         UUID;
BEGIN
  IF p_school_id IS NULL OR TRIM(p_school_id) = '' THEN
    RAISE EXCEPTION 'School ID is required to claim a referral free term.';
  END IF;

  -- 1. Resolve Academic Year and Term
  IF p_academic_year IS NULL OR p_term IS NULL THEN
    SELECT resolved_year, resolved_term, resolution_source
    INTO v_year, v_term, v_src
    FROM public.resolve_school_running_term(p_school_id)
    LIMIT 1;
  ELSE
    v_year := TRIM(p_academic_year);
    v_term := TRIM(p_term);
  END IF;

  -- 2. Guard: If currently in Onboarding Free Term, preserve referrals!
  v_free_eval := public.evaluate_free_term_eligibility(p_school_id, v_year, v_term);
  v_is_onboarding := COALESCE((v_free_eval->>'eligible')::boolean, false);

  IF v_is_onboarding THEN
    RETURN jsonb_build_object(
      'success', false,
      'already_free', true,
      'reason', 'School is currently enjoying their Onboarding First Term Free. Referral credits are preserved for when payment is due.',
      'academic_year', v_year,
      'term', v_term
    );
  END IF;

  -- 3. Select 2 oldest unconsumed, eligible referrals
  SELECT ARRAY_AGG(id) INTO v_ref_ids
  FROM (
    SELECT id
    FROM public.report_referrals
    WHERE referrer_school_id = TRIM(p_school_id)
      AND COALESCE(consumed_for_free_term, false) = false
      AND status != 'REJECTED'
      AND COALESCE(fraud_flag, false) = false
    ORDER BY created_at ASC
    LIMIT 2
  ) t;

  v_available_count := COALESCE(ARRAY_LENGTH(v_ref_ids, 1), 0);

  IF v_available_count < 2 THEN
    RETURN jsonb_build_object(
      'success', false,
      'insufficient_referrals', true,
      'available_referrals', v_available_count,
      'required_referrals', 2,
      'message', format('A minimum of 2 referred schools is required to earn a free term. Currently available: %s', v_available_count)
    );
  END IF;

  -- 4. Atomically mark the 2 referrals as consumed for this term
  UPDATE public.report_referrals
  SET consumed_for_free_term = TRUE,
      consumed_academic_year = v_year,
      consumed_term          = v_term,
      consumed_at            = NOW(),
      updated_at             = NOW()
  WHERE id = ANY(v_ref_ids);

  -- 5. Calculate remaining unconsumed referrals
  SELECT COUNT(*) INTO v_remaining_count
  FROM public.report_referrals
  WHERE referrer_school_id = TRIM(p_school_id)
    AND COALESCE(consumed_for_free_term, false) = false
    AND status != 'REJECTED'
    AND COALESCE(fraud_flag, false) = false;

  -- 6. Increment school referral free terms count
  UPDATE public.report_schools
  SET referral_free_terms_count = COALESCE(referral_free_terms_count, 0) + 1,
      updated_at = NOW()
  WHERE id = TRIM(p_school_id);

  -- 7. Update or create the school term bill to REFERRAL_FREE_TERM
  SELECT * INTO v_bill
  FROM public.school_term_bills
  WHERE school_id = TRIM(p_school_id)
    AND LOWER(TRIM(academic_year)) = LOWER(TRIM(v_year))
    AND LOWER(TRIM(term))          = LOWER(TRIM(v_term));

  IF v_bill.id IS NOT NULL THEN
    UPDATE public.school_term_bills
    SET status             = 'REFERRAL_FREE_TERM',
        approval_status    = 'APPROVED',
        amount_due         = 0.00,
        amount_paid        = 0.00,
        outstanding_amount = 0.00,
        approved_by        = COALESCE(p_claimed_by, 'Referral Reward Engine'),
        approved_at        = NOW(),
        paid_at            = NOW(),
        updated_at         = NOW()
    WHERE id = v_bill.id;
  ELSE
    -- Find active billing cycle or latest
    SELECT id INTO v_cycle_id
    FROM public.billing_cycles
    WHERE LOWER(TRIM(academic_year)) = LOWER(TRIM(v_year))
      AND LOWER(TRIM(term))          = LOWER(TRIM(v_term))
    ORDER BY created_at DESC
    LIMIT 1;

    IF v_cycle_id IS NOT NULL THEN
      INSERT INTO public.school_term_bills (
        billing_cycle_id, school_id, academic_year, term,
        active_learner_count, rate_per_learner, amount_due,
        amount_paid, outstanding_amount, status, approval_status,
        approved_by, approved_at, paid_at
      ) VALUES (
        v_cycle_id, TRIM(p_school_id), v_year, v_term,
        0, 0.00, 0.00,
        0.00, 0.00, 'REFERRAL_FREE_TERM', 'APPROVED',
        COALESCE(p_claimed_by, 'Referral Reward Engine'), NOW(), NOW()
      )
      ON CONFLICT (school_id, academic_year, term) 
      DO UPDATE SET status = 'REFERRAL_FREE_TERM',
                    amount_due = 0.00,
                    outstanding_amount = 0.00,
                    approval_status = 'APPROVED',
                    approved_by = COALESCE(p_claimed_by, 'Referral Reward Engine'),
                    paid_at = NOW(),
                    updated_at = NOW();
    END IF;
  END IF;

  -- 8. Safely record platform subscription audit log
  BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'platform_subscription_audit') THEN
      INSERT INTO public.platform_subscription_audit (
        school_id, academic_year, term, event, details, performed_by
      ) VALUES (
        TRIM(p_school_id),
        v_year,
        v_term,
        'REFERRAL_FREE_TERM_CLAIMED',
        jsonb_build_object(
          'academic_year', v_year,
          'term', v_term,
          'referrals_deducted', 2,
          'consumed_referral_ids', v_ref_ids,
          'remaining_referrals', v_remaining_count,
          'note', '2 referred schools deducted for full free term waiver. Remaining referrals saved for future terms.'
        ),
        COALESCE(p_claimed_by, 'School Admin')
      );
    END IF;
  EXCEPTION
    WHEN OTHERS THEN
      NULL;
  END;

  RETURN jsonb_build_object(
    'success',             true,
    'status',              'REFERRAL_FREE_TERM',
    'academic_year',       v_year,
    'term',                v_term,
    'referrals_deducted',  2,
    'remaining_referrals', v_remaining_count,
    'message',             format('Free Term granted via Referral Reward! 2 schools deducted, %s school(s) remaining for future terms.', v_remaining_count)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

GRANT EXECUTE ON FUNCTION public.claim_referral_free_term(TEXT, TEXT, TEXT, TEXT) TO authenticated, anon, service_role;


-- ─── 5. UPDATE START_TERM_BILLING_CYCLE WITH AUTO-REFERRAL REWARD WAIVER ───
CREATE OR REPLACE FUNCTION public.start_term_billing_cycle(
  p_academic_year TEXT,
  p_term TEXT,
  p_billing_deadline TIMESTAMPTZ,
  p_started_by TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_caller_id UUID := auth.uid();
  v_caller_role TEXT;
  v_cycle_id UUID;
  v_school RECORD;
  v_cat_rate NUMERIC(10, 2);
  v_rate NUMERIC(10, 2);
  v_learner_cnt INTEGER;
  v_amount_due NUMERIC(12, 2);
  v_free_eval JSONB;
  v_is_free BOOLEAN;
  v_status TEXT;
  v_created_count INTEGER := 0;
  v_exempt_count INTEGER := 0;
  v_ref_credits JSONB;
  v_can_claim_ref BOOLEAN := FALSE;
  v_claim_res JSONB;
BEGIN
  -- Security Verification: Caller MUST be super_admin / platform_admin
  IF v_caller_id IS NOT NULL THEN
    SELECT role INTO v_caller_role
    FROM public.report_profiles
    WHERE id = v_caller_id;

    IF v_caller_role IS NULL OR v_caller_role NOT IN ('super_admin', 'platform_admin', 'developer') THEN
      RAISE EXCEPTION 'Access Denied: Only Labour Edu platform administrators can initiate a term billing cycle.';
    END IF;
  END IF;

  -- Create or get active billing cycle
  INSERT INTO public.billing_cycles (
    academic_year, term, billing_deadline, started_by, status
  ) VALUES (
    p_academic_year, p_term, p_billing_deadline, COALESCE(p_started_by, v_caller_id::text, 'Labour Admin'), 'ACTIVE'
  )
  ON CONFLICT (academic_year, term) 
  DO UPDATE SET billing_deadline = EXCLUDED.billing_deadline
  RETURNING id INTO v_cycle_id;

  -- Iterate all schools & generate immutable snapshots
  FOR v_school IN SELECT * FROM public.report_schools LOOP
    v_free_eval := public.evaluate_free_term_eligibility(v_school.id, p_academic_year, p_term);
    v_is_free := (v_free_eval->>'eligible')::boolean;

    SELECT COUNT(*) INTO v_learner_cnt
    FROM public.report_learners
    WHERE school_id = v_school.id
      AND LOWER(COALESCE(status, 'active')) NOT IN ('alumni', 'graduated', 'transferred', 'inactive');

    SELECT amount_per_learner INTO v_cat_rate
    FROM public.platform_subscription_pricing
    WHERE LOWER(school_category) = LOWER(COALESCE(v_school.school_category, v_school.school_type, 'GES'))
    LIMIT 1;

    v_rate := COALESCE(v_school.per_learner_rate_override, v_cat_rate, 5.00);

    -- Priority 1: Onboarding Free Term
    IF v_is_free THEN
      v_amount_due := 0.00;
      v_status := 'FIRST_TERM_FREE';
      v_exempt_count := v_exempt_count + 1;

    -- Priority 2: Admin-granted exemption
    ELSIF v_school.subscription_exempt_until IS NOT NULL AND v_school.subscription_exempt_until >= NOW() THEN
      v_amount_due := 0.00;
      v_status := 'EXEMPT';
      v_exempt_count := v_exempt_count + 1;

    -- Priority 3: Referral Free Term (2 referrals deducted, remainder carries over)
    ELSE
      v_ref_credits := public.get_school_referral_credits(v_school.id);
      v_can_claim_ref := COALESCE((v_ref_credits->>'can_claim_free_term')::boolean, false);

      IF v_can_claim_ref THEN
        -- Auto-claim the referral free term: deduct 2 referrals & leave remainder
        v_claim_res := public.claim_referral_free_term(v_school.id, p_academic_year, p_term, 'Billing Cycle Auto-Reward');
        v_amount_due := 0.00;
        v_status := 'REFERRAL_FREE_TERM';
        v_exempt_count := v_exempt_count + 1;
      ELSE
        v_amount_due := v_learner_cnt * v_rate;
        v_status := 'AWAITING_APPROVAL';
        v_created_count := v_created_count + 1;
      END IF;
    END IF;

    INSERT INTO public.school_term_bills (
      billing_cycle_id, school_id, academic_year, term,
      active_learner_count, rate_per_learner, amount_due,
      amount_paid, outstanding_amount, status, approval_status
    ) VALUES (
      v_cycle_id, v_school.id, p_academic_year, p_term,
      v_learner_cnt, v_rate, v_amount_due,
      0.00, v_amount_due, v_status,
      CASE 
        WHEN v_status IN ('FIRST_TERM_FREE', 'EXEMPT', 'REFERRAL_FREE_TERM') THEN 'APPROVED' 
        ELSE 'PENDING' 
      END
    )
    ON CONFLICT (school_id, academic_year, term) 
    DO UPDATE SET 
      active_learner_count = EXCLUDED.active_learner_count,
      rate_per_learner = EXCLUDED.rate_per_learner,
      amount_due = EXCLUDED.amount_due,
      outstanding_amount = EXCLUDED.outstanding_amount,
      status = EXCLUDED.status,
      approval_status = EXCLUDED.approval_status;

  END LOOP;

  RETURN json_build_object(
    'success', true,
    'billing_cycle_id', v_cycle_id,
    'bills_created', v_created_count,
    'free_schools_exempt', v_exempt_count
  )::jsonb;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

GRANT EXECUTE ON FUNCTION public.start_term_billing_cycle(TEXT, TEXT, TIMESTAMPTZ, TEXT) TO authenticated, service_role;


-- ─── 6. UPDATE GET_SCHOOL_SUBSCRIPTION_STATUS WITH REFERRAL FREE TERM SUPPORT 
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
  v_ref_credits    JSONB;
BEGIN
  -- Auth & School Resolution
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

  -- Resolve Term
  IF p_academic_year IS NOT NULL AND p_term IS NOT NULL THEN
    v_year           := TRIM(p_academic_year);
    v_term           := TRIM(p_term);
    v_resolution_src := 'EXPLICIT_REQUEST';

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
    SELECT resolved_year, resolved_term, resolution_source
    INTO v_year, v_term, v_resolution_src
    FROM public.resolve_school_running_term(v_target_school)
    LIMIT 1;

    SELECT * INTO v_cycle
    FROM public.billing_cycles
    WHERE LOWER(status) = 'active'
    ORDER BY created_at DESC
    LIMIT 1;

    IF v_cycle.id IS NOT NULL THEN
      v_deadline := v_cycle.billing_deadline;
    END IF;
  END IF;

  -- Free-term Evaluation
  v_free_eval     := public.evaluate_free_term_eligibility(v_target_school, v_year, v_term);
  v_is_free       := COALESCE((v_free_eval->>'eligible')::boolean, false);
  v_is_onboarding := COALESCE((v_free_eval->>'is_onboarding_term')::boolean, false);

  -- Fetch referral credit balance
  v_ref_credits := public.get_school_referral_credits(v_target_school);

  -- Billing Bill Lookup
  SELECT * INTO v_bill
  FROM public.school_term_bills
  WHERE school_id    = v_target_school
    AND LOWER(TRIM(academic_year)) = LOWER(TRIM(v_year))
    AND LOWER(TRIM(term))          = LOWER(TRIM(v_term));

  -- ── Entitlement Decision ──────────────────────────────────────────────────
  IF v_school.subscription_exempt_until IS NOT NULL
     AND v_school.subscription_exempt_until >= NOW()
  THEN
    v_is_unlocked    := TRUE;
    v_status         := 'EXEMPT';
    v_reports_locked := FALSE;

  ELSIF v_is_free THEN
    v_is_unlocked    := TRUE;
    v_status         := 'FIRST_TERM_FREE';
    v_reports_locked := FALSE;

  ELSIF v_bill.id IS NOT NULL AND v_bill.status = 'REFERRAL_FREE_TERM' THEN
    -- School enjoys free term earned by referring 2 schools!
    v_is_unlocked    := TRUE;
    v_status         := 'REFERRAL_FREE_TERM';
    v_reports_locked := FALSE;
    v_lock_reason    := NULL;

  ELSIF v_bill.id IS NOT NULL THEN
    v_status      := v_bill.status;
    v_learner_cnt := v_bill.active_learner_count;
    v_rate        := v_bill.rate_per_learner;
    v_amount_due  := v_bill.amount_due;

    IF v_bill.status = 'PAID' THEN
      v_is_unlocked    := TRUE;
      v_reports_locked := FALSE;

    ELSIF v_bill.status IN ('FIRST_TERM_FREE', 'EXEMPT', 'REFERRAL_FREE_TERM') THEN
      v_is_unlocked    := TRUE;
      v_reports_locked := FALSE;

    ELSIF v_deadline IS NOT NULL AND NOW() > v_deadline THEN
      v_is_unlocked    := FALSE;
      v_reports_locked := TRUE;
      v_lock_reason    := format(
        'Term Subscription bill for %s (%s) is unpaid. Billing deadline (%s) has passed. Please approve payment, top up school wallet, or apply referral reward.',
        v_term, v_year,
        to_char(v_deadline, 'DD Mon YYYY')
      );

    ELSE
      v_is_unlocked    := TRUE;
      v_reports_locked := FALSE;
      v_lock_reason    := format(
        'Term Subscription bill for %s (%s) is pending payment. Please approve before billing deadline (%s).',
        v_term, v_year,
        CASE WHEN v_deadline IS NOT NULL THEN to_char(v_deadline, 'DD Mon YYYY') ELSE 'N/A' END
      );
    END IF;

  ELSE
    -- No bill created yet for this term: grant access
    v_is_unlocked    := TRUE;
    v_status         := 'NO_BILL';
    v_reports_locked := FALSE;
  END IF;

  -- Response Payload
  RETURN json_build_object(
    'is_unlocked',           v_is_unlocked,
    'billing_status',        v_status,
    'reports_locked',        v_reports_locked,
    'lock_reason',           v_lock_reason,

    'can_view_data',         true,
    'can_enter_results',     true,
    'can_edit_results',      true,
    'can_generate_reports',  NOT v_reports_locked,
    'can_download_reports',  NOT v_reports_locked,
    'can_print_reports',     NOT v_reports_locked,
    'can_export_reports',    NOT v_reports_locked,

    'wallet_balance',        v_wallet_bal,
    'bill_id',               v_bill.id,
    'amount_due',            CASE 
                               WHEN v_status = 'REFERRAL_FREE_TERM' THEN 0.00
                               ELSE COALESCE(v_bill.amount_due, v_amount_due)
                             END,
    'amount_paid',           COALESCE(v_bill.amount_paid, 0.00),
    'outstanding_amount',    CASE
                               WHEN v_is_unlocked AND v_status IN ('PAID', 'REFERRAL_FREE_TERM', 'FIRST_TERM_FREE', 'EXEMPT') THEN 0.00
                               ELSE COALESCE(v_bill.outstanding_amount, v_amount_due)
                             END,
    'approval_status',       COALESCE(v_bill.approval_status, 'PENDING'),
    'billing_deadline',      v_deadline,

    'academic_year',         v_year,
    'term',                  v_term,
    'resolution_source',     v_resolution_src,
    'active_learner_count',  COALESCE(v_bill.active_learner_count, v_learner_cnt),
    'rate_per_learner',      COALESCE(v_bill.rate_per_learner, v_rate),

    'is_first_term_free',    v_is_free,
    'is_onboarding_term',    v_is_onboarding,
    'free_term_reason',      v_free_eval->>'reason',
    'onboarding_year',       v_free_eval->>'onboarding_year',
    'onboarding_term',       v_free_eval->>'onboarding_term',
    'max_free_until_date',   v_free_eval->>'max_free_until_date',

    -- Referral Credit Information
    'referral_credits',      v_ref_credits,
    'is_referral_free_term', (v_status = 'REFERRAL_FREE_TERM')
  )::jsonb;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

GRANT EXECUTE ON FUNCTION public.get_school_subscription_status(TEXT, TEXT, TEXT) TO authenticated, service_role;
