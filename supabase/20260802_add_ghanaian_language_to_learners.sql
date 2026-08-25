-- ============================================================================
-- Migration: Add ghanaian_language column to report_learners table
-- Run in Supabase SQL Editor
-- ============================================================================

ALTER TABLE public.report_learners
  ADD COLUMN IF NOT EXISTS ghanaian_language VARCHAR(20) DEFAULT 'twi';
