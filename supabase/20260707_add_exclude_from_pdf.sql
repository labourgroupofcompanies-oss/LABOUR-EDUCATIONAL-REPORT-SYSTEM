-- Migration: Add exclude_from_pdf column to report_learners table
-- Run this script in the Supabase SQL Editor to support excluding students
-- with Parent Portal access from printed report cards.

ALTER TABLE public.report_learners 
  ADD COLUMN IF NOT EXISTS exclude_from_pdf BOOLEAN DEFAULT FALSE;
