-- Campos del prospecto que usa la base de Notion de Snodic.
-- Reversión: db/migrations/002_notion_fields.down.sql
SET search_path TO mapping, public;

ALTER TABLE prospects
  ADD COLUMN business_days  text,   -- "Lunes a Domingo"
  ADD COLUMN business_hours text,   -- "12:30 a 16:00"
  ADD COLUMN facebook       text;
