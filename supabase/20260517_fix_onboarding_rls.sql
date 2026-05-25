-- ================================================================
-- Fix Onboarding RLS Policy Violation
-- Run this in the Supabase SQL Editor
-- ================================================================

-- This function bypasses Row Level Security (SECURITY DEFINER)
-- to allow new schools and admin profiles to be created atomically
-- during the onboarding process when the user does not yet have 
-- full permissions set in their JWT token.

CREATE OR REPLACE FUNCTION public.register_school_and_admin(
  p_school_id TEXT,
  p_school_name TEXT,
  p_location TEXT,
  p_district TEXT,
  p_region TEXT,
  p_circuit TEXT,
  p_admin_id UUID,
  p_full_name TEXT,
  p_email TEXT,
  p_staff_id TEXT
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- 1. Insert School
  INSERT INTO public.report_schools (id, name, location, district, region, circuit)
  VALUES (p_school_id, p_school_name, p_location, p_district, p_region, p_circuit);

  -- 2. Insert Admin Profile
  INSERT INTO public.report_profiles (id, school_id, full_name, email, role, staff_id)
  VALUES (p_admin_id, p_school_id, p_full_name, p_email, 'super_admin', p_staff_id);
END;
$$;
