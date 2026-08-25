-- ============================================================================
-- Migration: 20260818_reconcile_wallet_balance_from_transactions.sql
-- Description: 
--   1. Reconciles all existing schools whose wallet_balance is 0.00 or out of sync
--      with their completed credit transactions.
--   2. Adds an automated database trigger so report_schools.wallet_balance is
--      always kept 100% accurate and up-to-date upon transaction inserts.
-- ============================================================================

-- ── 1. Reconcile Existing School Balances ────────────────────────────────────
DO $$
DECLARE
  v_school RECORD;
  v_total_credits NUMERIC(12,2);
  v_total_debits NUMERIC(12,2);
  v_net_balance NUMERIC(12,2);
  v_reconciled INTEGER := 0;
BEGIN
  FOR v_school IN SELECT id, name, wallet_balance FROM public.report_schools LOOP
    -- Sum verified credits from wallet_transactions and payment_transactions
    SELECT COALESCE(SUM(amount), 0.00) INTO v_total_credits
    FROM public.wallet_transactions
    WHERE school_id = v_school.id
      AND (transaction_type = 'CREDIT' OR type = 'CREDIT');

    -- Also check payment_transactions that may not be in wallet_transactions
    SELECT v_total_credits + COALESCE(SUM(COALESCE(verified_amount, requested_amount, 0.00)), 0.00)
    INTO v_total_credits
    FROM public.payment_transactions
    WHERE school_id = v_school.id
      AND status IN ('COMPLETED', 'SUCCESS', 'VERIFIED')
      AND provider_reference NOT IN (SELECT reference FROM public.wallet_transactions WHERE school_id = v_school.id);

    -- Sum debits
    SELECT COALESCE(SUM(amount), 0.00) INTO v_total_debits
    FROM public.wallet_transactions
    WHERE school_id = v_school.id
      AND (transaction_type = 'DEBIT' OR type = 'DEBIT');

    v_net_balance := GREATEST(0.00, v_total_credits - v_total_debits);

    IF v_net_balance > COALESCE(v_school.wallet_balance, 0.00) THEN
      UPDATE public.report_schools
      SET wallet_balance = v_net_balance
      WHERE id = v_school.id;

      v_reconciled := v_reconciled + 1;
      RAISE NOTICE 'Reconciled school % (%) balance: % -> %', v_school.name, v_school.id, v_school.wallet_balance, v_net_balance;
    END IF;
  END LOOP;

  RAISE NOTICE 'Finished reconciliation: % school(s) updated.', v_reconciled;
END;
$$;

-- ── 2. Automatic Realtime Sync Trigger Function ──────────────────────────────
CREATE OR REPLACE FUNCTION public.sync_school_wallet_on_transaction()
RETURNS TRIGGER AS $$
DECLARE
  v_school_id TEXT;
  v_amount NUMERIC(12,2);
  v_is_debit BOOLEAN;
BEGIN
  v_school_id := NEW.school_id;
  v_amount := COALESCE(NEW.amount, 0.00);
  v_is_debit := (NEW.transaction_type = 'DEBIT' OR NEW.type = 'DEBIT');

  IF v_is_debit THEN
    UPDATE public.report_schools
    SET wallet_balance = GREATEST(0.00, COALESCE(wallet_balance, 0.00) - v_amount)
    WHERE id = v_school_id;
  ELSE
    UPDATE public.report_schools
    SET wallet_balance = COALESCE(wallet_balance, 0.00) + v_amount
    WHERE id = v_school_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- ── 3. Attach Trigger to wallet_transactions ─────────────────────────────────
DROP TRIGGER IF EXISTS trg_sync_school_wallet ON public.wallet_transactions;
CREATE TRIGGER trg_sync_school_wallet
AFTER INSERT ON public.wallet_transactions
FOR EACH ROW
EXECUTE FUNCTION public.sync_school_wallet_on_transaction();
