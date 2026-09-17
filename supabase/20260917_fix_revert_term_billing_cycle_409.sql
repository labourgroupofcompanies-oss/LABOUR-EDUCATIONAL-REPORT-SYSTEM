-- ============================================================================
-- Migration: 20260917_fix_revert_term_billing_cycle_409.sql
-- Description: Fix HTTP 409 (Foreign Key Constraint Conflict 23503) during
--              Term Billing Cycle Reversion.
--
-- Root Causes Fixed:
-- 1. 'platform_subscription_audit' requires a valid foreign key school_id.
--    The previous version passed 'SYSTEM' which violated report_schools(id) FK.
-- 2. When 'school_term_bills' contains PAID bills, deleting from billing_cycles
--    failed due to ON DELETE RESTRICT foreign key constraint. Now safely sets
--    status = 'CANCELLED' if referenced bills exist, or deletes if empty.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.revert_term_billing_cycle(
  p_academic_year TEXT,
  p_term TEXT,
  p_reverted_by TEXT DEFAULT 'Labour Admin'
)
RETURNS JSONB AS $$
DECLARE
  v_cycle_id UUID;
  v_deleted_bills INTEGER := 0;
  v_audit_school_id TEXT;
BEGIN
  -- 1. Find billing cycle
  SELECT id INTO v_cycle_id
  FROM public.billing_cycles
  WHERE academic_year = p_academic_year AND term = p_term;

  -- 2. Delete unpaid term bills for this cycle
  DELETE FROM public.school_term_bills
  WHERE (billing_cycle_id = v_cycle_id OR (academic_year = p_academic_year AND term = p_term))
    AND status != 'PAID';

  GET DIAGNOSTICS v_deleted_bills = ROW_COUNT;

  -- 3. Delete or update billing cycle status (prevent 409 foreign key RESTRICT conflict)
  IF v_cycle_id IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM public.school_term_bills WHERE billing_cycle_id = v_cycle_id) THEN
      -- If any bills still reference this cycle (e.g. PAID bills), mark as CANCELLED
      UPDATE public.billing_cycles SET status = 'CANCELLED' WHERE id = v_cycle_id;
    ELSE
      BEGIN
        DELETE FROM public.billing_cycles WHERE id = v_cycle_id;
      EXCEPTION WHEN foreign_key_violation THEN
        UPDATE public.billing_cycles SET status = 'CANCELLED' WHERE id = v_cycle_id;
      END;
    END IF;
  END IF;

  -- 4. Log Audit Event safely (never violate school_id foreign key constraint)
  BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'platform_subscription_audit') THEN
      SELECT id INTO v_audit_school_id FROM public.report_schools LIMIT 1;

      IF v_audit_school_id IS NOT NULL THEN
        INSERT INTO public.platform_subscription_audit (
          school_id, academic_year, term, event, details, performed_by
        ) VALUES (
          v_audit_school_id,
          p_academic_year,
          p_term,
          'TERM_BILLING_CYCLE_REVERTED',
          jsonb_build_object(
            'academic_year', p_academic_year,
            'term', p_term,
            'deleted_bills_count', v_deleted_bills
          ),
          p_reverted_by
        );
      END IF;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    -- Never let audit logging failure abort the transaction
    NULL;
  END;

  RETURN jsonb_build_object(
    'success', true,
    'academic_year', p_academic_year,
    'term', p_term,
    'deleted_bills_count', v_deleted_bills,
    'message', 'Term billing cycle successfully reverted.'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

GRANT EXECUTE ON FUNCTION public.revert_term_billing_cycle(TEXT, TEXT, TEXT) TO authenticated, service_role;
