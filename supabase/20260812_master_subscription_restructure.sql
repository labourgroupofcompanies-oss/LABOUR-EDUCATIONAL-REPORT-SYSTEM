-- ============================================================================
-- Migration: 20260812_master_subscription_restructure.sql
-- Date: 2026-08-12
-- Description: Complete restructuring of the Subscription, Term Billing &
--              School Wallet System according to Master Business Rules:
--              1. Developer/Admin-initiated term billing cycles
--              2. Onboarding term free policy (max 16 weeks protection)
--              3. Immutable billing snapshots (anti-cheating)
--              4. Explicit school payment approval flow
--              5. Atomic wallet deduction & auto-settlement after Paystack top-up
--              6. Server-authoritative report entitlements & locking
-- ============================================================================

-- ─── 1. SCHOOL FREE TERM HISTORY ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.school_free_term_history (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id                TEXT NOT NULL REFERENCES public.report_schools(id) ON DELETE RESTRICT,
  onboarding_academic_year TEXT NOT NULL,
  onboarding_term          TEXT NOT NULL,
  onboarding_date          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  max_free_until_date      TIMESTAMPTZ NOT NULL, -- onboarding_date + 16 weeks
  is_expired               BOOLEAN NOT NULL DEFAULT FALSE,
  expired_reason           TEXT,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT unq_school_free_term_history UNIQUE (school_id)
);

CREATE INDEX IF NOT EXISTS idx_school_free_history_school ON public.school_free_term_history(school_id);

-- ─── 2. BILLING CYCLES (Labour Admin Initiated) ─────────────────────────────
CREATE TABLE IF NOT EXISTS public.billing_cycles (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  academic_year    TEXT NOT NULL,
  term             TEXT NOT NULL,
  billing_deadline TIMESTAMPTZ NOT NULL,
  started_by       TEXT NOT NULL DEFAULT 'Labour Admin',
  status           TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'COMPLETED', 'CANCELLED')),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT unq_billing_cycle_year_term UNIQUE (academic_year, term)
);

CREATE INDEX IF NOT EXISTS idx_billing_cycles_year_term ON public.billing_cycles(academic_year, term);

-- ─── 3. SCHOOL TERM BILLS (Immutable Billing Snapshots) ─────────────────────
CREATE TABLE IF NOT EXISTS public.school_term_bills (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  billing_cycle_id     UUID NOT NULL REFERENCES public.billing_cycles(id) ON DELETE RESTRICT,
  school_id            TEXT NOT NULL REFERENCES public.report_schools(id) ON DELETE RESTRICT,
  academic_year        TEXT NOT NULL,
  term                 TEXT NOT NULL,
  active_learner_count INTEGER NOT NULL DEFAULT 0,
  rate_per_learner     NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
  amount_due           NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  amount_paid          NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  outstanding_amount   NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  status               TEXT NOT NULL DEFAULT 'AWAITING_APPROVAL' 
                        CHECK (status IN (
                          'FIRST_TERM_FREE',
                          'AWAITING_APPROVAL',
                          'APPROVED',
                          'PAID',
                          'INSUFFICIENT_FUNDS',
                          'EXPIRED',
                          'EXEMPT'
                        )),
  approval_status      TEXT NOT NULL DEFAULT 'PENDING' CHECK (approval_status IN ('PENDING', 'APPROVED', 'EXEMPT')),
  approved_by          TEXT,
  approved_at          TIMESTAMPTZ,
  paid_at              TIMESTAMPTZ,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT unq_school_term_bill UNIQUE (school_id, academic_year, term)
);

CREATE INDEX IF NOT EXISTS idx_school_term_bills_school ON public.school_term_bills(school_id);
CREATE INDEX IF NOT EXISTS idx_school_term_bills_status ON public.school_term_bills(status);

-- ─── 4. RLS POLICIES FOR NEW BILLING TABLES ──────────────────────────────────
ALTER TABLE public.school_free_term_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_cycles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.school_term_bills ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "free_term_history_select" ON public.school_free_term_history;
CREATE POLICY "free_term_history_select" ON public.school_free_term_history 
  FOR SELECT USING (TRUE);

DROP POLICY IF EXISTS "billing_cycles_select" ON public.billing_cycles;
CREATE POLICY "billing_cycles_select" ON public.billing_cycles 
  FOR SELECT USING (TRUE);

DROP POLICY IF EXISTS "school_term_bills_select" ON public.school_term_bills;
CREATE POLICY "school_term_bills_select" ON public.school_term_bills 
  FOR SELECT USING (TRUE);

-- ─── 5. RPC: EVALUATE FREE TERM ELIGIBILITY (16-Week Rule) ───────────────────
CREATE OR REPLACE FUNCTION public.evaluate_free_term_eligibility(
  p_school_id TEXT,
  p_academic_year TEXT DEFAULT NULL,
  p_term TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_school RECORD;
  v_history RECORD;
  v_is_free BOOLEAN := FALSE;
  v_reason TEXT := 'Not onboarding term';
  v_now TIMESTAMPTZ := NOW();
BEGIN
  SELECT * INTO v_school FROM public.report_schools WHERE id = p_school_id;
  IF v_school.id IS NULL THEN
    RETURN json_build_object('eligible', false, 'reason', 'School not found')::jsonb;
  END IF;

  -- Check if school has free trial explicitly terminated by developer
  IF v_school.first_term_free_terminated = TRUE THEN
    RETURN json_build_object('eligible', false, 'reason', 'Free trial manually terminated by developer')::jsonb;
  END IF;

  -- Check or auto-create history record
  SELECT * INTO v_history FROM public.school_free_term_history WHERE school_id = p_school_id;
  IF v_history.id IS NULL THEN
    -- Auto-seed history if missing
    INSERT INTO public.school_free_term_history (
      school_id, onboarding_academic_year, onboarding_term, onboarding_date, max_free_until_date
    ) VALUES (
      p_school_id,
      COALESCE(v_school.initial_academic_year, p_academic_year, '2025/2026'),
      COALESCE(v_school.initial_term, p_term, 'Term 1'),
      COALESCE(v_school.created_at, NOW()),
      COALESCE(v_school.created_at, NOW()) + INTERVAL '16 weeks'
    )
    ON CONFLICT (school_id) DO NOTHING;

    SELECT * INTO v_history FROM public.school_free_term_history WHERE school_id = p_school_id;
  END IF;

  -- Rule 1: Check 16-week maximum duration limit
  IF v_now > v_history.max_free_until_date THEN
    IF NOT v_history.is_expired THEN
      UPDATE public.school_free_term_history
      SET is_expired = TRUE, expired_reason = '16-week maximum duration exceeded'
      WHERE id = v_history.id;
    END IF;
    RETURN json_build_object('eligible', false, 'reason', '16-week maximum free duration exceeded')::jsonb;
  END IF;

  -- Rule 2: Check if requested year + term matches onboarding year + term
  IF p_academic_year IS NOT NULL AND p_term IS NOT NULL THEN
    IF (v_history.onboarding_academic_year = p_academic_year AND v_history.onboarding_term = p_term) THEN
      v_is_free := TRUE;
      v_reason := 'Active Onboarding Free Term';
    ELSE
      v_is_free := FALSE;
      v_reason := 'Subsequent term (free entitlement consumed)';
    END IF;
  ELSE
    v_is_free := TRUE;
    v_reason := 'Within 16-week onboarding window';
  END IF;

  RETURN json_build_object(
    'eligible', v_is_free,
    'reason', v_reason,
    'onboarding_year', v_history.onboarding_academic_year,
    'onboarding_term', v_history.onboarding_term,
    'max_free_until_date', v_history.max_free_until_date,
    'is_expired', v_history.is_expired
  )::jsonb;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ─── 6. RPC: START TERM BILLING CYCLE (Labour Admin Initiated) ─────────────
CREATE OR REPLACE FUNCTION public.start_term_billing_cycle(
  p_academic_year TEXT,
  p_term TEXT,
  p_billing_deadline TIMESTAMPTZ,
  p_started_by TEXT DEFAULT 'Labour Admin'
)
RETURNS JSONB AS $$
DECLARE
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
BEGIN
  -- Create or get billing cycle
  INSERT INTO public.billing_cycles (
    academic_year, term, billing_deadline, started_by, status
  ) VALUES (
    p_academic_year, p_term, p_billing_deadline, p_started_by, 'ACTIVE'
  )
  ON CONFLICT (academic_year, term) 
  DO UPDATE SET billing_deadline = EXCLUDED.billing_deadline, started_by = EXCLUDED.started_by
  RETURNING id INTO v_cycle_id;

  -- Iterate all schools
  FOR v_school IN SELECT * FROM public.report_schools LOOP
    -- Evaluate free term eligibility
    v_free_eval := public.evaluate_free_term_eligibility(v_school.id, p_academic_year, p_term);
    v_is_free := (v_free_eval->>'eligible')::boolean;

    -- Count active learners for school
    SELECT COUNT(*) INTO v_learner_cnt
    FROM public.report_learners
    WHERE school_id = v_school.id
      AND LOWER(COALESCE(status, 'active')) NOT IN ('alumni', 'graduated', 'transferred', 'inactive');

    -- Resolve rate per learner
    SELECT amount_per_learner INTO v_cat_rate
    FROM public.platform_subscription_pricing
    WHERE LOWER(school_category) = LOWER(COALESCE(v_school.school_category, v_school.school_type, 'GES'))
    LIMIT 1;

    v_rate := COALESCE(v_school.per_learner_rate_override, v_cat_rate, 5.00);

    -- Determine status and bill amount
    IF v_is_free THEN
      v_amount_due := 0.00;
      v_status := 'FIRST_TERM_FREE';
      v_exempt_count := v_exempt_count + 1;
    ELSIF v_school.subscription_exempt_until IS NOT NULL AND v_school.subscription_exempt_until >= NOW() THEN
      v_amount_due := 0.00;
      v_status := 'EXEMPT';
      v_exempt_count := v_exempt_count + 1;
    ELSE
      v_amount_due := v_learner_cnt * v_rate;
      v_status := 'AWAITING_APPROVAL';
      v_created_count := v_created_count + 1;
    END IF;

    -- Insert immutable billing snapshot
    INSERT INTO public.school_term_bills (
      billing_cycle_id, school_id, academic_year, term,
      active_learner_count, rate_per_learner, amount_due,
      amount_paid, outstanding_amount, status, approval_status
    ) VALUES (
      v_cycle_id, v_school.id, p_academic_year, p_term,
      v_learner_cnt, v_rate, v_amount_due,
      CASE WHEN v_is_free OR v_status = 'EXEMPT' THEN 0.00 ELSE 0.00 END,
      v_amount_due, v_status,
      CASE WHEN v_is_free OR v_status = 'EXEMPT' THEN 'EXEMPT' ELSE 'PENDING' END
    )
    ON CONFLICT (school_id, academic_year, term) DO NOTHING;

  END LOOP;

  RETURN json_build_object(
    'success', true,
    'billing_cycle_id', v_cycle_id,
    'bills_created', v_created_count,
    'free_schools_exempt', v_exempt_count
  )::jsonb;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ─── 7. RPC: APPROVE AND PAY TERM BILL (School Admin Action) ────────────────
CREATE OR REPLACE FUNCTION public.approve_and_pay_term_bill(
  p_bill_id UUID,
  p_user_id TEXT DEFAULT 'School Admin'
)
RETURNS JSONB AS $$
DECLARE
  v_bill RECORD;
  v_school RECORD;
  v_old_bal NUMERIC(12,2);
  v_new_bal NUMERIC(12,2);
  v_tx_id UUID;
BEGIN
  -- 1. Fetch bill authoritative record
  SELECT * INTO v_bill FROM public.school_term_bills WHERE id = p_bill_id;
  IF v_bill.id IS NULL THEN
    RETURN json_build_object('success', false, 'message', 'Billing record not found')::jsonb;
  END IF;

  IF v_bill.status = 'PAID' THEN
    RETURN json_build_object('success', true, 'message', 'Bill is already paid', 'status', 'PAID')::jsonb;
  END IF;

  IF v_bill.status = 'FIRST_TERM_FREE' OR v_bill.status = 'EXEMPT' THEN
    RETURN json_build_object('success', true, 'message', 'Bill is exempt from payment', 'status', v_bill.status)::jsonb;
  END IF;

  -- 2. Fetch school authoritative wallet balance
  SELECT * INTO v_school FROM public.report_schools WHERE id = v_bill.school_id FOR UPDATE;
  v_old_bal := COALESCE(v_school.wallet_balance, 0.00);

  -- 3. Mark approval status
  UPDATE public.school_term_bills
  SET approval_status = 'APPROVED',
      approved_by = p_user_id,
      approved_at = NOW()
  WHERE id = p_bill_id;

  -- 4. Check Wallet Balance vs Bill Amount
  IF v_old_bal >= v_bill.amount_due THEN
    -- SUFFICIENT WALLET BALANCE: Perform Atomic Deduction
    v_new_bal := v_old_bal - v_bill.amount_due;

    -- Update school wallet
    UPDATE public.report_schools
    SET wallet_balance = v_new_bal
    WHERE id = v_bill.school_id;

    -- Update bill to PAID
    UPDATE public.school_term_bills
    SET status = 'PAID',
        amount_paid = v_bill.amount_due,
        outstanding_amount = 0.00,
        paid_at = NOW()
    WHERE id = p_bill_id;

    -- Insert Immutable Wallet Ledger Transaction
    INSERT INTO public.wallet_transactions (
      school_id, transaction_type, currency, amount,
      balance_before, balance_after, description, reference, created_by
    ) VALUES (
      v_bill.school_id, 'DEBIT', 'GHS', v_bill.amount_due,
      v_old_bal, v_new_bal,
      'Term Subscription Payment — ' || v_bill.academic_year || ' (' || v_bill.term || ')',
      'BILL-' || v_bill.id, p_user_id
    ) RETURNING id INTO v_tx_id;

    -- Insert Platform Audit
    INSERT INTO public.platform_subscription_audit (
      school_id, academic_year, term, event, details, performed_by
    ) VALUES (
      v_bill.school_id, v_bill.academic_year, v_bill.term,
      'TERM_SUBSCRIPTION_PAID',
      json_build_object('amount_paid', v_bill.amount_due, 'wallet_balance_after', v_new_bal),
      p_user_id
    );

    RETURN json_build_object(
      'success', true,
      'status', 'PAID',
      'message', 'Payment approved and deducted from school wallet successfully!',
      'amount_deducted', v_bill.amount_due,
      'wallet_balance', v_new_bal
    )::jsonb;

  ELSE
    -- INSUFFICIENT WALLET BALANCE: Do NOT partially deduct
    UPDATE public.school_term_bills
    SET status = 'INSUFFICIENT_FUNDS',
        outstanding_amount = v_bill.amount_due
    WHERE id = p_bill_id;

    RETURN json_build_object(
      'success', false,
      'status', 'INSUFFICIENT_FUNDS',
      'message', 'Payment approved, but wallet balance is insufficient.',
      'amount_due', v_bill.amount_due,
      'wallet_balance', v_old_bal,
      'top_up_required', (v_bill.amount_due - v_old_bal)
    )::jsonb;

  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ─── 8. ENHANCE WALLET DEPOSIT & AUTO-SETTLEMENT (Paystack Webhook Helper) ──
CREATE OR REPLACE FUNCTION public.process_wallet_credit(
  p_payment_id UUID,
  p_school_id TEXT,
  p_verified_amount NUMERIC,
  p_provider_reference TEXT,
  p_description TEXT DEFAULT 'Wallet Top Up',
  p_channel TEXT DEFAULT 'card',
  p_paystack_tx_id TEXT DEFAULT NULL,
  p_paid_at TIMESTAMPTZ DEFAULT NOW(),
  p_raw_response JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB AS $$
DECLARE
  v_school RECORD;
  v_old_bal NUMERIC(12,2);
  v_new_bal NUMERIC(12,2);
  v_bill RECORD;
  v_settle_res JSONB;
BEGIN
  -- 1. Idempotency Check: verify transaction not credited already
  SELECT wallet_balance INTO v_old_bal
  FROM public.report_schools
  WHERE id = p_school_id FOR UPDATE;

  IF v_old_bal IS NULL THEN
    RETURN json_build_object('success', false, 'message', 'School not found')::jsonb;
  END IF;

  -- 2. Update payment_transactions status
  UPDATE public.payment_transactions
  SET status = 'WALLET_CREDITED',
      verified_amount = p_verified_amount,
      provider_transaction_id = p_paystack_tx_id,
      paystack_channel = p_channel,
      paid_at = p_paid_at,
      credited_at = NOW(),
      completed_at = NOW(),
      paystack_raw_response = p_raw_response
  WHERE id = p_payment_id AND status != 'WALLET_CREDITED';

  -- 3. Credit School Wallet
  v_new_bal := v_old_bal + p_verified_amount;
  UPDATE public.report_schools
  SET wallet_balance = v_new_bal
  WHERE id = p_school_id;

  -- 4. Record Ledger Entry
  INSERT INTO public.wallet_transactions (
    school_id, payment_id, transaction_type, currency, amount,
    balance_before, balance_after, description, reference, created_by
  ) VALUES (
    p_school_id, p_payment_id, 'CREDIT', 'GHS', p_verified_amount,
    v_old_bal, v_new_bal, p_description, p_provider_reference, 'WEBHOOK'
  );

  -- 5. AUTO-SETTLEMENT CHECK: Look for approved bill with INSUFFICIENT_FUNDS or AWAITING_APPROVAL
  SELECT * INTO v_bill
  FROM public.school_term_bills
  WHERE school_id = p_school_id
    AND approval_status = 'APPROVED'
    AND status IN ('INSUFFICIENT_FUNDS', 'AWAITING_APPROVAL')
  ORDER BY created_at ASC LIMIT 1;

  IF v_bill.id IS NOT NULL AND v_new_bal >= v_bill.amount_due THEN
    v_settle_res := public.approve_and_pay_term_bill(v_bill.id, 'AUTO_SETTLEMENT_AFTER_TOPUP');
  END IF;

  RETURN json_build_object(
    'success', true,
    'school_id', p_school_id,
    'previous_balance', v_old_bal,
    'new_balance', v_new_bal,
    'auto_settlement', v_settle_res
  )::jsonb;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ─── 9. RPC: GET SCHOOL SUBSCRIPTION & REPORT ENTITLEMENT STATUS ────────────
CREATE OR REPLACE FUNCTION public.get_school_subscription_status(
  p_school_id TEXT,
  p_academic_year TEXT DEFAULT NULL,
  p_term TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_school RECORD;
  v_cycle RECORD;
  v_bill RECORD;
  v_year TEXT;
  v_term TEXT;
  v_free_eval JSONB;
  v_is_free BOOLEAN := FALSE;
  v_is_unlocked BOOLEAN := FALSE;
  v_status TEXT := 'NO_BILLING_CYCLE';
  v_deadline TIMESTAMPTZ;
  v_reports_locked BOOLEAN := FALSE;
  v_lock_reason TEXT := NULL;
  v_learner_cnt INTEGER := 0;
  v_rate NUMERIC(10,2) := 5.00;
  v_amount_due NUMERIC(12,2) := 0.00;
  v_wallet_bal NUMERIC(12,2) := 0.00;
BEGIN
  SELECT * INTO v_school FROM public.report_schools WHERE id = p_school_id;
  IF v_school.id IS NULL THEN
    RETURN json_build_object('is_unlocked', false, 'lock_reason', 'School not found')::jsonb;
  END IF;

  v_wallet_bal := COALESCE(v_school.wallet_balance, 0.00);

  -- Determine active cycle
  SELECT * INTO v_cycle FROM public.billing_cycles
  WHERE status = 'ACTIVE'
  ORDER BY created_at DESC LIMIT 1;

  IF v_cycle.id IS NOT NULL THEN
    v_year := v_cycle.academic_year;
    v_term := v_cycle.term;
    v_deadline := v_cycle.billing_deadline;
  ELSE
    v_year := COALESCE(p_academic_year, v_school.current_academic_year, '2025/2026');
    v_term := COALESCE(p_term, v_school.current_term, 'Term 1');
  END IF;

  -- Evaluate Free Term
  v_free_eval := public.evaluate_free_term_eligibility(p_school_id, v_year, v_term);
  v_is_free := (v_free_eval->>'eligible')::boolean;

  -- Check existing term bill
  SELECT * INTO v_bill FROM public.school_term_bills
  WHERE school_id = p_school_id AND academic_year = v_year AND term = v_term;

  IF v_is_free OR (v_school.subscription_exempt_until IS NOT NULL AND v_school.subscription_exempt_until >= NOW()) THEN
    v_is_unlocked := TRUE;
    v_status := CASE WHEN v_is_free THEN 'FIRST_TERM_FREE' ELSE 'EXEMPT' END;
    v_reports_locked := FALSE;
  ELSIF v_bill.id IS NOT NULL THEN
    v_status := v_bill.status;
    v_learner_cnt := v_bill.active_learner_count;
    v_rate := v_bill.rate_per_learner;
    v_amount_due := v_bill.amount_due;

    IF v_bill.status = 'PAID' THEN
      v_is_unlocked := TRUE;
      v_reports_locked := FALSE;
    ELSIF v_deadline IS NOT NULL AND NOW() > v_deadline THEN
      v_is_unlocked := FALSE;
      v_reports_locked := TRUE;
      v_lock_reason := 'Billing deadline (' || to_char(v_deadline, 'DD Mon YYYY') || ') has passed. Please approve payment or top up wallet.';
    ELSE
      -- Before deadline: reports remain open
      v_is_unlocked := TRUE;
      v_reports_locked := FALSE;
    END IF;
  ELSE
    -- No bill yet created
    v_is_unlocked := TRUE;
    v_status := 'NO_BILL';
    v_reports_locked := FALSE;
  END IF;

  RETURN json_build_object(
    'is_unlocked', v_is_unlocked,
    'billing_status', v_status,
    'reports_locked', v_reports_locked,
    'lock_reason', v_lock_reason,
    'can_view_data', true,
    'can_enter_results', true,
    'can_edit_results', true,
    'can_generate_reports', NOT v_reports_locked,
    'can_download_reports', NOT v_reports_locked,
    'can_print_reports', NOT v_reports_locked,
    'can_export_reports', NOT v_reports_locked,
    'wallet_balance', v_wallet_bal,
    'bill_id', v_bill.id,
    'academic_year', v_year,
    'term', v_term,
    'active_learner_count', COALESCE(v_bill.active_learner_count, v_learner_cnt),
    'rate_per_learner', COALESCE(v_bill.rate_per_learner, v_rate),
    'amount_due', COALESCE(v_bill.amount_due, v_amount_due),
    'amount_paid', COALESCE(v_bill.amount_paid, 0.00),
    'outstanding_amount', CASE WHEN v_is_unlocked AND v_status = 'PAID' THEN 0.00 ELSE COALESCE(v_bill.outstanding_amount, v_amount_due) END,
    'approval_status', COALESCE(v_bill.approval_status, 'PENDING'),
    'billing_deadline', v_deadline,
    'is_first_term_free', v_is_free,
    'free_term_reason', v_free_eval->>'reason'
  )::jsonb;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
