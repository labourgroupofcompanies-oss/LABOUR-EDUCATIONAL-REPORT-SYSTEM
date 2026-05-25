-- ================================================================
-- FINAL FIX: report_summaries RLS policies
-- Fixes "new row violates row-level security policy" error
--
-- ROOT CAUSE: The old policies checked auth.jwt() ->> 'school_id'
-- but school_id is NOT stored in the Supabase JWT token.
-- It lives in the report_profiles table.
--
-- FIX: Look up school_id from report_profiles using auth.uid()
-- Run this in the Supabase SQL Editor
-- ================================================================

-- ── Step 1: Drop ALL existing report_summaries policies ──────────
DROP POLICY IF EXISTS "report_summaries_select"  ON public.report_summaries;
DROP POLICY IF EXISTS "report_summaries_insert"  ON public.report_summaries;
DROP POLICY IF EXISTS "report_summaries_update"  ON public.report_summaries;
DROP POLICY IF EXISTS "report_summaries_delete"  ON public.report_summaries;

-- ── Step 2: Recreate SELECT policy ───────────────────────────────
-- Headteachers see all reports for their school.
-- Class teachers see reports only for their assigned class.
CREATE POLICY "report_summaries_select"
  ON public.report_summaries FOR SELECT
  USING (
    school_id = (
      SELECT school_id FROM public.report_profiles WHERE id = auth.uid()
    )
    AND (
      -- Headteacher (super_admin) can read all
      EXISTS (
        SELECT 1 FROM public.report_profiles
        WHERE id = auth.uid() AND role = 'super_admin'
      )
      OR
      -- Class Teacher can read their class's reports
      EXISTS (
        SELECT 1 FROM public.report_teacher_assignments
        WHERE teacher_id = auth.uid()
          AND class_id = report_summaries.class_id
          AND subject_id IS NULL
      )
    )
  );

-- ── Step 3: Recreate INSERT policy ───────────────────────────────
-- Class teachers (and headteachers) can insert report summaries.
CREATE POLICY "report_summaries_insert"
  ON public.report_summaries FOR INSERT
  WITH CHECK (
    school_id = (
      SELECT school_id FROM public.report_profiles WHERE id = auth.uid()
    )
    AND (
      -- Headteacher (super_admin) can insert any
      EXISTS (
        SELECT 1 FROM public.report_profiles
        WHERE id = auth.uid() AND role = 'super_admin'
      )
      OR
      -- Class Teacher can insert for their assigned class
      EXISTS (
        SELECT 1 FROM public.report_teacher_assignments
        WHERE teacher_id = auth.uid()
          AND class_id = report_summaries.class_id
          AND subject_id IS NULL
      )
    )
  );

-- ── Step 4: Recreate UPDATE policy ───────────────────────────────
CREATE POLICY "report_summaries_update"
  ON public.report_summaries FOR UPDATE
  USING (
    school_id = (
      SELECT school_id FROM public.report_profiles WHERE id = auth.uid()
    )
    AND (
      -- Headteacher (super_admin) can update any
      EXISTS (
        SELECT 1 FROM public.report_profiles
        WHERE id = auth.uid() AND role = 'super_admin'
      )
      OR
      -- Class Teacher can update their class's reports
      EXISTS (
        SELECT 1 FROM public.report_teacher_assignments
        WHERE teacher_id = auth.uid()
          AND class_id = report_summaries.class_id
          AND subject_id IS NULL
      )
    )
  )
  WITH CHECK (
    school_id = (
      SELECT school_id FROM public.report_profiles WHERE id = auth.uid()
    )
  );

-- ── Step 5: Recreate DELETE policy ───────────────────────────────
-- Only headteachers can delete report summaries.
CREATE POLICY "report_summaries_delete"
  ON public.report_summaries FOR DELETE
  USING (
    school_id = (
      SELECT school_id FROM public.report_profiles WHERE id = auth.uid()
    )
    AND EXISTS (
      SELECT 1 FROM public.report_profiles
      WHERE id = auth.uid() AND role = 'super_admin'
    )
  );

-- ── Step 6: Also fix report_scores RLS the same way ──────────────
-- (report_scores may have the same JWT-based bug)
DROP POLICY IF EXISTS "report_scores_insert"  ON public.report_scores;
DROP POLICY IF EXISTS "report_scores_update"  ON public.report_scores;
DROP POLICY IF EXISTS "report_scores_select"  ON public.report_scores;
DROP POLICY IF EXISTS "report_scores_delete"  ON public.report_scores;

-- Scores: SELECT
CREATE POLICY "report_scores_select"
  ON public.report_scores FOR SELECT
  USING (
    school_id = (
      SELECT school_id FROM public.report_profiles WHERE id = auth.uid()
    )
  );

-- Scores: INSERT
CREATE POLICY "report_scores_insert"
  ON public.report_scores FOR INSERT
  WITH CHECK (
    school_id = (
      SELECT school_id FROM public.report_profiles WHERE id = auth.uid()
    )
  );

-- Scores: UPDATE
CREATE POLICY "report_scores_update"
  ON public.report_scores FOR UPDATE
  USING (
    school_id = (
      SELECT school_id FROM public.report_profiles WHERE id = auth.uid()
    )
  )
  WITH CHECK (
    school_id = (
      SELECT school_id FROM public.report_profiles WHERE id = auth.uid()
    )
  );

-- Scores: DELETE
CREATE POLICY "report_scores_delete"
  ON public.report_scores FOR DELETE
  USING (
    school_id = (
      SELECT school_id FROM public.report_profiles WHERE id = auth.uid()
    )
  );

-- ── Step 7: Add missing columns to report_scores (if not done yet) ─
ALTER TABLE public.report_scores
  ADD COLUMN IF NOT EXISTS academic_year TEXT,
  ADD COLUMN IF NOT EXISTS class_score   NUMERIC(5,2);

-- ── Step 8: Add next_term_bill to report_summaries (if not done yet) ─
ALTER TABLE public.report_summaries
  ADD COLUMN IF NOT EXISTS next_term_bill TEXT;

-- Done! All RLS policies now correctly identify users via
-- the report_profiles table rather than unreliable JWT claims.
