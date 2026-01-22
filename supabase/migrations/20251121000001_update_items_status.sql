-- Update items status check constraint
alter table items drop constraint items_status_check;
alter table items add constraint items_status_check check (status in ('checked_in', 'checked_out', 'retired', 'requested'));
