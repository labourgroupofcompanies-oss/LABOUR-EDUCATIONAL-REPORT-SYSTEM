-- ================================================================
-- FIX / UPGRADE REPORT_REFERRALS COLUMNS AND CONSTRAINTS
-- Run this in Supabase SQL Editor to ensure all referral fields exist
-- ================================================================

-- 1. Ensure columns exist on report_referrals
DO $$
BEGIN
  -- verified_by
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'report_referrals' AND column_name = 'verified_by') THEN
    ALTER TABLE public.report_referrals ADD COLUMN verified_by TEXT;
  END IF;

  -- verified_at
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'report_referrals' AND column_name = 'verified_at') THEN
    ALTER TABLE public.report_referrals ADD COLUMN verified_at TIMESTAMPTZ;
  END IF;

  -- reward_date
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'report_referrals' AND column_name = 'reward_date') THEN
    ALTER TABLE public.report_referrals ADD COLUMN reward_date TIMESTAMPTZ;
  END IF;

  -- updated_at
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'report_referrals' AND column_name = 'updated_at') THEN
    ALTER TABLE public.report_referrals ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();
  END IF;

  -- Ensure id has default UUID
  ALTER TABLE public.report_referrals ALTER COLUMN id SET DEFAULT gen_random_uuid();
END $$;

-- 2. Ensure RLS allows updates
ALTER TABLE public.report_referrals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "report_referrals_update_policy" ON public.report_referrals;
CREATE POLICY "report_referrals_update_policy" ON public.report_referrals
  FOR UPDATE
  TO authenticated, anon
  USING (true);
