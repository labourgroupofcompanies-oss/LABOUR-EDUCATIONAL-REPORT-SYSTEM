-- ================================================================
-- Migration to add missing columns to report_schools
-- Run this in the Supabase SQL Editor
-- ================================================================

ALTER TABLE public.report_schools
  ADD COLUMN IF NOT EXISTS district TEXT,
  ADD COLUMN IF NOT EXISTS region TEXT,
  ADD COLUMN IF NOT EXISTS circuit TEXT;
