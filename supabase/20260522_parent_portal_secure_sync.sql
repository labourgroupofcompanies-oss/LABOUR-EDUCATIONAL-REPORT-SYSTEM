-- Migration: Parent Portal Secure Sync and Public Metadata Select
-- Date: 2026-05-22

-- 1. Create secure SECURITY DEFINER RPC to get scores by guardian contact
CREATE OR REPLACE FUNCTION public.get_scores_by_guardian_contact(p_contact TEXT)
RETURNS TABLE (
  id BIGINT,
  school_id TEXT,
  learner_id UUID,
  class_id INTEGER,
  subject_id INTEGER,
  ca_scores NUMERIC[],
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

-- 2. Create secure SECURITY DEFINER RPC to get summaries by guardian contact
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

-- 3. Recreate SELECT policies for metadata tables to allow public/anonymous SELECT

-- A. Schools Table
DROP POLICY IF EXISTS "report_schools_select_own_school" ON public.report_schools;
CREATE POLICY "report_schools_select_public" ON public.report_schools FOR SELECT USING (true);

-- B. Settings Table
DROP POLICY IF EXISTS "report_settings_all_own_school" ON public.report_settings;
CREATE POLICY "report_settings_write_own" ON public.report_settings FOR ALL USING (
  school_id = COALESCE(auth.jwt() ->> 'school_id', auth.jwt() -> 'user_metadata' ->> 'school_id')
);
CREATE POLICY "report_settings_select_public" ON public.report_settings FOR SELECT USING (true);

-- C. Classes Table
DROP POLICY IF EXISTS "report_classes_select_own_school" ON public.report_classes;
CREATE POLICY "report_classes_select_public" ON public.report_classes FOR SELECT USING (true);

-- D. Subjects Table
DROP POLICY IF EXISTS "report_subjects_select_own_school" ON public.report_subjects;
CREATE POLICY "report_subjects_select_public" ON public.report_subjects FOR SELECT USING (true);

-- E. Class-Subjects Table
DROP POLICY IF EXISTS "report_class_subjects_select_own" ON public.report_class_subjects;
CREATE POLICY "report_class_subjects_select_public" ON public.report_class_subjects FOR SELECT USING (true);
