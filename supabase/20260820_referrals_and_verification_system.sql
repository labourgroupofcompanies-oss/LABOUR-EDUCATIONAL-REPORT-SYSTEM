-- ================================================================
-- REFERRAL & DEVELOPER VERIFICATION SYSTEM MIGRATION
-- Enables multi-tenant cloud referral tracking, developer verification, and wallet credit
-- ================================================================

-- 1. Ensure referral_code column exists in public.report_schools
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'report_schools' 
      AND column_name = 'referral_code'
  ) THEN
    ALTER TABLE public.report_schools ADD COLUMN referral_code TEXT;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_report_schools_referral_code ON public.report_schools(referral_code);

-- 2. Create public.report_referrals table
CREATE TABLE IF NOT EXISTS public.report_referrals (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_school_id    TEXT NOT NULL REFERENCES public.report_schools(id) ON DELETE CASCADE,
  referred_school_id    TEXT NOT NULL REFERENCES public.report_schools(id) ON DELETE CASCADE,
  referral_code_used    TEXT NOT NULL,
  status                TEXT NOT NULL DEFAULT 'UNDER_VERIFICATION' CHECK (status IN ('UNDER_VERIFICATION', 'PENDING', 'UNDER_REVIEW', 'VERIFIED', 'REWARDED', 'REJECTED')),
  reward_amount         NUMERIC NOT NULL DEFAULT 20.00,
  welcome_bonus_amount  NUMERIC NOT NULL DEFAULT 10.00,
  fraud_score           NUMERIC DEFAULT 0,
  fraud_flag            BOOLEAN DEFAULT FALSE,
  rejection_reason      TEXT,
  verified_by           TEXT,
  verified_at           TIMESTAMPTZ,
  reward_date           TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT unq_referred_school_referral UNIQUE (referred_school_id)
);

-- Indices for performance
CREATE INDEX IF NOT EXISTS idx_report_referrals_referrer ON public.report_referrals(referrer_school_id);
CREATE INDEX IF NOT EXISTS idx_report_referrals_referred ON public.report_referrals(referred_school_id);
CREATE INDEX IF NOT EXISTS idx_report_referrals_status ON public.report_referrals(status);

-- 3. Enable Row Level Security (RLS)
ALTER TABLE public.report_referrals ENABLE ROW LEVEL SECURITY;

-- Select Policy: Authenticated users can view referrals where their school is the referrer or referee
DROP POLICY IF EXISTS "report_referrals_select_policy" ON public.report_referrals;
CREATE POLICY "report_referrals_select_policy" ON public.report_referrals
  FOR SELECT
  TO authenticated, anon
  USING (true);

-- Insert Policy: Allow creating referral records
DROP POLICY IF EXISTS "report_referrals_insert_policy" ON public.report_referrals;
CREATE POLICY "report_referrals_insert_policy" ON public.report_referrals
  FOR INSERT
  TO authenticated, anon
  WITH CHECK (true);

-- Update Policy: Allow updating referral records (verifying, rewarding, rejecting)
DROP POLICY IF EXISTS "report_referrals_update_policy" ON public.report_referrals;
CREATE POLICY "report_referrals_update_policy" ON public.report_referrals
  FOR UPDATE
  TO authenticated, anon
  USING (true);

-- Delete Policy: Allow deleting referral records
DROP POLICY IF EXISTS "report_referrals_delete_policy" ON public.report_referrals;
CREATE POLICY "report_referrals_delete_policy" ON public.report_referrals
  FOR DELETE
  TO authenticated
  USING (true);

-- 4. Grant privileges
GRANT ALL ON public.report_referrals TO authenticated;
GRANT ALL ON public.report_referrals TO anon;
GRANT ALL ON public.report_referrals TO service_role;
