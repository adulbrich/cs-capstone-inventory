-- Add 'picked_up' to the checkout_requests status allowed values
alter table checkout_requests
  drop constraint checkout_requests_status_check;
alter table checkout_requests
  add constraint checkout_requests_status_check
  check (status in ('pending', 'reviewed', 'cancelled', 'returned', 'picked_up'));
