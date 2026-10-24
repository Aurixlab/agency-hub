-- Run once in the SEO Supabase SQL editor. SEO sync upserts daily reports on
-- (client_id, report_type, period_start), which requires this unique constraint.
-- Keep only the newest report for any duplicate period before adding it.
DELETE FROM public.seo_reports a
USING public.seo_reports b
WHERE a.client_id = b.client_id
  AND a.report_type = b.report_type
  AND a.period_start = b.period_start
  AND (a.created_at, a.id::text) < (b.created_at, b.id::text);
ALTER TABLE public.seo_reports
  ADD CONSTRAINT seo_reports_client_type_period_key UNIQUE (client_id, report_type, period_start);
