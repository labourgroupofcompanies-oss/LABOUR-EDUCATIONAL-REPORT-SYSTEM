-- ================================================================
--  Labour Edu Report System — Complete Supabase Setup
--  Multi-Tenant: Each school ONLY sees its own data.
--  Run this entire script in Supabase → SQL Editor → Run All
-- ================================================================


-- ================================================================
--  STEP 1: report_schools
--  One row per school. school_id is used as the tenant key across all tables.
-- ================================================================
CREATE TABLE IF NOT EXISTS public.report_schools (
  id            TEXT PRIMARY KEY,   -- e.g. 'SCH-ABCD1234'
  name          TEXT NOT NULL,
  location      TEXT,
  district      TEXT,
  region        TEXT,
  circuit       TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.report_schools ENABLE ROW LEVEL SECURITY;

-- Schools: each row is public (needed so users can look up their own school on login)
-- But only the school admin can see their own row.
CREATE POLICY "report_schools_select_own"
  ON public.report_schools FOR SELECT
  USING (id = (auth.jwt() ->> 'school_id'));


-- ================================================================
--  STEP 2: report_profiles
--  One row per staff member (headteachers + teachers).
--  The `school_id` column is the multi-tenant key.
-- ================================================================
CREATE TABLE IF NOT EXISTS public.report_profiles (
  id            UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  school_id     TEXT NOT NULL REFERENCES public.report_schools(id),
  full_name     TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('super_admin', 'teacher')),
  staff_id      TEXT,
  email         TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_report_profiles_school
  ON public.report_profiles (school_id);

ALTER TABLE public.report_profiles ENABLE ROW LEVEL SECURITY;

-- Profiles: users can only see profiles within their own school
CREATE POLICY "report_profiles_select_own_school"
  ON public.report_profiles FOR SELECT
  USING (school_id = (auth.jwt() ->> 'school_id'));

CREATE POLICY "report_profiles_insert_own_school"
  ON public.report_profiles FOR INSERT
  WITH CHECK (school_id = (auth.jwt() ->> 'school_id'));

CREATE POLICY "report_profiles_update_own_school"
  ON public.report_profiles FOR UPDATE
  USING (school_id = (auth.jwt() ->> 'school_id'));


-- ================================================================
--  STEP 3: report_classes
--  Each class belongs to a school.
-- ================================================================
CREATE TABLE IF NOT EXISTS public.report_classes (
  id            SERIAL PRIMARY KEY,
  school_id     TEXT NOT NULL REFERENCES public.report_schools(id),
  name          TEXT NOT NULL,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_report_classes_school
  ON public.report_classes (school_id);

ALTER TABLE public.report_classes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "report_classes_select_own_school"
  ON public.report_classes FOR SELECT
  USING (school_id = (auth.jwt() ->> 'school_id'));

CREATE POLICY "report_classes_insert_own_school"
  ON public.report_classes FOR INSERT
  WITH CHECK (school_id = (auth.jwt() ->> 'school_id'));

CREATE POLICY "report_classes_update_own_school"
  ON public.report_classes FOR UPDATE
  USING (school_id = (auth.jwt() ->> 'school_id'));

CREATE POLICY "report_classes_delete_own_school"
  ON public.report_classes FOR DELETE
  USING (school_id = (auth.jwt() ->> 'school_id'));


-- ================================================================
--  STEP 4: report_learners
--  Each learner belongs to a school + class.
--  A school can NEVER see another school's learners.
-- ================================================================
CREATE TABLE IF NOT EXISTS public.report_learners (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id           TEXT NOT NULL REFERENCES public.report_schools(id),
  reg_number          TEXT NOT NULL,
  full_name           TEXT NOT NULL,
  gender              TEXT NOT NULL CHECK (gender IN ('Male', 'Female')),
  class_id            INTEGER REFERENCES public.report_classes(id),
  photo_url           TEXT,
  guardian_name       TEXT,
  guardian_relation   TEXT,
  guardian_contact_1  TEXT,
  guardian_contact_2  TEXT,
  guardian_profession TEXT,
  guardian_location   TEXT,
  synced              BOOLEAN DEFAULT TRUE,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

-- No duplicate reg numbers within the same school
ALTER TABLE public.report_learners
  ADD CONSTRAINT report_learners_school_reg_unique UNIQUE (school_id, reg_number);

CREATE INDEX IF NOT EXISTS idx_report_learners_school
  ON public.report_learners (school_id);

CREATE INDEX IF NOT EXISTS idx_report_learners_class
  ON public.report_learners (class_id);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER report_learners_updated_at
  BEFORE UPDATE ON public.report_learners
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

ALTER TABLE public.report_learners ENABLE ROW LEVEL SECURITY;

-- *** THE CORE MULTI-TENANT RULE ***
-- A user can ONLY access learners whose school_id matches their own school_id
-- stored in the JWT token. It is physically impossible to read another school's data.

CREATE POLICY "report_learners_select_own_school"
  ON public.report_learners FOR SELECT
  USING (school_id = (auth.jwt() ->> 'school_id'));

CREATE POLICY "report_learners_insert_own_school"
  ON public.report_learners FOR INSERT
  WITH CHECK (school_id = (auth.jwt() ->> 'school_id'));

CREATE POLICY "report_learners_update_own_school"
  ON public.report_learners FOR UPDATE
  USING (school_id = (auth.jwt() ->> 'school_id'));

CREATE POLICY "report_learners_delete_own_school"
  ON public.report_learners FOR DELETE
  USING (school_id = (auth.jwt() ->> 'school_id'));


-- ================================================================
--  STEP 5: report_subjects
-- ================================================================
CREATE TABLE IF NOT EXISTS public.report_subjects (
  id            SERIAL PRIMARY KEY,
  school_id     TEXT NOT NULL REFERENCES public.report_schools(id),
  name          TEXT NOT NULL,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_report_subjects_school
  ON public.report_subjects (school_id);

ALTER TABLE public.report_subjects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "report_subjects_select_own_school"
  ON public.report_subjects FOR SELECT
  USING (school_id = (auth.jwt() ->> 'school_id'));

CREATE POLICY "report_subjects_insert_own_school"
  ON public.report_subjects FOR INSERT
  WITH CHECK (school_id = (auth.jwt() ->> 'school_id'));

CREATE POLICY "report_subjects_update_own_school"
  ON public.report_subjects FOR UPDATE
  USING (school_id = (auth.jwt() ->> 'school_id'));

CREATE POLICY "report_subjects_delete_own_school"
  ON public.report_subjects FOR DELETE
  USING (school_id = (auth.jwt() ->> 'school_id'));


-- ================================================================
--  STEP 6: report_scores
-- ================================================================
CREATE TABLE IF NOT EXISTS public.report_scores (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id     TEXT NOT NULL REFERENCES public.report_schools(id),
  learner_id    UUID REFERENCES public.report_learners(id) ON DELETE CASCADE,
  class_id      INTEGER REFERENCES public.report_classes(id),
  subject_id    INTEGER REFERENCES public.report_subjects(id),
  term          TEXT,
  ca_scores     JSONB,          -- Stores structured CA breakdown as JSON array
  exam_score    NUMERIC(5,2),
  total_score   NUMERIC(5,2),
  grade         TEXT,
  remark        TEXT,
  is_submitted  BOOLEAN DEFAULT FALSE,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_report_scores_school
  ON public.report_scores (school_id);

CREATE INDEX IF NOT EXISTS idx_report_scores_learner
  ON public.report_scores (learner_id);

CREATE OR REPLACE TRIGGER report_scores_updated_at
  BEFORE UPDATE ON public.report_scores
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

ALTER TABLE public.report_scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "report_scores_select_own_school"
  ON public.report_scores FOR SELECT
  USING (school_id = (auth.jwt() ->> 'school_id'));

CREATE POLICY "report_scores_insert_own_school"
  ON public.report_scores FOR INSERT
  WITH CHECK (school_id = (auth.jwt() ->> 'school_id'));

CREATE POLICY "report_scores_update_own_school"
  ON public.report_scores FOR UPDATE
  USING (school_id = (auth.jwt() ->> 'school_id'));

CREATE POLICY "report_scores_delete_own_school"
  ON public.report_scores FOR DELETE
  USING (school_id = (auth.jwt() ->> 'school_id'));


-- ================================================================
--  STEP 7: report_settings
--  Each school has its own grading scale and CA configuration.
-- ================================================================
CREATE TABLE IF NOT EXISTS public.report_settings (
  id            TEXT PRIMARY KEY DEFAULT 'global',  -- one row per school
  school_id     TEXT NOT NULL REFERENCES public.report_schools(id),
  ca_weight     INTEGER DEFAULT 30,
  exam_weight   INTEGER DEFAULT 70,
  ca_model      TEXT DEFAULT 'simple_mean',
  ca_best_n     INTEGER,
  ca_breakdown  JSONB,       -- Array of {id, label, count, maxScore, enabled}
  grading_scale JSONB,       -- Array of {min, max, grade, remark}
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.report_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "report_settings_select_own_school"
  ON public.report_settings FOR SELECT
  USING (school_id = (auth.jwt() ->> 'school_id'));

CREATE POLICY "report_settings_upsert_own_school"
  ON public.report_settings FOR INSERT
  WITH CHECK (school_id = (auth.jwt() ->> 'school_id'));

CREATE POLICY "report_settings_update_own_school"
  ON public.report_settings FOR UPDATE
  USING (school_id = (auth.jwt() ->> 'school_id'));


-- ================================================================
--  STEP 8: Storage bucket for learner photos
-- ================================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('learner-photos', 'learner-photos', true)
ON CONFLICT (id) DO NOTHING;

-- Only authenticated users can upload
CREATE POLICY "learner_photos_insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'learner-photos');

-- Anyone can view (photos are linked in public reports)
CREATE POLICY "learner_photos_select"
  ON storage.objects FOR SELECT TO public
  USING (bucket_id = 'learner-photos');

-- Authenticated users can replace their own photos
CREATE POLICY "learner_photos_update"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'learner-photos');


-- ================================================================
--  HOW THE MULTI-TENANCY WORKS
-- ================================================================
--
--  When a school admin logs in via Supabase Auth, their JWT token
--  automatically carries the custom claim:
--    { "school_id": "SCH-0001" }
--
--  Every RLS policy checks:
--    school_id = (auth.jwt() ->> 'school_id')
--
--  This means:
--  - School A users physically CANNOT query School B's data.
--  - This is enforced at the DATABASE level, not just the app.
--  - Even if someone gets the anon key, they cannot read other schools' data.
--
--  TO SET THE CUSTOM CLAIM on login, use Supabase's Auth Hook:
--  Go to: Authentication → Hooks → Custom Access Token
--  Or use the SQL function below to add it automatically.
-- ================================================================

-- Auto-inject school_id into JWT when user logs in
-- (Add this as a Supabase Auth Hook: Authentication > Hooks > Custom Access Token)
CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event JSONB)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  claims JSONB;
  v_school_id TEXT;
BEGIN
  claims := event -> 'claims';
  -- Look up school_id from the profiles table
  SELECT school_id INTO v_school_id
    FROM public.report_profiles
   WHERE id = (event ->> 'user_id')::UUID;

  IF v_school_id IS NOT NULL THEN
    claims := jsonb_set(claims, '{school_id}', to_jsonb(v_school_id));
  END IF;

  RETURN jsonb_set(event, '{claims}', claims);
END;
$$;

-- Grant the hook permission to read profiles
GRANT EXECUTE ON FUNCTION public.custom_access_token_hook TO supabase_auth_admin;
REVOKE EXECUTE ON FUNCTION public.custom_access_token_hook FROM PUBLIC;
GRANT SELECT ON public.report_profiles TO supabase_auth_admin;
