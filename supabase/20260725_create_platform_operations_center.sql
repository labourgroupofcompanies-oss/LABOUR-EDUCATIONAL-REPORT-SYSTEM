-- ============================================================================
-- Migration: Create Platform Operations Center Architecture & Health Scoring
-- ============================================================================

-- 1. School Subscriptions Table
CREATE TABLE IF NOT EXISTS public.platform_school_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id UUID NOT NULL,
    school_name VARCHAR(255) NOT NULL,
    tier VARCHAR(20) NOT NULL CHECK (tier IN ('Basic', 'Standard', 'Enterprise')),
    status VARCHAR(20) NOT NULL CHECK (status IN ('Active', 'Trial', 'Suspended', 'Expired')),
    renewal_date TIMESTAMPTZ NOT NULL,
    price_ghs NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    auto_renew BOOLEAN NOT NULL DEFAULT true,
    is_read_only BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. School Activity Timeline Events Table
CREATE TABLE IF NOT EXISTS public.platform_school_timeline_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id UUID NOT NULL,
    event_type VARCHAR(100) NOT NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    actor_name VARCHAR(255) NOT NULL DEFAULT 'System / Admin',
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Support Tickets Table
CREATE TABLE IF NOT EXISTS public.platform_support_tickets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id UUID NOT NULL,
    school_name VARCHAR(255) NOT NULL,
    ticket_code VARCHAR(50) NOT NULL UNIQUE,
    title VARCHAR(255) NOT NULL,
    category VARCHAR(100) NOT NULL,
    priority VARCHAR(20) NOT NULL CHECK (priority IN ('Low', 'Medium', 'High', 'Urgent')),
    status VARCHAR(20) NOT NULL CHECK (status IN ('Open', 'In Progress', 'Resolved')),
    messages JSONB DEFAULT '[]',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Super Admin Remote Support Interventions Table
CREATE TABLE IF NOT EXISTS public.platform_support_interventions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    admin_name VARCHAR(255) NOT NULL DEFAULT 'Super Admin',
    school_id UUID NOT NULL,
    school_name VARCHAR(255) NOT NULL,
    action_type VARCHAR(100) NOT NULL,
    description TEXT NOT NULL,
    previous_state JSONB DEFAULT '{}',
    new_state JSONB DEFAULT '{}',
    result VARCHAR(20) NOT NULL CHECK (result IN ('success', 'failed')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. School Health Score Snapshot Cache
CREATE TABLE IF NOT EXISTS public.platform_school_health_scores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id UUID NOT NULL UNIQUE,
    school_name VARCHAR(255) NOT NULL,
    health_score INTEGER NOT NULL CHECK (health_score BETWEEN 0 AND 100),
    health_status VARCHAR(20) NOT NULL CHECK (health_status IN ('Healthy', 'Warning', 'Critical')),
    sync_health_score INTEGER NOT NULL DEFAULT 100,
    score_completion_score INTEGER NOT NULL DEFAULT 85,
    report_generation_score INTEGER NOT NULL DEFAULT 90,
    support_issues_score INTEGER NOT NULL DEFAULT 100,
    subscription_status_score INTEGER NOT NULL DEFAULT 100,
    active_users_score INTEGER NOT NULL DEFAULT 90,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- INDEXES FOR PERFORMANCE
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_platform_ops_sub_school ON public.platform_school_subscriptions(school_id);
CREATE INDEX IF NOT EXISTS idx_platform_ops_timeline_school ON public.platform_school_timeline_events(school_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_platform_ops_tickets_status ON public.platform_support_tickets(status);
CREATE INDEX IF NOT EXISTS idx_platform_ops_interventions_school ON public.platform_support_interventions(school_id);
CREATE INDEX IF NOT EXISTS idx_platform_ops_health_score ON public.platform_school_health_scores(health_score);

-- ============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================================
ALTER TABLE public.platform_school_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_school_timeline_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_support_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_support_interventions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_school_health_scores ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
    tbl text;
BEGIN
    FOR tbl IN 
        SELECT unnest(ARRAY[
            'platform_school_subscriptions',
            'platform_school_timeline_events',
            'platform_support_tickets',
            'platform_support_interventions',
            'platform_school_health_scores'
        ])
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS super_admin_all_%I ON public.%I;', tbl, tbl);
        EXECUTE format('CREATE POLICY super_admin_all_%I ON public.%I FOR ALL USING (public.is_super_admin());', tbl, tbl);
    END LOOP;
END $$;
