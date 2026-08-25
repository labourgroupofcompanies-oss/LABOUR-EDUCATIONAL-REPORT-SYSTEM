-- ============================================================================
-- Migration: RECONCILE_TOPUPS.sql
-- Description: Reconciles all previous Paystack top-ups that were recorded in 
--              payment_transactions but not yet credited to report_schools.wallet_balance.
-- ============================================================================

DO $$
DECLARE
  v_rec RECORD;
  v_old_bal NUMERIC(12,2);
  v_new_bal NUMERIC(12,2);
  v_amount NUMERIC(12,2);
  v_bill RECORD;
  v_reconciled_count INTEGER := 0;
BEGIN
  FOR v_rec IN 
    SELECT * 
    FROM public.payment_transactions 
    WHERE status IN ('COMPLETED', 'VERIFIED')
      AND id NOT IN (SELECT COALESCE(payment_id, '00000000-0000-0000-0000-000000000000'::uuid) FROM public.wallet_transactions)
  LOOP
    v_amount := COALESCE(v_rec.verified_amount, v_rec.requested_amount, 0.00);

    IF v_amount > 0 THEN
      SELECT wallet_balance INTO v_old_bal
      FROM public.report_schools
      WHERE id = v_rec.school_id
      FOR UPDATE;

      v_old_bal := COALESCE(v_old_bal, 0.00);
      v_new_bal := v_old_bal + v_amount;

      -- 1. Update report_schools wallet balance
      UPDATE public.report_schools
      SET wallet_balance = v_new_bal
      WHERE id = v_rec.school_id;

      -- 2. Insert immutable wallet ledger entry
      INSERT INTO public.wallet_transactions (
        school_id, payment_id, transaction_type, currency, amount,
        balance_before, balance_after, description, reference, created_by
      ) VALUES (
        v_rec.school_id, v_rec.id, 'CREDIT', 'GHS', v_amount,
        v_old_bal, v_new_bal, 'Reconciled Paystack Wallet Top Up', v_rec.provider_reference, 'RECONCILIATION'
      );

      -- 3. Update payment status to WALLET_CREDITED
      UPDATE public.payment_transactions
      SET status = 'WALLET_CREDITED',
          credited_at = NOW()
      WHERE id = v_rec.id;

      v_reconciled_count := v_reconciled_count + 1;

      -- 4. Auto-settle any approved insufficient bill for this school
      SELECT * INTO v_bill
      FROM public.school_term_bills
      WHERE school_id = v_rec.school_id
        AND approval_status = 'APPROVED'
        AND status = 'INSUFFICIENT_FUNDS'
      ORDER BY created_at ASC LIMIT 1;

      IF v_bill.id IS NOT NULL AND v_new_bal >= v_bill.amount_due THEN
        PERFORM public.approve_and_pay_term_bill(v_bill.id, 'AUTO_SETTLEMENT_AFTER_RECONCILIATION');
      END IF;

    END IF;
  END LOOP;

  RAISE NOTICE 'Successfully reconciled % top-up transaction(s).', v_reconciled_count;
END;
$$;
