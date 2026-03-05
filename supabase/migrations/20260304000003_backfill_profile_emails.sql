-- Backfill profiles.email from auth.users for any existing rows where it is null.
-- New users are handled by the handle_new_user trigger (updated in 20260304000001).
update public.profiles p
set email = u.email
from auth.users u
where p.id = u.id
  and p.email is null
  and u.email is not null;
