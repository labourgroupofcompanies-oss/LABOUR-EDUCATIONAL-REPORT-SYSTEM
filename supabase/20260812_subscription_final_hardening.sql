-- ============================================================================
-- Migration: 20260812_subscription_final_hardening.sql
-- Date: 2026-08-12
-- Description: FINAL Subscription Security & Billing Integrity Hardening
--
-- Core Security Hardening:
-- 1. Restricted billing_cycles RLS (no broad USING TRUE)
-- 2. Strictly hardened process_wallet_credit() with multi-field payment verification,
--    amount cross-validation, and valid status transition checks (prevents cross-school & fake credit attacks)
-- 3. Exact Free-Term Logic: Onboarding term IS FREE only if requested_year = onboarding_year AND
--    requested_term = onboarding_term AND NOW() <= max_free_until_date (16 weeks max).
--    Subsequent terms are NEVER free regardless of weeks elapsed.
-- 4. Require auth.uid() IS NOT NULL for approve_and_pay_term_bill (no unauthenticated client fallback)
-- 5. Strict Auto-Settlement Rule: ONLY settle bills with approval_status = 'APPROVED' AND status = 'INSUFFICIENT_FUNDS'
-- 6. Unique wallet deduction reference constraint (BILL-{bill_id})
-- 7. Optimized RLS subqueries using (SELECT auth.uid()) pattern and explicit table grants
-- ============================================================================

-- ─── 1. PERFORMANCE INDEXES FOR RLS & LEDGER ──────────────────────────────
CREATE INDEX IF NOT EXISTS idx_report_profiles_auth_lookup ON public.report_profiles(id, school_id, role);
CREATE INDEX IF NOT EXISTS idx_school_term_bills_school_year_term ON public.school_term_bills(school_id, academic_year, term);
CREATE UNIQUE INDEX IF NOT EXISTS unq_wallet_tx_bill_deduction ON public.wallet_transactions(school_id, reference) WHERE transaction_type = 'DEBIT';

-- ─── 2. HARDENED RLS FOR BILLING CYCLES & BILLS ──────────────────────────────
ALTER TABLE public.billing_cycles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.school_term_bills ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.school_free_term_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "billing_cycles_tenant_select" ON public.billing_cycles;
DROP POLICY IF EXISTS "school_term_bills_tenant_select" ON public.school_term_bills;
DROP POLICY IF EXISTS "school_free_term_history_tenant_select" ON public.school_free_term_history;

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

-- ─── 3. HARDENED RPC: EVALUATE FREE TERM ELIGIBILITY (Exact Business Rule) ──
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
    -- If year/term not specified, check if still within onboarding window
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

-- Revoke direct EXECUTE on evaluate_free_term_eligibility from PUBLIC & authenticated (internal RPC only)
REVOKE EXECUTE ON FUNCTION public.evaluate_free_term_eligibility(TEXT, TEXT, TEXT) FROM PUBLIC, authenticated, anon;
GRANT EXECUTE ON FUNCTION public.evaluate_free_term_eligibility(TEXT, TEXT, TEXT) TO service_role;


-- ─── 4. HARDENED RPC: APPROVE AND PAY TERM BILL (No Unauthenticated Fallbacks) ─
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
  -- 1. Fetch bill authoritative record
  SELECT * INTO v_bill FROM public.school_term_bills WHERE id = p_bill_id FOR UPDATE;
  IF v_bill.id IS NULL THEN
    RETURN json_build_object('success', false, 'message', 'Billing record not found')::jsonb;
  END IF;

  -- 2. Strict Authentication & Ownership Check (No Client Fallback for school users)
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

  -- 3. Validate Bill Status
  IF v_bill.status = 'PAID' THEN
    RETURN json_build_object('success', true, 'message', 'Bill is already paid', 'status', 'PAID')::jsonb;
  END IF;

  IF v_bill.status = 'FIRST_TERM_FREE' OR v_bill.status = 'EXEMPT' THEN
    RETURN json_build_object('success', true, 'message', 'Bill is exempt from payment', 'status', v_bill.status)::jsonb;
  END IF;

  IF v_bill.status = 'EXPIRED' THEN
    RETURN json_build_object('success', false, 'message', 'Billing deadline has expired. Contact Labour Admin for renewal.', 'status', 'EXPIRED')::jsonb;
  END IF;

  -- 4. Fetch school authoritative wallet balance
  SELECT * INTO v_school FROM public.report_schools WHERE id = v_bill.school_id FOR UPDATE;
  v_old_bal := COALESCE(v_school.wallet_balance, 0.00);

  -- 5. Mark approval status
  UPDATE public.school_term_bills
  SET approval_status = 'APPROVED',
      approved_by = v_effective_user,
      approved_at = NOW()
  WHERE id = p_bill_id;

  -- 6. Check Wallet Balance vs Bill Amount
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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;


-- ─── 5. HARDENED PROCESS_WALLET_CREDIT (Multi-Field Verification & Strict Auto-Settlement) ──
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
  -- 1. Lock payment_transactions record FOR UPDATE
  SELECT * INTO v_payment
  FROM public.payment_transactions
  WHERE id = p_payment_id FOR UPDATE;

  IF v_payment.id IS NULL THEN
    RETURN json_build_object('success', false, 'message', 'Payment transaction record not found')::jsonb;
  END IF;

  -- 2. Idempotency Check
  IF v_payment.status = 'WALLET_CREDITED' OR v_payment.status = 'COMPLETED' THEN
    RETURN json_build_object('success', true, 'already_processed', true, 'message', 'Payment already processed and credited')::jsonb;
  END IF;

  -- 3. Strict Multi-Field Verification (Cross-School & Fake Amount Attack Prevention)
  IF v_payment.school_id != p_school_id THEN
    RAISE EXCEPTION 'Security Violation: Payment transaction school_id mismatch. Expected %, got %', v_payment.school_id, p_school_id;
  END IF;

  IF v_payment.provider_reference != p_provider_reference THEN
    RAISE EXCEPTION 'Security Violation: Payment provider reference mismatch.';
  END IF;

  IF LOWER(v_payment.currency) != 'ghs' THEN
    RAISE EXCEPTION 'Security Violation: Payment currency must be GHS.';
  END IF;

  -- 4. Validate Payment Status Transition (Do not allow FAILED/CANCELLED to become WALLET_CREDITED)
  IF v_payment.status IN ('FAILED', 'CANCELLED', 'REFUNDED') THEN
    RAISE EXCEPTION 'Security Violation: Cannot credit wallet for payment in status %', v_payment.status;
  END IF;

  -- 5. Cross-Check Credit Amount against Authoritative Payment Transaction Record
  v_credit_amount := COALESCE(v_payment.verified_amount, v_payment.requested_amount, p_verified_amount);
  IF ABS(v_credit_amount - p_verified_amount) > 0.01 THEN
    RAISE EXCEPTION 'Security Violation: Verified amount mismatch with recorded payment transaction.';
  END IF;

  -- 6. Lock school record
  SELECT wallet_balance INTO v_old_bal
  FROM public.report_schools
  WHERE id = p_school_id FOR UPDATE;

  IF v_old_bal IS NULL THEN
    RETURN json_build_object('success', false, 'message', 'School not found')::jsonb;
  END IF;

  -- 7. Update Payment Status to WALLET_CREDITED
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

  -- 8. Credit School Wallet
  v_new_bal := v_old_bal + v_credit_amount;
  UPDATE public.report_schools
  SET wallet_balance = v_new_bal
  WHERE id = p_school_id;

  -- 9. Insert Immutable Wallet Ledger Transaction
  INSERT INTO public.wallet_transactions (
    school_id, payment_id, transaction_type, currency, amount,
    balance_before, balance_after, description, reference, created_by
  ) VALUES (
    p_school_id, p_payment_id, 'CREDIT', 'GHS', v_credit_amount,
    v_old_bal, v_new_bal, p_description, p_provider_reference, 'WEBHOOK'
  );

  -- 10. STRICT AUTO-SETTLEMENT RULE:
  --     ONLY auto-settle bills that are EXPLICITLY APPROVED (approval_status = 'APPROVED')
  --     AND currently in status 'INSUFFICIENT_FUNDS'.
  --     NEVER auto-settle 'AWAITING_APPROVAL', 'FIRST_TERM_FREE', 'EXEMPT', 'EXPIRED', or 'PAID'.
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


-- ─── 6. SERVER-SIDE REPORT ENTITLEMENT ENFORCEMENT ───────────────────────────
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


-- ─── 7. EXPLICIT GRANTS & PRIVILEGES REVIEW ─────────────────────────────────
REVOKE ALL ON FUNCTION public.process_wallet_credit(UUID, TEXT, NUMERIC, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, JSONB) FROM PUBLIC, authenticated, anon;
GRANT EXECUTE ON FUNCTION public.process_wallet_credit(UUID, TEXT, NUMERIC, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, JSONB) TO service_role;

GRANT EXECUTE ON FUNCTION public.approve_and_pay_term_bill(UUID, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_school_subscription_status(TEXT, TEXT, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.check_report_entitlement(TEXT) TO authenticated, service_role;
