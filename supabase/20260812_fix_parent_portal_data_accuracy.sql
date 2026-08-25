-- Migration: 20260812_fix_parent_portal_data_accuracy.sql
-- Date: 2026-08-12
-- Description: Updates get_scores_by_guardian_contact to only return submitted scores
--              for terms where the report summary has been released.

DROP FUNCTION IF EXISTS public.get_scores_by_guardian_contact(TEXT);

CREATE OR REPLACE FUNCTION public.get_scores_by_guardian_contact(p_contact TEXT)
RETURNS TABLE (
  id BIGINT,
  school_id TEXT,
  learner_id UUID,
  class_id INTEGER,
  subject_id INTEGER,
  ca_scores JSONB,
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
    (substring(regexp_replace(COALESCE(l.guardian_contact_1, ''), '[^0-9]', '', 'g') from '([0-9]{9})$') = v_clean_contact
    OR substring(regexp_replace(COALESCE(l.guardian_contact_2, ''), '[^0-9]', '', 'g') from '([0-9]{9})$') = v_clean_contact)
    AND s.is_submitted = TRUE
    AND EXISTS (
      SELECT 1 FROM public.report_summaries rs 
      WHERE rs.learner_id = s.learner_id 
      AND rs.academic_year = s.academic_year 
      AND rs.term = s.term 
      AND rs.is_released = TRUE
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
