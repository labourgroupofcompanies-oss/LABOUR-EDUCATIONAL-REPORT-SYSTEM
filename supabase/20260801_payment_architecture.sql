-- ============================================================================
-- Migration: Enterprise Payment Architecture for Labour Edu App
-- Paystack Integration — Payment Transactions + Immutable Wallet Ledger
-- Run this ENTIRE script in your Supabase SQL Editor
-- ============================================================================

-- ─── 1. payment_transactions ─────────────────────────────────────────────────
-- Every Paystack (or manual) payment attempt is recorded here.
-- Wallet is NEVER credited without a corresponding row in this table.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.payment_transactions (
  id                        UUID        PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Ownership
  school_id                 TEXT        NOT NULL REFERENCES public.report_schools(id) ON DELETE RESTRICT,

  -- Provider
  provider                  TEXT        NOT NULL DEFAULT 'paystack'
                                        CHECK (provider IN ('paystack', 'mtn_momo', 'hubtel', 'flutterwave', 'manual')),
  provider_reference        TEXT        NOT NULL,                       -- Our generated reference (unique per payment)
  provider_transaction_id   TEXT,                                       -- Paystack's internal transaction ID (from verify response)

  -- Payment details
  payment_method            TEXT        NOT NULL
                                        CHECK (payment_method IN ('card', 'mobile_money', 'bank_transfer', 'manual', 'ussd')),
  currency                  TEXT        NOT NULL DEFAULT 'GHS',
  requested_amount          NUMERIC(12, 2) NOT NULL,                    -- Amount browser sent (stored for audit, NEVER used to credit)
  verified_amount           NUMERIC(12, 2),                             -- Amount confirmed by Paystack API — ONLY this is credited

  -- State machine
  status                    TEXT        NOT NULL DEFAULT 'INITIALIZED'
                                        CHECK (status IN (
                                          'INITIALIZED',
                                          'PENDING_AUTHORIZATION',
                                          'PENDING_VERIFICATION',
                                          'VERIFIED',
                                          'WALLET_CREDITED',
                                          'COMPLETED',
                                          'FAILED',
                                          'CANCELLED',
                                          'REFUNDED'
                                        )),

  -- Mobile money details
  momo_provider             TEXT,                                       -- 'MTN' | 'Telecel' | 'AT'
  momo_phone                TEXT,

  -- Customer info
  customer_email            TEXT        NOT NULL,

  -- Paystack response metadata
  paystack_channel          TEXT,                                       -- 'card' | 'mobile_money' | 'bank' etc.
  paystack_fees_kobo        BIGINT,                                     -- Paystack processing fees in kobo
  paystack_access_code      TEXT,                                       -- Access code for popup
  paystack_raw_response     JSONB,                                      -- Full raw Paystack verify response (audit trail)

  -- Idempotency — prevents duplicate wallet credits
  idempotency_key           TEXT        UNIQUE,                         -- Unique key to prevent duplicate processing

  -- Timestamps (state transition log)
  initiated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  authorized_at             TIMESTAMPTZ,
  verified_at               TIMESTAMPTZ,
  credited_at               TIMESTAMPTZ,
  completed_at              TIMESTAMPTZ,
  failed_at                 TIMESTAMPTZ,
  cancelled_at              TIMESTAMPTZ,
  paid_at                   TIMESTAMPTZ,                                -- When Paystack reports the payment occurred

  -- Webhook tracking
  webhook_received_at       TIMESTAMPTZ,
  webhook_event_type        TEXT,                                       -- 'charge.success' | 'charge.failed' etc.
  webhook_attempts          INT         NOT NULL DEFAULT 0,

  -- Audit
  initiated_by              TEXT        NOT NULL,                       -- Supabase auth user ID
  failure_reason            TEXT,

  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Unique constraint: one record per provider_reference
CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_txn_provider_ref
  ON public.payment_transactions(provider_reference);

-- Efficient lookup by school and status
CREATE INDEX IF NOT EXISTS idx_payment_txn_school_id
  ON public.payment_transactions(school_id);

CREATE INDEX IF NOT EXISTS idx_payment_txn_status
  ON public.payment_transactions(status);

CREATE INDEX IF NOT EXISTS idx_payment_txn_idempotency
  ON public.payment_transactions(idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_payment_transactions_updated_at ON public.payment_transactions;
CREATE TRIGGER trg_payment_transactions_updated_at
  BEFORE UPDATE ON public.payment_transactions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- ─── 2. wallet_transactions (Immutable Ledger) ────────────────────────────────
-- Every cent into/out of a school's wallet is recorded here.
-- This table is APPEND-ONLY. Never update or delete rows.
-- Wallet balance = SUM of all entries for that school_id.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.wallet_transactions (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Wallet owner
  school_id         TEXT        NOT NULL REFERENCES public.report_schools(id) ON DELETE RESTRICT,

  -- Link to the payment that caused this ledger entry (NULL for system debits)
  payment_id        UUID        REFERENCES public.payment_transactions(id) ON DELETE RESTRICT,

  -- Transaction type
  transaction_type  TEXT        NOT NULL
                                CHECK (transaction_type IN (
                                  'CREDIT',       -- Money in (top-up)
                                  'DEBIT',        -- Money out (subscription charge)
                                  'RESERVE',      -- Funds reserved pending debit
                                  'RELEASE',      -- Reserved funds released
                                  'REFUND',       -- Refund credited back
                                  'ADJUSTMENT'    -- Admin correction with full audit
                                )),

  currency          TEXT        NOT NULL DEFAULT 'GHS',
  amount            NUMERIC(12, 2) NOT NULL,                            -- Always positive; type indicates direction
  balance_before    NUMERIC(12, 2) NOT NULL,                           -- Wallet balance immediately before this entry
  balance_after     NUMERIC(12, 2) NOT NULL,                           -- Wallet balance immediately after this entry
  description       TEXT        NOT NULL,
  reference         TEXT,                                              -- External reference (Paystack ref, etc.)

  -- Who created this entry
  created_by        TEXT        NOT NULL,                              -- 'WEBHOOK' | 'SYSTEM' | user_id | 'ADMIN'

  -- Immutable — no updated_at by design
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Lookups
CREATE INDEX IF NOT EXISTS idx_wallet_txn_school_id
  ON public.wallet_transactions(school_id);

CREATE INDEX IF NOT EXISTS idx_wallet_txn_payment_id
  ON public.wallet_transactions(payment_id)
  WHERE payment_id IS NOT NULL;

-- ─── Enforce append-only via RLS (no UPDATE, no DELETE allowed) ─────────────
ALTER TABLE public.wallet_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS wallet_ledger_select_school ON public.wallet_transactions;
CREATE POLICY wallet_ledger_select_school
  ON public.wallet_transactions FOR SELECT
  USING (
    school_id = (
      SELECT school_id FROM public.profiles WHERE id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND role IN ('developer', 'accountant', 'operations')
    )
  );

-- Service role can insert (Edge Functions use service role)
-- No UPDATE or DELETE policies — this table is append-only by design.


-- ─── 3. payment_events (Domain Event Log) ────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.payment_events (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id    UUID        REFERENCES public.payment_transactions(id) ON DELETE CASCADE,
  school_id     TEXT        REFERENCES public.report_schools(id) ON DELETE CASCADE,
  event_type    TEXT        NOT NULL,   -- 'PaymentVerified' | 'WalletCredited' | 'WalletDebited' etc.
  payload       JSONB       NOT NULL DEFAULT '{}',
  published_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_by  TEXT[]      DEFAULT '{}'  -- Subscribers that have consumed this event
);

CREATE INDEX IF NOT EXISTS idx_payment_events_payment_id
  ON public.payment_events(payment_id);
CREATE INDEX IF NOT EXISTS idx_payment_events_school_id
  ON public.payment_events(school_id);
CREATE INDEX IF NOT EXISTS idx_payment_events_type
  ON public.payment_events(event_type);


-- ─── 4. RLS for payment_transactions ─────────────────────────────────────────
ALTER TABLE public.payment_transactions ENABLE ROW LEVEL SECURITY;

-- Headteachers can view their own school's payments
DROP POLICY IF EXISTS payment_txn_select_school ON public.payment_transactions;
CREATE POLICY payment_txn_select_school
  ON public.payment_transactions FOR SELECT
  USING (
    school_id = (
      SELECT school_id FROM public.profiles WHERE id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND role IN ('developer', 'accountant', 'operations')
    )
  );

-- RLS for payment_events (platform admins and owners only)
ALTER TABLE public.payment_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS payment_events_select ON public.payment_events;
CREATE POLICY payment_events_select
  ON public.payment_events FOR SELECT
  USING (
    school_id = (
      SELECT school_id FROM public.profiles WHERE id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND role IN ('developer', 'accountant', 'operations')
    )
  );


-- ─── 5. Idempotent Wallet Credit RPC (called from Edge Function) ─────────────
-- This function runs as a single atomic transaction inside Postgres.
-- It handles: idempotency check → ledger entry → wallet balance update → event log.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.process_wallet_credit(
  p_payment_id          UUID,
  p_school_id           TEXT,
  p_verified_amount     NUMERIC,
  p_provider_reference  TEXT,
  p_description         TEXT,
  p_channel             TEXT,
  p_paystack_tx_id      TEXT,
  p_paid_at             TIMESTAMPTZ,
  p_raw_response        JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_old_balance         NUMERIC(12, 2);
  v_new_balance         NUMERIC(12, 2);
  v_ledger_id           UUID;
BEGIN
  -- ① Idempotency: if this payment is already COMPLETED or WALLET_CREDITED, return early
  IF EXISTS (
    SELECT 1 FROM public.payment_transactions
    WHERE id = p_payment_id
      AND status IN ('WALLET_CREDITED', 'COMPLETED', 'REFUNDED')
  ) THEN
    RETURN jsonb_build_object(
      'success', true,
      'idempotent', true,
      'message', 'Payment already processed'
    );
  END IF;

  -- ② Lock the school row to prevent race conditions (row-level lock)
  SELECT wallet_balance INTO v_old_balance
  FROM public.report_schools
  WHERE id = p_school_id
  FOR UPDATE;                        -- Blocks concurrent webhook calls for same school

  IF v_old_balance IS NULL THEN
    RAISE EXCEPTION 'School % not found', p_school_id;
  END IF;

  v_new_balance := v_old_balance + p_verified_amount;

  -- ③ Update payment_transactions status
  UPDATE public.payment_transactions
  SET
    status                  = 'WALLET_CREDITED',
    verified_amount         = p_verified_amount,
    provider_transaction_id = p_paystack_tx_id,
    paystack_channel        = p_channel,
    paystack_raw_response   = p_raw_response,
    verified_at             = NOW(),
    credited_at             = NOW(),
    paid_at                 = COALESCE(p_paid_at, NOW()),
    webhook_received_at     = NOW(),
    idempotency_key         = p_provider_reference
  WHERE id = p_payment_id;

  -- ④ Insert immutable ledger entry
  INSERT INTO public.wallet_transactions (
    school_id,
    payment_id,
    transaction_type,
    currency,
    amount,
    balance_before,
    balance_after,
    description,
    reference,
    created_by
  ) VALUES (
    p_school_id,
    p_payment_id,
    'CREDIT',
    'GHS',
    p_verified_amount,
    v_old_balance,
    v_new_balance,
    p_description,
    p_provider_reference,
    'WEBHOOK'
  ) RETURNING id INTO v_ledger_id;

  -- ⑤ Update wallet balance on report_schools
  UPDATE public.report_schools
  SET
    wallet_balance = v_new_balance,
    updated_at     = NOW()
  WHERE id = p_school_id;

  -- ⑥ Mark payment COMPLETED
  UPDATE public.payment_transactions
  SET
    status       = 'COMPLETED',
    completed_at = NOW()
  WHERE id = p_payment_id;

  -- ⑦ Insert domain event records
  INSERT INTO public.payment_events (payment_id, school_id, event_type, payload)
  VALUES
    (p_payment_id, p_school_id, 'PaymentVerified',
      jsonb_build_object('payment_id', p_payment_id, 'amount', p_verified_amount, 'reference', p_provider_reference)),
    (p_payment_id, p_school_id, 'WalletCredited',
      jsonb_build_object('school_id', p_school_id, 'amount', p_verified_amount, 'balance_before', v_old_balance, 'new_balance', v_new_balance, 'ledger_id', v_ledger_id));

  -- ⑧ Also insert into the existing platform_wallet_transactions table for backward compatibility
  BEGIN
    INSERT INTO public.platform_wallet_transactions (
      school_id,
      type,
      amount,
      balance_before,
      balance_after,
      reference,
      description
    ) VALUES (
      p_school_id,
      'DEPOSIT',
      p_verified_amount,
      v_old_balance,
      v_new_balance,
      p_provider_reference,
      p_description
    );
  EXCEPTION WHEN undefined_table THEN
    -- platform_wallet_transactions may not exist in all environments
    NULL;
  END;

  RETURN jsonb_build_object(
    'success',       true,
    'idempotent',    false,
    'old_balance',   v_old_balance,
    'new_balance',   v_new_balance,
    'amount',        p_verified_amount,
    'ledger_id',     v_ledger_id,
    'payment_id',    p_payment_id
  );
END;
$$;


-- ─── 6. process_wallet_debit RPC (for subscription charge at term end) ───────
CREATE OR REPLACE FUNCTION public.process_wallet_debit(
  p_school_id     TEXT,
  p_amount        NUMERIC,
  p_description   TEXT,
  p_performed_by  TEXT DEFAULT 'SYSTEM'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_old_balance NUMERIC(12, 2);
  v_new_balance NUMERIC(12, 2);
BEGIN
  SELECT wallet_balance INTO v_old_balance
  FROM public.report_schools
  WHERE id = p_school_id
  FOR UPDATE;

  IF v_old_balance IS NULL THEN
    RAISE EXCEPTION 'School % not found', p_school_id;
  END IF;

  IF v_old_balance < p_amount THEN
    RAISE EXCEPTION 'Insufficient wallet balance. Balance: %, Required: %', v_old_balance, p_amount;
  END IF;

  v_new_balance := v_old_balance - p_amount;

  -- Ledger entry
  INSERT INTO public.wallet_transactions (
    school_id, transaction_type, currency, amount,
    balance_before, balance_after, description, created_by
  ) VALUES (
    p_school_id, 'DEBIT', 'GHS', p_amount,
    v_old_balance, v_new_balance, p_description, p_performed_by
  );

  -- Update balance
  UPDATE public.report_schools
  SET wallet_balance = v_new_balance, updated_at = NOW()
  WHERE id = p_school_id;

  -- Domain event
  INSERT INTO public.payment_events (school_id, event_type, payload)
  VALUES (
    p_school_id, 'WalletDebited',
    jsonb_build_object('amount', p_amount, 'balance_before', v_old_balance, 'new_balance', v_new_balance, 'reason', p_description)
  );

  RETURN jsonb_build_object(
    'success',      true,
    'old_balance',  v_old_balance,
    'new_balance',  v_new_balance,
    'amount',       p_amount
  );
END;
$$;


-- ─── 7. Grant execute to authenticated and service roles ─────────────────────
GRANT EXECUTE ON FUNCTION public.process_wallet_credit TO service_role;
GRANT EXECUTE ON FUNCTION public.process_wallet_debit  TO service_role;
GRANT EXECUTE ON FUNCTION public.process_wallet_debit  TO authenticated;

-- Allow service_role to insert/update payment_transactions (Edge Functions)
GRANT ALL ON public.payment_transactions TO service_role;
GRANT ALL ON public.wallet_transactions  TO service_role;
GRANT ALL ON public.payment_events       TO service_role;

-- Allow authenticated users to INSERT their own payment_transactions (initialize-payment)
DROP POLICY IF EXISTS payment_txn_insert_own ON public.payment_transactions;
CREATE POLICY payment_txn_insert_own
  ON public.payment_transactions FOR INSERT
  WITH CHECK (
    initiated_by = auth.uid()::text
    AND
    school_id = (SELECT school_id FROM public.profiles WHERE id = auth.uid())
  );
