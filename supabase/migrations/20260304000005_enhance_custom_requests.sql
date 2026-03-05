-- Drop old constraint first so the backfill UPDATE is not blocked
alter table custom_requests drop constraint if exists custom_requests_status_check;

-- Migrate existing 'reviewed' rows to 'approved' (reviewed implied admin acceptance)
update custom_requests set status = 'approved' where status = 'reviewed';

-- Re-add constraint: requests go directly to approved or refused (no intermediate 'reviewed')
alter table custom_requests add constraint custom_requests_status_check
  check (status in ('pending', 'approved', 'refused'));

-- Link procurement items back to their source custom request
alter table items add column if not exists custom_request_id uuid
  references custom_requests(id) on delete set null;
