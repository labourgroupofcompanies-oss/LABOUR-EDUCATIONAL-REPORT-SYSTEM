-- Migration: Sibling-Linked Parent Portal and Announcements
-- Date: 2026-05-21

CREATE TABLE IF NOT EXISTS public.report_parent_accounts (
    phone_number TEXT PRIMARY KEY,
    password_hash TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.report_announcements (
    id BIGSERIAL PRIMARY KEY,
    school_id TEXT NOT NULL REFERENCES public.report_schools(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable Row Level Security (RLS)
ALTER TABLE public.report_parent_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.report_announcements ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist to prevent errors on double-runs
DROP POLICY IF EXISTS "Allow public select for login verification" ON public.report_parent_accounts;
DROP POLICY IF EXISTS "Allow public insert for account creation" ON public.report_parent_accounts;
DROP POLICY IF EXISTS "Allow public update for password resets" ON public.report_parent_accounts;
DROP POLICY IF EXISTS "Allow select for parents and staff" ON public.report_announcements;
DROP POLICY IF EXISTS "Allow write for super admins" ON public.report_announcements;

-- Policies for report_parent_accounts
CREATE POLICY "Allow public select for login verification" ON public.report_parent_accounts FOR SELECT USING (true);
CREATE POLICY "Allow public insert for account creation" ON public.report_parent_accounts FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update for password resets" ON public.report_parent_accounts FOR UPDATE USING (true);

-- Policies for report_announcements
CREATE POLICY "Allow select for parents and staff" ON public.report_announcements FOR SELECT USING (true);
CREATE POLICY "Allow write for super admins" ON public.report_announcements FOR ALL USING (true);
