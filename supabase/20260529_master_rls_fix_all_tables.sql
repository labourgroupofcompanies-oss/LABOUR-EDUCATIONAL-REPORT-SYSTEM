-- Labour Edu Report System - Master RLS Fix (2026-05-29)
-- Run this entire file in Supabase SQL Editor

-- PART 1: Helper functions to read school_id and role from JWT user_metadata
-- (works even without the custom_access_token_hook configured)

CREATE OR REPLACE FUNCTION public.jwt_school_id()
RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(
    auth.jwt() -> 'user_metadata' ->> 'school_id',
    auth.jwt() ->> 'school_id',
    auth.jwt() -> 'app_metadata' ->> 'school_id'
  );
$$;

CREATE OR REPLACE FUNCTION public.jwt_role()
RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(
    auth.jwt() -> 'user_metadata' ->> 'role',
    auth.jwt() ->> 'role',
    auth.jwt() -> 'app_metadata' ->> 'role'
  );
$$;

GRANT EXECUTE ON FUNCTION public.jwt_school_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.jwt_role() TO authenticated;

-- PART 2: Enhanced custom_access_token_hook
-- Register this in: Supabase Dashboard > Authentication > Hooks > Custom Access Token

CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event JSONB)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  claims      JSONB;
  v_school_id TEXT;
  v_role      TEXT;
  v_user_id   UUID;
BEGIN
  claims    := event -> 'claims';
  v_user_id := (event ->> 'user_id')::UUID;
  SELECT school_id, role INTO v_school_id, v_role
    FROM public.report_profiles WHERE id = v_user_id LIMIT 1;
  IF v_school_id IS NOT NULL THEN
    claims := jsonb_set(claims, '{school_id}', to_jsonb(v_school_id));
  END IF;
  IF v_role IS NOT NULL THEN
    claims := jsonb_set(claims, '{user_role}', to_jsonb(v_role));
  END IF;
  RETURN jsonb_set(event, '{claims}', claims);
EXCEPTION WHEN OTHERS THEN
  RETURN event;
END;
$$;

GRANT EXECUTE ON FUNCTION public.custom_access_token_hook TO supabase_auth_admin;
REVOKE EXECUTE ON FUNCTION public.custom_access_token_hook FROM PUBLIC;
GRANT SELECT ON public.report_profiles TO supabase_auth_admin;

-- PART 3: report_schools

DROP POLICY IF EXISTS "report_schools_select_own" ON public.report_schools;
DROP POLICY IF EXISTS "report_schools_insert_own" ON public.report_schools;
DROP POLICY IF EXISTS "report_schools_update_own" ON public.report_schools;
DROP POLICY IF EXISTS "report_schools_delete_own" ON public.report_schools;

CREATE POLICY "report_schools_select_own"
  ON public.report_schools FOR SELECT
  USING (id = public.jwt_school_id());

CREATE POLICY "report_schools_update_own"
  ON public.report_schools FOR UPDATE
  USING (id = public.jwt_school_id() AND public.jwt_role() = 'super_admin');

-- PART 4: report_profiles

DROP POLICY IF EXISTS "report_profiles_select_own_school" ON public.report_profiles;
DROP POLICY IF EXISTS "report_profiles_insert_own_school" ON public.report_profiles;
DROP POLICY IF EXISTS "report_profiles_update_own_school" ON public.report_profiles;
DROP POLICY IF EXISTS "report_profiles_delete_own_school" ON public.report_profiles;
DROP POLICY IF EXISTS "profiles_delete_own"               ON public.report_profiles;

CREATE POLICY "report_profiles_select_own_school"
  ON public.report_profiles FOR SELECT
  USING (school_id = public.jwt_school_id() OR id = auth.uid());

CREATE POLICY "report_profiles_insert_own_school"
  ON public.report_profiles FOR INSERT
  WITH CHECK (school_id = public.jwt_school_id() OR id = auth.uid());

CREATE POLICY "report_profiles_update_own_school"
  ON public.report_profiles FOR UPDATE
  USING (school_id = public.jwt_school_id() OR id = auth.uid());

CREATE POLICY "report_profiles_delete_own_school"
  ON public.report_profiles FOR DELETE
  USING (school_id = public.jwt_school_id() OR id = auth.uid());

-- PART 5: report_classes

DROP POLICY IF EXISTS "report_classes_select_own_school" ON public.report_classes;
DROP POLICY IF EXISTS "report_classes_insert_own_school" ON public.report_classes;
DROP POLICY IF EXISTS "report_classes_update_own_school" ON public.report_classes;
DROP POLICY IF EXISTS "report_classes_delete_own_school" ON public.report_classes;

CREATE POLICY "report_classes_select_own_school"
  ON public.report_classes FOR SELECT
  USING (school_id = public.jwt_school_id());

CREATE POLICY "report_classes_insert_own_school"
  ON public.report_classes FOR INSERT
  WITH CHECK (school_id = public.jwt_school_id() AND public.jwt_role() = 'super_admin');

CREATE POLICY "report_classes_update_own_school"
  ON public.report_classes FOR UPDATE
  USING (school_id = public.jwt_school_id() AND public.jwt_role() = 'super_admin');

CREATE POLICY "report_classes_delete_own_school"
  ON public.report_classes FOR DELETE
  USING (school_id = public.jwt_school_id() AND public.jwt_role() = 'super_admin');

-- PART 6: report_subjects

DROP POLICY IF EXISTS "report_subjects_select_own_school" ON public.report_subjects;
DROP POLICY IF EXISTS "report_subjects_insert_own_school" ON public.report_subjects;
DROP POLICY IF EXISTS "report_subjects_update_own_school" ON public.report_subjects;
DROP POLICY IF EXISTS "report_subjects_delete_own_school" ON public.report_subjects;

CREATE POLICY "report_subjects_select_own_school"
  ON public.report_subjects FOR SELECT
  USING (school_id = public.jwt_school_id());

CREATE POLICY "report_subjects_insert_own_school"
  ON public.report_subjects FOR INSERT
  WITH CHECK (school_id = public.jwt_school_id() AND public.jwt_role() = 'super_admin');

CREATE POLICY "report_subjects_update_own_school"
  ON public.report_subjects FOR UPDATE
  USING (school_id = public.jwt_school_id() AND public.jwt_role() = 'super_admin');

CREATE POLICY "report_subjects_delete_own_school"
  ON public.report_subjects FOR DELETE
  USING (school_id = public.jwt_school_id() AND public.jwt_role() = 'super_admin');

-- PART 7: report_class_subjects

DROP POLICY IF EXISTS "report_class_subjects_select"     ON public.report_class_subjects;
DROP POLICY IF EXISTS "report_class_subjects_insert"     ON public.report_class_subjects;
DROP POLICY IF EXISTS "report_class_subjects_update"     ON public.report_class_subjects;
DROP POLICY IF EXISTS "report_class_subjects_delete"     ON public.report_class_subjects;
DROP POLICY IF EXISTS "class_subjects_select_own_school" ON public.report_class_subjects;
DROP POLICY IF EXISTS "class_subjects_insert_own_school" ON public.report_class_subjects;
DROP POLICY IF EXISTS "class_subjects_delete_own_school" ON public.report_class_subjects;

CREATE POLICY "report_class_subjects_select"
  ON public.report_class_subjects FOR SELECT
  USING (school_id = public.jwt_school_id());

CREATE POLICY "report_class_subjects_insert"
  ON public.report_class_subjects FOR INSERT
  WITH CHECK (school_id = public.jwt_school_id() AND public.jwt_role() = 'super_admin');

CREATE POLICY "report_class_subjects_update"
  ON public.report_class_subjects FOR UPDATE
  USING (school_id = public.jwt_school_id() AND public.jwt_role() = 'super_admin');

CREATE POLICY "report_class_subjects_delete"
  ON public.report_class_subjects FOR DELETE
  USING (school_id = public.jwt_school_id() AND public.jwt_role() = 'super_admin');

-- PART 8: report_teacher_assignments

DROP POLICY IF EXISTS "report_teacher_assignments_select"    ON public.report_teacher_assignments;
DROP POLICY IF EXISTS "report_teacher_assignments_insert"    ON public.report_teacher_assignments;
DROP POLICY IF EXISTS "report_teacher_assignments_update"    ON public.report_teacher_assignments;
DROP POLICY IF EXISTS "report_teacher_assignments_delete"    ON public.report_teacher_assignments;
DROP POLICY IF EXISTS "teacher_assignments_select_own_school" ON public.report_teacher_assignments;
DROP POLICY IF EXISTS "teacher_assignments_insert_own_school" ON public.report_teacher_assignments;
DROP POLICY IF EXISTS "teacher_assignments_delete_own_school" ON public.report_teacher_assignments;

CREATE POLICY "report_teacher_assignments_select"
  ON public.report_teacher_assignments FOR SELECT
  USING (school_id = public.jwt_school_id());

CREATE POLICY "report_teacher_assignments_insert"
  ON public.report_teacher_assignments FOR INSERT
  WITH CHECK (school_id = public.jwt_school_id() AND public.jwt_role() = 'super_admin');

CREATE POLICY "report_teacher_assignments_update"
  ON public.report_teacher_assignments FOR UPDATE
  USING (school_id = public.jwt_school_id() AND public.jwt_role() = 'super_admin');

CREATE POLICY "report_teacher_assignments_delete"
  ON public.report_teacher_assignments FOR DELETE
  USING (school_id = public.jwt_school_id() AND public.jwt_role() = 'super_admin');

-- PART 9: report_learners

DROP POLICY IF EXISTS "report_learners_select_own_school" ON public.report_learners;
DROP POLICY IF EXISTS "report_learners_insert_own_school" ON public.report_learners;
DROP POLICY IF EXISTS "report_learners_update_own_school" ON public.report_learners;
DROP POLICY IF EXISTS "report_learners_delete_own_school" ON public.report_learners;

CREATE POLICY "report_learners_select_own_school"
  ON public.report_learners FOR SELECT
  USING (school_id = public.jwt_school_id());

CREATE POLICY "report_learners_insert_own_school"
  ON public.report_learners FOR INSERT
  WITH CHECK (school_id = public.jwt_school_id() AND public.jwt_role() IN ('super_admin', 'teacher'));

CREATE POLICY "report_learners_update_own_school"
  ON public.report_learners FOR UPDATE
  USING (school_id = public.jwt_school_id() AND public.jwt_role() IN ('super_admin', 'teacher'));

CREATE POLICY "report_learners_delete_own_school"
  ON public.report_learners FOR DELETE
  USING (school_id = public.jwt_school_id() AND public.jwt_role() = 'super_admin');

-- PART 10: report_scores

DROP POLICY IF EXISTS "report_scores_select_own_school" ON public.report_scores;
DROP POLICY IF EXISTS "report_scores_insert_own_school" ON public.report_scores;
DROP POLICY IF EXISTS "report_scores_update_own_school" ON public.report_scores;
DROP POLICY IF EXISTS "report_scores_delete_own_school" ON public.report_scores;

CREATE POLICY "report_scores_select_own_school"
  ON public.report_scores FOR SELECT
  USING (school_id = public.jwt_school_id());

CREATE POLICY "report_scores_insert_own_school"
  ON public.report_scores FOR INSERT
  WITH CHECK (school_id = public.jwt_school_id() AND public.jwt_role() IN ('super_admin', 'teacher'));

CREATE POLICY "report_scores_update_own_school"
  ON public.report_scores FOR UPDATE
  USING (school_id = public.jwt_school_id() AND public.jwt_role() IN ('super_admin', 'teacher'));

CREATE POLICY "report_scores_delete_own_school"
  ON public.report_scores FOR DELETE
  USING (school_id = public.jwt_school_id() AND public.jwt_role() IN ('super_admin', 'teacher'));

-- PART 11: report_settings

DROP POLICY IF EXISTS "report_settings_select_own_school" ON public.report_settings;
DROP POLICY IF EXISTS "report_settings_upsert_own_school" ON public.report_settings;
DROP POLICY IF EXISTS "report_settings_insert_own_school" ON public.report_settings;
DROP POLICY IF EXISTS "report_settings_update_own_school" ON public.report_settings;

CREATE POLICY "report_settings_select_own_school"
  ON public.report_settings FOR SELECT
  USING (school_id = public.jwt_school_id());

CREATE POLICY "report_settings_insert_own_school"
  ON public.report_settings FOR INSERT
  WITH CHECK (school_id = public.jwt_school_id() AND public.jwt_role() = 'super_admin');

CREATE POLICY "report_settings_update_own_school"
  ON public.report_settings FOR UPDATE
  USING (school_id = public.jwt_school_id() AND public.jwt_role() = 'super_admin');

-- PART 12: report_summaries

DROP POLICY IF EXISTS "report_summaries_select_own_school" ON public.report_summaries;
DROP POLICY IF EXISTS "report_summaries_insert_own_school" ON public.report_summaries;
DROP POLICY IF EXISTS "report_summaries_update_own_school" ON public.report_summaries;
DROP POLICY IF EXISTS "report_summaries_delete_own_school" ON public.report_summaries;
DROP POLICY IF EXISTS "summaries_select_own_school"        ON public.report_summaries;
DROP POLICY IF EXISTS "summaries_insert_own_school"        ON public.report_summaries;
DROP POLICY IF EXISTS "summaries_update_own_school"        ON public.report_summaries;
DROP POLICY IF EXISTS "summaries_delete_own_school"        ON public.report_summaries;

CREATE POLICY "report_summaries_select_own_school"
  ON public.report_summaries FOR SELECT
  USING (school_id = public.jwt_school_id());

CREATE POLICY "report_summaries_insert_own_school"
  ON public.report_summaries FOR INSERT
  WITH CHECK (school_id = public.jwt_school_id() AND public.jwt_role() IN ('super_admin', 'teacher'));

CREATE POLICY "report_summaries_update_own_school"
  ON public.report_summaries FOR UPDATE
  USING (school_id = public.jwt_school_id() AND public.jwt_role() IN ('super_admin', 'teacher'));

CREATE POLICY "report_summaries_delete_own_school"
  ON public.report_summaries FOR DELETE
  USING (school_id = public.jwt_school_id() AND public.jwt_role() = 'super_admin');

-- PART 13: report_messages

DROP POLICY IF EXISTS "messages_public_select"  ON public.report_messages;
DROP POLICY IF EXISTS "messages_public_insert"  ON public.report_messages;
DROP POLICY IF EXISTS "messages_public_update"  ON public.report_messages;
DROP POLICY IF EXISTS "messages_school_select"  ON public.report_messages;
DROP POLICY IF EXISTS "messages_school_insert"  ON public.report_messages;
DROP POLICY IF EXISTS "messages_school_update"  ON public.report_messages;

CREATE POLICY "messages_school_select"
  ON public.report_messages FOR SELECT
  USING (school_id = public.jwt_school_id() OR auth.role() = 'anon');

CREATE POLICY "messages_school_insert"
  ON public.report_messages FOR INSERT
  WITH CHECK (school_id = public.jwt_school_id() OR auth.role() = 'anon');

CREATE POLICY "messages_school_update"
  ON public.report_messages FOR UPDATE
  USING (school_id = public.jwt_school_id() OR auth.role() = 'anon');

-- PART 14: report_notifications

DROP POLICY IF EXISTS "notifs_public_select"   ON public.report_notifications;
DROP POLICY IF EXISTS "notifs_admin_all"       ON public.report_notifications;
DROP POLICY IF EXISTS "notifications_select"   ON public.report_notifications;
DROP POLICY IF EXISTS "notifications_insert"   ON public.report_notifications;
DROP POLICY IF EXISTS "notifications_update"   ON public.report_notifications;
DROP POLICY IF EXISTS "notifications_delete"   ON public.report_notifications;

CREATE POLICY "notifications_select"
  ON public.report_notifications FOR SELECT
  USING (school_id = public.jwt_school_id() OR auth.role() = 'anon');

CREATE POLICY "notifications_insert"
  ON public.report_notifications FOR INSERT
  WITH CHECK (school_id = public.jwt_school_id() AND public.jwt_role() = 'super_admin');

CREATE POLICY "notifications_update"
  ON public.report_notifications FOR UPDATE
  USING (school_id = public.jwt_school_id() AND public.jwt_role() = 'super_admin');

CREATE POLICY "notifications_delete"
  ON public.report_notifications FOR DELETE
  USING (school_id = public.jwt_school_id() AND public.jwt_role() = 'super_admin');

-- PART 15: Storage buckets

INSERT INTO storage.buckets (id, name, public)
VALUES ('school-logos', 'school-logos', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "school_logos_select" ON storage.objects;
DROP POLICY IF EXISTS "school_logos_insert" ON storage.objects;
DROP POLICY IF EXISTS "school_logos_update" ON storage.objects;
DROP POLICY IF EXISTS "school_logos_delete" ON storage.objects;

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

DROP POLICY IF EXISTS "learner_photos_select" ON storage.objects;
DROP POLICY IF EXISTS "learner_photos_insert" ON storage.objects;
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
