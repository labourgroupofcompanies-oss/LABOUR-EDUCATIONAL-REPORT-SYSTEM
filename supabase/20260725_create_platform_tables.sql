-- ============================================================================
-- Migration: Create All Platform Developer Portal Tables
-- Paste entire file into Supabase SQL Editor and click Run
-- ============================================================================

-- ─── 1. platform_api_keys ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.platform_api_keys (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  key_prefix  TEXT,
  key_hash    TEXT NOT NULL,
  environment TEXT NOT NULL DEFAULT 'sandbox',
  scopes      TEXT[] DEFAULT '{}',
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  expires_at  TIMESTAMPTZ,
  created_by  UUID,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── 2. platform_webhooks ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.platform_webhooks (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  url         TEXT NOT NULL,
  secret_hash TEXT,
  environment TEXT NOT NULL DEFAULT 'sandbox',
  events      TEXT[] DEFAULT '{}',
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_by  UUID,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── 3. platform_webhook_deliveries ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.platform_webhook_deliveries (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  webhook_id       UUID REFERENCES public.platform_webhooks(id) ON DELETE CASCADE,
  event            TEXT NOT NULL,
  status           TEXT NOT NULL DEFAULT 'pending',
  request_payload  JSONB,
  response_status  INTEGER,
  response_body    TEXT,
  response_time_ms INTEGER DEFAULT 0,
  retry_count      INTEGER DEFAULT 0,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── 4. platform_api_versions ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.platform_api_versions (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version          TEXT NOT NULL UNIQUE,
  stage            TEXT NOT NULL DEFAULT 'Draft',
  changelog        TEXT,
  release_date     TIMESTAMPTZ DEFAULT NOW(),
  deprecation_date TIMESTAMPTZ,
  sunset_date      TIMESTAMPTZ,
  is_default       BOOLEAN NOT NULL DEFAULT FALSE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── 5. platform_api_analytics ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.platform_api_analytics (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  api_key_id       UUID,
  endpoint         TEXT,
  method           TEXT DEFAULT 'GET',
  status_code      INTEGER DEFAULT 200,
  response_time_ms INTEGER DEFAULT 0,
  request_count    INTEGER DEFAULT 1,
  environment      TEXT DEFAULT 'sandbox',
  ip_address       TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── 6. platform_security_logs ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.platform_security_logs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type  TEXT NOT NULL,
  severity    TEXT NOT NULL DEFAULT 'low',
  description TEXT,
  user_id     UUID,
  ip_address  TEXT,
  metadata    JSONB DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── 7. platform_developer_activity_logs ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.platform_developer_activity_logs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id      UUID,
  admin_name    TEXT,
  action        TEXT NOT NULL,
  target_entity TEXT,
  details       JSONB DEFAULT '{}',
  result        TEXT DEFAULT 'success',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── 8. platform_sandbox_data ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.platform_sandbox_data (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type TEXT NOT NULL,
  data        JSONB NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── RLS Policies (open to authenticated — super admin gate is in the app) ───
ALTER TABLE public.platform_api_keys             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_webhooks             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_webhook_deliveries   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_api_versions         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_api_analytics        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_security_logs        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_developer_activity_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_sandbox_data         ENABLE ROW LEVEL SECURITY;

CREATE POLICY "platform_api_keys_open"             ON public.platform_api_keys             FOR ALL TO authenticated USING (TRUE);
CREATE POLICY "platform_webhooks_open"             ON public.platform_webhooks             FOR ALL TO authenticated USING (TRUE);
CREATE POLICY "platform_webhook_deliveries_open"   ON public.platform_webhook_deliveries   FOR ALL TO authenticated USING (TRUE);
CREATE POLICY "platform_api_versions_open"         ON public.platform_api_versions         FOR ALL TO authenticated USING (TRUE);
CREATE POLICY "platform_api_analytics_open"        ON public.platform_api_analytics        FOR ALL TO authenticated USING (TRUE);
CREATE POLICY "platform_security_logs_open"        ON public.platform_security_logs        FOR ALL TO authenticated USING (TRUE);
CREATE POLICY "platform_developer_activity_logs_open" ON public.platform_developer_activity_logs FOR ALL TO authenticated USING (TRUE);
CREATE POLICY "platform_sandbox_data_open"         ON public.platform_sandbox_data         FOR ALL TO authenticated USING (TRUE);

-- ─── Seed starter API versions ────────────────────────────────────────────────
INSERT INTO public.platform_api_versions (version, stage, is_default, release_date, changelog)
VALUES
  ('v1.2.0',      'Active',  TRUE,  '2025-01-15T00:00:00Z', 'Stable production release for Ghana Basic Schools report card API.'),
  ('v2.0.0-beta', 'Preview', FALSE, '2026-06-01T00:00:00Z',  'Preview release with GraphQL support and real-time score sync webhooks.')
ON CONFLICT (version) DO NOTHING;
