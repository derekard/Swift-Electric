-- ============================================================================
-- Field report finishers
--
-- Store finger-drawn sign-off images in private storage and keep the database
-- row light by recording only the storage path/content type.
-- ============================================================================

alter table public.job_signoffs
  add column if not exists signature_image_path text,
  add column if not exists signature_content_type text;
