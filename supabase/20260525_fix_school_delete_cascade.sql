-- ================================================================
-- Migration to enable ON DELETE CASCADE for all school_id references
-- Run this in the Supabase SQL Editor to allow deleting schools
-- ================================================================

-- 1. Upgrade report_profiles school constraint
ALTER TABLE public.report_profiles
  DROP CONSTRAINT IF EXISTS report_profiles_school_id_fkey,
  ADD CONSTRAINT report_profiles_school_id_fkey
    FOREIGN KEY (school_id)
    REFERENCES public.report_schools(id)
    ON DELETE CASCADE;

-- 2. Upgrade report_classes school constraint
ALTER TABLE public.report_classes
  DROP CONSTRAINT IF EXISTS report_classes_school_id_fkey,
  ADD CONSTRAINT report_classes_school_id_fkey
    FOREIGN KEY (school_id)
    REFERENCES public.report_schools(id)
    ON DELETE CASCADE;

-- 3. Upgrade report_learners school constraint
ALTER TABLE public.report_learners
  DROP CONSTRAINT IF EXISTS report_learners_school_id_fkey,
  ADD CONSTRAINT report_learners_school_id_fkey
    FOREIGN KEY (school_id)
    REFERENCES public.report_schools(id)
    ON DELETE CASCADE;

-- 4. Upgrade report_subjects school constraint
ALTER TABLE public.report_subjects
  DROP CONSTRAINT IF EXISTS report_subjects_school_id_fkey,
  ADD CONSTRAINT report_subjects_school_id_fkey
    FOREIGN KEY (school_id)
    REFERENCES public.report_schools(id)
    ON DELETE CASCADE;

-- 5. Upgrade report_scores school constraint
ALTER TABLE public.report_scores
  DROP CONSTRAINT IF EXISTS report_scores_school_id_fkey,
  ADD CONSTRAINT report_scores_school_id_fkey
    FOREIGN KEY (school_id)
    REFERENCES public.report_schools(id)
    ON DELETE CASCADE;

-- 6. Upgrade report_settings school constraint
ALTER TABLE public.report_settings
  DROP CONSTRAINT IF EXISTS report_settings_school_id_fkey,
  ADD CONSTRAINT report_settings_school_id_fkey
    FOREIGN KEY (school_id)
    REFERENCES public.report_schools(id)
    ON DELETE CASCADE;
