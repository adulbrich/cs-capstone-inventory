-- Extend items status to support procurement lifecycle
alter table items drop constraint items_status_check;
alter table items add constraint items_status_check
  check (status in ('checked_in', 'checked_out', 'retired', 'requested', 'procurement', 'purchased'));

-- Store the purchase/vendor URL for items sourced from custom requests
alter table items add column if not exists purchase_url text;
