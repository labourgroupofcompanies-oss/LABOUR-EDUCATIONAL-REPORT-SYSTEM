-- STEP 1 OF 2: Create Platform Tables
-- Run this first, wait for success, then run step 2

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

CREATE TABLE IF NOT EXISTS public.platform_webhook_deliveries (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  webhook_id       UUID,
  event            TEXT NOT NULL,
  status           TEXT NOT NULL DEFAULT 'pending',
  request_payload  JSONB,
  response_status  INTEGER,
  response_body    TEXT,
  response_time_ms INTEGER DEFAULT 0,
  retry_count      INTEGER DEFAULT 0,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

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

CREATE TABLE IF NOT EXISTS public.platform_sandbox_data (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type TEXT NOT NULL,
  data        JSONB NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
