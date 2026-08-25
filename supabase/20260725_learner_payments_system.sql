-- ============================================================================
-- Migration: Enterprise Learner Fee Payment & Financial Accounting System
-- Run this script in your Supabase SQL Editor
-- ============================================================================

-- ─── 1. school_fee_structure (Class Fee Templates) ─────────────────────────
CREATE TABLE IF NOT EXISTS public.school_fee_structure (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id      TEXT NOT NULL REFERENCES public.report_schools(id) ON DELETE CASCADE,
  academic_year  TEXT NOT NULL,
  term           TEXT NOT NULL,
  class_name     TEXT NOT NULL, -- e.g. 'Basic 7', 'Basic 8', 'All Classes'
  fee_category   TEXT NOT NULL, -- 'Tuition', 'PTA', 'ICT Levy', 'Sports', 'Feeding', 'Uniform'
  amount         NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  is_mandatory   BOOLEAN NOT NULL DEFAULT TRUE,
  display_order  INTEGER DEFAULT 1,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fee_struct_school ON public.school_fee_structure(school_id);
CREATE INDEX IF NOT EXISTS idx_fee_struct_class ON public.school_fee_structure(school_id, academic_year, term, class_name);

-- ─── 2. learner_fee_transactions (Immutable Audit Ledger) ─────────────────
CREATE TABLE IF NOT EXISTS public.learner_fee_transactions (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_tx_id        UUID UNIQUE NOT NULL, -- Idempotency Key
  school_id           TEXT NOT NULL REFERENCES public.report_schools(id) ON DELETE CASCADE,
  learner_id          UUID NOT NULL REFERENCES public.report_learners(id) ON DELETE CASCADE,
  academic_year       TEXT NOT NULL,
  term                TEXT NOT NULL,
  transaction_type    TEXT NOT NULL CHECK (transaction_type IN ('CHARGE', 'PAYMENT', 'DISCOUNT', 'WAIVER', 'REVERSAL', 'ADJUSTMENT')),
  amount              NUMERIC(12, 2) NOT NULL,
  balance_before      NUMERIC(12, 2) NOT NULL,
  balance_after       NUMERIC(12, 2) NOT NULL,
  payment_method      TEXT CHECK (payment_method IN ('CASH', 'MOMO', 'BANK_TRANSFER', 'CHEQUE', 'OTHER')),
  receipt_number      TEXT NOT NULL,
  receipt_status      TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (receipt_status IN ('ACTIVE', 'VOID', 'REVERSED', 'REPLACED')),
  reversal_reason     TEXT,
  reversed_tx_id      UUID REFERENCES public.learner_fee_transactions(id),
  notes               TEXT,
  received_by_staff   TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fee_tx_school ON public.learner_fee_transactions(school_id);
CREATE INDEX IF NOT EXISTS idx_fee_tx_learner ON public.learner_fee_transactions(learner_id);
CREATE INDEX IF NOT EXISTS idx_fee_tx_receipt ON public.learner_fee_transactions(receipt_number);

-- ─── 3. learner_payment_allocations (Multi-Category Settlement) ────────────
CREATE TABLE IF NOT EXISTS public.learner_payment_allocations (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id     UUID NOT NULL REFERENCES public.learner_fee_transactions(id) ON DELETE CASCADE,
  fee_structure_id   UUID REFERENCES public.school_fee_structure(id) ON DELETE SET NULL,
  fee_category       TEXT NOT NULL,
  allocated_amount   NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_allocations_tx ON public.learner_payment_allocations(transaction_id);

-- ─── 4. daily_cashbook_closings (Daily Cash Reconciliation & Locking) ──────
CREATE TABLE IF NOT EXISTS public.daily_cashbook_closings (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id            TEXT NOT NULL REFERENCES public.report_schools(id) ON DELETE CASCADE,
  closing_date         DATE NOT NULL,
  opening_cash         NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  total_collections    NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  total_refunds        NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  total_reversals      NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  expected_closing_cash NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  actual_physical_cash NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  variance             NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  status               TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'CLOSED', 'RECONCILED_WITH_VARIANCE')),
  notes                TEXT,
  closed_by_staff      TEXT,
  closed_at            TIMESTAMPTZ,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT unq_school_closing_date UNIQUE (school_id, closing_date)
);

CREATE INDEX IF NOT EXISTS idx_cashbook_school_date ON public.daily_cashbook_closings(school_id, closing_date);

-- ─── 5. financial_audit_log (Administrative Audit Log) ────────────────────
CREATE TABLE IF NOT EXISTS public.financial_audit_log (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id          TEXT NOT NULL REFERENCES public.report_schools(id) ON DELETE CASCADE,
  staff_id           TEXT,
  action             TEXT NOT NULL,
  entity             TEXT NOT NULL,
  entity_id          TEXT,
  old_values         JSONB DEFAULT '{}',
  new_values         JSONB DEFAULT '{}',
  ip_address         TEXT,
  device_information TEXT,
  performed_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fin_audit_school ON public.financial_audit_log(school_id);
CREATE INDEX IF NOT EXISTS idx_fin_audit_action ON public.financial_audit_log(action);

-- ─── 6. Enable RLS and add policies ─────────────────────────────────────────
ALTER TABLE public.school_fee_structure ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.learner_fee_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.learner_payment_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_cashbook_closings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financial_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sfs_open" ON public.school_fee_structure;
CREATE POLICY "sfs_open" ON public.school_fee_structure FOR ALL TO anon, authenticated USING (TRUE) WITH CHECK (TRUE);

DROP POLICY IF EXISTS "lft_open" ON public.learner_fee_transactions;
CREATE POLICY "lft_open" ON public.learner_fee_transactions FOR ALL TO anon, authenticated USING (TRUE) WITH CHECK (TRUE);

DROP POLICY IF EXISTS "lpa_open" ON public.learner_payment_allocations;
CREATE POLICY "lpa_open" ON public.learner_payment_allocations FOR ALL TO anon, authenticated USING (TRUE) WITH CHECK (TRUE);

DROP POLICY IF EXISTS "dcc_open" ON public.daily_cashbook_closings;
CREATE POLICY "dcc_open" ON public.daily_cashbook_closings FOR ALL TO anon, authenticated USING (TRUE) WITH CHECK (TRUE);

DROP POLICY IF EXISTS "fal_open" ON public.financial_audit_log;
CREATE POLICY "fal_open" ON public.financial_audit_log FOR ALL TO anon, authenticated USING (TRUE) WITH CHECK (TRUE);


-- ============================================================================
-- RPC FUNCTIONS & PROCEDURES
-- ============================================================================

-- ─── Function 1: Centralized Receipt Number Generator ──────────────────────
CREATE OR REPLACE FUNCTION public.generate_receipt_number(
  p_school_id TEXT,
  p_academic_year TEXT DEFAULT '2026'
)
RETURNS TEXT AS $$
DECLARE
  v_school_code TEXT;
  v_year_clean TEXT;
  v_seq INTEGER := 1;
  v_receipt_no TEXT;
BEGIN
  v_year_clean := COALESCE(REGEXP_REPLACE(p_academic_year, '[^0-9]', '', 'g'), '2026');
  IF LENGTH(v_year_clean) > 4 THEN
    v_year_clean := SUBSTRING(v_year_clean FROM 1 FOR 4);
  END IF;

  v_school_code := UPPER(REGEXP_REPLACE(p_school_id, '[^A-Za-z0-9]', '', 'g'));
  IF LENGTH(v_school_code) > 6 THEN
    v_school_code := SUBSTRING(v_school_code FROM 1 FOR 6);
  END IF;

  -- Count total transactions for school to derive sequence
  SELECT COUNT(*) + 1 INTO v_seq
  FROM public.learner_fee_transactions
  WHERE school_id = p_school_id;

  v_receipt_no := 'RCP-' || v_year_clean || '-' || v_school_code || '-' || LPAD(v_seq::text, 6, '0');
  RETURN v_receipt_no;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ─── Function 2: Record Learner Payment (With Idempotency & Cashbook Check) ───
CREATE OR REPLACE FUNCTION public.record_learner_payment(
  p_client_tx_id UUID,
  p_school_id TEXT,
  p_learner_id TEXT,
  p_academic_year TEXT,
  p_term TEXT,
  p_amount NUMERIC,
  p_payment_method TEXT,
  p_allocations JSONB DEFAULT '[]'::jsonb,
  p_notes TEXT DEFAULT NULL,
  p_received_by TEXT DEFAULT 'Bursar/Headteacher'
)
RETURNS JSONB AS $$
DECLARE
  v_existing RECORD;
  v_learner RECORD;
  v_cashbook RECORD;
  v_old_owed NUMERIC(12,2) := 0.00;
  v_new_owed NUMERIC(12,2) := 0.00;
  v_receipt_no TEXT;
  v_tx RECORD;
  v_alloc JSONB;
  v_learner_uuid UUID;
BEGIN
  v_learner_uuid := p_learner_id::uuid;

  -- 1. Idempotency Check
  SELECT * INTO v_existing
  FROM public.learner_fee_transactions
  WHERE client_tx_id = p_client_tx_id;

  IF v_existing.id IS NOT NULL THEN
    RETURN json_build_object('success', true, 'status', 'EXISTING', 'receipt_number', v_existing.receipt_number, 'transaction', row_to_json(v_existing))::jsonb;
  END IF;

  -- 2. Cashbook Locking Check for Today
  SELECT * INTO v_cashbook
  FROM public.daily_cashbook_closings
  WHERE school_id = p_school_id AND closing_date = CURRENT_DATE;

  IF v_cashbook.id IS NOT NULL AND v_cashbook.status = 'CLOSED' THEN
    RETURN json_build_object('success', false, 'error', 'Cashbook for today is CLOSED. Please contact Headteacher to reopen cashbook before entering payments.')::jsonb;
  END IF;

  -- 3. Get current learner balance
  SELECT * INTO v_learner
  FROM public.report_learners
  WHERE id = v_learner_uuid;

  IF v_learner.id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Learner not found')::jsonb;
  END IF;

  v_old_owed := COALESCE(v_learner.fees_owed, 0.00);
  v_new_owed := v_old_owed - p_amount;

  -- 4. Generate backend receipt number
  v_receipt_no := public.generate_receipt_number(p_school_id, p_academic_year);

  -- 5. Record Transaction
  INSERT INTO public.learner_fee_transactions (
    client_tx_id, school_id, learner_id, academic_year, term, transaction_type,
    amount, balance_before, balance_after, payment_method, receipt_number, receipt_status, notes, received_by_staff
  ) VALUES (
    p_client_tx_id, p_school_id, v_learner_uuid, p_academic_year, p_term, 'PAYMENT',
    p_amount, v_old_owed, v_new_owed, p_payment_method, v_receipt_no, 'ACTIVE', p_notes, p_received_by
  ) RETURNING * INTO v_tx;

  -- 6. Record Category Allocations
  IF jsonb_array_length(p_allocations) > 0 THEN
    FOR v_alloc IN SELECT * FROM jsonb_array_elements(p_allocations)
    LOOP
      INSERT INTO public.learner_payment_allocations (
        transaction_id, fee_category, allocated_amount
      ) VALUES (
        v_tx.id, COALESCE(v_alloc->>'category', 'Tuition'), COALESCE((v_alloc->>'amount')::numeric, 0.00)
      );
    END LOOP;
  ELSE
    INSERT INTO public.learner_payment_allocations (
      transaction_id, fee_category, allocated_amount
    ) VALUES (
      v_tx.id, 'Tuition & General Fees', p_amount
    );
  END IF;

  -- 7. Update Learner Cached Balance
  UPDATE public.report_learners
  SET fees_owed = v_new_owed,
      fees_paid = COALESCE(fees_paid, 0.00) + p_amount
  WHERE id = v_learner_uuid;

  -- 8. Audit Log
  INSERT INTO public.financial_audit_log (
    school_id, staff_id, action, entity, entity_id, new_values
  ) VALUES (
    p_school_id, p_received_by, 'Payment Recorded', 'learner_fee_transactions', v_tx.id::text,
    json_build_object('receipt_number', v_receipt_no, 'amount', p_amount, 'learner_id', p_learner_id)::jsonb
  );

  RETURN json_build_object(
    'success', true,
    'status', 'CREATED',
    'receipt_number', v_receipt_no,
    'balance_after', v_new_owed,
    'transaction', row_to_json(v_tx)
  )::jsonb;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ─── Function 3: Reverse Learner Transaction ─────────────────────────────
CREATE OR REPLACE FUNCTION public.reverse_learner_transaction(
  p_school_id TEXT,
  p_transaction_id UUID,
  p_reversal_reason TEXT,
  p_performed_by TEXT
)
RETURNS JSONB AS $$
DECLARE
  v_orig RECORD;
  v_learner RECORD;
  v_old_owed NUMERIC(12,2);
  v_new_owed NUMERIC(12,2);
  v_reversal_tx RECORD;
BEGIN
  SELECT * INTO v_orig
  FROM public.learner_fee_transactions
  WHERE id = p_transaction_id AND school_id = p_school_id;

  IF v_orig.id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Original transaction not found')::jsonb;
  END IF;

  IF v_orig.receipt_status = 'REVERSED' THEN
    RETURN json_build_object('success', false, 'error', 'Transaction is already reversed')::jsonb;
  END IF;

  SELECT * INTO v_learner FROM public.report_learners WHERE id = v_orig.learner_id;
  v_old_owed := COALESCE(v_learner.fees_owed, 0.00);
  v_new_owed := v_old_owed + v_orig.amount;

  -- Mark original receipt as REVERSED
  UPDATE public.learner_fee_transactions
  SET receipt_status = 'REVERSED', reversal_reason = p_reversal_reason
  WHERE id = p_transaction_id;

  -- Insert offsetting REVERSAL transaction
  INSERT INTO public.learner_fee_transactions (
    client_tx_id, school_id, learner_id, academic_year, term, transaction_type,
    amount, balance_before, balance_after, payment_method, receipt_number, receipt_status,
    reversal_reason, reversed_tx_id, notes, received_by_staff
  ) VALUES (
    gen_random_uuid(), p_school_id, v_orig.learner_id, v_orig.academic_year, v_orig.term, 'REVERSAL',
    v_orig.amount, v_old_owed, v_new_owed, v_orig.payment_method, v_orig.receipt_number, 'REVERSED',
    p_reversal_reason, p_transaction_id, 'Reversal of ' || v_orig.receipt_number, p_performed_by
  ) RETURNING * INTO v_reversal_tx;

  -- Restore learner balance
  UPDATE public.report_learners
  SET fees_owed = v_new_owed,
      fees_paid = GREATEST(0.00, COALESCE(fees_paid, 0.00) - v_orig.amount)
  WHERE id = v_orig.learner_id;

  -- Audit Log
  INSERT INTO public.financial_audit_log (
    school_id, staff_id, action, entity, entity_id, old_values, new_values
  ) VALUES (
    p_school_id, p_performed_by, 'Payment Reversed', 'learner_fee_transactions', p_transaction_id::text,
    json_build_object('receipt_number', v_orig.receipt_number, 'amount', v_orig.amount)::jsonb,
    json_build_object('reversal_reason', p_reversal_reason, 'reversal_tx_id', v_reversal_tx.id)::jsonb
  );

  RETURN json_build_object('success', true, 'message', 'Transaction reversed successfully', 'reversal_tx', row_to_json(v_reversal_tx))::jsonb;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ─── Function 4: Rebuild Learner Balances From Ledger ───────────────────────
CREATE OR REPLACE FUNCTION public.rebuild_learner_balances(p_school_id TEXT)
RETURNS JSONB AS $$
DECLARE
  v_rec RECORD;
  v_count INTEGER := 0;
BEGIN
  FOR v_rec IN
    SELECT l.id AS learner_id,
           COALESCE(SUM(CASE WHEN t.transaction_type = 'CHARGE' THEN t.amount ELSE 0 END), 0) -
           COALESCE(SUM(CASE WHEN t.transaction_type = 'PAYMENT' AND t.receipt_status = 'ACTIVE' THEN t.amount ELSE 0 END), 0) -
           COALESCE(SUM(CASE WHEN t.transaction_type IN ('DISCOUNT', 'WAIVER') THEN t.amount ELSE 0 END), 0) +
           COALESCE(SUM(CASE WHEN t.transaction_type = 'REVERSAL' THEN t.amount ELSE 0 END), 0) AS calc_balance,
           COALESCE(SUM(CASE WHEN t.transaction_type = 'PAYMENT' AND t.receipt_status = 'ACTIVE' THEN t.amount ELSE 0 END), 0) AS calc_paid
    FROM public.report_learners l
    LEFT JOIN public.learner_fee_transactions t ON l.id = t.learner_id
    WHERE l.school_id = p_school_id
    GROUP BY l.id
  LOOP
    UPDATE public.report_learners
    SET fees_owed = v_rec.calc_balance,
        fees_paid = v_rec.calc_paid
    WHERE id = v_rec.learner_id;
    v_count := v_count + 1;
  END LOOP;

  RETURN json_build_object('success', true, 'learners_updated', v_count)::jsonb;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
