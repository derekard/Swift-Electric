-- ============================================================================
-- One-time: renumber EXISTING quotes/jobs/invoices into the SE-* scheme so all
-- records are consistent (new ones already use SEP-/SEQ-/SEI- from 0009).
-- Numbers are assigned in creation order starting at 26000. The display numbers
-- are not referenced by any foreign key (relations use UUIDs), so this is safe.
--
-- Two-step per table (temp value first) so the UNIQUE constraint can't be
-- violated mid-update while values are reshuffled. Deterministic + safe to
-- re-run.
-- ============================================================================

-- Quotes ---------------------------------------------------------------------
update public.quotes set quote_number = 'TMPQ-' || id::text;
with ordered as (
  select id, row_number() over (order by created_at, id) - 1 as rn
  from public.quotes
)
update public.quotes q
  set quote_number = 'SEQ-' || (26000 + o.rn)
  from ordered o
  where o.id = q.id;
select setval(
  'public.quote_seq',
  26000 + greatest((select count(*) from public.quotes), 1) - 1,
  (select count(*) from public.quotes) > 0
);

-- Jobs -----------------------------------------------------------------------
update public.jobs set job_number = 'TMPJ-' || id::text;
with ordered as (
  select id, row_number() over (order by created_at, id) - 1 as rn
  from public.jobs
)
update public.jobs j
  set job_number = 'SEP-' || (26000 + o.rn)
  from ordered o
  where o.id = j.id;
select setval(
  'public.job_seq',
  26000 + greatest((select count(*) from public.jobs), 1) - 1,
  (select count(*) from public.jobs) > 0
);

-- Invoices -------------------------------------------------------------------
update public.invoices set invoice_number = 'TMPI-' || id::text;
with ordered as (
  select id, row_number() over (order by created_at, id) - 1 as rn
  from public.invoices
)
update public.invoices i
  set invoice_number = 'SEI-' || (26000 + o.rn)
  from ordered o
  where o.id = i.id;
select setval(
  'public.invoice_seq',
  26000 + greatest((select count(*) from public.invoices), 1) - 1,
  (select count(*) from public.invoices) > 0
);
