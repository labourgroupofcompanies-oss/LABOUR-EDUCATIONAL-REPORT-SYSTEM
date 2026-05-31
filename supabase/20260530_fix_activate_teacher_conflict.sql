-- ============================================================================
-- Fix activate_teacher_account RPC conflict (409 Conflict)
-- Run this in your Supabase SQL Editor (SQL Editor -> New Query -> Run)
-- ============================================================================

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
  v_profile_id_exists BOOLEAN;
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

  -- Check if email already exists in auth.users
  SELECT id INTO new_user_id
  FROM auth.users
  WHERE LOWER(TRIM(email)) = LOWER(TRIM(teacher_email))
  LIMIT 1;

  IF new_user_id IS NOT NULL THEN
    -- Teacher already has an auth account! Update password, raw_user_meta_data, and email verification state
    UPDATE auth.users
    SET encrypted_password = extensions.crypt(teacher_password, extensions.gen_salt('bf')),
        email_confirmed_at = COALESCE(email_confirmed_at, NOW()),
        raw_user_meta_data = COALESCE(raw_user_meta_data, '{}'::jsonb) || jsonb_build_object('role', 'teacher', 'school_id', v_school_id),
        updated_at = NOW()
    WHERE id = new_user_id;

    -- Ensure a corresponding identity exists for standard logins
    IF NOT EXISTS (SELECT 1 FROM auth.identities WHERE user_id = new_user_id) THEN
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
    END IF;
  ELSE
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
      new_user_id,
      new_user_id,
      jsonb_build_object('sub', new_user_id, 'email', LOWER(TRIM(teacher_email))),
      'email',
      NOW(),
      NOW(),
      NOW()
    );
  END IF;

  -- 3. Update the profile with the new Auth ID and set is_claimed = TRUE
  SELECT EXISTS(
    SELECT 1 FROM public.report_profiles WHERE id = new_user_id
  ) INTO v_profile_id_exists;

  IF v_profile_id_exists THEN
    -- If a profile with this id already exists, update it and clean up the temp profile
    UPDATE public.report_profiles
    SET email = LOWER(TRIM(teacher_email)),
        is_claimed = TRUE,
        school_id = v_school_id
    WHERE id = new_user_id;

    -- Re-route any assignments from the temp profile to the main auth-bound profile
    UPDATE public.report_teacher_assignments
    SET teacher_id = new_user_id
    WHERE teacher_id = old_temp_id;

    -- Delete the duplicate temporary profile
    DELETE FROM public.report_profiles WHERE id = old_temp_id;
  ELSE
    -- Standard update cascading to assignments automatically via ON UPDATE CASCADE
    UPDATE public.report_profiles 
    SET id = new_user_id, 
        is_claimed = TRUE 
    WHERE id = old_temp_id;
  END IF;

  RETURN new_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
