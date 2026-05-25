-- ================================================================
-- Fix All Users RLS Metadata (Including Headteachers / Admin)
-- Run this in the Supabase SQL Editor to fix 42501 errors
-- ================================================================

UPDATE auth.users
SET raw_user_meta_data = raw_user_meta_data || jsonb_build_object('school_id', rp.school_id)
FROM public.report_profiles rp
WHERE auth.users.id = rp.id
  AND (auth.users.raw_user_meta_data->>'school_id') IS NULL;
