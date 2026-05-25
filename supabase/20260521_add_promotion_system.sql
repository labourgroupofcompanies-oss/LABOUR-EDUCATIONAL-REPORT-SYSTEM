-- ================================================================
-- Migration: Add Promotion System & Alumni Status
-- Run this in the Supabase SQL Editor
-- ================================================================

-- 1. Add promotion_status to report_summaries
ALTER TABLE public.report_summaries
  ADD COLUMN IF NOT EXISTS promotion_status TEXT DEFAULT 'pending';

-- 2. Add status to report_learners (Active vs Alumni)
ALTER TABLE public.report_learners
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'Active';

-- 3. Create RPC for bulk promotion approval (ACID transaction)
-- This function will be called by the Headteacher to approve promotions
-- for a specific class in Term 3.
CREATE OR REPLACE FUNCTION public.execute_class_promotions(
  p_school_id TEXT,
  p_class_id INTEGER,
  p_academic_year TEXT,
  p_term TEXT
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_summary RECORD;
  v_new_class_id INTEGER;
BEGIN
  -- Loop through all pending summaries for this class/year/term
  FOR v_summary IN 
    SELECT id, learner_id, promoted_to 
    FROM public.report_summaries
    WHERE school_id = p_school_id
      AND class_id = p_class_id
      AND academic_year = p_academic_year
      AND term = p_term
      AND promotion_status = 'pending'
      AND promoted_to IS NOT NULL 
      AND promoted_to != ''
  LOOP
    
    IF v_summary.promoted_to = 'Alumni' THEN
      -- Mark as Alumni
      UPDATE public.report_learners
      SET status = 'Alumni', updated_at = NOW()
      WHERE id = v_summary.learner_id;
    ELSE
      -- Move to new class
      -- We attempt to cast promoted_to to INTEGER safely
      BEGIN
        v_new_class_id := v_summary.promoted_to::INTEGER;
        
        UPDATE public.report_learners
        SET class_id = v_new_class_id, updated_at = NOW()
        WHERE id = v_summary.learner_id;
      EXCEPTION WHEN OTHERS THEN
        -- If cast fails (e.g. they put text instead of an ID), skip it
        RAISE NOTICE 'Invalid class ID in promoted_to: %', v_summary.promoted_to;
      END;
    END IF;

    -- Mark summary as approved
    UPDATE public.report_summaries
    SET promotion_status = 'approved', updated_at = NOW()
    WHERE id = v_summary.id;

  END LOOP;
END;
$$;
