-- Migration: Add signature_url column to report_profiles table
-- Run this script in the Supabase SQL Editor to support teachers saving their signatures.

ALTER TABLE public.report_profiles 
  ADD COLUMN IF NOT EXISTS signature_url TEXT;
