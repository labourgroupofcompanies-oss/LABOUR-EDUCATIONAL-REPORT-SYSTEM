-- ================================================================
-- Migration to upgrade RLS policies to be hook-independent and recursion-free
-- Run this in the Supabase SQL Editor
-- ================================================================

-- ── 1. REPORT_SCHOOLS ────────────────────────────────────────────
DROP POLICY IF EXISTS "report_schools_select_own" ON public.report_schools;

CREATE POLICY "report_schools_select_own"
  ON public.report_schools FOR SELECT
  USING (id = COALESCE(
    auth.jwt() ->> 'school_id',
    auth.jwt() -> 'user_metadata' ->> 'school_id'
  ));

-- ── 2. REPORT_PROFILES ───────────────────────────────────────────
DROP POLICY IF EXISTS "report_profiles_select_own_school" ON public.report_profiles;
DROP POLICY IF EXISTS "report_profiles_insert_own_school" ON public.report_profiles;
DROP POLICY IF EXISTS "report_profiles_update_own_school" ON public.report_profiles;

CREATE POLICY "report_profiles_select_own_school"
  ON public.report_profiles FOR SELECT
  USING (school_id = COALESCE(
    auth.jwt() ->> 'school_id',
    auth.jwt() -> 'user_metadata' ->> 'school_id'
  ));

CREATE POLICY "report_profiles_insert_own_school"
  ON public.report_profiles FOR INSERT
  WITH CHECK (school_id = COALESCE(
    auth.jwt() ->> 'school_id',
    auth.jwt() -> 'user_metadata' ->> 'school_id'
  ));

CREATE POLICY "report_profiles_update_own_school"
  ON public.report_profiles FOR UPDATE
  USING (school_id = COALESCE(
    auth.jwt() ->> 'school_id',
    auth.jwt() -> 'user_metadata' ->> 'school_id'
  ));

-- ── 3. REPORT_CLASSES ────────────────────────────────────────────
DROP POLICY IF EXISTS "report_classes_select_own_school" ON public.report_classes;
DROP POLICY IF EXISTS "report_classes_insert_own_school" ON public.report_classes;
DROP POLICY IF EXISTS "report_classes_update_own_school" ON public.report_classes;
DROP POLICY IF EXISTS "report_classes_delete_own_school" ON public.report_classes;

CREATE POLICY "report_classes_select_own_school"
  ON public.report_classes FOR SELECT
  USING (school_id = COALESCE(
    auth.jwt() ->> 'school_id',
    auth.jwt() -> 'user_metadata' ->> 'school_id'
  ));

CREATE POLICY "report_classes_insert_own_school"
  ON public.report_classes FOR INSERT
  WITH CHECK (school_id = COALESCE(
    auth.jwt() ->> 'school_id',
    auth.jwt() -> 'user_metadata' ->> 'school_id'
  ));

CREATE POLICY "report_classes_update_own_school"
  ON public.report_classes FOR UPDATE
  USING (school_id = COALESCE(
    auth.jwt() ->> 'school_id',
    auth.jwt() -> 'user_metadata' ->> 'school_id'
  ));

CREATE POLICY "report_classes_delete_own_school"
  ON public.report_classes FOR DELETE
  USING (school_id = COALESCE(
    auth.jwt() ->> 'school_id',
    auth.jwt() -> 'user_metadata' ->> 'school_id'
  ));

-- ── 4. REPORT_LEARNERS ───────────────────────────────────────────
DROP POLICY IF EXISTS "report_learners_select_own_school" ON public.report_learners;
DROP POLICY IF EXISTS "report_learners_insert_own_school" ON public.report_learners;
DROP POLICY IF EXISTS "report_learners_update_own_school" ON public.report_learners;
DROP POLICY IF EXISTS "report_learners_delete_own_school" ON public.report_learners;

CREATE POLICY "report_learners_select_own_school"
  ON public.report_learners FOR SELECT
  USING (school_id = COALESCE(
    auth.jwt() ->> 'school_id',
    auth.jwt() -> 'user_metadata' ->> 'school_id'
  ));

CREATE POLICY "report_learners_insert_own_school"
  ON public.report_learners FOR INSERT
  WITH CHECK (school_id = COALESCE(
    auth.jwt() ->> 'school_id',
    auth.jwt() -> 'user_metadata' ->> 'school_id'
  ));

CREATE POLICY "report_learners_update_own_school"
  ON public.report_learners FOR UPDATE
  USING (school_id = COALESCE(
    auth.jwt() ->> 'school_id',
    auth.jwt() -> 'user_metadata' ->> 'school_id'
  ));

CREATE POLICY "report_learners_delete_own_school"
  ON public.report_learners FOR DELETE
  USING (school_id = COALESCE(
    auth.jwt() ->> 'school_id',
    auth.jwt() -> 'user_metadata' ->> 'school_id'
  ));

-- ── 5. REPORT_SUBJECTS ───────────────────────────────────────────
DROP POLICY IF EXISTS "report_subjects_select_own_school" ON public.report_subjects;
DROP POLICY IF EXISTS "report_subjects_insert_own_school" ON public.report_subjects;
DROP POLICY IF EXISTS "report_subjects_update_own_school" ON public.report_subjects;
DROP POLICY IF EXISTS "report_subjects_delete_own_school" ON public.report_subjects;

CREATE POLICY "report_subjects_select_own_school"
  ON public.report_subjects FOR SELECT
  USING (school_id = COALESCE(
    auth.jwt() ->> 'school_id',
    auth.jwt() -> 'user_metadata' ->> 'school_id'
  ));

CREATE POLICY "report_subjects_insert_own_school"
  ON public.report_subjects FOR INSERT
  WITH CHECK (school_id = COALESCE(
    auth.jwt() ->> 'school_id',
    auth.jwt() -> 'user_metadata' ->> 'school_id'
  ));

CREATE POLICY "report_subjects_update_own_school"
  ON public.report_subjects FOR UPDATE
  USING (school_id = COALESCE(
    auth.jwt() ->> 'school_id',
    auth.jwt() -> 'user_metadata' ->> 'school_id'
  ));

CREATE POLICY "report_subjects_delete_own_school"
  ON public.report_subjects FOR DELETE
  USING (school_id = COALESCE(
    auth.jwt() ->> 'school_id',
    auth.jwt() -> 'user_metadata' ->> 'school_id'
  ));

-- ── 6. REPORT_SCORES ─────────────────────────────────────────────
DROP POLICY IF EXISTS "report_scores_select_own_school" ON public.report_scores;
DROP POLICY IF EXISTS "report_scores_insert_own_school" ON public.report_scores;
DROP POLICY IF EXISTS "report_scores_update_own_school" ON public.report_scores;
DROP POLICY IF EXISTS "report_scores_delete_own_school" ON public.report_scores;

CREATE POLICY "report_scores_select_own_school"
  ON public.report_scores FOR SELECT
  USING (school_id = COALESCE(
    auth.jwt() ->> 'school_id',
    auth.jwt() -> 'user_metadata' ->> 'school_id'
  ));

CREATE POLICY "report_scores_insert_own_school"
  ON public.report_scores FOR INSERT
  WITH CHECK (school_id = COALESCE(
    auth.jwt() ->> 'school_id',
    auth.jwt() -> 'user_metadata' ->> 'school_id'
  ));

CREATE POLICY "report_scores_update_own_school"
  ON public.report_scores FOR UPDATE
  USING (school_id = COALESCE(
    auth.jwt() ->> 'school_id',
    auth.jwt() -> 'user_metadata' ->> 'school_id'
  ));

CREATE POLICY "report_scores_delete_own_school"
  ON public.report_scores FOR DELETE
  USING (school_id = COALESCE(
    auth.jwt() ->> 'school_id',
    auth.jwt() -> 'user_metadata' ->> 'school_id'
  ));

-- ── 7. REPORT_SETTINGS ───────────────────────────────────────────
DROP POLICY IF EXISTS "report_settings_select_own_school" ON public.report_settings;
DROP POLICY IF EXISTS "report_settings_upsert_own_school" ON public.report_settings;
DROP POLICY IF EXISTS "report_settings_update_own_school" ON public.report_settings;

CREATE POLICY "report_settings_select_own_school"
  ON public.report_settings FOR SELECT
  USING (school_id = COALESCE(
    auth.jwt() ->> 'school_id',
    auth.jwt() -> 'user_metadata' ->> 'school_id'
  ));

CREATE POLICY "report_settings_upsert_own_school"
  ON public.report_settings FOR INSERT
  WITH CHECK (school_id = COALESCE(
    auth.jwt() ->> 'school_id',
    auth.jwt() -> 'user_metadata' ->> 'school_id'
  ));

CREATE POLICY "report_settings_update_own_school"
  ON public.report_settings FOR UPDATE
  USING (school_id = COALESCE(
    auth.jwt() ->> 'school_id',
    auth.jwt() -> 'user_metadata' ->> 'school_id'
  ));
