-- STEP 2 OF 2: Enable RLS + Policies + Seed Data
-- Run this AFTER step 1 succeeds

ALTER TABLE public.platform_api_keys                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_webhooks                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_webhook_deliveries       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_api_versions             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_api_analytics            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_security_logs            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_developer_activity_logs  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_sandbox_data             ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pak_open"  ON public.platform_api_keys                 FOR ALL TO authenticated USING (TRUE);
CREATE POLICY "pwh_open"  ON public.platform_webhooks                 FOR ALL TO authenticated USING (TRUE);
CREATE POLICY "pwd_open"  ON public.platform_webhook_deliveries       FOR ALL TO authenticated USING (TRUE);
CREATE POLICY "pav_open"  ON public.platform_api_versions             FOR ALL TO authenticated USING (TRUE);
CREATE POLICY "paa_open"  ON public.platform_api_analytics            FOR ALL TO authenticated USING (TRUE);
CREATE POLICY "psl_open"  ON public.platform_security_logs            FOR ALL TO authenticated USING (TRUE);
CREATE POLICY "pdal_open" ON public.platform_developer_activity_logs  FOR ALL TO authenticated USING (TRUE);
CREATE POLICY "psd_open"  ON public.platform_sandbox_data             FOR ALL TO authenticated USING (TRUE);

INSERT INTO public.platform_api_versions (version, stage, is_default, release_date, changelog)
VALUES
  ('v1.2.0',      'Active',  TRUE,  '2025-01-15T00:00:00Z', 'Stable production release for Ghana Basic Schools report card API.'),
  ('v2.0.0-beta', 'Preview', FALSE, '2026-06-01T00:00:00Z',  'Preview release with GraphQL support and real-time score sync webhooks.')
ON CONFLICT (version) DO NOTHING;
