-- ================================================================
-- Fix Teacher RLS Metadata
-- Run this in the Supabase SQL Editor
-- ================================================================

-- 1. Update existing auth.users to have school_id in their metadata so RLS works
UPDATE auth.users
SET raw_user_meta_data = raw_user_meta_data || jsonb_build_object('school_id', rp.school_id)
FROM public.report_profiles rp
WHERE auth.users.id = rp.id
  AND rp.role = 'teacher'
  AND (auth.users.raw_user_meta_data->>'school_id') IS NULL;

-- 2. Update activate_teacher_account to correctly embed school_id
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

  -- 1. Insert teacher account directly into auth.users
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
    NOW(), 
    '{"provider":"email","providers":["email"]}',
    jsonb_build_object('role', 'teacher', 'school_id', v_school_id),
    NOW(),
    NOW(),
    '',
    '',
    '',
    ''
  ) RETURNING id INTO new_user_id;

  -- 2. Bind Auth Identity
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
    new_user_id, 
    new_user_id,
    jsonb_build_object('sub', new_user_id, 'email', LOWER(TRIM(teacher_email))),
    'email',
    NOW(),
    NOW(),
    NOW()
  );

  -- 3. Update the profile
  UPDATE public.report_profiles 
  SET id = new_user_id, 
      is_claimed = TRUE 
  WHERE id = old_temp_id;

  RETURN new_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Update create_teacher_user to embed school_id (and omit confirmed_at)
CREATE OR REPLACE FUNCTION public.create_teacher_user(
  teacher_email TEXT,
  teacher_password TEXT,
  teacher_name TEXT,
  teacher_staff_id TEXT,
  school_id_val TEXT
) RETURNS UUID AS $$
DECLARE
  new_user_id UUID;
BEGIN
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
    teacher_email,
    extensions.crypt(teacher_password, extensions.gen_salt('bf')),
    NOW(), 
    '{"provider":"email","providers":["email"]}',
    jsonb_build_object('full_name', teacher_name, 'role', 'teacher', 'school_id', school_id_val),
    NOW(),
    NOW(),
    '',
    '',
    '',
    ''
  ) RETURNING id INTO new_user_id;

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
    new_user_id,
    new_user_id,
    jsonb_build_object('sub', new_user_id, 'email', teacher_email),
    'email',
    NOW(),
    NOW(),
    NOW()
  );

  INSERT INTO public.report_profiles (
    id,
    school_id,
    full_name,
    role,
    staff_id,
    email
  ) VALUES (
    new_user_id,
    school_id_val,
    teacher_name,
    'teacher',
    teacher_staff_id,
    teacher_email
  );

  RETURN new_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
