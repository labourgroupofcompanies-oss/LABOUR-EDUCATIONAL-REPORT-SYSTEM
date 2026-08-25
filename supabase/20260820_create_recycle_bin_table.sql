-- ================================================================
-- RECYCLE BIN SYSTEM MIGRATION
-- Enables safe recovery of deleted entities (learners, teachers, classes, subjects)
-- ================================================================

CREATE TABLE IF NOT EXISTS public.recycle_bin (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id       TEXT NOT NULL REFERENCES public.report_schools(id) ON DELETE CASCADE,
  entity_type     TEXT NOT NULL, -- e.g. 'learner', 'teacher', 'class', 'subject'
  entity_id       TEXT NOT NULL, -- original ID / UUID
  entity_name     TEXT NOT NULL, -- e.g. "John Doe (REG-2024-001)"
  data_payload    JSONB NOT NULL, -- full JSON snapshot including relational records (scores, etc.)
  deleted_by      TEXT NOT NULL, -- User display name / email
  deleted_by_role TEXT,          -- e.g. 'super_admin', 'teacher'
  deleted_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at      TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '30 days'),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indices for rapid querying
CREATE INDEX IF NOT EXISTS idx_recycle_bin_school ON public.recycle_bin(school_id);
CREATE INDEX IF NOT EXISTS idx_recycle_bin_type ON public.recycle_bin(school_id, entity_type);
CREATE INDEX IF NOT EXISTS idx_recycle_bin_expires ON public.recycle_bin(expires_at);

-- Row Level Security (RLS)
ALTER TABLE public.recycle_bin ENABLE ROW LEVEL SECURITY;

-- 1. Select policy: authenticated users can view recycle bin items belonging to their school
DROP POLICY IF EXISTS "recycle_bin_school_select" ON public.recycle_bin;
CREATE POLICY "recycle_bin_school_select" ON public.recycle_bin
  FOR SELECT
  TO authenticated
  USING (
    school_id IN (
      SELECT school_id FROM public.report_profiles WHERE id = auth.uid()
    )
  );

-- 2. Insert policy: authenticated users can insert into recycle bin for their school
DROP POLICY IF EXISTS "recycle_bin_school_insert" ON public.recycle_bin;
CREATE POLICY "recycle_bin_school_insert" ON public.recycle_bin
  FOR INSERT
  TO authenticated
  WITH CHECK (
    school_id IN (
      SELECT school_id FROM public.report_profiles WHERE id = auth.uid()
    )
  );

-- 3. Update policy: authenticated users can update recycle bin items for their school
DROP POLICY IF EXISTS "recycle_bin_school_update" ON public.recycle_bin;
CREATE POLICY "recycle_bin_school_update" ON public.recycle_bin
  FOR UPDATE
  TO authenticated
  USING (
    school_id IN (
      SELECT school_id FROM public.report_profiles WHERE id = auth.uid()
    )
  );

-- 4. Delete policy: authenticated users can permanently remove items for their school
DROP POLICY IF EXISTS "recycle_bin_school_delete" ON public.recycle_bin;
CREATE POLICY "recycle_bin_school_delete" ON public.recycle_bin
  FOR DELETE
  TO authenticated
  USING (
    school_id IN (
      SELECT school_id FROM public.report_profiles WHERE id = auth.uid()
    )
  );

-- Grant privileges
GRANT ALL ON public.recycle_bin TO authenticated;
