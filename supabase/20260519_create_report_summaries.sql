-- ================================================================
-- Migration to support School Profile details and Term Summaries
-- Run this in your Supabase SQL Editor
-- ================================================================

-- 1. Add School Profile & Term settings columns to report_schools
ALTER TABLE public.report_schools
  ADD COLUMN IF NOT EXISTS motto TEXT,
  ADD COLUMN IF NOT EXISTS logo_url TEXT,
  ADD COLUMN IF NOT EXISTS current_academic_year TEXT,
  ADD COLUMN IF NOT EXISTS current_term TEXT,
  ADD COLUMN IF NOT EXISTS vacation_date TEXT,
  ADD COLUMN IF NOT EXISTS next_term_begins TEXT;

-- 2. Create public.report_summaries table
CREATE TABLE IF NOT EXISTS public.report_summaries (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id           TEXT NOT NULL REFERENCES public.report_schools(id) ON DELETE CASCADE,
  learner_id          UUID NOT NULL REFERENCES public.report_learners(id) ON DELETE CASCADE,
  class_id            INTEGER NOT NULL REFERENCES public.report_classes(id) ON DELETE CASCADE,
  academic_year       TEXT NOT NULL,
  term                TEXT NOT NULL,
  attendance_present  INTEGER DEFAULT 0,
  attendance_total    INTEGER DEFAULT 0,
  conduct             TEXT,
  attitude            TEXT,
  teacher_remark      TEXT,
  headteacher_remark  TEXT,
  promoted_to         TEXT,
  next_term_begins    TEXT,
  fees_owed           TEXT,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

-- Unique constraint: A student can only have one report card summary per academic year & term
ALTER TABLE public.report_summaries
  DROP CONSTRAINT IF EXISTS report_summaries_learner_term_unique;
ALTER TABLE public.report_summaries
  ADD CONSTRAINT report_summaries_learner_term_unique UNIQUE (school_id, learner_id, academic_year, term);

-- Indices for performance
CREATE INDEX IF NOT EXISTS idx_report_summaries_school ON public.report_summaries (school_id);
CREATE INDEX IF NOT EXISTS idx_report_summaries_learner ON public.report_summaries (learner_id);
CREATE INDEX IF NOT EXISTS idx_report_summaries_class ON public.report_summaries (class_id);

-- Enable Row Level Security (RLS)
ALTER TABLE public.report_summaries ENABLE ROW LEVEL SECURITY;

-- 3. Row Level Security Policies

-- SELECT Policy
-- Headteachers can read all reports for their school.
-- Class Teachers can read reports only for the classes they advise (assigned where subject_id is null).
CREATE POLICY "report_summaries_select"
  ON public.report_summaries FOR SELECT
  USING (
    school_id = (auth.jwt() ->> 'school_id')
    AND (
      -- Check if user is headteacher (super_admin)
      EXISTS (
        SELECT 1 FROM public.report_profiles
        WHERE id = auth.uid() AND role = 'super_admin'
      )
      OR 
      -- Check if user is the assigned Class Teacher for this class
      EXISTS (
        SELECT 1 FROM public.report_teacher_assignments
        WHERE teacher_id = auth.uid()
          AND class_id = report_summaries.class_id
          AND subject_id IS NULL
      )
    )
  );

-- INSERT Policy
CREATE POLICY "report_summaries_insert"
  ON public.report_summaries FOR INSERT
  WITH CHECK (
    school_id = (auth.jwt() ->> 'school_id')
    AND (
      -- Check if user is headteacher (super_admin)
      EXISTS (
        SELECT 1 FROM public.report_profiles
        WHERE id = auth.uid() AND role = 'super_admin'
      )
      OR
      -- Check if user is the assigned Class Teacher for this class
      EXISTS (
        SELECT 1 FROM public.report_teacher_assignments
        WHERE teacher_id = auth.uid()
          AND class_id = report_summaries.class_id
          AND subject_id IS NULL
      )
    )
  );

-- UPDATE Policy
CREATE POLICY "report_summaries_update"
  ON public.report_summaries FOR UPDATE
  USING (
    school_id = (auth.jwt() ->> 'school_id')
    AND (
      -- Check if user is headteacher (super_admin)
      EXISTS (
        SELECT 1 FROM public.report_profiles
        WHERE id = auth.uid() AND role = 'super_admin'
      )
      OR
      -- Check if user is the assigned Class Teacher for this class
      EXISTS (
        SELECT 1 FROM public.report_teacher_assignments
        WHERE teacher_id = auth.uid()
          AND class_id = report_summaries.class_id
          AND subject_id IS NULL
      )
    )
  );

-- DELETE Policy
CREATE POLICY "report_summaries_delete"
  ON public.report_summaries FOR DELETE
  USING (
    school_id = (auth.jwt() ->> 'school_id')
    AND (
      -- Only headteachers can delete reports
      EXISTS (
        SELECT 1 FROM public.report_profiles
        WHERE id = auth.uid() AND role = 'super_admin'
      )
    )
  );

-- 4. Set up auto-update trigger for updated_at
CREATE OR REPLACE TRIGGER report_summaries_updated_at
  BEFORE UPDATE ON public.report_summaries
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
