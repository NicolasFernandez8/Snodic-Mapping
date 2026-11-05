-- DESTRUCTIVO: borra historial, variantes, casos y datos de captación.
SET search_path TO mapping, public;
DROP TABLE IF EXISTS activities, message_variants, case_studies;
ALTER TABLE outputs DROP COLUMN IF EXISTS variant;
ALTER TABLE prospects
  DROP COLUMN IF EXISTS stage, DROP COLUMN IF EXISTS stage_changed_at, DROP COLUMN IF EXISTS contacted_at,
  DROP COLUMN IF EXISTS next_follow_up_at, DROP COLUMN IF EXISTS follow_ups_sent, DROP COLUMN IF EXISTS assigned_to,
  DROP COLUMN IF EXISTS score, DROP COLUMN IF EXISTS score_breakdown, DROP COLUMN IF EXISTS message_variant,
  DROP COLUMN IF EXISTS audit_slug, DROP COLUMN IF EXISTS audit_views, DROP COLUMN IF EXISTS audit_last_viewed_at;
DELETE FROM settings WHERE key IN ('follow_up_days','follow_up_max','contact_whatsapp');
DELETE FROM public.schema_migrations WHERE version = '004_crm';
