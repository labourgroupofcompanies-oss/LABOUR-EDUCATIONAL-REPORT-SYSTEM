-- ================================================================
-- Migration to fix foreign key constraint cascades on classes and subjects
-- Run this in the Supabase SQL Editor to resolve 409 (Conflict) on delete
-- ================================================================

-- ── 1. UPDATE LEARNERS CLASS REFERENCE ───────────────────────────
-- If a class is deleted, clear the student's class field but keep the student safe!
ALTER TABLE public.report_learners
  DROP CONSTRAINT IF EXISTS report_learners_class_id_fkey,
  ADD CONSTRAINT report_learners_class_id_fkey 
    FOREIGN KEY (class_id) 
    REFERENCES public.report_classes(id) 
    ON DELETE SET NULL;

-- ── 2. UPDATE SCORES CLASS & SUBJECT REFERENCES ──────────────────
-- If a class is deleted, cascade delete all score reports in it
ALTER TABLE public.report_scores
  DROP CONSTRAINT IF EXISTS report_scores_class_id_fkey,
  ADD CONSTRAINT report_scores_class_id_fkey 
    FOREIGN KEY (class_id) 
    REFERENCES public.report_classes(id) 
    ON DELETE CASCADE;

-- If a subject is deleted, cascade delete all score reports in it
ALTER TABLE public.report_scores
  DROP CONSTRAINT IF EXISTS report_scores_subject_id_fkey,
  ADD CONSTRAINT report_scores_subject_id_fkey 
    FOREIGN KEY (subject_id) 
    REFERENCES public.report_subjects(id) 
    ON DELETE CASCADE;
