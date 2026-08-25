-- ============================================================================
-- Migration: Enterprise School Wallet & Subscription Management System
-- Run this script in your Supabase SQL Editor
-- ============================================================================

-- ─── 1. platform_academic_calendars ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.platform_academic_calendars (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  calendar_name        TEXT NOT NULL,
  academic_year        TEXT NOT NULL,
  term                 TEXT NOT NULL,
  school_category      TEXT NOT NULL DEFAULT 'GES', -- 'GES', 'Private', 'International', etc.
  start_date           DATE NOT NULL,
  end_date             DATE NOT NULL, -- Official Term End Date
  score_entry_deadline DATE,
  is_active            BOOLEAN NOT NULL DEFAULT TRUE,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── 2. platform_subscription_pricing ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.platform_subscription_pricing (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_category    TEXT UNIQUE NOT NULL,
  amount_per_learner NUMERIC(10, 2) NOT NULL DEFAULT 5.00,
  currency           TEXT NOT NULL DEFAULT 'GH₵',
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed default pricing rates if not existing
INSERT INTO public.platform_subscription_pricing (school_category, amount_per_learner, currency)
VALUES
  ('GES', 5.00, 'GH₵'),
  ('Private', 8.00, 'GH₵'),
  ('International', 15.00, 'GH₵')
ON CONFLICT (school_category) DO NOTHING;

-- ─── 3. Extend report_schools table for Wallet & Exceptions ─────────────────
ALTER TABLE public.report_schools
  ADD COLUMN IF NOT EXISTS wallet_balance NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS wallet_reserved NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS school_category TEXT DEFAULT 'GES',
  ADD COLUMN IF NOT EXISTS per_learner_rate_override NUMERIC(10, 2) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS subscription_exempt_until TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS subscription_notes TEXT DEFAULT NULL;

-- ─── 4. subscription_snapshots (Frozen Billing Snapshot Table) ──────────────
CREATE TABLE IF NOT EXISTS public.subscription_snapshots (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id        TEXT NOT NULL REFERENCES public.report_schools(id) ON DELETE CASCADE,
  academic_year    TEXT NOT NULL,
  term             TEXT NOT NULL,
  learner_count    INTEGER NOT NULL DEFAULT 0,
  rate_per_learner NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
  total_amount     NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  billing_status   TEXT NOT NULL DEFAULT 'PENDING' CHECK (billing_status IN ('PENDING', 'DEDUCTED', 'INSUFFICIENT_FUNDS', 'EXEMPT')),
  processed_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT unq_school_year_term UNIQUE (school_id, academic_year, term)
);

CREATE INDEX IF NOT EXISTS idx_subscription_snapshots_school ON public.subscription_snapshots(school_id);

-- ─── 5. platform_wallet_transactions ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.platform_wallet_transactions (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id      TEXT NOT NULL REFERENCES public.report_schools(id) ON DELETE CASCADE,
  type           TEXT NOT NULL CHECK (type IN ('DEPOSIT', 'DEDUCTION', 'ADJUSTMENT', 'REFUND')),
  amount         NUMERIC(12, 2) NOT NULL,
  balance_before NUMERIC(12, 2) NOT NULL,
  balance_after  NUMERIC(12, 2) NOT NULL,
  academic_year  TEXT,
  term           TEXT,
  reference      TEXT,
  description    TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wallet_tx_school ON public.platform_wallet_transactions(school_id);

-- ─── 6. platform_subscription_audit ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.platform_subscription_audit (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id     TEXT NOT NULL REFERENCES public.report_schools(id) ON DELETE CASCADE,
  academic_year TEXT,
  term          TEXT,
  event         TEXT NOT NULL,
  details       JSONB DEFAULT '{}',
  performed_by  TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sub_audit_school ON public.platform_subscription_audit(school_id);

-- ─── 7. Enable RLS and add open policies for authenticated platform users ───
ALTER TABLE public.platform_academic_calendars ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_subscription_pricing ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscription_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_wallet_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_subscription_audit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pac_open" ON public.platform_academic_calendars;
CREATE POLICY "pac_open" ON public.platform_academic_calendars FOR ALL TO anon, authenticated USING (TRUE) WITH CHECK (TRUE);

DROP POLICY IF EXISTS "psp_open" ON public.platform_subscription_pricing;
CREATE POLICY "psp_open" ON public.platform_subscription_pricing FOR ALL TO anon, authenticated USING (TRUE) WITH CHECK (TRUE);

DROP POLICY IF EXISTS "ss_open" ON public.subscription_snapshots;
CREATE POLICY "ss_open" ON public.subscription_snapshots FOR ALL TO anon, authenticated USING (TRUE) WITH CHECK (TRUE);

DROP POLICY IF EXISTS "pwt_open" ON public.platform_wallet_transactions;
CREATE POLICY "pwt_open" ON public.platform_wallet_transactions FOR ALL TO anon, authenticated USING (TRUE) WITH CHECK (TRUE);

DROP POLICY IF EXISTS "psa_open" ON public.platform_subscription_audit;
CREATE POLICY "psa_open" ON public.platform_subscription_audit FOR ALL TO anon, authenticated USING (TRUE) WITH CHECK (TRUE);


-- ============================================================================
-- RPC PROCEDURES (Clean, Idempotent Function Definitions)
-- ============================================================================

DROP FUNCTION IF EXISTS public.deposit_school_wallet(TEXT, NUMERIC, TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.create_billing_snapshot(TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.process_school_subscription(TEXT, TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.get_school_subscription_status(TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.trigger_term_end_subscriptions();

-- ─── RPC 1: deposit_school_wallet ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.deposit_school_wallet(
  p_school_id TEXT,
  p_amount NUMERIC,
  p_reference TEXT DEFAULT NULL,
  p_description TEXT DEFAULT 'Wallet Top Up',
  p_performed_by TEXT DEFAULT 'System/Admin'
)
RETURNS JSONB AS $$
DECLARE
  v_old_bal NUMERIC(12,2);
  v_new_bal NUMERIC(12,2);
  v_details JSONB;
BEGIN
  IF p_amount <= 0 THEN
    RETURN json_build_object('success', false, 'message', 'Deposit amount must be greater than 0')::jsonb;
  END IF;

  SELECT wallet_balance INTO v_old_bal
  FROM public.report_schools
  WHERE id = p_school_id;

  IF v_old_bal IS NULL THEN
    RETURN json_build_object('success', false, 'message', 'School not found')::jsonb;
  END IF;

  v_new_bal := v_old_bal + p_amount;

  UPDATE public.report_schools
  SET wallet_balance = v_new_bal
  WHERE id = p_school_id;

  -- Record transaction
  INSERT INTO public.platform_wallet_transactions (
    school_id, type, amount, balance_before, balance_after, reference, description
  ) VALUES (
    p_school_id, 'DEPOSIT', p_amount, v_old_bal, v_new_bal, p_reference, p_description
  );

  -- Record audit log
  v_details := json_build_object('amount', p_amount, 'old_balance', v_old_bal, 'new_balance', v_new_bal, 'reference', p_reference)::jsonb;
  INSERT INTO public.platform_subscription_audit (
    school_id, event, details, performed_by
  ) VALUES (
    p_school_id, 'Wallet Deposit', v_details, p_performed_by
  );

  RETURN json_build_object(
    'success', true,
    'old_balance', v_old_bal,
    'new_balance', v_new_bal,
    'amount', p_amount
  )::jsonb;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ─── RPC 2: create_billing_snapshot ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.create_billing_snapshot(
  p_school_id TEXT,
  p_academic_year TEXT,
  p_term TEXT
)
RETURNS JSONB AS $$
DECLARE
  v_existing RECORD;
  v_learner_cnt INTEGER := 0;
  v_rate NUMERIC(10,2) := 5.00;
  v_school_cat TEXT := 'GES';
  v_override_rate NUMERIC(10,2);
  v_total NUMERIC(12,2);
  v_snapshot RECORD;
  v_details JSONB;
BEGIN
  -- Check if snapshot already exists
  SELECT * INTO v_existing
  FROM public.subscription_snapshots
  WHERE school_id = p_school_id AND academic_year = p_academic_year AND term = p_term;

  IF v_existing.id IS NOT NULL THEN
    RETURN json_build_object(
      'created', false,
      'snapshot', row_to_json(v_existing)
    )::jsonb;
  END IF;

  -- Get school category and rate override
  SELECT COALESCE(school_category, 'GES'), per_learner_rate_override
  INTO v_school_cat, v_override_rate
  FROM public.report_schools
  WHERE id = p_school_id;

  -- Determine rate
  IF v_override_rate IS NOT NULL AND v_override_rate > 0 THEN
    v_rate := v_override_rate;
  ELSE
    SELECT COALESCE(amount_per_learner, 5.00) INTO v_rate
    FROM public.platform_subscription_pricing
    WHERE school_category = v_school_cat;

    IF v_rate IS NULL THEN
      v_rate := 5.00;
    END IF;
  END IF;

  -- Count total learners for school
  SELECT COUNT(*) INTO v_learner_cnt
  FROM public.report_learners
  WHERE school_id = p_school_id;

  v_total := v_learner_cnt * v_rate;

  -- Freeze snapshot
  INSERT INTO public.subscription_snapshots (
    school_id, academic_year, term, learner_count, rate_per_learner, total_amount, billing_status
  ) VALUES (
    p_school_id, p_academic_year, p_term, v_learner_cnt, v_rate, v_total, 'PENDING'
  )
  RETURNING * INTO v_snapshot;

  -- Record audit log
  v_details := json_build_object('learner_count', v_learner_cnt, 'rate', v_rate, 'total_amount', v_total)::jsonb;
  INSERT INTO public.platform_subscription_audit (
    school_id, academic_year, term, event, details, performed_by
  ) VALUES (
    p_school_id, p_academic_year, p_term, 'Snapshot Created', v_details, 'System'
  );

  RETURN json_build_object(
    'created', true,
    'snapshot', row_to_json(v_snapshot)
  )::jsonb;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ─── RPC 3: process_school_subscription ─────────────────────────────────────
CREATE OR REPLACE FUNCTION public.process_school_subscription(
  p_school_id TEXT,
  p_academic_year TEXT,
  p_term TEXT,
  p_performed_by TEXT DEFAULT 'System/Admin'
)
RETURNS JSONB AS $$
DECLARE
  v_snapshot RECORD;
  v_school RECORD;
  v_old_bal NUMERIC(12,2);
  v_new_bal NUMERIC(12,2);
  v_is_exempt BOOLEAN := FALSE;
  v_details JSONB;
BEGIN
  -- Stage 1: Ensure snapshot exists
  PERFORM public.create_billing_snapshot(p_school_id, p_academic_year, p_term);

  SELECT * INTO v_snapshot
  FROM public.subscription_snapshots
  WHERE school_id = p_school_id AND academic_year = p_academic_year AND term = p_term;

  -- Idempotency Guard: Exit if already DEDUCTED or EXEMPT
  IF v_snapshot.billing_status = 'DEDUCTED' THEN
    RETURN json_build_object('success', true, 'status', 'DEDUCTED', 'message', 'Subscription already deducted')::jsonb;
  END IF;

  IF v_snapshot.billing_status = 'EXEMPT' THEN
    RETURN json_build_object('success', true, 'status', 'EXEMPT', 'message', 'School subscription is exempt')::jsonb;
  END IF;

  -- Load school details
  SELECT * INTO v_school
  FROM public.report_schools
  WHERE id = p_school_id;

  v_old_bal := COALESCE(v_school.wallet_balance, 0.00);

  -- Stage 2: Check exemption
  IF v_school.subscription_exempt_until IS NOT NULL AND v_school.subscription_exempt_until >= NOW() THEN
    v_is_exempt := TRUE;
    UPDATE public.subscription_snapshots
    SET billing_status = 'EXEMPT'
    WHERE id = v_snapshot.id;

    v_details := json_build_object('exempt_until', v_school.subscription_exempt_until, 'notes', v_school.subscription_notes)::jsonb;
    INSERT INTO public.platform_subscription_audit (
      school_id, academic_year, term, event, details, performed_by
    ) VALUES (
      p_school_id, p_academic_year, p_term, 'School Exempted', v_details, p_performed_by
    );

    RETURN json_build_object('success', true, 'status', 'EXEMPT', 'message', 'Subscription exempt until ' || v_school.subscription_exempt_until)::jsonb;
  END IF;

  -- Stage 3: Check Wallet Balance
  IF v_old_bal >= v_snapshot.total_amount THEN
    v_new_bal := v_old_bal - v_snapshot.total_amount;

    UPDATE public.report_schools
    SET wallet_balance = v_new_bal
    WHERE id = p_school_id;

    UPDATE public.subscription_snapshots
    SET billing_status = 'DEDUCTED'
    WHERE id = v_snapshot.id;

    -- Record transaction
    INSERT INTO public.platform_wallet_transactions (
      school_id, type, amount, balance_before, balance_after, academic_year, term, description
    ) VALUES (
      p_school_id, 'DEDUCTION', v_snapshot.total_amount, v_old_bal, v_new_bal, p_academic_year, p_term,
      'Term Subscription Deduction for ' || p_academic_year || ' ' || p_term
    );

    -- Record audit log
    v_details := json_build_object('amount', v_snapshot.total_amount, 'old_balance', v_old_bal, 'new_balance', v_new_bal)::jsonb;
    INSERT INTO public.platform_subscription_audit (
      school_id, academic_year, term, event, details, performed_by
    ) VALUES (
      p_school_id, p_academic_year, p_term, 'Wallet Deducted', v_details, p_performed_by
    );

    RETURN json_build_object('success', true, 'status', 'DEDUCTED', 'new_balance', v_new_bal)::jsonb;
  ELSE
    -- Insufficient funds
    UPDATE public.subscription_snapshots
    SET billing_status = 'INSUFFICIENT_FUNDS'
    WHERE id = v_snapshot.id;

    v_details := json_build_object('wallet_balance', v_old_bal, 'required_amount', v_snapshot.total_amount, 'outstanding', (v_snapshot.total_amount - v_old_bal))::jsonb;
    INSERT INTO public.platform_subscription_audit (
      school_id, academic_year, term, event, details, performed_by
    ) VALUES (
      p_school_id, p_academic_year, p_term, 'Wallet Insufficient', v_details, p_performed_by
    );

    RETURN json_build_object(
      'success', false,
      'status', 'INSUFFICIENT_FUNDS',
      'wallet_balance', v_old_bal,
      'required_amount', v_snapshot.total_amount,
      'outstanding', (v_snapshot.total_amount - v_old_bal)
    )::jsonb;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ─── RPC 4: get_school_subscription_status ──────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_school_subscription_status(
  p_school_id TEXT,
  p_academic_year TEXT DEFAULT NULL,
  p_term TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_school RECORD;
  v_cal RECORD;
  v_snap RECORD;
  v_acad_year TEXT;
  v_current_term TEXT;
  v_school_cat TEXT;
  v_rate NUMERIC(10,2);
  v_learner_cnt INTEGER := 0;
  v_req_amount NUMERIC(12,2) := 0.00;
  v_outstanding NUMERIC(12,2) := 0.00;
  v_wallet_bal NUMERIC(12,2) := 0.00;
  v_wallet_res NUMERIC(12,2) := 0.00;
  v_wallet_avail NUMERIC(12,2) := 0.00;
  v_is_exempt BOOLEAN := FALSE;
  v_is_unlocked BOOLEAN := TRUE;
  v_days_left INTEGER := 999;
  v_notif_level TEXT := 'none';
  v_billing_status TEXT := 'ACTIVE';
  v_lock_reason TEXT := NULL;
BEGIN
  -- Get school
  SELECT * INTO v_school
  FROM public.report_schools
  WHERE id = p_school_id;

  IF v_school.id IS NULL THEN
    RETURN json_build_object('error', 'School not found')::jsonb;
  END IF;

  v_wallet_bal := COALESCE(v_school.wallet_balance, 0.00);
  v_wallet_res := COALESCE(v_school.wallet_reserved, 0.00);
  v_wallet_avail := v_wallet_bal - v_wallet_res;
  v_school_cat := COALESCE(v_school.school_category, 'GES');

  -- Get active calendar for category
  SELECT * INTO v_cal
  FROM public.platform_academic_calendars
  WHERE school_category = v_school_cat AND is_active = TRUE
  ORDER BY created_at DESC LIMIT 1;

  IF v_cal.id IS NOT NULL THEN
    v_acad_year := v_cal.academic_year;
    v_current_term := v_cal.term;
    v_days_left := (v_cal.end_date - CURRENT_DATE);
  ELSE
    v_acad_year := COALESCE(p_academic_year, v_school.current_academic_year, '2025/2026');
    v_current_term := COALESCE(p_term, v_school.current_term, 'Term 1');
    v_days_left := 30;
  END IF;

  -- Determine notification level
  IF v_days_left <= 0 THEN
    v_notif_level := 'term_ended';
  ELSIF v_days_left <= 1 THEN
    v_notif_level := '1_day';
  ELSIF v_days_left <= 3 THEN
    v_notif_level := '3_days';
  ELSIF v_days_left <= 7 THEN
    v_notif_level := '7_days';
  ELSE
    v_notif_level := 'none';
  END IF;

  -- Check exemption
  IF v_school.subscription_exempt_until IS NOT NULL AND v_school.subscription_exempt_until >= NOW() THEN
    v_is_exempt := TRUE;
  END IF;

  -- Check if snapshot exists for current term
  SELECT * INTO v_snap
  FROM public.subscription_snapshots
  WHERE school_id = p_school_id AND academic_year = v_acad_year AND term = v_current_term;

  IF v_snap.id IS NOT NULL THEN
    v_req_amount := v_snap.total_amount;
    v_learner_cnt := v_snap.learner_count;
    v_rate := v_snap.rate_per_learner;
    v_billing_status := v_snap.billing_status;

    IF v_snap.billing_status = 'INSUFFICIENT_FUNDS' AND NOT v_is_exempt THEN
      v_is_unlocked := FALSE;
      v_outstanding := v_req_amount - v_wallet_bal;
      v_lock_reason := 'School wallet balance (GH₵ ' || v_wallet_bal || ') is insufficient for required term fee (GH₵ ' || v_req_amount || ').';
    ELSE
      v_is_unlocked := TRUE;
      v_outstanding := 0.00;
    END IF;
  ELSE
    -- Calculate live estimate for upcoming term
    SELECT COUNT(*) INTO v_learner_cnt
    FROM public.report_learners
    WHERE school_id = p_school_id;

    IF v_school.per_learner_rate_override IS NOT NULL AND v_school.per_learner_rate_override > 0 THEN
      v_rate := v_school.per_learner_rate_override;
    ELSE
      SELECT COALESCE(amount_per_learner, 5.00) INTO v_rate
      FROM public.platform_subscription_pricing
      WHERE school_category = v_school_cat;
      IF v_rate IS NULL THEN v_rate := 5.00; END IF;
    END IF;

    v_req_amount := v_learner_cnt * v_rate;
    v_billing_status := 'PENDING';

    -- If term ended and no snapshot exists, check balance
    IF v_days_left <= 0 AND NOT v_is_exempt AND v_wallet_bal < v_req_amount THEN
      v_is_unlocked := FALSE;
      v_outstanding := v_req_amount - v_wallet_bal;
      v_lock_reason := 'Official term ended. Wallet balance (GH₵ ' || v_wallet_bal || ') is below required subscription fee (GH₵ ' || v_req_amount || ').';
    ELSE
      v_is_unlocked := TRUE;
      v_outstanding := GREATEST(0.00, v_req_amount - v_wallet_bal);
    END IF;
  END IF;

  RETURN json_build_object(
    'is_unlocked', v_is_unlocked,
    'billing_status', v_billing_status,
    'wallet_balance', v_wallet_bal,
    'wallet_reserved', v_wallet_res,
    'wallet_available', v_wallet_avail,
    'required_amount', v_req_amount,
    'outstanding_amount', v_outstanding,
    'learner_count', v_learner_cnt,
    'rate_per_learner', v_rate,
    'academic_year', v_acad_year,
    'term', v_current_term,
    'is_exempt', v_is_exempt,
    'subscription_exempt_until', v_school.subscription_exempt_until,
    'days_to_term_end', v_days_left,
    'notification_level', v_notif_level,
    'report_cards_locked', NOT v_is_unlocked,
    'lock_reason', v_lock_reason
  )::jsonb;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ─── RPC 5: trigger_term_end_subscriptions ───────────────────────────────────
CREATE OR REPLACE FUNCTION public.trigger_term_end_subscriptions()
RETURNS JSONB AS $$
DECLARE
  v_cal RECORD;
  v_school RECORD;
  v_processed_cnt INTEGER := 0;
BEGIN
  FOR v_cal IN
    SELECT * FROM public.platform_academic_calendars
    WHERE is_active = TRUE AND end_date <= CURRENT_DATE
  LOOP
    FOR v_school IN
      SELECT id FROM public.report_schools
      WHERE COALESCE(school_category, 'GES') = v_cal.school_category
    LOOP
      PERFORM public.process_school_subscription(v_school.id, v_cal.academic_year, v_cal.term, 'Cron System');
      v_processed_cnt := v_processed_cnt + 1;
    END LOOP;
  END LOOP;

  RETURN json_build_object('success', true, 'schools_processed', v_processed_cnt)::jsonb;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
