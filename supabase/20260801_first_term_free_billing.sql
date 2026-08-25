-- ============================================================================
-- Migration: First Term Free Billing Structure & Developer Termination Controls
-- Script: 20260801_first_term_free_billing.sql
-- ============================================================================

-- 1. Extend report_schools table with First Term Free tracking columns
ALTER TABLE public.report_schools
  ADD COLUMN IF NOT EXISTS is_first_term_free BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS first_term_free_terminated BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS initial_academic_year TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS initial_term TEXT DEFAULT NULL;

-- 2. Update register_school_and_admin RPC to populate initial term metadata
CREATE OR REPLACE FUNCTION public.register_school_and_admin(
  p_school_id TEXT,
  p_school_name TEXT,
  p_location TEXT,
  p_district TEXT,
  p_region TEXT,
  p_circuit TEXT,
  p_school_type TEXT,
  p_admin_id UUID,
  p_full_name TEXT,
  p_email TEXT,
  p_staff_id TEXT
)
RETURNS JSONB AS $$
DECLARE
  v_current_year TEXT := '2025/2026';
  v_current_term TEXT := 'Term 1';
  v_cal RECORD;
BEGIN
  -- Determine current active calendar if available
  SELECT academic_year, term INTO v_cal
  FROM public.platform_academic_calendars
  WHERE is_active = TRUE
  ORDER BY created_at DESC LIMIT 1;

  IF v_cal.academic_year IS NOT NULL THEN
    v_current_year := v_cal.academic_year;
    v_current_term := v_cal.term;
  END IF;

  -- Insert School with First Term Free enabled
  INSERT INTO public.report_schools (
    id, name, location, district, region, circuit, school_type,
    is_first_term_free, first_term_free_terminated,
    initial_academic_year, initial_term,
    wallet_balance, wallet_reserved
  ) VALUES (
    p_school_id, p_school_name, p_location, p_district, p_region, p_circuit, p_school_type,
    TRUE, FALSE,
    v_current_year, v_current_term,
    0.00, 0.00
  )
  ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    location = EXCLUDED.location,
    district = EXCLUDED.district,
    region = EXCLUDED.region,
    circuit = EXCLUDED.circuit,
    school_type = EXCLUDED.school_type;

  -- Insert Admin Profile
  INSERT INTO public.report_profiles (
    id, school_id, full_name, email, staff_id, role
  ) VALUES (
    p_admin_id, p_school_id, p_full_name, p_email, p_staff_id, 'super_admin'
  )
  ON CONFLICT (id) DO UPDATE SET
    school_id = EXCLUDED.school_id,
    full_name = EXCLUDED.full_name,
    email = EXCLUDED.email,
    staff_id = EXCLUDED.staff_id,
    role = 'super_admin';

  RETURN json_build_object('success', true, 'school_id', p_school_id)::jsonb;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 3. RPC to Terminate or Restore School Free Trial by Developer/Admin
CREATE OR REPLACE FUNCTION public.terminate_school_free_trial(
  p_school_id TEXT,
  p_terminate BOOLEAN DEFAULT TRUE,
  p_performed_by TEXT DEFAULT 'Platform Developer'
)
RETURNS JSONB AS $$
DECLARE
  v_school RECORD;
  v_details JSONB;
BEGIN
  SELECT * INTO v_school
  FROM public.report_schools
  WHERE id = p_school_id;

  IF v_school.id IS NULL THEN
    RETURN json_build_object('success', false, 'message', 'School not found')::jsonb;
  END IF;

  UPDATE public.report_schools
  SET first_term_free_terminated = p_terminate
  WHERE id = p_school_id;

  v_details := json_build_object(
    'action', CASE WHEN p_terminate THEN 'Free Trial Terminated' ELSE 'Free Trial Restored' END,
    'previous_state', v_school.first_term_free_terminated
  )::jsonb;

  INSERT INTO public.platform_subscription_audit (
    school_id, event, details, performed_by
  ) VALUES (
    p_school_id,
    CASE WHEN p_terminate THEN 'Free Trial Terminated by Developer' ELSE 'Free Trial Restored by Developer' END,
    v_details,
    p_performed_by
  );

  RETURN json_build_object(
    'success', true,
    'school_id', p_school_id,
    'first_term_free_terminated', p_terminate
  )::jsonb;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 4. Update get_school_subscription_status RPC to account for Free First Term
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
  v_is_first_term_free_active BOOLEAN := FALSE;
  v_is_unlocked BOOLEAN := TRUE;
  v_days_left INTEGER := 999;
  v_notif_level TEXT := 'none';
  v_billing_status TEXT := 'ACTIVE';
  v_lock_reason TEXT := NULL;
BEGIN
  -- Load school record
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

  -- Check First Term Free qualification
  -- Active ONLY IF:
  -- 1) is_first_term_free is TRUE
  -- 2) first_term_free_terminated is FALSE
  -- 3) Either initial term matches current term OR initial term is not yet set (newly onboarded)
  IF COALESCE(v_school.is_first_term_free, TRUE) = TRUE
     AND COALESCE(v_school.first_term_free_terminated, FALSE) = FALSE THEN

    IF v_school.initial_academic_year IS NULL OR v_school.initial_term IS NULL THEN
      v_is_first_term_free_active := TRUE;
    ELSIF v_school.initial_academic_year = v_acad_year AND v_school.initial_term = v_current_term THEN
      v_is_first_term_free_active := TRUE;
    ELSE
      -- Term has advanced to next term, so trial has ended automatically
      v_is_first_term_free_active := FALSE;
    END IF;
  END IF;

  -- Count total learners
  SELECT COUNT(*) INTO v_learner_cnt
  FROM public.report_learners
  WHERE school_id = p_school_id;

  -- Determine rate
  IF v_school.per_learner_rate_override IS NOT NULL AND v_school.per_learner_rate_override > 0 THEN
    v_rate := v_school.per_learner_rate_override;
  ELSE
    SELECT COALESCE(amount_per_learner, 5.00) INTO v_rate
    FROM public.platform_subscription_pricing
    WHERE school_category = v_school_cat;
    IF v_rate IS NULL THEN v_rate := 5.00; END IF;
  END IF;

  -- Check if snapshot exists for current term
  SELECT * INTO v_snap
  FROM public.subscription_snapshots
  WHERE school_id = p_school_id AND academic_year = v_acad_year AND term = v_current_term;

  IF v_is_first_term_free_active THEN
    v_billing_status := 'FIRST_TERM_FREE';
    v_req_amount := 0.00;
    v_outstanding := 0.00;
    v_is_unlocked := TRUE;
    v_lock_reason := NULL;
  ELSIF v_snap.id IS NOT NULL THEN
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
    v_req_amount := v_learner_cnt * v_rate;
    v_billing_status := 'PENDING';

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
    'is_first_term_free', COALESCE(v_school.is_first_term_free, TRUE),
    'is_first_term_free_active', v_is_first_term_free_active,
    'first_term_free_terminated', COALESCE(v_school.first_term_free_terminated, FALSE),
    'initial_academic_year', v_school.initial_academic_year,
    'initial_term', v_school.initial_term,
    'subscription_exempt_until', v_school.subscription_exempt_until,
    'days_to_term_end', v_days_left,
    'notification_level', v_notif_level,
    'report_cards_locked', NOT v_is_unlocked,
    'lock_reason', v_lock_reason
  )::jsonb;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 5. Update process_school_subscription RPC to process FIRST_TERM_FREE snapshots
CREATE OR REPLACE FUNCTION public.process_school_subscription(
  p_school_id TEXT,
  p_academic_year TEXT,
  p_term TEXT,
  p_performed_by TEXT DEFAULT 'System/Admin'
)
RETURNS JSONB AS $$
DECLARE
  v_status_json JSONB;
  v_snapshot RECORD;
  v_school RECORD;
  v_old_bal NUMERIC(12,2);
  v_new_bal NUMERIC(12,2);
  v_is_exempt BOOLEAN := FALSE;
  v_is_first_term_free_active BOOLEAN := FALSE;
  v_details JSONB;
BEGIN
  -- Get subscription status evaluation
  v_status_json := public.get_school_subscription_status(p_school_id, p_academic_year, p_term);
  v_is_first_term_free_active := COALESCE((v_status_json->>'is_first_term_free_active')::boolean, false);

  -- Stage 1: Ensure snapshot exists
  PERFORM public.create_billing_snapshot(p_school_id, p_academic_year, p_term);

  SELECT * INTO v_snapshot
  FROM public.subscription_snapshots
  WHERE school_id = p_school_id AND academic_year = p_academic_year AND term = p_term;

  -- If in Free First Term, freeze snapshot status as FIRST_TERM_FREE with 0 charge
  IF v_is_first_term_free_active THEN
    UPDATE public.subscription_snapshots
    SET billing_status = 'FIRST_TERM_FREE',
        total_amount = 0.00
    WHERE id = v_snapshot.id;

    v_details := json_build_object('note', 'First Term Free Enjoyment Applied')::jsonb;
    INSERT INTO public.platform_subscription_audit (
      school_id, academic_year, term, event, details, performed_by
    ) VALUES (
      p_school_id, p_academic_year, p_term, 'First Term Free Granted', v_details, p_performed_by
    );

    RETURN json_build_object('success', true, 'status', 'FIRST_TERM_FREE', 'message', 'School enjoyed First Term Free')::jsonb;
  END IF;

  -- Idempotency Guard: Exit if already DEDUCTED or EXEMPT or FIRST_TERM_FREE
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

  -- Stage 3: Check Wallet Balance (Standard Next Term / Paid billing)
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
