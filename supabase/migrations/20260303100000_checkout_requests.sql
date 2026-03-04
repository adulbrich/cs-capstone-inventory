create table checkout_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'reviewed', 'cancelled')),
  admin_note text,
  reviewed_by uuid references auth.users,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create table checkout_request_items (
  id uuid primary key default gen_random_uuid(),
  checkout_request_id uuid not null references checkout_requests on delete cascade,
  item_id uuid references items on delete set null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'refused')),
  created_at timestamptz not null default now()
);

-- RLS: checkout_requests
alter table checkout_requests enable row level security;

create policy "Users can view own checkout requests"
  on checkout_requests for select
  using (auth.uid() = user_id);

create policy "Users can insert own checkout requests"
  on checkout_requests for insert
  with check (auth.uid() = user_id and user_id is not null);

create policy "Users can update own pending checkout requests"
  on checkout_requests for update
  using (auth.uid() = user_id and status = 'pending')
  with check (auth.uid() = user_id);

create policy "Admins can select all checkout requests"
  on checkout_requests for select
  using (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid()
      and profiles.role in ('admin', 'instructor')
    )
  );

create policy "Admins can update all checkout requests"
  on checkout_requests for update
  using (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid()
      and profiles.role in ('admin', 'instructor')
    )
  );

-- RLS: checkout_request_items
alter table checkout_request_items enable row level security;

create policy "Users can view own checkout request items"
  on checkout_request_items for select
  using (
    exists (
      select 1 from checkout_requests cr
      where cr.id = checkout_request_id
      and cr.user_id = auth.uid()
    )
  );

create policy "Users can insert own checkout request items"
  on checkout_request_items for insert
  with check (
    exists (
      select 1 from checkout_requests cr
      where cr.id = checkout_request_id
      and cr.user_id = auth.uid()
    )
  );

create policy "Admins can select all checkout request items"
  on checkout_request_items for select
  using (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid()
      and profiles.role in ('admin', 'instructor')
    )
  );

create policy "Admins can update all checkout request items"
  on checkout_request_items for update
  using (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid()
      and profiles.role in ('admin', 'instructor')
    )
  );
