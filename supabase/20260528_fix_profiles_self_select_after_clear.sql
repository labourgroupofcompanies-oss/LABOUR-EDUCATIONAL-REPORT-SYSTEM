-- ================================================================
-- Fix: Allow users to always SELECT their own row in report_profiles
--
-- Problem: The SELECT policy requires school_id in the JWT to match
-- the row's school_id. When a user clears browser storage and logs in
-- fresh, there is a race window where the JWT may not yet have school_id
-- refreshed in its claims — causing the profile query to return 0 rows.
-- This makes the app incorrectly report "invalid credentials".
--
-- Fix: Allow `id = auth.uid()` as an additional OR clause so a user can
-- ALWAYS read their own profile row, regardless of JWT metadata state.
-- ================================================================

DROP POLICY IF EXISTS "report_profiles_select_own_school" ON public.report_profiles;

CREATE POLICY "report_profiles_select_own_school"
  ON public.report_profiles FOR SELECT
  USING (
    -- Allow read if school_id matches JWT school claim (normal case)
    school_id = COALESCE(
      auth.jwt() ->> 'school_id',
      auth.jwt() -> 'user_metadata' ->> 'school_id',
      auth.jwt() -> 'app_metadata' ->> 'school_id'
    )
    OR
    -- Always allow a user to read their own profile row (fixes cleared-storage login)
    id = auth.uid()
  );
