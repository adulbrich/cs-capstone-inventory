-- Expand custom_request status to support approved/refused outcomes
alter table custom_requests drop constraint if exists custom_requests_status_check;
alter table custom_requests add constraint custom_requests_status_check
  check (status in ('pending', 'reviewed', 'approved', 'refused'));

-- Link procurement items back to their source custom request
alter table items add column if not exists custom_request_id uuid
  references custom_requests(id) on delete set null;
