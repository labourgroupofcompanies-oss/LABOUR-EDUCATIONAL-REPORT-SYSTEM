-- ================================================================
-- Migration to establish report_class_subjects table for linking subjects to classes
-- Run this in the Supabase SQL Editor
-- ================================================================

CREATE TABLE IF NOT EXISTS public.report_class_subjects (
  id            SERIAL PRIMARY KEY,
  school_id     TEXT NOT NULL REFERENCES public.report_schools(id) ON DELETE CASCADE,
  class_id      INTEGER NOT NULL REFERENCES public.report_classes(id) ON DELETE CASCADE,
  subject_id    INTEGER NOT NULL REFERENCES public.report_subjects(id) ON DELETE CASCADE,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Indexing for high-performance joins
CREATE INDEX IF NOT EXISTS idx_class_subjects_school 
  ON public.report_class_subjects (school_id);
CREATE INDEX IF NOT EXISTS idx_class_subjects_class 
  ON public.report_class_subjects (class_id);
CREATE INDEX IF NOT EXISTS idx_class_subjects_subject 
  ON public.report_class_subjects (subject_id);

-- Prevent duplicate assignments of the same subject to the same class
ALTER TABLE public.report_class_subjects
  DROP CONSTRAINT IF EXISTS unique_class_subject_combination,
  ADD CONSTRAINT unique_class_subject_combination UNIQUE (school_id, class_id, subject_id);

-- ── ROW LEVEL SECURITY (RLS) ─────────────────────────────────────
ALTER TABLE public.report_class_subjects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "report_class_subjects_select_own" ON public.report_class_subjects;
DROP POLICY IF EXISTS "report_class_subjects_insert_own" ON public.report_class_subjects;
DROP POLICY IF EXISTS "report_class_subjects_update_own" ON public.report_class_subjects;
DROP POLICY IF EXISTS "report_class_subjects_delete_own" ON public.report_class_subjects;

CREATE POLICY "report_class_subjects_select_own"
  ON public.report_class_subjects FOR SELECT
  USING (school_id = COALESCE(
    auth.jwt() ->> 'school_id',
    auth.jwt() -> 'user_metadata' ->> 'school_id'
  ));

CREATE POLICY "report_class_subjects_insert_own"
  ON public.report_class_subjects FOR INSERT
  WITH CHECK (school_id = COALESCE(
    auth.jwt() ->> 'school_id',
    auth.jwt() -> 'user_metadata' ->> 'school_id'
  ));

CREATE POLICY "report_class_subjects_update_own"
  ON public.report_class_subjects FOR UPDATE
  USING (school_id = COALESCE(
    auth.jwt() ->> 'school_id',
    auth.jwt() -> 'user_metadata' ->> 'school_id'
  ));

CREATE POLICY "report_class_subjects_delete_own"
  ON public.report_class_subjects FOR DELETE
  USING (school_id = COALESCE(
    auth.jwt() ->> 'school_id',
    auth.jwt() -> 'user_metadata' ->> 'school_id'
  ));
