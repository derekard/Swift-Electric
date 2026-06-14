-- Record how an invoice was paid (for bookkeeping / HST records).
-- Run this in the Supabase SQL editor against the live project.

alter table public.invoices
  add column if not exists payment_method text
    check (payment_method in ('cash', 'cheque', 'e_transfer', 'card', 'other'));
