-- ================================================================
-- Migration: Add missing next_term_bill column to report_summaries
-- Run this in the Supabase SQL Editor
-- ================================================================

ALTER TABLE public.report_summaries
  ADD COLUMN IF NOT EXISTS next_term_bill TEXT;
