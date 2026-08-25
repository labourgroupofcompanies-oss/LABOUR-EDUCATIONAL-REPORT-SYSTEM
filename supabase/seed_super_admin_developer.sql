-- ============================================================================
-- Seed: Platform Super Admin Developer Account
--
-- HOW TO USE (run each statement separately in Supabase SQL Editor):
-- 1. Create user in Dashboard: Authentication → Users → Add User
--    Email:    shrtgallery@gmail.com
--    Password: iwillberich@30
--    ✓ Auto Confirm User
-- 2. Run Statement A
-- 3. Run Statement B
-- 4. Run Statement C
-- ============================================================================


-- ── Statement A: Set super_admin role on auth user metadata ─────────────────

UPDATE auth.users
SET
  raw_user_meta_data = raw_user_meta_data
                       || '{"role":"super_admin","full_name":"Platform Super Admin"}' :: jsonb,
  updated_at         = NOW()
WHERE email = 'shrtgallery@gmail.com';


-- ── Statement B: Allow NULL school_id for platform-level super admins ────────

ALTER TABLE public.report_profiles
  ALTER COLUMN school_id DROP NOT NULL;


-- ── Statement C: Create / update platform profile ────────────────────────────

INSERT INTO public.report_profiles (
  id, email, full_name, role, school_id, created_at, updated_at
)
SELECT
  id,
  email,
  'Platform Super Admin',
  'super_admin',
  NULL,
  NOW(),
  NOW()
FROM auth.users
WHERE email = 'shrtgallery@gmail.com'
ON CONFLICT (id) DO UPDATE
  SET role       = 'super_admin',
      updated_at = NOW();
