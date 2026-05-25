-- Drop all existing policies on report_settings
DROP POLICY IF EXISTS "report_settings_select_own_school" ON public.report_settings;
DROP POLICY IF EXISTS "report_settings_upsert_own_school" ON public.report_settings;
DROP POLICY IF EXISTS "report_settings_update_own_school" ON public.report_settings;
DROP POLICY IF EXISTS "report_settings_insert_own_school" ON public.report_settings;
DROP POLICY IF EXISTS "report_settings_all_own_school" ON public.report_settings;

-- Create a single, unified policy that allows full CRUD access to the school's settings
CREATE POLICY "report_settings_all_own_school"
  ON public.report_settings
  FOR ALL
  USING (
    school_id = COALESCE(auth.jwt() ->> 'school_id', auth.jwt() -> 'user_metadata' ->> 'school_id')
  )
  WITH CHECK (
    school_id = COALESCE(auth.jwt() ->> 'school_id', auth.jwt() -> 'user_metadata' ->> 'school_id')
  );
