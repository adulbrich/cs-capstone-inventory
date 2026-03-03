# App Improvements Design
Date: 2026-03-03

## Overview
Seven improvements to the CS Capstone Inventory Management app to address security gaps, UX issues, and missing features identified after the first working iteration.

---

## 1. Admin Role Guard
**Problem:** Any authenticated user can access `/admin`.

**Solution:** Create `src/routes/admin/+layout.server.ts`. It fetches the user's profile from the `profiles` table and redirects to `/` with a 303 if the role is not `admin` or `instructor`. This protects the entire `/admin` route subtree, now and for any future admin routes.

---

## 2. Logout Button
**Problem:** There is no way to sign out once logged in.

**Solution:** Add a logout button to the nav in `src/routes/+layout.svelte`, visible only when a session exists. It calls `supabase.auth.signOut()` then navigates to `/`. Styled as a subtle nav link to match existing nav items.

---

## 3. Active Users Stat
**Problem:** The "Active Users" card on the admin dashboard is hardcoded to `0`.

**Solution:** In `src/routes/admin/+page.server.ts`, replace the placeholder with `SELECT COUNT(*) FROM profiles` using the Supabase client's `.select('*', { count: 'exact', head: true })` pattern.

---

## 4. Requests Table — User Names
**Problem:** The admin requests table shows "Unknown User" because requests are fetched without a profile join (FK relationship error workaround).

**Solution:** After fetching requests, extract unique `user_id` values, query `profiles` for those IDs, then merge user data into request objects in JavaScript before returning from the load function. Avoids the FK relationship issue while still displaying full names and emails.

---

## 5. Smart Login Redirect
**Problem:** Login always redirects to `/admin` regardless of the user's role.

**Solution:** In `src/routes/login/+page.svelte`, after successful sign-in, query `profiles` for the user's role. Redirect `admin`/`instructor` to `/admin`, redirect `student` (or any other role) to `/`.

---

## 6. Transactions Audit Log
**Problem:** The `transactions` table exists in the schema but is never written to or displayed.

**Solution (write side):** In the relevant server actions, insert a transaction record after each state change:
- `requestItem` → action: `check_out` (pending)
- `cancelRequest` → action: `check_in`
- `approveRequest` → action: `check_out`
- `refuseRequest` → action: `check_in`
- `create` (admin item creation) → action: `note_added`
- `update` (admin item update) → action: `note_added`

Also add a new migration to ensure the `transactions` table has correct RLS:
- Admins/instructors can insert and select all transactions.
- Users can select transactions where `user_id = auth.uid()`.

**Solution (read side):** Add an "Audit Log" card at the bottom of the admin page. Fetch the 50 most recent transaction entries joined with item titles and user profiles. Display as a simple table: Date | Item | User | Action | Notes.

---

## 7. Filter Dropdown on Inventory Page
**Problem:** The filter icon button on the main inventory page has no behavior.

**Solution:** Replace the `<Button>` with a `<DropdownMenu>` containing three options: All / Available / Checked Out. Selecting an option sets `statusFilter`, which the existing `filteredItems` derived state already uses for filtering. The button shows a visual indicator (filled icon or badge) when a non-"all" filter is active.

---

## Files Changed

| File | Change |
|------|--------|
| `src/routes/admin/+layout.server.ts` | **New** — role guard |
| `src/routes/+layout.svelte` | Add logout button to nav |
| `src/routes/admin/+page.server.ts` | Fix activeUsers, profile join, add transaction writes, fetch audit log |
| `src/routes/admin/+page.svelte` | Add audit log card |
| `src/routes/login/+page.svelte` | Smart role-based redirect |
| `src/routes/+page.svelte` | Filter dropdown |
| `src/routes/+page.server.ts` | Add transaction writes for requestItem/cancelRequest |
| `supabase/migrations/<timestamp>_fix_transactions_rls.sql` | **New** — transactions RLS policies |
