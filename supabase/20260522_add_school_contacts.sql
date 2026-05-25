-- Migration: Add phone and email contacts to report_schools
-- Date: 2026-05-22

ALTER TABLE public.report_schools
  ADD COLUMN IF NOT EXISTS phone TEXT,
  ADD COLUMN IF NOT EXISTS email TEXT;
