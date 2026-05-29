-- ================================================================
-- MASTER RLS FIX — Labour Edu Report System
-- Date: 2026-05-29
--
-- ROOT CAUSE: All original policies use auth.jwt() ->> 'school_id'
-- which only works if the custom_access_token_hook is active in
-- Supabase Auth settings. Without it, school_id lives only in
-- user_metadata and the top-level claim is always NULL → every
-- INSERT/UPDATE/DELETE fails with "violates row-level security".
--
-- FIX STRATEGY:
--   1. Create helper functions to reliably extract school_id and
--      role from JWT regardless of where they are stored.
--   2. Rewrite ALL policies on ALL tables to use these helpers.
--   3. Add self-access rules (id = auth.uid()) so users can always
--      access their own rows even before metadata is refreshed.
--   4. Keep strict multi-tenancy: School A can NEVER see School B.
--
-- HOW TO USE:
--   Copy this entire file into Supabase SQL Editor → Run All
-- ================================================================


-- ================================================================
-- PART 1: HELPER FUNCTIONS
-- Extract school_id and role reliably from ANY JWT structure.
-- Checks user_metadata first (always populated on login), then
-- the top-level claim (set by hook if configured), then app_metadata.
-- ================================================================

CREATE OR REPLACE FUNCTION public.jwt_school_id()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    auth.jwt() -> 'user_metadata' ->> 'school_id',
    auth.jwt() ->> 'school_id',
    auth.jwt() -> 'app_metadata' ->> 'school_id'
  );
$$;

CREATE OR REPLACE FUNCTION public.jwt_role()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    auth.jwt() -> 'user_metadata' ->> 'role',
    auth.jwt() ->> 'role',
    auth.jwt() -> 'app_metadata' ->> 'role'
  );
$$;

-- Grant usage to authenticated users
GRANT EXECUTE ON FUNCTION public.jwt_school_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.jwt_role() TO authenticated;


-- ================================================================
-- PART 2: ENHANCED custom_access_token_hook
-- Injects school_id AND role into the JWT top-level claims so
-- the old policies also work. Register this in:
-- Supabase Dashboard → Authentication → Hooks → Custom Access Token
-- ================================================================

CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  claims      JSONB;
  v_school_id TEXT;
  v_role      TEXT;
  v_user_id   UUID;
BEGIN
  claims     := event -> 'claims';
  v_user_id  := (event ->> 'user_id')::UUID;

  -- First try report_profiles (main staff table)
  SELECT school_id, role INTO v_school_id, v_role
    FROM public.report_profiles
   WHERE id = v_user_id
   LIMIT 1;

  -- Inject into top-level JWT claims
  IF v_school_id IS NOT NULL THEN
    claims := jsonb_set(claims, '{school_id}', to_jsonb(v_school_id));
  END IF;

  IF v_role IS NOT NULL THEN
    claims := jsonb_set(claims, '{user_role}', to_jsonb(v_role));
  END IF;

  RETURN jsonb_set(event, '{claims}', claims);
EXCEPTION WHEN OTHERS THEN
  -- Never block login even if hook fails
  RETURN event;
END;
$$;

GRANT EXECUTE ON FUNCTION public.custom_access_token_hook TO supabase_auth_admin;
REVOKE EXECUTE ON FUNCTION public.custom_access_token_hook FROM PUBLIC;
GRANT SELECT ON public.report_profiles TO supabase_auth_admin;


-- ================================================================
-- PART 3: report_schools
-- ================================================================
DROP POLICY IF EXISTS "report_schools_select_own"            ON public.report_schools;
DROP POLICY IF EXISTS "report_schools_insert_own"            ON public.report_schools;
DROP POLICY IF EXISTS "report_schools_update_own"            ON public.report_schools;
DROP POLICY IF EXISTS "report_schools_delete_own"            ON public.report_schools;

-- Any authenticated user can SELECT their own school's row
CREATE POLICY "report_schools_select_own"
  ON public.report_schools FOR SELECT
  USING (id = public.jwt_school_id());

-- Only super_admin can update school details
CREATE POLICY "report_schools_update_own"
  ON public.report_schools FOR UPDATE
  USING (
    id = public.jwt_school_id()
    AND public.jwt_role() = 'super_admin'
  );

-- INSERT handled by SECURITY DEFINER RPC (register_school_and_admin)
-- No direct INSERT policy needed for normal users


-- ================================================================
-- PART 4: report_profiles  (staff: super_admin + teachers)
-- ================================================================
DROP POLICY IF EXISTS "report_profiles_select_own_school"   ON public.report_profiles;
DROP POLICY IF EXISTS "report_profiles_insert_own_school"   ON public.report_profiles;
DROP POLICY IF EXISTS "report_profiles_update_own_school"   ON public.report_profiles;
DROP POLICY IF EXISTS "report_profiles_delete_own_school"   ON public.report_profiles;
DROP POLICY IF EXISTS "profiles_delete_own"                 ON public.report_profiles;

-- SELECT: see all profiles in your school OR your own row
CREATE POLICY "report_profiles_select_own_school"
  ON public.report_profiles FOR SELECT
  USING (
    school_id = public.jwt_school_id()
    OR id = auth.uid()
  );

-- INSERT: super_admin inserts teachers for their school
--         Also allow self-insert (id = auth.uid()) for onboarding via RPC
CREATE POLICY "report_profiles_insert_own_school"
  ON public.report_profiles FOR INSERT
  WITH CHECK (
    school_id = public.jwt_school_id()
    OR id = auth.uid()
  );

-- UPDATE: super_admin updates any profile in school; teachers update own row
CREATE POLICY "report_profiles_update_own_school"
  ON public.report_profiles FOR UPDATE
  USING (
    school_id = public.jwt_school_id()
    OR id = auth.uid()
  );

-- DELETE: super_admin deletes teachers; users can delete own row
CREATE POLICY "report_profiles_delete_own_school"
  ON public.report_profiles FOR DELETE
  USING (
    school_id = public.jwt_school_id()
    OR id = auth.uid()
  );


-- ================================================================
-- PART 5: report_classes
-- ================================================================
DROP POLICY IF EXISTS "report_classes_select_own_school"    ON public.report_classes;
DROP POLICY IF EXISTS "report_classes_insert_own_school"    ON public.report_classes;
DROP POLICY IF EXISTS "report_classes_update_own_school"    ON public.report_classes;
DROP POLICY IF EXISTS "report_classes_delete_own_school"    ON public.report_classes;

-- All authenticated school members can SELECT classes
CREATE POLICY "report_classes_select_own_school"
  ON public.report_classes FOR SELECT
  USING (school_id = public.jwt_school_id());

-- Only super_admin can CREATE classes
CREATE POLICY "report_classes_insert_own_school"
  ON public.report_classes FOR INSERT
  WITH CHECK (
    school_id = public.jwt_school_id()
    AND public.jwt_role() = 'super_admin'
  );

-- Only super_admin can UPDATE classes
CREATE POLICY "report_classes_update_own_school"
  ON public.report_classes FOR UPDATE
  USING (
    school_id = public.jwt_school_id()
    AND public.jwt_role() = 'super_admin'
  );

-- Only super_admin can DELETE classes
CREATE POLICY "report_classes_delete_own_school"
  ON public.report_classes FOR DELETE
  USING (
    school_id = public.jwt_school_id()
    AND public.jwt_role() = 'super_admin'
  );


-- ================================================================
-- PART 6: report_subjects
-- ================================================================
DROP POLICY IF EXISTS "report_subjects_select_own_school"   ON public.report_subjects;
DROP POLICY IF EXISTS "report_subjects_insert_own_school"   ON public.report_subjects;
DROP POLICY IF EXISTS "report_subjects_update_own_school"   ON public.report_subjects;
DROP POLICY IF EXISTS "report_subjects_delete_own_school"   ON public.report_subjects;

CREATE POLICY "report_subjects_select_own_school"
  ON public.report_subjects FOR SELECT
  USING (school_id = public.jwt_school_id());

CREATE POLICY "report_subjects_insert_own_school"
  ON public.report_subjects FOR INSERT
  WITH CHECK (
    school_id = public.jwt_school_id()
    AND public.jwt_role() = 'super_admin'
  );

CREATE POLICY "report_subjects_update_own_school"
  ON public.report_subjects FOR UPDATE
  USING (
    school_id = public.jwt_school_id()
    AND public.jwt_role() = 'super_admin'
  );

CREATE POLICY "report_subjects_delete_own_school"
  ON public.report_subjects FOR DELETE
  USING (
    school_id = public.jwt_school_id()
    AND public.jwt_role() = 'super_admin'
  );


-- ================================================================
-- PART 7: report_class_subjects
-- ================================================================
DROP POLICY IF EXISTS "report_class_subjects_select"        ON public.report_class_subjects;
DROP POLICY IF EXISTS "report_class_subjects_insert"        ON public.report_class_subjects;
DROP POLICY IF EXISTS "report_class_subjects_update"        ON public.report_class_subjects;
DROP POLICY IF EXISTS "report_class_subjects_delete"        ON public.report_class_subjects;
-- Also drop any older policy names that might exist
DROP POLICY IF EXISTS "class_subjects_select_own_school"    ON public.report_class_subjects;
DROP POLICY IF EXISTS "class_subjects_insert_own_school"    ON public.report_class_subjects;
DROP POLICY IF EXISTS "class_subjects_delete_own_school"    ON public.report_class_subjects;

CREATE POLICY "report_class_subjects_select"
  ON public.report_class_subjects FOR SELECT
  USING (school_id = public.jwt_school_id());

CREATE POLICY "report_class_subjects_insert"
  ON public.report_class_subjects FOR INSERT
  WITH CHECK (
    school_id = public.jwt_school_id()
    AND public.jwt_role() = 'super_admin'
  );

CREATE POLICY "report_class_subjects_update"
  ON public.report_class_subjects FOR UPDATE
  USING (
    school_id = public.jwt_school_id()
    AND public.jwt_role() = 'super_admin'
  );

CREATE POLICY "report_class_subjects_delete"
  ON public.report_class_subjects FOR DELETE
  USING (
    school_id = public.jwt_school_id()
    AND public.jwt_role() = 'super_admin'
  );


-- ================================================================
-- PART 8: report_teacher_assignments
-- ================================================================
DROP POLICY IF EXISTS "report_teacher_assignments_select"   ON public.report_teacher_assignments;
DROP POLICY IF EXISTS "report_teacher_assignments_insert"   ON public.report_teacher_assignments;
DROP POLICY IF EXISTS "report_teacher_assignments_update"   ON public.report_teacher_assignments;
DROP POLICY IF EXISTS "report_teacher_assignments_delete"   ON public.report_teacher_assignments;
DROP POLICY IF EXISTS "teacher_assignments_select_own_school" ON public.report_teacher_assignments;
DROP POLICY IF EXISTS "teacher_assignments_insert_own_school" ON public.report_teacher_assignments;
DROP POLICY IF EXISTS "teacher_assignments_delete_own_school" ON public.report_teacher_assignments;

-- All school members can SELECT assignments (teachers need this to know their classes)
CREATE POLICY "report_teacher_assignments_select"
  ON public.report_teacher_assignments FOR SELECT
  USING (school_id = public.jwt_school_id());

-- Only super_admin assigns teachers to classes
CREATE POLICY "report_teacher_assignments_insert"
  ON public.report_teacher_assignments FOR INSERT
  WITH CHECK (
    school_id = public.jwt_school_id()
    AND public.jwt_role() = 'super_admin'
  );

CREATE POLICY "report_teacher_assignments_update"
  ON public.report_teacher_assignments FOR UPDATE
  USING (
    school_id = public.jwt_school_id()
    AND public.jwt_role() = 'super_admin'
  );

CREATE POLICY "report_teacher_assignments_delete"
  ON public.report_teacher_assignments FOR DELETE
  USING (
    school_id = public.jwt_school_id()
    AND public.jwt_role() = 'super_admin'
  );


-- ================================================================
-- PART 9: report_learners
-- ================================================================
DROP POLICY IF EXISTS "report_learners_select_own_school"   ON public.report_learners;
DROP POLICY IF EXISTS "report_learners_insert_own_school"   ON public.report_learners;
DROP POLICY IF EXISTS "report_learners_update_own_school"   ON public.report_learners;
DROP POLICY IF EXISTS "report_learners_delete_own_school"   ON public.report_learners;

-- All school members can SELECT learners
CREATE POLICY "report_learners_select_own_school"
  ON public.report_learners FOR SELECT
  USING (school_id = public.jwt_school_id());

-- super_admin and teachers can INSERT learners
CREATE POLICY "report_learners_insert_own_school"
  ON public.report_learners FOR INSERT
  WITH CHECK (
    school_id = public.jwt_school_id()
    AND public.jwt_role() IN ('super_admin', 'teacher')
  );

-- super_admin and teachers can UPDATE learners
CREATE POLICY "report_learners_update_own_school"
  ON public.report_learners FOR UPDATE
  USING (
    school_id = public.jwt_school_id()
    AND public.jwt_role() IN ('super_admin', 'teacher')
  );

-- Only super_admin can DELETE learners
CREATE POLICY "report_learners_delete_own_school"
  ON public.report_learners FOR DELETE
  USING (
    school_id = public.jwt_school_id()
    AND public.jwt_role() = 'super_admin'
  );


-- ================================================================
-- PART 10: report_scores
-- ================================================================
DROP POLICY IF EXISTS "report_scores_select_own_school"     ON public.report_scores;
DROP POLICY IF EXISTS "report_scores_insert_own_school"     ON public.report_scores;
DROP POLICY IF EXISTS "report_scores_update_own_school"     ON public.report_scores;
DROP POLICY IF EXISTS "report_scores_delete_own_school"     ON public.report_scores;

-- All school members can SELECT scores
CREATE POLICY "report_scores_select_own_school"
  ON public.report_scores FOR SELECT
  USING (school_id = public.jwt_school_id());

-- Both teachers and super_admin can enter scores
CREATE POLICY "report_scores_insert_own_school"
  ON public.report_scores FOR INSERT
  WITH CHECK (
    school_id = public.jwt_school_id()
    AND public.jwt_role() IN ('super_admin', 'teacher')
  );

-- Both can update scores
CREATE POLICY "report_scores_update_own_school"
  ON public.report_scores FOR UPDATE
  USING (
    school_id = public.jwt_school_id()
    AND public.jwt_role() IN ('super_admin', 'teacher')
  );

-- Both can delete scores (e.g. re-entry corrections)
CREATE POLICY "report_scores_delete_own_school"
  ON public.report_scores FOR DELETE
  USING (
    school_id = public.jwt_school_id()
    AND public.jwt_role() IN ('super_admin', 'teacher')
  );


-- ================================================================
-- PART 11: report_settings
-- ================================================================
DROP POLICY IF EXISTS "report_settings_select_own_school"   ON public.report_settings;
DROP POLICY IF EXISTS "report_settings_upsert_own_school"   ON public.report_settings;
DROP POLICY IF EXISTS "report_settings_insert_own_school"   ON public.report_settings;
DROP POLICY IF EXISTS "report_settings_update_own_school"   ON public.report_settings;

-- All school members can read settings (needed for score calculation)
CREATE POLICY "report_settings_select_own_school"
  ON public.report_settings FOR SELECT
  USING (school_id = public.jwt_school_id());

-- Only super_admin can create or update settings
CREATE POLICY "report_settings_insert_own_school"
  ON public.report_settings FOR INSERT
  WITH CHECK (
    school_id = public.jwt_school_id()
    AND public.jwt_role() = 'super_admin'
  );

CREATE POLICY "report_settings_update_own_school"
  ON public.report_settings FOR UPDATE
  USING (
    school_id = public.jwt_school_id()
    AND public.jwt_role() = 'super_admin'
  );


-- ================================================================
-- PART 12: report_summaries  (report card summaries)
-- ================================================================
DROP POLICY IF EXISTS "report_summaries_select_own_school"  ON public.report_summaries;
DROP POLICY IF EXISTS "report_summaries_insert_own_school"  ON public.report_summaries;
DROP POLICY IF EXISTS "report_summaries_update_own_school"  ON public.report_summaries;
DROP POLICY IF EXISTS "report_summaries_delete_own_school"  ON public.report_summaries;
DROP POLICY IF EXISTS "summaries_select_own_school"         ON public.report_summaries;
DROP POLICY IF EXISTS "summaries_insert_own_school"         ON public.report_summaries;
DROP POLICY IF EXISTS "summaries_update_own_school"         ON public.report_summaries;
DROP POLICY IF EXISTS "summaries_delete_own_school"         ON public.report_summaries;

-- All school members can SELECT summaries
CREATE POLICY "report_summaries_select_own_school"
  ON public.report_summaries FOR SELECT
  USING (school_id = public.jwt_school_id());

-- Both teachers and super_admin can INSERT summaries
CREATE POLICY "report_summaries_insert_own_school"
  ON public.report_summaries FOR INSERT
  WITH CHECK (
    school_id = public.jwt_school_id()
    AND public.jwt_role() IN ('super_admin', 'teacher')
  );

-- Both can UPDATE summaries
CREATE POLICY "report_summaries_update_own_school"
  ON public.report_summaries FOR UPDATE
  USING (
    school_id = public.jwt_school_id()
    AND public.jwt_role() IN ('super_admin', 'teacher')
  );

-- Only super_admin can DELETE summaries
CREATE POLICY "report_summaries_delete_own_school"
  ON public.report_summaries FOR DELETE
  USING (
    school_id = public.jwt_school_id()
    AND public.jwt_role() = 'super_admin'
  );


-- ================================================================
-- PART 13: report_messages  (parent-school communication)
-- These use SECURITY DEFINER RPCs so policies stay open for RPCs
-- but authenticated school members can also query directly.
-- ================================================================
DROP POLICY IF EXISTS "messages_public_select"              ON public.report_messages;
DROP POLICY IF EXISTS "messages_public_insert"              ON public.report_messages;
DROP POLICY IF EXISTS "messages_public_update"              ON public.report_messages;

-- School staff can select their school's messages
CREATE POLICY "messages_school_select"
  ON public.report_messages FOR SELECT
  USING (
    school_id = public.jwt_school_id()
    OR auth.role() = 'anon'   -- Allow anon for parent-side RPC access
  );

-- School staff (head_teacher) can insert messages; anon for parent replies via RPC
CREATE POLICY "messages_school_insert"
  ON public.report_messages FOR INSERT
  WITH CHECK (
    school_id = public.jwt_school_id()
    OR auth.role() = 'anon'
  );

-- School staff can mark messages as read
CREATE POLICY "messages_school_update"
  ON public.report_messages FOR UPDATE
  USING (
    school_id = public.jwt_school_id()
    OR auth.role() = 'anon'
  );


-- ================================================================
-- PART 14: report_notifications  (broadcast & targeted alerts)
-- ================================================================
DROP POLICY IF EXISTS "notifs_public_select"                ON public.report_notifications;
DROP POLICY IF EXISTS "notifs_admin_all"                    ON public.report_notifications;

-- School staff and parents (anon, via RPC) can SELECT notifications
CREATE POLICY "notifications_select"
  ON public.report_notifications FOR SELECT
  USING (
    school_id = public.jwt_school_id()
    OR auth.role() = 'anon'
  );

-- Only super_admin can send notifications
CREATE POLICY "notifications_insert"
  ON public.report_notifications FOR INSERT
  WITH CHECK (
    school_id = public.jwt_school_id()
    AND public.jwt_role() = 'super_admin'
  );

-- Only super_admin can update notifications
CREATE POLICY "notifications_update"
  ON public.report_notifications FOR UPDATE
  USING (
    school_id = public.jwt_school_id()
    AND public.jwt_role() = 'super_admin'
  );

-- Only super_admin can delete notifications
CREATE POLICY "notifications_delete"
  ON public.report_notifications FOR DELETE
  USING (
    school_id = public.jwt_school_id()
    AND public.jwt_role() = 'super_admin'
  );


-- ================================================================
-- PART 15: Storage buckets
-- ================================================================

-- school-logos bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('school-logos', 'school-logos', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "school_logos_select"  ON storage.objects;
DROP POLICY IF EXISTS "school_logos_insert"  ON storage.objects;
DROP POLICY IF EXISTS "school_logos_update"  ON storage.objects;
DROP POLICY IF EXISTS "school_logos_delete"  ON storage.objects;

CREATE POLICY "school_logos_select"
  ON storage.objects FOR SELECT TO public
  USING (bucket_id = 'school-logos');

CREATE POLICY "school_logos_insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'school-logos');

CREATE POLICY "school_logos_update"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'school-logos');

CREATE POLICY "school_logos_delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'school-logos');

-- learner-photos bucket
DROP POLICY IF EXISTS "learner_photos_insert" ON storage.objects;
DROP POLICY IF EXISTS "learner_photos_select" ON storage.objects;
DROP POLICY IF EXISTS "learner_photos_update" ON storage.objects;
DROP POLICY IF EXISTS "learner_photos_delete" ON storage.objects;

CREATE POLICY "learner_photos_select"
  ON storage.objects FOR SELECT TO public
  USING (bucket_id = 'learner-photos');

CREATE POLICY "learner_photos_insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'learner-photos');

CREATE POLICY "learner_photos_update"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'learner-photos');

CREATE POLICY "learner_photos_delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'learner-photos');


-- ================================================================
-- PART 16: Verify setup
-- Run these queries to confirm everything is correct:
-- ================================================================
--
-- SELECT proname, prosecdef FROM pg_proc
-- WHERE proname IN ('jwt_school_id', 'jwt_role', 'custom_access_token_hook');
--
-- SELECT schemaname, tablename, policyname, cmd, qual
-- FROM pg_policies
-- WHERE schemaname = 'public'
-- ORDER BY tablename, cmd;
--
-- ================================================================
