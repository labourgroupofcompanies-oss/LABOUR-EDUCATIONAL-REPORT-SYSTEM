-- ================================================================
-- Migration to add guardian columns to report_learners
-- Run this in the Supabase SQL Editor
-- ================================================================

ALTER TABLE public.report_learners
  ADD COLUMN IF NOT EXISTS guardian_name TEXT,
  ADD COLUMN IF NOT EXISTS guardian_relation TEXT,
  ADD COLUMN IF NOT EXISTS guardian_contact_1 TEXT,
  ADD COLUMN IF NOT EXISTS guardian_contact_2 TEXT,
  ADD COLUMN IF NOT EXISTS guardian_profession TEXT,
  ADD COLUMN IF NOT EXISTS guardian_location TEXT;
