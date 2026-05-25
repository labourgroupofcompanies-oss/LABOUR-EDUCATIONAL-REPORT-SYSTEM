-- ============================================================
-- Migration: Tighten RLS & Add Scalability Indexes
-- Date: 2026-05-23
-- Fixes: Open USING (true) policies on communication tables
-- Performance: Adds multi-tenant (school_id) indexing for scale
-- ============================================================

-- 1. Tighten RLS for Messages
DROP POLICY IF EXISTS "messages_public_select"  ON public.report_messages;
DROP POLICY IF EXISTS "messages_public_insert"  ON public.report_messages;
DROP POLICY IF EXISTS "messages_public_update"  ON public.report_messages;

CREATE POLICY "messages_school_select" ON public.report_messages
    FOR SELECT USING (
        school_id = (SELECT school_id FROM public.report_profiles WHERE id = auth.uid())
    );

CREATE POLICY "messages_school_insert" ON public.report_messages
    FOR INSERT WITH CHECK (
        school_id = (SELECT school_id FROM public.report_profiles WHERE id = auth.uid())
    );

CREATE POLICY "messages_school_update" ON public.report_messages
    FOR UPDATE USING (
        school_id = (SELECT school_id FROM public.report_profiles WHERE id = auth.uid())
    );

-- 2. Tighten RLS for Notifications
DROP POLICY IF EXISTS "notifs_public_select"    ON public.report_notifications;
DROP POLICY IF EXISTS "notifs_admin_all"        ON public.report_notifications;

CREATE POLICY "notifs_school_select" ON public.report_notifications
    FOR SELECT USING (
        school_id = (SELECT school_id FROM public.report_profiles WHERE id = auth.uid())
    );

CREATE POLICY "notifs_school_all" ON public.report_notifications
    FOR ALL USING (
        school_id = (SELECT school_id FROM public.report_profiles WHERE id = auth.uid())
    );

-- 3. Add High-Performance Multi-Tenant Indexes
-- Most queries now filter locally in JS, but realtime and pull queries 
-- MUST hit the database with a where('school_id') clause efficiently.

CREATE INDEX IF NOT EXISTS idx_report_profiles_school ON public.report_profiles(school_id);
CREATE INDEX IF NOT EXISTS idx_report_classes_school ON public.report_classes(school_id);
CREATE INDEX IF NOT EXISTS idx_report_subjects_school ON public.report_subjects(school_id);
CREATE INDEX IF NOT EXISTS idx_report_teacher_assigns_school ON public.report_teacher_assignments(school_id);
CREATE INDEX IF NOT EXISTS idx_report_class_subs_school ON public.report_class_subjects(school_id);
CREATE INDEX IF NOT EXISTS idx_report_learners_school ON public.report_learners(school_id);
CREATE INDEX IF NOT EXISTS idx_report_scores_school ON public.report_scores(school_id);
CREATE INDEX IF NOT EXISTS idx_report_summaries_school ON public.report_summaries(school_id);
