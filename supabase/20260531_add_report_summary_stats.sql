-- ============================================================================
-- Migration: Add Persisted Statistics to public.report_summaries
-- Date: 2026-05-31
-- 
-- Run this script in the Supabase SQL Editor.
-- ============================================================================

-- 1. Add class_average, class_rank, and total_graded columns to public.report_summaries
ALTER TABLE public.report_summaries
  ADD COLUMN IF NOT EXISTS class_average NUMERIC,
  ADD COLUMN IF NOT EXISTS class_rank INTEGER,
  ADD COLUMN IF NOT EXISTS total_graded INTEGER;

-- 2. Create indices for performance when compiling and viewing statistics
CREATE INDEX IF NOT EXISTS idx_report_summaries_class_average ON public.report_summaries (class_average);
CREATE INDEX IF NOT EXISTS idx_report_summaries_class_rank ON public.report_summaries (class_rank);

-- 3. Drop existing secure RPC function to prevent signature conflict errors
DROP FUNCTION IF EXISTS public.get_summaries_by_guardian_contact(TEXT);

-- 4. Recreate RPC function with new columns in return type
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
  is_released BOOLEAN,
  class_average NUMERIC,      -- Added
  class_rank INTEGER,         -- Added
  total_graded INTEGER,       -- Added
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
    s.is_released,
    s.class_average,          -- Added
    s.class_rank,             -- Added
    s.total_graded,           -- Added
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

-- 5. Force schema reload cache notification
NOTIFY pgrst, 'reload schema';
