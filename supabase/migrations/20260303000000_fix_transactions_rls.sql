-- Allow authenticated users to insert transactions attributed to themselves.
-- This enables server actions (running as the authenticated user) to write audit logs.
create policy "Authenticated users can insert own transactions" on transactions
  for insert with check (auth.uid() = user_id);
