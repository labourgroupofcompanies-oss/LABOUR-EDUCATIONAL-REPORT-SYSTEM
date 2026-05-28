-- ================================================================
-- Fix: Allow super_admin to insert teacher profiles for their school
-- even when school_id is only in user_metadata (not app_metadata).
--
-- Root Cause: New school users who register teachers before the Dashboard
-- runs its self-heal (which sets school_id in auth metadata) would have
-- their inserts blocked by the strict RLS INSERT policy.
--
-- This migration makes the INSERT policy also accept auth.uid() matching
-- the existing profile id (for a user inserting their own profile), and
-- relaxes it for super_admin role checks via user_metadata.
-- ================================================================

-- Drop old INSERT policy
DROP POLICY IF EXISTS "report_profiles_insert_own_school" ON public.report_profiles;

-- New INSERT policy: allow insert if school_id matches ANY of:
--   1. Top-level JWT school_id claim (set after Dashboard self-heal)
--   2. user_metadata.school_id (always present after login)
--   3. app_metadata.school_id (may be set for some users)
CREATE POLICY "report_profiles_insert_own_school"
  ON public.report_profiles FOR INSERT
  WITH CHECK (
    school_id = COALESCE(
      auth.jwt() ->> 'school_id',
      auth.jwt() -> 'user_metadata' ->> 'school_id',
      auth.jwt() -> 'app_metadata' ->> 'school_id'
    )
    OR
    -- Also allow a user to insert their OWN profile row (self-insert)
    id = auth.uid()
  );

-- Drop old DELETE policy if exists and recreate to allow admin to delete any teacher in their school
DROP POLICY IF EXISTS "report_profiles_delete_own_school" ON public.report_profiles;
DROP POLICY IF EXISTS "profiles_delete_own" ON public.report_profiles;

CREATE POLICY "report_profiles_delete_own_school"
  ON public.report_profiles FOR DELETE
  USING (
    school_id = COALESCE(
      auth.jwt() ->> 'school_id',
      auth.jwt() -> 'user_metadata' ->> 'school_id',
      auth.jwt() -> 'app_metadata' ->> 'school_id'
    )
    OR
    -- Allow a user to delete their own row
    id = auth.uid()
  );

-- Also ensure UPDATE policy covers all three metadata locations
DROP POLICY IF EXISTS "report_profiles_update_own_school" ON public.report_profiles;

CREATE POLICY "report_profiles_update_own_school"
  ON public.report_profiles FOR UPDATE
  USING (
    school_id = COALESCE(
      auth.jwt() ->> 'school_id',
      auth.jwt() -> 'user_metadata' ->> 'school_id',
      auth.jwt() -> 'app_metadata' ->> 'school_id'
    )
    OR
    id = auth.uid()
  );
