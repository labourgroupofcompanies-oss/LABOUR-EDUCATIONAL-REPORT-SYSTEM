-- ================================================================
-- Migration: Add Payments System and Class Category
-- Run this in your Supabase SQL Editor
-- ================================================================

-- 1. Add category column to public.report_classes
ALTER TABLE public.report_classes
  ADD COLUMN IF NOT EXISTS category TEXT;

-- 2. Create public.report_payments table
CREATE TABLE IF NOT EXISTS public.report_payments (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id           TEXT NOT NULL REFERENCES public.report_schools(id) ON DELETE CASCADE,
  learner_id          UUID NOT NULL REFERENCES public.report_learners(id) ON DELETE CASCADE,
  academic_year       TEXT NOT NULL,
  term                TEXT NOT NULL,
  amount              NUMERIC(10, 2) NOT NULL,
  payment_date        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  payment_method      TEXT NOT NULL, -- 'Cash', 'Mobile Money', 'Bank Transfer'
  reference           TEXT,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

-- Unique constraint / Index
CREATE INDEX IF NOT EXISTS idx_report_payments_school ON public.report_payments (school_id);
CREATE INDEX IF NOT EXISTS idx_report_payments_learner ON public.report_payments (learner_id);

-- Enable RLS
ALTER TABLE public.report_payments ENABLE ROW LEVEL SECURITY;

-- 3. RLS Policies for report_payments

-- SELECT policy: super_admin (headteacher) can read all payments for their school.
DROP POLICY IF EXISTS "report_payments_select" ON public.report_payments;
CREATE POLICY "report_payments_select"
  ON public.report_payments FOR SELECT
  USING (
    school_id = (auth.jwt() ->> 'school_id')
    AND EXISTS (
      SELECT 1 FROM public.report_profiles
      WHERE id = auth.uid() AND role = 'super_admin'
    )
  );

-- INSERT policy: super_admin can insert
DROP POLICY IF EXISTS "report_payments_insert" ON public.report_payments;
CREATE POLICY "report_payments_insert"
  ON public.report_payments FOR INSERT
  WITH CHECK (
    school_id = (auth.jwt() ->> 'school_id')
    AND EXISTS (
      SELECT 1 FROM public.report_profiles
      WHERE id = auth.uid() AND role = 'super_admin'
    )
  );

-- UPDATE policy: super_admin can update
DROP POLICY IF EXISTS "report_payments_update" ON public.report_payments;
CREATE POLICY "report_payments_update"
  ON public.report_payments FOR UPDATE
  USING (
    school_id = (auth.jwt() ->> 'school_id')
    AND EXISTS (
      SELECT 1 FROM public.report_profiles
      WHERE id = auth.uid() AND role = 'super_admin'
    )
  );

-- DELETE policy: super_admin can delete
DROP POLICY IF EXISTS "report_payments_delete" ON public.report_payments;
CREATE POLICY "report_payments_delete"
  ON public.report_payments FOR DELETE
  USING (
    school_id = (auth.jwt() ->> 'school_id')
    AND EXISTS (
      SELECT 1 FROM public.report_profiles
      WHERE id = auth.uid() AND role = 'super_admin'
    )
  );

-- 4. Create secure SECURITY DEFINER RPC to get payments by guardian contact
CREATE OR REPLACE FUNCTION public.get_payments_by_guardian_contact(p_contact TEXT)
RETURNS TABLE (
  id UUID,
  school_id TEXT,
  learner_id UUID,
  academic_year TEXT,
  term TEXT,
  amount NUMERIC,
  payment_date TIMESTAMPTZ,
  payment_method TEXT,
  reference TEXT,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
) AS $$
DECLARE
  v_clean_contact TEXT;
BEGIN
  -- Extract last 9 digits of the search contact, removing any non-digits
  v_clean_contact := substring(regexp_replace(p_contact, '[^0-9]', '', 'g') from '([0-9]{9})$');
  
  IF v_clean_contact IS NULL OR length(v_clean_contact) < 9 THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT 
    p.id,
    p.school_id,
    p.learner_id,
    p.academic_year,
    p.term,
    p.amount,
    p.payment_date,
    p.payment_method,
    p.reference,
    p.created_at,
    p.updated_at
  FROM 
    public.report_payments p
  JOIN
    public.report_learners l ON p.learner_id = l.id
  WHERE 
    substring(regexp_replace(COALESCE(l.guardian_contact_1, ''), '[^0-9]', '', 'g') from '([0-9]{9})$') = v_clean_contact
    OR substring(regexp_replace(COALESCE(l.guardian_contact_2, ''), '[^0-9]', '', 'g') from '([0-9]{9})$') = v_clean_contact;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
