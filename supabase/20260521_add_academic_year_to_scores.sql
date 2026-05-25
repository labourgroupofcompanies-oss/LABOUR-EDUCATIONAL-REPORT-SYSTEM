-- ================================================================
-- Migration: Add missing columns and update report_summaries RLS
-- Run this in the Supabase SQL Editor
-- ================================================================

-- 1. Add missing academic_year and class_score columns to report_scores
ALTER TABLE public.report_scores
  ADD COLUMN IF NOT EXISTS academic_year TEXT,
  ADD COLUMN IF NOT EXISTS class_score NUMERIC(5,2);

-- 2. Recreate INSERT policy for report_summaries to allow headteachers (super_admin)
DROP POLICY IF EXISTS "report_summaries_insert" ON public.report_summaries;
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

-- 3. Recreate UPDATE policy for report_summaries to allow headteachers (super_admin)
DROP POLICY IF EXISTS "report_summaries_update" ON public.report_summaries;
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
