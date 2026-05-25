-- Migration: Add RPC for head teachers to reset parent passwords
-- Date: 2026-05-24

CREATE OR REPLACE FUNCTION public.reset_parent_password(p_phone_number TEXT, p_new_password_hash TEXT)
RETURNS void AS $$
BEGIN
  -- We use security definer to bypass RLS so head teachers can update any parent account
  UPDATE public.report_parent_accounts
  SET password_hash = p_new_password_hash
  WHERE phone_number = p_phone_number;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

