-- ================================================================
-- Fix Staff Foreign Key Constraints and Portal Activation
-- Run this in your Supabase SQL Editor (SQL Editor -> New Query -> Run)
-- ================================================================

-- 1. Remove the strict auth.users reference on report_profiles(id)
-- This allows pre-registered teachers to exist as profiles BEFORE they sign up/claim their accounts.
ALTER TABLE public.report_profiles 
  DROP CONSTRAINT IF EXISTS report_profiles_id_fkey;

-- 2. Drop and recreate the assignment foreign key to support ON UPDATE CASCADE
-- This allows automatic cascading of the profile ID when a teacher claims/activates their account.
ALTER TABLE public.report_teacher_assignments 
  DROP CONSTRAINT IF EXISTS report_teacher_assignments_teacher_id_fkey;

ALTER TABLE public.report_teacher_assignments
  ADD CONSTRAINT report_teacher_assignments_teacher_id_fkey
  FOREIGN KEY (teacher_id) REFERENCES public.report_profiles(id) 
  ON DELETE CASCADE 
  ON UPDATE CASCADE;

-- 3. Ensure the is_claimed column exists in report_profiles
ALTER TABLE public.report_profiles 
  ADD COLUMN IF NOT EXISTS is_claimed BOOLEAN DEFAULT FALSE;

-- 4. Re-create the portal activation secure function in the correct logical order
CREATE OR REPLACE FUNCTION public.activate_teacher_account(
  teacher_email TEXT,
  teacher_password TEXT
) RETURNS UUID AS $$
DECLARE
  new_user_id UUID;
  old_temp_id UUID;
  v_school_id TEXT;
  profile_exists BOOLEAN;
  already_claimed BOOLEAN;
BEGIN
  -- Check if teacher profile exists
  SELECT EXISTS(
    SELECT 1 FROM public.report_profiles WHERE LOWER(TRIM(email)) = LOWER(TRIM(teacher_email))
  ) INTO profile_exists;

  IF NOT profile_exists THEN
    RAISE EXCEPTION 'No teacher registry found matching email %. Please contact your school administrator.', teacher_email;
  END IF;

  -- Check if already claimed and get school_id
  SELECT COALESCE(is_claimed, FALSE), id, school_id INTO already_claimed, old_temp_id, v_school_id
  FROM public.report_profiles 
  WHERE LOWER(TRIM(email)) = LOWER(TRIM(teacher_email)) 
  LIMIT 1;

  IF already_claimed THEN
    RAISE EXCEPTION 'This teacher portal has already been activated. Please log in directly.';
  END IF;

  -- 1. Insert teacher account directly into auth.users (email_confirmed_at is set to NOW() to skip email verification)
  INSERT INTO auth.users (
    instance_id,
    id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    raw_app_meta_data,
    raw_user_meta_data,
    created_at,
    updated_at,
    confirmation_token,
    recovery_token,
    email_change_token_new,
    email_change
  ) VALUES (
    '00000000-0000-0000-0000-000000000000',
    gen_random_uuid(),
    'authenticated',
    'authenticated',
    LOWER(TRIM(teacher_email)),
    extensions.crypt(teacher_password, extensions.gen_salt('bf')),
    NOW(), -- Auto-confirms email instantly!
    '{"provider":"email","providers":["email"]}',
    jsonb_build_object('role', 'teacher', 'school_id', v_school_id),
    NOW(),
    NOW(),
    '',
    '',
    '',
    ''
  ) RETURNING id INTO new_user_id;

  -- 2. Bind Auth Identity to allow standard email/password logins
  INSERT INTO auth.identities (
    id,
    provider_id,
    user_id,
    identity_data,
    provider,
    last_sign_in_at,
    created_at,
    updated_at
  ) VALUES (
    new_user_id,
    new_user_id, -- provider_id is same as identity id (user_id as text) for email provider
    new_user_id,
    jsonb_build_object('sub', new_user_id, 'email', LOWER(TRIM(teacher_email))),
    'email',
    NOW(),
    NOW(),
    NOW()
  );

  -- 3. Update the profile with the new Auth ID and set is_claimed = TRUE
  -- This will automatically CASCADE the ID change to report_teacher_assignments table due to ON UPDATE CASCADE!
  UPDATE public.report_profiles 
  SET id = new_user_id, 
      is_claimed = TRUE 
  WHERE id = old_temp_id;

  RETURN new_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
