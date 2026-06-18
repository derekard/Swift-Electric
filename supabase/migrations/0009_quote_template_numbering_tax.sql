-- ============================================================================
-- Quote proposal template + SE-* numbering scheme + invoice tax exemption.
-- Additive + idempotent. Auto-applies on deploy via scripts/migrate.mjs.
-- ============================================================================

-- 1) Default quote intro → professional proposal template --------------------
alter table public.tenant_settings
  alter column quote_intro set default
$tpl$At Swift Electric, we believe quality electrical work starts with clear communication, professional workmanship, and a commitment to doing the job right the first time. Our team takes pride in delivering safe, reliable, and code-compliant installations while providing a level of service that homeowners, businesses, and contractors can depend on.

This proposal outlines our understanding of your project requirements, the scope of work to be completed, project pricing, and associated terms. We have carefully reviewed the project and developed a solution designed to meet your needs while maintaining the highest standards of quality and safety.

We appreciate the opportunity to earn your business and look forward to working with you on this project.$tpl$;

-- Bring existing tenants still on the old one-line default up to the template
-- (don't clobber anyone who customized their intro).
update public.tenant_settings
  set quote_intro =
$tpl$At Swift Electric, we believe quality electrical work starts with clear communication, professional workmanship, and a commitment to doing the job right the first time. Our team takes pride in delivering safe, reliable, and code-compliant installations while providing a level of service that homeowners, businesses, and contractors can depend on.

This proposal outlines our understanding of your project requirements, the scope of work to be completed, project pricing, and associated terms. We have carefully reviewed the project and developed a solution designed to meet your needs while maintaining the highest standards of quality and safety.

We appreciate the opportunity to earn your business and look forward to working with you on this project.$tpl$
  where quote_intro = 'I am pleased to submit an estimate for the following electrical work';

-- 2) Numbering: SE-* prefixes, numbers start at the year base (26000) --------
-- Quote → SEQ-, Job → SEP- (project), Invoice → SEI-. Existing rows keep their
-- old numbers; new rows use the SE-* scheme from 26000 up. (Next year, bump the
-- sequences, e.g. `alter sequence ... restart with 27000`.)
alter sequence public.quote_seq   restart with 26000;
alter sequence public.job_seq     restart with 26000;
alter sequence public.invoice_seq restart with 26000;

alter table public.quotes
  alter column quote_number   set default ('SEQ-' || nextval('public.quote_seq'));
alter table public.jobs
  alter column job_number     set default ('SEP-' || nextval('public.job_seq'));
alter table public.invoices
  alter column invoice_number set default ('SEI-' || nextval('public.invoice_seq'));

-- 3) Invoice tax exemption ---------------------------------------------------
-- When true, HST is not charged (hst_amount = 0, total = pre-tax). The toggle
-- recomputes and stores hst_amount/total, so PDFs/lists/reports reflect it.
alter table public.invoices
  add column if not exists tax_exempt boolean not null default false;
