create table custom_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'reviewed')),
  reason text not null,
  alternatives text not null,
  items jsonb not null default '[]',
  admin_note text,
  reviewed_by uuid references auth.users,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

alter table custom_requests enable row level security;

create policy "Users can view own custom requests"
  on custom_requests for select
  using (auth.uid() = user_id);

create policy "Users can insert own custom requests"
  on custom_requests for insert
  with check (auth.uid() = user_id and user_id is not null);

create policy "Admins can select all custom requests"
  on custom_requests for select
  using (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid()
      and profiles.role in ('admin', 'instructor')
    )
  );

create policy "Admins can update all custom requests"
  on custom_requests for update
  using (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid()
      and profiles.role in ('admin', 'instructor')
    )
  );
