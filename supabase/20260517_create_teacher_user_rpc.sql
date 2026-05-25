-- ================================================================
-- Migration to establish create_teacher_user RPC function 
-- Creates a teacher in auth.users, pre-confirms email, and creates their profile
-- Run this in the Supabase SQL Editor
-- ================================================================

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
  -- 1. Insert teacher account directly into auth.users (email_confirmed_at and confirmed_at are set to NOW() to skip email verification)
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
    NOW(), -- Auto-confirms email instantly!
    '{"provider":"email","providers":["email"]}',
    jsonb_build_object('full_name', teacher_name, 'role', 'teacher'),
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
    jsonb_build_object('sub', new_user_id, 'email', teacher_email),
    'email',
    NOW(),
    NOW(),
    NOW()
  );

  -- 3. Create the profile mapping record in public.report_profiles
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
