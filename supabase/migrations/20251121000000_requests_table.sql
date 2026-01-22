-- Create requests table
create table requests (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  item_id uuid references items(id) on delete cascade not null,
  status text default 'pending' check (status in ('pending', 'approved', 'refused', 'cancelled')),
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable RLS
alter table requests enable row level security;

-- Policies

-- Students can create requests
create policy "Students can create requests" on requests
  for insert with check (auth.uid() = user_id);

-- Students can view their own requests
create policy "Users can view own requests" on requests
  for select using (auth.uid() = user_id);

-- Students can update their own requests (e.g. to cancel)
create policy "Users can update own requests" on requests
  for update using (auth.uid() = user_id);

-- Admins can view all requests
create policy "Admins can view all requests" on requests
  for select using (auth.uid() in (select id from profiles where role in ('instructor', 'admin')));

-- Admins can update all requests
create policy "Admins can update all requests" on requests
  for update using (auth.uid() in (select id from profiles where role in ('instructor', 'admin')));
