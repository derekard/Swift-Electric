-- ============================================================================
-- Cross-tenant relationship integrity.
--
-- Existing tenant-scoped child tables already carry tenant_id and single-column
-- UUID FKs. These composite FKs make the database reject new or updated rows
-- whose related parent belongs to a different tenant. They are NOT VALID so the
-- migration does not destructively rewrite or fail on any legacy dirty data;
-- PostgreSQL still enforces them for future INSERT/UPDATE statements.
-- ============================================================================

-- Parent keys required by composite foreign keys.
alter table public.clients
  add constraint clients_id_tenant_id_unique unique (id, tenant_id);

alter table public.quotes
  add constraint quotes_id_tenant_id_unique unique (id, tenant_id);

alter table public.quote_areas
  add constraint quote_areas_id_tenant_id_unique unique (id, tenant_id);

alter table public.price_book_items
  add constraint price_book_items_id_tenant_id_unique unique (id, tenant_id);

alter table public.jobs
  add constraint jobs_id_tenant_id_unique unique (id, tenant_id);

alter table public.profiles
  add constraint profiles_id_tenant_id_unique unique (id, tenant_id);

-- Quotes and their nested proposal rows.
alter table public.quotes
  add constraint quotes_client_same_tenant_fk
  foreign key (client_id, tenant_id)
  references public.clients (id, tenant_id)
  not valid;

alter table public.quote_areas
  add constraint quote_areas_quote_same_tenant_fk
  foreign key (quote_id, tenant_id)
  references public.quotes (id, tenant_id)
  on delete cascade
  not valid;

alter table public.quote_lines
  add constraint quote_lines_area_same_tenant_fk
  foreign key (area_id, tenant_id)
  references public.quote_areas (id, tenant_id)
  on delete cascade
  not valid;

alter table public.quote_lines
  add constraint quote_lines_price_book_item_same_tenant_fk
  foreign key (price_book_item_id, tenant_id)
  references public.price_book_items (id, tenant_id)
  not valid;

-- Jobs, assignments, and invoice lineage.
alter table public.jobs
  add constraint jobs_quote_same_tenant_fk
  foreign key (quote_id, tenant_id)
  references public.quotes (id, tenant_id)
  not valid;

alter table public.jobs
  add constraint jobs_client_same_tenant_fk
  foreign key (client_id, tenant_id)
  references public.clients (id, tenant_id)
  not valid;

alter table public.job_assignments
  add constraint job_assignments_job_same_tenant_fk
  foreign key (job_id, tenant_id)
  references public.jobs (id, tenant_id)
  on delete cascade
  not valid;

alter table public.job_assignments
  add constraint job_assignments_profile_same_tenant_fk
  foreign key (profile_id, tenant_id)
  references public.profiles (id, tenant_id)
  on delete cascade
  not valid;

alter table public.invoices
  add constraint invoices_job_same_tenant_fk
  foreign key (job_id, tenant_id)
  references public.jobs (id, tenant_id)
  not valid;

alter table public.invoices
  add constraint invoices_quote_same_tenant_fk
  foreign key (quote_id, tenant_id)
  references public.quotes (id, tenant_id)
  not valid;

alter table public.invoices
  add constraint invoices_client_same_tenant_fk
  foreign key (client_id, tenant_id)
  references public.clients (id, tenant_id)
  not valid;

-- Operational rows must point at jobs from the same tenant.
alter table public.time_entries
  add constraint time_entries_job_same_tenant_fk
  foreign key (job_id, tenant_id)
  references public.jobs (id, tenant_id)
  not valid;

alter table public.mileage_entries
  add constraint mileage_entries_job_same_tenant_fk
  foreign key (job_id, tenant_id)
  references public.jobs (id, tenant_id)
  not valid;

alter table public.expenses
  add constraint expenses_job_same_tenant_fk
  foreign key (job_id, tenant_id)
  references public.jobs (id, tenant_id)
  not valid;

alter table public.job_visits
  add constraint job_visits_job_same_tenant_fk
  foreign key (job_id, tenant_id)
  references public.jobs (id, tenant_id)
  on delete cascade
  not valid;
