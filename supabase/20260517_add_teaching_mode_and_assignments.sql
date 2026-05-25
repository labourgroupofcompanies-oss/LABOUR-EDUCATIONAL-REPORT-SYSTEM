-- ================================================================
-- Migration to add teaching_mode to classes and create teacher assignments table
-- Run this in the Supabase SQL Editor
-- ================================================================

-- ── 1. ADD TEACHING_MODE TO CLASSES ─────────────────────────────
ALTER TABLE public.report_classes 
  ADD COLUMN IF NOT EXISTS teaching_mode TEXT NOT NULL DEFAULT 'class_teacher'
  CHECK (teaching_mode IN ('class_teacher', 'subject_teacher'));

-- ── 2. CREATE TEACHER ASSIGNMENTS TABLE ─────────────────────────
CREATE TABLE IF NOT EXISTS public.report_teacher_assignments (
  id            SERIAL PRIMARY KEY,
  school_id     TEXT NOT NULL REFERENCES public.report_schools(id) ON DELETE CASCADE,
  teacher_id    UUID NOT NULL REFERENCES public.report_profiles(id) ON DELETE CASCADE,
  class_id      INTEGER NOT NULL REFERENCES public.report_classes(id) ON DELETE CASCADE,
  subject_id    INTEGER REFERENCES public.report_subjects(id) ON DELETE CASCADE, -- NULL means they teach all subjects in the class (Class Teacher)
  term_id       INTEGER, -- Option for term-specific assignments (can be NULL)
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Index for faster queries
CREATE INDEX IF NOT EXISTS idx_teacher_assignments_school 
  ON public.report_teacher_assignments (school_id);
CREATE INDEX IF NOT EXISTS idx_teacher_assignments_teacher 
  ON public.report_teacher_assignments (teacher_id);
CREATE INDEX IF NOT EXISTS idx_teacher_assignments_class 
  ON public.report_teacher_assignments (class_id);

-- Enforce unique assignments (a teacher can only be assigned to a specific class-subject once)
ALTER TABLE public.report_teacher_assignments
  DROP CONSTRAINT IF EXISTS unique_teacher_class_subject_assignment,
  ADD CONSTRAINT unique_teacher_class_subject_assignment UNIQUE NULLS NOT DISTINCT (school_id, teacher_id, class_id, subject_id);

-- ── 3. ROW LEVEL SECURITY (RLS) ─────────────────────────────────
ALTER TABLE public.report_teacher_assignments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "report_teacher_assignments_select_own" ON public.report_teacher_assignments;
DROP POLICY IF EXISTS "report_teacher_assignments_insert_own" ON public.report_teacher_assignments;
DROP POLICY IF EXISTS "report_teacher_assignments_update_own" ON public.report_teacher_assignments;
DROP POLICY IF EXISTS "report_teacher_assignments_delete_own" ON public.report_teacher_assignments;

CREATE POLICY "report_teacher_assignments_select_own"
  ON public.report_teacher_assignments FOR SELECT
  USING (school_id = COALESCE(
    auth.jwt() ->> 'school_id',
    auth.jwt() -> 'user_metadata' ->> 'school_id'
  ));

CREATE POLICY "report_teacher_assignments_insert_own"
  ON public.report_teacher_assignments FOR INSERT
  WITH CHECK (school_id = COALESCE(
    auth.jwt() ->> 'school_id',
    auth.jwt() -> 'user_metadata' ->> 'school_id'
  ));

CREATE POLICY "report_teacher_assignments_update_own"
  ON public.report_teacher_assignments FOR UPDATE
  USING (school_id = COALESCE(
    auth.jwt() ->> 'school_id',
    auth.jwt() -> 'user_metadata' ->> 'school_id'
  ));

CREATE POLICY "report_teacher_assignments_delete_own"
  ON public.report_teacher_assignments FOR DELETE
  USING (school_id = COALESCE(
    auth.jwt() ->> 'school_id',
    auth.jwt() -> 'user_metadata' ->> 'school_id'
  ));
