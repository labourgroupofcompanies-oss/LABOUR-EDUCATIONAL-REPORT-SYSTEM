-- ============================================================================
-- Migration: Create Platform Developer Portal Architecture & Security Policy
-- ============================================================================

-- 1. API Keys Table
CREATE TABLE IF NOT EXISTS public.platform_api_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    key_prefix VARCHAR(16) NOT NULL,
    key_hash TEXT NOT NULL UNIQUE,
    environment VARCHAR(20) NOT NULL CHECK (environment IN ('sandbox', 'production')),
    scopes TEXT[] NOT NULL DEFAULT '{}',
    is_active BOOLEAN NOT NULL DEFAULT true,
    expires_at TIMESTAMPTZ,
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    last_used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Webhooks Table
CREATE TABLE IF NOT EXISTS public.platform_webhooks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    url TEXT NOT NULL,
    secret_hash TEXT NOT NULL,
    environment VARCHAR(20) NOT NULL CHECK (environment IN ('sandbox', 'production')),
    events TEXT[] NOT NULL DEFAULT '{}',
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Webhook Deliveries Table
CREATE TABLE IF NOT EXISTS public.platform_webhook_deliveries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    webhook_id UUID NOT NULL REFERENCES public.platform_webhooks(id) ON DELETE CASCADE,
    event VARCHAR(100) NOT NULL,
    payload JSONB NOT NULL,
    response_status INTEGER,
    response_body TEXT,
    response_time_ms INTEGER,
    retry_count INTEGER NOT NULL DEFAULT 0,
    status VARCHAR(20) NOT NULL CHECK (status IN ('success', 'failed', 'pending')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. API Version Manager Table
CREATE TABLE IF NOT EXISTS public.platform_api_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    version VARCHAR(20) NOT NULL UNIQUE,
    stage VARCHAR(20) NOT NULL CHECK (stage IN ('Draft', 'Preview', 'Active', 'Deprecated', 'Sunset', 'Retired')),
    release_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deprecation_date TIMESTAMPTZ,
    sunset_date TIMESTAMPTZ,
    is_default BOOLEAN NOT NULL DEFAULT false,
    changelog TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. API Analytics Table
CREATE TABLE IF NOT EXISTS public.platform_api_analytics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key_id UUID REFERENCES public.platform_api_keys(id) ON DELETE SET NULL,
    endpoint VARCHAR(255) NOT NULL,
    method VARCHAR(10) NOT NULL,
    status_code INTEGER NOT NULL,
    response_time_ms INTEGER NOT NULL,
    environment VARCHAR(20) NOT NULL CHECK (environment IN ('sandbox', 'production')),
    ip_address VARCHAR(45),
    user_agent TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. Security Center Logs Table
CREATE TABLE IF NOT EXISTS public.platform_security_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type VARCHAR(100) NOT NULL,
    severity VARCHAR(20) NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
    description TEXT NOT NULL,
    ip_address VARCHAR(45),
    user_agent TEXT,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    key_id UUID REFERENCES public.platform_api_keys(id) ON DELETE SET NULL,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 7. Developer Activity Logs Table
CREATE TABLE IF NOT EXISTS public.platform_developer_activity_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    admin_name VARCHAR(255) NOT NULL DEFAULT 'Super Admin',
    action VARCHAR(100) NOT NULL,
    target_entity VARCHAR(255) NOT NULL,
    details JSONB DEFAULT '{}',
    result VARCHAR(20) NOT NULL CHECK (result IN ('success', 'failed')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 8. Isolated Sandbox Store
CREATE TABLE IF NOT EXISTS public.platform_sandbox_data (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_type VARCHAR(50) NOT NULL,
    data JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- INDEXES FOR PERFORMANCE
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_platform_api_keys_hash ON public.platform_api_keys(key_hash);
CREATE INDEX IF NOT EXISTS idx_platform_api_keys_env ON public.platform_api_keys(environment);
CREATE INDEX IF NOT EXISTS idx_platform_webhooks_env ON public.platform_webhooks(environment);
CREATE INDEX IF NOT EXISTS idx_platform_webhook_deliveries_webhook ON public.platform_webhook_deliveries(webhook_id);
CREATE INDEX IF NOT EXISTS idx_platform_webhook_deliveries_created ON public.platform_webhook_deliveries(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_platform_api_analytics_created ON public.platform_api_analytics(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_platform_api_analytics_env ON public.platform_api_analytics(environment);
CREATE INDEX IF NOT EXISTS idx_platform_security_logs_created ON public.platform_security_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_platform_dev_activity_created ON public.platform_developer_activity_logs(created_at DESC);

-- ============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- Restricted Strictly to Super Admins
-- ============================================================================

ALTER TABLE public.platform_api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_webhooks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_webhook_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_api_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_api_analytics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_security_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_developer_activity_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_sandbox_data ENABLE ROW LEVEL SECURITY;

-- Helper policy function or inline check for Super Admin
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.report_profiles
    WHERE id = auth.uid() AND role = 'super_admin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant Super Admin full access policies across all platform developer tables
DO $$
DECLARE
    tbl text;
BEGIN
    FOR tbl IN 
        SELECT unnest(ARRAY[
            'platform_api_keys',
            'platform_webhooks',
            'platform_webhook_deliveries',
            'platform_api_versions',
            'platform_api_analytics',
            'platform_security_logs',
            'platform_developer_activity_logs',
            'platform_sandbox_data'
        ])
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS super_admin_all_%I ON public.%I;', tbl, tbl);
        EXECUTE format('CREATE POLICY super_admin_all_%I ON public.%I FOR ALL USING (public.is_super_admin());', tbl, tbl);
    END LOOP;
END $$;
