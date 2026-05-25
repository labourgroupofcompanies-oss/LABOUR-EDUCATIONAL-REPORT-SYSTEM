-- ================================================================
-- Migration: Add Report Release System to public.report_summaries
-- Run this in the Supabase SQL Editor
-- ================================================================

-- 1. Add is_released column to public.report_summaries table
ALTER TABLE public.report_summaries
  ADD COLUMN IF NOT EXISTS is_released BOOLEAN DEFAULT FALSE;

-- 2. Create index for faster filtering of released reports
CREATE INDEX IF NOT EXISTS idx_report_summaries_is_released 
  ON public.report_summaries (is_released);

-- 3. Recreate public.get_summaries_by_guardian_contact to return the is_released column
CREATE OR REPLACE FUNCTION public.get_summaries_by_guardian_contact(p_contact TEXT)
RETURNS TABLE (
  id UUID,
  school_id TEXT,
  learner_id UUID,
  class_id INTEGER,
  academic_year TEXT,
  term TEXT,
  attendance_present INTEGER,
  attendance_total INTEGER,
  conduct TEXT,
  attitude TEXT,
  teacher_remark TEXT,
  headteacher_remark TEXT,
  promoted_to TEXT,
  next_term_begins TEXT,
  fees_owed TEXT,
  next_term_bill TEXT,
  is_released BOOLEAN,        -- Added column
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
    s.id,
    s.school_id,
    s.learner_id,
    s.class_id,
    s.academic_year,
    s.term,
    s.attendance_present,
    s.attendance_total,
    s.conduct,
    s.attitude,
    s.teacher_remark,
    s.headteacher_remark,
    s.promoted_to,
    s.next_term_begins,
    s.fees_owed,
    s.next_term_bill,
    s.is_released,            -- Added SELECT
    s.created_at,
    s.updated_at
  FROM 
    public.report_summaries s
  JOIN
    public.report_learners l ON s.learner_id = l.id
  WHERE 
    substring(regexp_replace(COALESCE(l.guardian_contact_1, ''), '[^0-9]', '', 'g') from '([0-9]{9})$') = v_clean_contact
    OR substring(regexp_replace(COALESCE(l.guardian_contact_2, ''), '[^0-9]', '', 'g') from '([0-9]{9})$') = v_clean_contact;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
