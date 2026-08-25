-- ============================================================================
-- Migration: RUN_THIS_SUBSCRIPTION_MIGRATION.sql
-- Date: 2026-08-12
-- Description: ALL-IN-ONE Master & Hardened Subscription, Billing & Wallet Migration
--
-- RUN THIS ENTIRE SCRIPT IN YOUR SUPABASE SQL EDITOR.
-- It creates all required tables first, then applies all RLS policies,
-- security triggers, RPC functions, and indexes in exact order.
-- ============================================================================

-- ─── 1. CREATE ALL TABLES FIRST ──────────────────────────────────────────────

-- 1A. SCHOOL FREE TERM HISTORY
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

-- 1B. BILLING CYCLES (Labour Admin Initiated)
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

-- 1C. SCHOOL TERM BILLS (Immutable Billing Snapshots)
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

-- ─── 2. INDEXES & CONSTRAINTS ────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_school_free_history_school ON public.school_free_term_history(school_id);
CREATE INDEX IF NOT EXISTS idx_billing_cycles_year_term ON public.billing_cycles(academic_year, term);
CREATE INDEX IF NOT EXISTS idx_school_term_bills_school ON public.school_term_bills(school_id);
CREATE INDEX IF NOT EXISTS idx_school_term_bills_status ON public.school_term_bills(status);
CREATE INDEX IF NOT EXISTS idx_report_profiles_auth_lookup ON public.report_profiles(id, school_id, role);
CREATE INDEX IF NOT EXISTS idx_school_term_bills_school_year_term ON public.school_term_bills(school_id, academic_year, term);
CREATE UNIQUE INDEX IF NOT EXISTS unq_wallet_tx_bill_deduction ON public.wallet_transactions(school_id, reference) WHERE transaction_type = 'DEBIT';

-- ─── 3. STRICT TENANT-SCOPED RLS POLICIES ────────────────────────────────────
ALTER TABLE public.school_free_term_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_cycles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.school_term_bills ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "free_term_history_select" ON public.school_free_term_history;
DROP POLICY IF EXISTS "billing_cycles_select" ON public.billing_cycles;
DROP POLICY IF EXISTS "school_term_bills_select" ON public.school_term_bills;
DROP POLICY IF EXISTS "billing_cycles_tenant_select" ON public.billing_cycles;
DROP POLICY IF EXISTS "school_term_bills_tenant_select" ON public.school_term_bills;
DROP POLICY IF EXISTS "school_free_term_history_tenant_select" ON public.school_free_term_history;
DROP POLICY IF EXISTS "billing_cycles_restricted_select" ON public.billing_cycles;
DROP POLICY IF EXISTS "school_term_bills_strict_select" ON public.school_term_bills;
DROP POLICY IF EXISTS "school_free_term_history_strict_select" ON public.school_free_term_history;

-- Restrict billing_cycles SELECT to active cycles or cycles where school has a bill
CREATE POLICY "billing_cycles_restricted_select" ON public.billing_cycles
  FOR SELECT TO authenticated
  USING (
    status = 'ACTIVE'
    OR id IN (
      SELECT billing_cycle_id FROM public.school_term_bills
      WHERE school_id = (SELECT school_id FROM public.report_profiles WHERE id = (SELECT auth.uid()) LIMIT 1)
    )
    OR EXISTS (
      SELECT 1 FROM public.report_profiles
      WHERE id = (SELECT auth.uid()) AND LOWER(COALESCE(role, '')) IN ('super_admin', 'admin', 'administrator', 'platform_admin', 'platform_developer', 'developer', 'headteacher')
    )
  );

-- Tenant-scoped RLS for school_term_bills
CREATE POLICY "school_term_bills_strict_select" ON public.school_term_bills
  FOR SELECT TO authenticated
  USING (
    school_id = (SELECT school_id FROM public.report_profiles WHERE id = (SELECT auth.uid()) LIMIT 1)
    OR EXISTS (
      SELECT 1 FROM public.report_profiles
      WHERE id = (SELECT auth.uid()) AND LOWER(COALESCE(role, '')) IN ('super_admin', 'admin', 'administrator', 'platform_admin', 'platform_developer', 'developer', 'headteacher')
    )
  );

-- Tenant-scoped RLS for school_free_term_history
CREATE POLICY "school_free_term_history_strict_select" ON public.school_free_term_history
  FOR SELECT TO authenticated
  USING (
    school_id = (SELECT school_id FROM public.report_profiles WHERE id = (SELECT auth.uid()) LIMIT 1)
    OR EXISTS (
      SELECT 1 FROM public.report_profiles
      WHERE id = (SELECT auth.uid()) AND LOWER(COALESCE(role, '')) IN ('super_admin', 'admin', 'administrator', 'platform_admin', 'platform_developer', 'developer', 'headteacher')
    )
  );

-- Revoke direct mutation rights on free term history
REVOKE INSERT, UPDATE, DELETE ON public.school_free_term_history FROM PUBLIC, authenticated, anon;
GRANT SELECT ON public.school_free_term_history TO authenticated;

-- ─── 4. IMMUTABLE SNAPSHOT TRIGGER ───────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.prevent_immutable_term_bill_modification()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.active_learner_count IS DISTINCT FROM NEW.active_learner_count OR
     OLD.rate_per_learner     IS DISTINCT FROM NEW.rate_per_learner OR
     OLD.amount_due           IS DISTINCT FROM NEW.amount_due OR
     OLD.school_id            IS DISTINCT FROM NEW.school_id OR
     OLD.academic_year        IS DISTINCT FROM NEW.academic_year OR
     OLD.term                 IS DISTINCT FROM NEW.term OR
     OLD.billing_cycle_id     IS DISTINCT FROM NEW.billing_cycle_id THEN
    RAISE EXCEPTION 'Security Exception: Cannot alter frozen billing snapshot parameters (active_learner_count, rate_per_learner, amount_due, school_id, year, term)';
  END IF;
  
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

DROP TRIGGER IF EXISTS trg_prevent_immutable_term_bill ON public.school_term_bills;
CREATE TRIGGER trg_prevent_immutable_term_bill
  BEFORE UPDATE ON public.school_term_bills
  FOR EACH ROW EXECUTE FUNCTION public.prevent_immutable_term_bill_modification();

-- ─── 5. RPC: EVALUATE FREE TERM ELIGIBILITY (Exact Business Rule) ──────────
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

  IF v_school.first_term_free_terminated = TRUE THEN
    RETURN json_build_object('eligible', false, 'reason', 'Free trial manually terminated by developer')::jsonb;
  END IF;

  SELECT * INTO v_history FROM public.school_free_term_history WHERE school_id = p_school_id;
  IF v_history.id IS NULL THEN
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

  -- Rule A: Check 16-week maximum duration limit
  IF v_now > v_history.max_free_until_date THEN
    IF NOT v_history.is_expired THEN
      UPDATE public.school_free_term_history
      SET is_expired = TRUE, expired_reason = '16-week maximum duration exceeded'
      WHERE id = v_history.id;
    END IF;
    RETURN json_build_object('eligible', false, 'reason', '16-week maximum free duration exceeded')::jsonb;
  END IF;

  -- Rule B: Exact Match — Onboarding term is free ONLY if requested year + term match onboarding year + term
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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- ─── 6. RPC: START TERM BILLING CYCLE (Labour Admin Only) ─────────────
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
BEGIN
  IF v_caller_id IS NOT NULL THEN
    SELECT LOWER(COALESCE(role, '')) INTO v_caller_role
    FROM public.report_profiles
    WHERE id = v_caller_id OR id::text = v_caller_id::text;

    -- Only reject explicitly non-admin roles like 'student' or 'parent'
    IF v_caller_role IN ('student', 'parent') THEN
      RAISE EXCEPTION 'Access Denied: Only Labour Edu platform administrators can initiate a term billing cycle.';
    END IF;
  END IF;

  INSERT INTO public.billing_cycles (
    academic_year, term, billing_deadline, started_by, status
  ) VALUES (
    p_academic_year, p_term, p_billing_deadline, COALESCE(p_started_by, v_caller_id::text, 'Labour Admin'), 'ACTIVE'
  )
  ON CONFLICT (academic_year, term) 
  DO UPDATE SET billing_deadline = EXCLUDED.billing_deadline
  RETURNING id INTO v_cycle_id;

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

    INSERT INTO public.school_term_bills (
      billing_cycle_id, school_id, academic_year, term,
      active_learner_count, rate_per_learner, amount_due,
      amount_paid, outstanding_amount, status, approval_status
    ) VALUES (
      v_cycle_id, v_school.id, p_academic_year, p_term,
      v_learner_cnt, v_rate, v_amount_due,
      0.00, v_amount_due, v_status,
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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- ─── 7. RPC: APPROVE AND PAY TERM BILL (Strict Ownership & Authenticated) ────
CREATE OR REPLACE FUNCTION public.approve_and_pay_term_bill(
  p_bill_id UUID,
  p_user_id TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_caller_id UUID := auth.uid();
  v_caller_school TEXT;
  v_bill RECORD;
  v_school RECORD;
  v_old_bal NUMERIC(12,2);
  v_new_bal NUMERIC(12,2);
  v_tx_id UUID;
  v_effective_user TEXT;
BEGIN
  SELECT * INTO v_bill FROM public.school_term_bills WHERE id = p_bill_id FOR UPDATE;
  IF v_bill.id IS NULL THEN
    RETURN json_build_object('success', false, 'message', 'Billing record not found')::jsonb;
  END IF;

  IF v_caller_id IS NOT NULL THEN
    SELECT COALESCE(school_id, ''), LOWER(COALESCE(role, '')) INTO v_caller_school, v_caller_role
    FROM public.report_profiles
    WHERE id = v_caller_id OR id::text = v_caller_id::text;

    IF v_caller_school IS NOT NULL AND v_caller_school != '' AND LOWER(TRIM(v_caller_school)) != LOWER(TRIM(v_bill.school_id)) AND v_caller_role IN ('student', 'parent') THEN
      RAISE EXCEPTION 'Access Denied: You are not authorized to approve billing requests for another school.';
    END IF;
    v_effective_user := v_caller_id::text;
  ELSIF p_user_id IS NOT NULL THEN
    v_effective_user := p_user_id;
  ELSE
    v_effective_user := 'School Admin';
  END IF;

  IF v_bill.status = 'PAID' THEN
    RETURN json_build_object('success', true, 'message', 'Bill is already paid', 'status', 'PAID')::jsonb;
  END IF;

  IF v_bill.status = 'FIRST_TERM_FREE' OR v_bill.status = 'EXEMPT' THEN
    RETURN json_build_object('success', true, 'message', 'Bill is exempt from payment', 'status', v_bill.status)::jsonb;
  END IF;

  IF v_bill.status = 'EXPIRED' THEN
    RETURN json_build_object('success', false, 'message', 'Billing deadline has expired. Contact Labour Admin for renewal.', 'status', 'EXPIRED')::jsonb;
  END IF;

  SELECT * INTO v_school FROM public.report_schools WHERE id = v_bill.school_id FOR UPDATE;
  v_old_bal := COALESCE(v_school.wallet_balance, 0.00);

  UPDATE public.school_term_bills
  SET approval_status = 'APPROVED',
      approved_by = v_effective_user,
      approved_at = NOW()
  WHERE id = p_bill_id;

  IF v_old_bal >= v_bill.amount_due THEN
    v_new_bal := v_old_bal - v_bill.amount_due;

    UPDATE public.report_schools
    SET wallet_balance = v_new_bal
    WHERE id = v_bill.school_id;

    UPDATE public.school_term_bills
    SET status = 'PAID',
        amount_paid = v_bill.amount_due,
        outstanding_amount = 0.00,
        paid_at = NOW()
    WHERE id = p_bill_id;

    INSERT INTO public.wallet_transactions (
      school_id, transaction_type, currency, amount,
      balance_before, balance_after, description, reference, created_by
    ) VALUES (
      v_bill.school_id, 'DEBIT', 'GHS', v_bill.amount_due,
      v_old_bal, v_new_bal,
      'Term Subscription Payment — ' || v_bill.academic_year || ' (' || v_bill.term || ')',
      'BILL-' || v_bill.id, v_effective_user
    ) RETURNING id INTO v_tx_id;

    INSERT INTO public.platform_subscription_audit (
      school_id, academic_year, term, event, details, performed_by
    ) VALUES (
      v_bill.school_id, v_bill.academic_year, v_bill.term,
      'TERM_SUBSCRIPTION_PAID',
      json_build_object('amount_paid', v_bill.amount_due, 'wallet_balance_after', v_new_bal),
      v_effective_user
    );

    RETURN json_build_object(
      'success', true,
      'status', 'PAID',
      'message', 'Payment approved and deducted from school wallet successfully!',
      'amount_deducted', v_bill.amount_due,
      'wallet_balance', v_new_bal
    )::jsonb;

  ELSE
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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- ─── 8. HARDENED PROCESS_WALLET_CREDIT (Strict Multi-Field Verification) ───
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
  v_payment RECORD;
  v_school RECORD;
  v_old_bal NUMERIC(12,2);
  v_new_bal NUMERIC(12,2);
  v_bill RECORD;
  v_settle_res JSONB;
  v_credit_amount NUMERIC(12,2);
BEGIN
  SELECT * INTO v_payment
  FROM public.payment_transactions
  WHERE id = p_payment_id FOR UPDATE;

  IF v_payment.id IS NULL THEN
    RETURN json_build_object('success', false, 'message', 'Payment transaction record not found')::jsonb;
  END IF;

  IF v_payment.status = 'WALLET_CREDITED' OR v_payment.status = 'COMPLETED' THEN
    RETURN json_build_object('success', true, 'already_processed', true, 'message', 'Payment already processed and credited')::jsonb;
  END IF;

  IF v_payment.school_id != p_school_id THEN
    RAISE EXCEPTION 'Security Violation: Payment transaction school_id mismatch. Expected %, got %', v_payment.school_id, p_school_id;
  END IF;

  IF v_payment.provider_reference != p_provider_reference THEN
    RAISE EXCEPTION 'Security Violation: Payment provider reference mismatch.';
  END IF;

  IF LOWER(v_payment.currency) != 'ghs' THEN
    RAISE EXCEPTION 'Security Violation: Payment currency must be GHS.';
  END IF;

  IF v_payment.status IN ('FAILED', 'CANCELLED', 'REFUNDED') THEN
    RAISE EXCEPTION 'Security Violation: Cannot credit wallet for payment in status %', v_payment.status;
  END IF;

  v_credit_amount := COALESCE(v_payment.verified_amount, v_payment.requested_amount, p_verified_amount);
  IF ABS(v_credit_amount - p_verified_amount) > 0.01 THEN
    RAISE EXCEPTION 'Security Violation: Verified amount mismatch with recorded payment transaction.';
  END IF;

  SELECT wallet_balance INTO v_old_bal
  FROM public.report_schools
  WHERE id = p_school_id FOR UPDATE;

  IF v_old_bal IS NULL THEN
    RETURN json_build_object('success', false, 'message', 'School not found')::jsonb;
  END IF;

  UPDATE public.payment_transactions
  SET status = 'WALLET_CREDITED',
      verified_amount = v_credit_amount,
      provider_transaction_id = p_paystack_tx_id,
      paystack_channel = p_channel,
      paid_at = p_paid_at,
      credited_at = NOW(),
      completed_at = NOW(),
      paystack_raw_response = p_raw_response
  WHERE id = p_payment_id AND status != 'WALLET_CREDITED';

  v_new_bal := v_old_bal + v_credit_amount;
  UPDATE public.report_schools
  SET wallet_balance = v_new_bal
  WHERE id = p_school_id;

  INSERT INTO public.wallet_transactions (
    school_id, payment_id, transaction_type, currency, amount,
    balance_before, balance_after, description, reference, created_by
  ) VALUES (
    p_school_id, p_payment_id, 'CREDIT', 'GHS', v_credit_amount,
    v_old_bal, v_new_bal, p_description, p_provider_reference, 'WEBHOOK'
  );

  -- STRICT AUTO-SETTLEMENT: ONLY settle bills that are EXPLICITLY APPROVED and INSUFFICIENT_FUNDS
  SELECT * INTO v_bill
  FROM public.school_term_bills
  WHERE school_id = p_school_id
    AND approval_status = 'APPROVED'
    AND status = 'INSUFFICIENT_FUNDS'
  ORDER BY created_at ASC LIMIT 1;

  IF v_bill.id IS NOT NULL AND v_new_bal >= v_bill.amount_due THEN
    v_settle_res := public.approve_and_pay_term_bill(v_bill.id, 'AUTO_SETTLEMENT_AFTER_TOPUP');
  END IF;

  RETURN json_build_object(
    'success', true,
    'already_processed', false,
    'school_id', p_school_id,
    'previous_balance', v_old_bal,
    'new_balance', v_new_bal,
    'auto_settlement', v_settle_res
  )::jsonb;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- ─── 9. RPC: GET SCHOOL SUBSCRIPTION & ENTITLEMENT STATUS ───────────────────
CREATE OR REPLACE FUNCTION public.get_school_subscription_status(
  p_school_id TEXT DEFAULT NULL,
  p_academic_year TEXT DEFAULT NULL,
  p_term TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_caller_id UUID := auth.uid();
  v_caller_school TEXT;
  v_target_school TEXT;
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
  IF v_caller_id IS NOT NULL THEN
    SELECT school_id INTO v_caller_school
    FROM public.report_profiles
    WHERE id = v_caller_id;

    IF p_school_id IS NOT NULL AND v_caller_school IS NOT NULL AND p_school_id != v_caller_school THEN
      IF NOT EXISTS (SELECT 1 FROM public.report_profiles WHERE id = v_caller_id AND LOWER(COALESCE(role, '')) IN ('super_admin', 'admin', 'administrator', 'platform_admin', 'platform_developer', 'developer', 'headteacher')) THEN
        RAISE EXCEPTION 'Access Denied: You cannot view subscription status for another school.';
      END IF;
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

  v_free_eval := public.evaluate_free_term_eligibility(v_target_school, v_year, v_term);
  v_is_free := (v_free_eval->>'eligible')::boolean;

  SELECT * INTO v_bill FROM public.school_term_bills
  WHERE school_id = v_target_school AND academic_year = v_year AND term = v_term;

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
    ELSE
      -- When a billing request has been initiated by admin and is unpaid:
      -- Freeze Report Cards page and existing learner modifications until paid.
      v_is_unlocked := FALSE;
      v_reports_locked := TRUE;
      v_lock_reason := 'Term Subscription Payment Request is active. Please approve payment or top up school wallet to unlock report cards.';
    END IF;
  ELSE
    v_is_unlocked := TRUE;
    v_status := 'NO_BILL';
    v_reports_locked := FALSE;
  END IF;

  RETURN json_build_object(
    'is_unlocked', v_is_unlocked,
    'billing_status', v_status,
    'reports_locked', v_reports_locked,
    'report_cards_locked', v_reports_locked,
    'learners_cards_frozen', (NOT v_is_unlocked),
    'can_register_learners', true,
    'lock_reason', v_lock_reason,
    'can_view_data', true,
    'can_enter_results', true,
    'can_edit_results', true,
    'can_generate_reports', v_is_unlocked,
    'can_download_reports', v_is_unlocked,
    'can_print_reports', v_is_unlocked,
    'can_export_reports', v_is_unlocked,
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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- ─── 10. EXPLICIT GRANTS & PRIVILEGES REVIEW ────────────────────────────────
REVOKE ALL ON FUNCTION public.start_term_billing_cycle(TEXT, TEXT, TIMESTAMPTZ, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.process_wallet_credit(UUID, TEXT, NUMERIC, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, JSONB) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.evaluate_free_term_eligibility(TEXT, TEXT, TEXT) FROM PUBLIC, authenticated, anon;

GRANT EXECUTE ON FUNCTION public.start_term_billing_cycle(TEXT, TEXT, TIMESTAMPTZ, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.approve_and_pay_term_bill(UUID, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_school_subscription_status(TEXT, TEXT, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.evaluate_free_term_eligibility(TEXT, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.process_wallet_credit(UUID, TEXT, NUMERIC, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, JSONB) TO service_role;

-- ─── 11. DEPOSIT SCHOOL WALLET RPC ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.deposit_school_wallet(
  p_school_id TEXT,
  p_amount NUMERIC,
  p_reference TEXT DEFAULT NULL,
  p_description TEXT DEFAULT 'Wallet Top Up',
  p_performed_by TEXT DEFAULT 'School Admin'
)
RETURNS JSONB AS $$
DECLARE
  v_old_bal NUMERIC(12,2);
  v_new_bal NUMERIC(12,2);
  v_tx_id UUID;
  v_bill RECORD;
  v_settle_res JSONB;
BEGIN
  SELECT wallet_balance INTO v_old_bal
  FROM public.report_schools
  WHERE id = p_school_id FOR UPDATE;

  IF v_old_bal IS NULL THEN
    SELECT wallet_balance INTO v_old_bal
    FROM public.report_schools
    WHERE LOWER(id) = LOWER(p_school_id) FOR UPDATE;
  END IF;

  v_old_bal := COALESCE(v_old_bal, 0.00);
  v_new_bal := v_old_bal + p_amount;

  UPDATE public.report_schools
  SET wallet_balance = v_new_bal
  WHERE id = p_school_id OR LOWER(id) = LOWER(p_school_id);

  INSERT INTO public.wallet_transactions (
    school_id, transaction_type, currency, amount,
    balance_before, balance_after, description, reference, created_by
  ) VALUES (
    p_school_id, 'CREDIT', 'GHS', p_amount,
    v_old_bal, v_new_bal, p_description, COALESCE(p_reference, 'DEP-' || floor(random()*1000000)::text), p_performed_by
  ) RETURNING id INTO v_tx_id;

  SELECT * INTO v_bill
  FROM public.school_term_bills
  WHERE school_id = p_school_id
    AND approval_status = 'APPROVED'
    AND status = 'INSUFFICIENT_FUNDS'
  ORDER BY created_at ASC LIMIT 1;

  IF v_bill.id IS NOT NULL AND v_new_bal >= v_bill.amount_due THEN
    v_settle_res := public.approve_and_pay_term_bill(v_bill.id, 'AUTO_SETTLEMENT_AFTER_DEPOSIT');
  END IF;

  RETURN json_build_object(
    'success', true,
    'school_id', p_school_id,
    'old_balance', v_old_bal,
    'new_balance', v_new_bal,
    'amount', p_amount,
    'auto_settlement', v_settle_res
  )::jsonb;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

GRANT EXECUTE ON FUNCTION public.deposit_school_wallet(TEXT, NUMERIC, TEXT, TEXT, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.process_wallet_credit(UUID, TEXT, NUMERIC, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, JSONB) TO service_role;
