-- ============================================================
-- Migration: Parent-School Communication Center
-- Date: 2026-05-22
-- Tables: report_messages, report_notifications
-- RPCs:   get_messages_by_guardian_contact,
--         send_parent_message,
--         get_notifications_by_guardian_contact
-- ============================================================

-- ──────────────────────────────────────────────────────────────
-- TABLE 1: report_messages  (two-way text chat)
-- ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.report_messages (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id   TEXT NOT NULL,
    parent_phone TEXT NOT NULL,
    sender_role TEXT NOT NULL CHECK (sender_role IN ('parent', 'head_teacher')),
    content     TEXT NOT NULL,
    is_read     BOOLEAN NOT NULL DEFAULT false,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_report_messages_school_phone
    ON public.report_messages (school_id, parent_phone);

-- ──────────────────────────────────────────────────────────────
-- TABLE 2: report_notifications  (broadcast OR targeted alerts)
-- parent_phone IS NULL  → school-wide broadcast to ALL parents
-- parent_phone = 'xxx'  → direct alert sent only to that parent
-- ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.report_notifications (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id    TEXT NOT NULL,
    parent_phone TEXT DEFAULT NULL,
    title        TEXT NOT NULL,
    content      TEXT NOT NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_report_notifications_school
    ON public.report_notifications (school_id);

CREATE INDEX IF NOT EXISTS idx_report_notifications_phone
    ON public.report_notifications (parent_phone);

-- ──────────────────────────────────────────────────────────────
-- ROW LEVEL SECURITY
-- ──────────────────────────────────────────────────────────────
ALTER TABLE public.report_messages     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.report_notifications ENABLE ROW LEVEL SECURITY;

-- Drop any pre-existing policies
DROP POLICY IF EXISTS "messages_public_select"  ON public.report_messages;
DROP POLICY IF EXISTS "messages_public_insert"  ON public.report_messages;
DROP POLICY IF EXISTS "messages_public_update"  ON public.report_messages;
DROP POLICY IF EXISTS "notifs_public_select"    ON public.report_notifications;
DROP POLICY IF EXISTS "notifs_admin_all"        ON public.report_notifications;

-- Open select for RPC use (functions run as SECURITY DEFINER)
CREATE POLICY "messages_public_select" ON public.report_messages
    FOR SELECT USING (true);

CREATE POLICY "messages_public_insert" ON public.report_messages
    FOR INSERT WITH CHECK (true);

CREATE POLICY "messages_public_update" ON public.report_messages
    FOR UPDATE USING (true);

CREATE POLICY "notifs_public_select" ON public.report_notifications
    FOR SELECT USING (true);

CREATE POLICY "notifs_admin_all" ON public.report_notifications
    FOR ALL USING (true);

-- ──────────────────────────────────────────────────────────────
-- RPC 1: get_messages_by_guardian_contact
--        Returns full message thread for a given parent phone
-- ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_messages_by_guardian_contact(
    p_contact   TEXT,
    p_school_id TEXT
)
RETURNS TABLE (
    id           UUID,
    school_id    TEXT,
    parent_phone TEXT,
    sender_role  TEXT,
    content      TEXT,
    is_read      BOOLEAN,
    created_at   TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_clean TEXT;
BEGIN
    v_clean := substring(
        regexp_replace(p_contact, '[^0-9]', '', 'g')
        FROM '([0-9]{9})$'
    );

    IF v_clean IS NULL OR length(v_clean) < 9 THEN
        RETURN;
    END IF;

    RETURN QUERY
    SELECT
        m.id, m.school_id, m.parent_phone,
        m.sender_role, m.content, m.is_read, m.created_at
    FROM public.report_messages m
    WHERE
        m.school_id = p_school_id
        AND substring(regexp_replace(m.parent_phone, '[^0-9]', '', 'g') FROM '([0-9]{9})$') = v_clean
    ORDER BY m.created_at ASC;
END;
$$;

-- ──────────────────────────────────────────────────────────────
-- RPC 2: send_parent_message
--        Allows a parent (unauthenticated) to insert a message
-- ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.send_parent_message(
    p_contact   TEXT,
    p_school_id TEXT,
    p_content   TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_clean TEXT;
    v_id    UUID;
BEGIN
    v_clean := substring(
        regexp_replace(p_contact, '[^0-9]', '', 'g')
        FROM '([0-9]{9})$'
    );

    IF v_clean IS NULL OR length(v_clean) < 9 THEN
        RAISE EXCEPTION 'Invalid contact number';
    END IF;

    INSERT INTO public.report_messages (school_id, parent_phone, sender_role, content)
    VALUES (p_school_id, p_contact, 'parent', p_content)
    RETURNING id INTO v_id;

    RETURN v_id;
END;
$$;

-- ──────────────────────────────────────────────────────────────
-- RPC 3: get_notifications_by_guardian_contact
--        Returns broadcast + targeted notifications for a parent
-- ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_notifications_by_guardian_contact(
    p_contact   TEXT,
    p_school_id TEXT
)
RETURNS TABLE (
    id           UUID,
    school_id    TEXT,
    parent_phone TEXT,
    title        TEXT,
    content      TEXT,
    created_at   TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_clean TEXT;
BEGIN
    v_clean := substring(
        regexp_replace(p_contact, '[^0-9]', '', 'g')
        FROM '([0-9]{9})$'
    );

    IF v_clean IS NULL OR length(v_clean) < 9 THEN
        RETURN;
    END IF;

    RETURN QUERY
    SELECT
        n.id, n.school_id, n.parent_phone,
        n.title, n.content, n.created_at
    FROM public.report_notifications n
    WHERE
        n.school_id = p_school_id
        AND (
            n.parent_phone IS NULL
            OR substring(regexp_replace(n.parent_phone, '[^0-9]', '', 'g') FROM '([0-9]{9})$') = v_clean
        )
    ORDER BY n.created_at DESC;
END;
$$;
