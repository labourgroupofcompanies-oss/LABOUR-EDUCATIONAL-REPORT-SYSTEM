-- ================================================================
-- Migration to add is_claimed column and activate_teacher_account RPC
-- Allows teachers to activate/claim their portals with their own password
-- ================================================================

-- 1. Add is_claimed column to report_profiles if it doesn't exist
ALTER TABLE public.report_profiles 
ADD COLUMN IF NOT EXISTS is_claimed BOOLEAN DEFAULT FALSE;

-- 2. Create the unauthenticated verification function (Bypasses RLS safely)
CREATE OR REPLACE FUNCTION public.verify_unclaimed_teacher(
  teacher_email TEXT
) RETURNS JSONB AS $$
DECLARE
  result JSONB;
BEGIN
  SELECT jsonb_build_object(
    'id', id,
    'full_name', full_name,
    'staff_id', staff_id,
    'school_id', school_id,
    'email', email,
    'is_claimed', COALESCE(is_claimed, FALSE)
  ) INTO result
  FROM public.report_profiles
  WHERE LOWER(TRIM(email)) = LOWER(TRIM(teacher_email))
    AND role = 'teacher'
  LIMIT 1;

  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Create the portal activation secure function
CREATE OR REPLACE FUNCTION public.activate_teacher_account(
  teacher_email TEXT,
  teacher_password TEXT
) RETURNS UUID AS $$
DECLARE
  new_user_id UUID;
  old_temp_id UUID;
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

  -- Check if already claimed
  SELECT COALESCE(is_claimed, FALSE), id INTO already_claimed, old_temp_id 
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
    crypt(teacher_password, gen_salt('bf')),
    NOW(), -- Auto-confirms email instantly!
    '{"provider":"email","providers":["email"]}',
    '{"role":"teacher"}',
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
    user_id,
    identity_data,
    provider,
    last_sign_in_at,
    created_at,
    updated_at
  ) VALUES (
    new_user_id,
    new_user_id,
    jsonb_build_object('sub', new_user_id, 'email', LOWER(TRIM(teacher_email))),
    'email',
    NOW(),
    NOW(),
    NOW()
  );

  -- 3. Cascade Assignments to the new Auth ID
  UPDATE public.report_teacher_assignments 
  SET teacher_id = new_user_id 
  WHERE teacher_id = old_temp_id;

  -- 4. Update the profile with the new Auth ID and set is_claimed = TRUE
  UPDATE public.report_profiles 
  SET id = new_user_id, 
      is_claimed = TRUE 
  WHERE id = old_temp_id;

  RETURN new_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
