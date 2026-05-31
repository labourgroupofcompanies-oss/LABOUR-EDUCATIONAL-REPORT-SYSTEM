-- Migration: Fix get_scores_by_guardian_contact RPC Return Type for ca_scores (NUMERIC[] to JSONB)
-- Date: 2026-05-31

-- 1. Drop the existing function to allow changing return types without signature collision
DROP FUNCTION IF EXISTS public.get_scores_by_guardian_contact(TEXT);

-- 2. Re-create the function with the corrected ca_scores JSONB column type matching public.report_scores.ca_scores
CREATE OR REPLACE FUNCTION public.get_scores_by_guardian_contact(p_contact TEXT)
RETURNS TABLE (
  id UUID,
  school_id TEXT,
  learner_id UUID,
  class_id INTEGER,
  subject_id INTEGER,
  ca_scores JSONB,          -- Corrected from NUMERIC[] to JSONB
  exam_score NUMERIC,
  class_score NUMERIC,
  total_score NUMERIC,
  grade TEXT,
  remark TEXT,
  is_submitted BOOLEAN,
  term TEXT,
  academic_year TEXT,
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
    s.subject_id,
    s.ca_scores,
    s.exam_score,
    s.class_score,
    s.total_score,
    s.grade,
    s.remark,
    s.is_submitted,
    s.term,
    s.academic_year,
    s.created_at,
    s.updated_at
  FROM 
    public.report_scores s
  JOIN
    public.report_learners l ON s.learner_id = l.id
  WHERE 
    substring(regexp_replace(COALESCE(l.guardian_contact_1, ''), '[^0-9]', '', 'g') from '([0-9]{9})$') = v_clean_contact
    OR substring(regexp_replace(COALESCE(l.guardian_contact_2, ''), '[^0-9]', '', 'g') from '([0-9]{9})$') = v_clean_contact;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Force schema reload cache notification
NOTIFY pgrst, 'reload schema';
