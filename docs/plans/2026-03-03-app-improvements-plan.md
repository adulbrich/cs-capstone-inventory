# App Improvements Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement 7 improvements: admin role guard, logout button, active users stat, requests profile join, smart login redirect, transactions audit log, and filter dropdown.

**Architecture:** Server-side role guard via SvelteKit's nested layout system; UI polish in existing Svelte components; Supabase row-level security migration for transaction writes; profile data fetched in a second query and merged in JS to avoid FK join issues.

**Tech Stack:** SvelteKit 5 (Svelte 5 runes), Supabase (Postgres + RLS), bits-ui v2 (DropdownMenu child snippet pattern), Tailwind CSS v4.

> **Note:** This project has no automated test setup. Each task uses manual browser verification instead of test commands.

---

## Task 1: Transactions RLS Migration

**Files:**
- Create: `supabase/migrations/20260303000000_fix_transactions_rls.sql`

**Step 1: Create the migration file**

```sql
-- Allow authenticated users to insert transactions attributed to themselves.
-- This enables server actions (running as the authenticated user) to write audit logs.
create policy "Authenticated users can insert own transactions" on transactions
  for insert with check (auth.uid() = user_id);
```

**Step 2: Apply locally (if using Supabase CLI)**

```bash
supabase db push
```

If not using Supabase CLI locally, apply via the Supabase dashboard SQL editor.

**Step 3: Verify**

In the Supabase dashboard → Table Editor → `transactions` → RLS policies, confirm the new policy appears alongside the two existing SELECT policies.

**Step 4: Commit**

```bash
git add supabase/migrations/20260303000000_fix_transactions_rls.sql
git commit -m "feat: add INSERT RLS policy for transactions table"
```

---

## Task 2: Admin Role Guard

**Files:**
- Create: `src/routes/admin/+layout.server.ts`

**Step 1: Create the file**

```typescript
import { redirect } from "@sveltejs/kit";
import type { LayoutServerLoad } from "./$types";

export const load: LayoutServerLoad = async ({
  locals: { supabase, safeGetSession },
}) => {
  const { session } = await safeGetSession();

  if (!session) {
    throw redirect(303, "/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", session.user.id)
    .single();

  if (!profile || !["admin", "instructor"].includes(profile.role)) {
    throw redirect(303, "/");
  }

  return {};
};
```

**Step 2: Remove the redundant session check from `admin/+page.server.ts`**

In `src/routes/admin/+page.server.ts`, the top of `load` currently redirects to `/login` if no session. Remove those lines (lines 9-12) since the layout guard now handles it:

Old code to remove:
```typescript
  // Redirect to login if not authenticated
  if (!session) {
    throw redirect(303, "/login");
  }
```

Also remove the `redirect` import if it's only used there (keep `fail`).

**Step 3: Manual verification**

1. Start dev server: `npm run dev`
2. While logged out, navigate to `http://localhost:5173/admin` — should redirect to `/login`
3. Log in as a student account (create one if needed via Supabase dashboard) — navigating to `/admin` should redirect to `/`
4. Log in as `alex@example.com` (admin) — `/admin` should load normally

**Step 4: Commit**

```bash
git add src/routes/admin/+layout.server.ts src/routes/admin/+page.server.ts
git commit -m "feat: add admin role guard via layout.server.ts"
```

---

## Task 3: Logout Button

**Files:**
- Modify: `src/routes/+layout.svelte`

**Step 1: Add `goto` import and logout button**

Current `+layout.svelte` script block:
```typescript
import "./layout.css";
import { onMount } from "svelte";
import { invalidate } from "$app/navigation";
import { page } from "$app/stores";
```

Add `goto` to the navigation imports:
```typescript
import { goto, invalidate } from "$app/navigation";
```

**Step 2: Replace the nav Login link with a conditional logout/login**

Current nav section:
```svelte
<nav class="flex items-center space-x-4">
  <a href="/" class="font-semibold">Search Inventory</a>
  <a href="/admin" class="font-semibold">Manage Inventory</a>
  {#if !session}
    <a href="/login" class="font-semibold">Login</a>
  {/if}
</nav>
```

Replace with:
```svelte
<nav class="flex items-center space-x-4">
  <a href="/" class="font-semibold">Search Inventory</a>
  <a href="/admin" class="font-semibold">Manage Inventory</a>
  {#if session}
    <button
      class="font-semibold"
      onclick={async () => {
        await supabase.auth.signOut();
        await goto("/");
      }}
    >
      Logout
    </button>
  {:else}
    <a href="/login" class="font-semibold">Login</a>
  {/if}
</nav>
```

**Step 3: Manual verification**

1. Log in — nav should show "Logout" instead of "Login"
2. Click Logout — should navigate to `/` and nav should show "Login" again
3. While logged out, nav should show "Login"

**Step 4: Commit**

```bash
git add src/routes/+layout.svelte
git commit -m "feat: add logout button to nav"
```

---

## Task 4: Active Users Stat

**Files:**
- Modify: `src/routes/admin/+page.server.ts`

**Step 1: Replace the activeUsers placeholder**

Find this block in the `load` function (around line 43-53):
```typescript
  return {
    items: items || [],
    requests: requests || [],
    stats: {
      totalItems,
      checkedOut,
      retired,
      pendingRequests,
      activeUsers: 0, // Placeholder - would need to query profiles table
    },
  };
```

First, add the query before the return (after the existing stats calculations):
```typescript
  const { count: activeUsers } = await supabase
    .from("profiles")
    .select("*", { count: "exact", head: true });
```

Then update the return:
```typescript
  return {
    items: items || [],
    requests: requests || [],
    stats: {
      totalItems,
      checkedOut,
      retired,
      pendingRequests,
      activeUsers: activeUsers ?? 0,
    },
  };
```

**Step 2: Manual verification**

Navigate to `/admin` — the "Active Users" card should show a real number (at least 1, the alex admin account).

**Step 3: Commit**

```bash
git add src/routes/admin/+page.server.ts
git commit -m "feat: query real active users count for admin stats"
```

---

## Task 5: Requests Profile Join

**Files:**
- Modify: `src/routes/admin/+page.server.ts`

**Context:** The `requests` table has `user_id` but no direct FK to `profiles` recognized by the Supabase JS client. Email is not in `profiles`. We fetch profiles in a second query and merge in JS.

**Step 1: Add profile fetch and merge after the requests query**

After the existing requests fetch block, add:
```typescript
  // Fetch profiles for request users (second query to avoid FK join issues)
  const requestUserIds = [...new Set((requests || []).map((r) => r.user_id))];
  let profilesById: Record<string, { full_name: string | null }> = {};
  if (requestUserIds.length > 0) {
    const { data: requestProfiles } = await supabase
      .from("profiles")
      .select("id, full_name")
      .in("id", requestUserIds);
    if (requestProfiles) {
      profilesById = Object.fromEntries(
        requestProfiles.map((p) => [p.id, { full_name: p.full_name }])
      );
    }
  }

  // Merge user and item data into requests
  const requestsWithData = (requests || []).map((req) => ({
    ...req,
    user: profilesById[req.user_id] ?? {},
    item: (items || []).find((item) => item.id === req.item_id) ?? null,
  }));
```

**Step 2: Update the return to use `requestsWithData`**

```typescript
  return {
    items: items || [],
    requests: requestsWithData,
    stats: { ... },
  };
```

**Step 3: Manual verification**

1. Using the alex admin account, request an item as a different user (or create a pending request via Supabase dashboard)
2. Visit `/admin` — the requests table should show the user's full name instead of "Unknown User"

**Step 4: Commit**

```bash
git add src/routes/admin/+page.server.ts
git commit -m "feat: resolve user names in admin requests table"
```

---

## Task 6: Smart Login Redirect

**Files:**
- Modify: `src/routes/login/+page.svelte`

**Step 1: Update `handleLogin` to check role after sign-in**

Current:
```typescript
  } else {
    // Invalidate to refresh session data
    await invalidateAll();
    // Redirect to admin
    goto("/admin");
  }
```

Replace with:
```typescript
  } else {
    // Fetch profile to determine redirect destination
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", authData.user.id)
      .single();

    await invalidateAll();
    const dest =
      profile?.role === "admin" || profile?.role === "instructor"
        ? "/admin"
        : "/";
    goto(dest);
  }
```

**Step 2: Manual verification**

1. Log in as `alex@example.com` (admin) → should land on `/admin`
2. Log in as a student account → should land on `/`

**Step 3: Commit**

```bash
git add src/routes/login/+page.svelte
git commit -m "feat: redirect to correct page based on user role after login"
```

---

## Task 7: Transaction Writes (Audit Log — Server Side)

**Files:**
- Modify: `src/routes/+page.server.ts`
- Modify: `src/routes/admin/+page.server.ts`

**Context:** Insert a row into `transactions` after each state-changing action. Transaction failures are non-fatal — log to console but don't fail the user-facing action.

**Step 1: Add transaction insert to `requestItem` in `+page.server.ts`**

After the successful item status update (end of `requestItem` action, before `return { success: true }`):
```typescript
    // Log to audit trail (non-fatal)
    await supabase.from("transactions").insert({
      item_id: itemId,
      user_id: session.user.id,
      action: "check_out",
      notes: "Item requested by student",
    });
```

**Step 2: Add transaction insert to `cancelRequest` in `+page.server.ts`**

After the successful item status revert, before `return { success: true }`:
```typescript
    // Log to audit trail (non-fatal)
    await supabase.from("transactions").insert({
      item_id: reqData.item_id,
      user_id: session.user.id,
      action: "check_in",
      notes: "Request cancelled by student",
    });
```

**Step 3: Add transaction insert to `approveRequest` in `admin/+page.server.ts`**

After the successful item status update, before `return { success: true }`:
```typescript
    // Log to audit trail (non-fatal)
    await supabase.from("transactions").insert({
      item_id: reqData.item_id,
      user_id: session.user.id,
      action: "check_out",
      notes: `Approved for ${reqData.user?.full_name || "student"}`,
    });
```

**Step 4: Add transaction insert to `refuseRequest` in `admin/+page.server.ts`**

After the successful item status revert, before `return { success: true }`:
```typescript
    // Log to audit trail (non-fatal)
    await supabase.from("transactions").insert({
      item_id: reqData.item_id,
      user_id: session.user.id,
      action: "check_in",
      notes: "Request refused by admin",
    });
```

**Step 5: Add transaction insert to `create` and `update` in `admin/+page.server.ts`**

In the `create` action, after the successful insert, before `return { success: true, item: data }`:
```typescript
    await supabase.from("transactions").insert({
      item_id: data.id,
      user_id: (await supabase.auth.getUser()).data.user?.id ?? null,
      action: "note_added",
      notes: `Item created: ${title}`,
    });
```

Wait — in the `create` action, we don't have `safeGetSession` in scope. The action signature is `create: async ({ request, locals: { supabase } })`. We need to also destructure `safeGetSession`:

Update the create action signature:
```typescript
  create: async ({ request, locals: { supabase, safeGetSession } }) => {
```

Then add the session fetch and transaction insert:
```typescript
    const { session } = await safeGetSession();
    if (session) {
      await supabase.from("transactions").insert({
        item_id: data.id,
        user_id: session.user.id,
        action: "note_added",
        notes: `Item created: ${title}`,
      });
    }
```

Do the same for the `update` action (already has `safeGetSession` destructured):
```typescript
    if (session?.session) {
      await supabase.from("transactions").insert({
        item_id: id,
        user_id: session.session.user.id,
        action: "note_added",
        notes: `Item updated: ${title}`,
      });
    }
```

Note: In the update action, `safeGetSession` returns `{ session, user }`. Check what the update action currently does — it calls `const session = await event.locals.safeGetSession()` and checks `if (!session)`. This is slightly inconsistent with other actions (which destructure `{ session }`). Keep the existing pattern and adapt accordingly.

**Step 6: Manual verification**

1. Request an item as a student
2. In Supabase dashboard → Table Editor → `transactions` — should see a row with `action: "check_out"`
3. Approve the request as admin — should see a second `check_out` row
4. Create a new item as admin — should see a `note_added` row

**Step 7: Commit**

```bash
git add src/routes/+page.server.ts src/routes/admin/+page.server.ts
git commit -m "feat: write audit log entries to transactions table on state changes"
```

---

## Task 8: Audit Log Admin Viewer

**Files:**
- Modify: `src/routes/admin/+page.server.ts`
- Modify: `src/routes/admin/+page.svelte`

**Step 1: Fetch recent transactions in the load function**

In `admin/+page.server.ts`, add this after the existing queries:
```typescript
  // Fetch 50 most recent transactions with item title
  const { data: transactionLogs } = await supabase
    .from("transactions")
    .select("*, item:items(title)")
    .order("created_at", { ascending: false })
    .limit(50);

  // Resolve user names for transactions
  const txUserIds = [
    ...new Set(
      (transactionLogs || []).map((t) => t.user_id).filter(Boolean)
    ),
  ];
  let txProfilesById: Record<string, { full_name: string | null }> = {};
  if (txUserIds.length > 0) {
    const { data: txProfiles } = await supabase
      .from("profiles")
      .select("id, full_name")
      .in("id", txUserIds);
    if (txProfiles) {
      txProfilesById = Object.fromEntries(
        txProfiles.map((p) => [p.id, { full_name: p.full_name }])
      );
    }
  }

  const auditLog = (transactionLogs || []).map((t) => ({
    ...t,
    user: txProfilesById[t.user_id] ?? {},
  }));
```

Add `auditLog` to the return:
```typescript
  return {
    items: items || [],
    requests: requestsWithData,
    auditLog,
    stats: { ... },
  };
```

**Step 2: Add `Transaction` type and `auditLog` to `PageData` in `admin/+page.svelte`**

In the script block, add:
```typescript
  type Transaction = {
    id: string;
    item_id: string | null;
    user_id: string | null;
    action: string;
    notes: string | null;
    created_at: string;
    item: { title: string } | null;
    user: { full_name?: string | null };
  };
```

Add `auditLog: Transaction[]` to `PageData`.

**Step 3: Add the Audit Log card at the bottom of `admin/+page.svelte`**

After the existing Inventory Items card, add:
```svelte
<!-- Audit Log -->
{#if data.auditLog && data.auditLog.length > 0}
  <Card>
    <CardHeader>
      <CardTitle>Audit Log</CardTitle>
    </CardHeader>
    <CardContent>
      <div class="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Item</TableHead>
              <TableHead>User</TableHead>
              <TableHead>Action</TableHead>
              <TableHead>Notes</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {#each data.auditLog as entry (entry.id)}
              <TableRow>
                <TableCell class="text-xs text-muted-foreground whitespace-nowrap">
                  {new Date(entry.created_at).toLocaleString()}
                </TableCell>
                <TableCell class="font-medium">
                  {entry.item?.title || "—"}
                </TableCell>
                <TableCell>
                  {entry.user?.full_name || "—"}
                </TableCell>
                <TableCell>
                  <Badge variant="secondary" class="text-xs">
                    {entry.action.replace("_", " ")}
                  </Badge>
                </TableCell>
                <TableCell class="text-sm text-muted-foreground max-w-[200px] truncate">
                  {entry.notes || "—"}
                </TableCell>
              </TableRow>
            {/each}
          </TableBody>
        </Table>
      </div>
    </CardContent>
  </Card>
{/if}
```

**Step 4: Manual verification**

1. Perform some actions (request item, approve, create item)
2. Visit `/admin` — the Audit Log card should appear at the bottom with timestamped entries

**Step 5: Commit**

```bash
git add src/routes/admin/+page.server.ts src/routes/admin/+page.svelte
git commit -m "feat: add audit log viewer to admin dashboard"
```

---

## Task 9: Filter Dropdown

**Files:**
- Modify: `src/routes/+page.svelte`

**Step 1: Add DropdownMenu imports to the script block**

Add to the existing imports:
```typescript
  import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
  } from "$lib/components/ui/dropdown-menu";
```

**Step 2: Replace the filter Button with a DropdownMenu**

Find the current filter button:
```svelte
      <Button variant="outline" size="icon">
        <Filter class="h-4 w-4"/>
        <span class="sr-only">Filter</span>
      </Button>
```

Replace with:
```svelte
      <DropdownMenu>
        <DropdownMenuTrigger>
          {#snippet child({ props })}
            <Button
              variant="outline"
              size="icon"
              class={statusFilter !== "all" ? "border-primary" : ""}
              {...props}
            >
              <Filter class="h-4 w-4 {statusFilter !== 'all' ? 'text-primary' : ''}" />
              <span class="sr-only">Filter by status</span>
            </Button>
          {/snippet}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onclick={() => (statusFilter = "all")}>
            All
          </DropdownMenuItem>
          <DropdownMenuItem onclick={() => (statusFilter = "checked_in")}>
            Available
          </DropdownMenuItem>
          <DropdownMenuItem onclick={() => (statusFilter = "checked_out")}>
            Checked Out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
```

**Step 3: Manual verification**

1. Visit `/` — filter button should open a dropdown with three options
2. Select "Available" — grid should show only `checked_in` items; filter button border turns primary color
3. Select "All" — all non-retired items return
4. Combine with search — both filters should work together (the `filteredItems` derived already chains them)

**Step 4: Commit**

```bash
git add src/routes/+page.svelte
git commit -m "feat: wire up filter button with status dropdown"
```

---

## Summary

| Task | Files Changed | Commit |
|------|--------------|--------|
| 1. Transactions RLS | `migrations/...sql` | `feat: add INSERT RLS policy for transactions table` |
| 2. Admin role guard | `admin/+layout.server.ts`, `admin/+page.server.ts` | `feat: add admin role guard via layout.server.ts` |
| 3. Logout button | `+layout.svelte` | `feat: add logout button to nav` |
| 4. Active users | `admin/+page.server.ts` | `feat: query real active users count for admin stats` |
| 5. Profile join | `admin/+page.server.ts` | `feat: resolve user names in admin requests table` |
| 6. Smart redirect | `login/+page.svelte` | `feat: redirect to correct page based on user role after login` |
| 7. Transaction writes | `+page.server.ts`, `admin/+page.server.ts` | `feat: write audit log entries to transactions table on state changes` |
| 8. Audit log UI | `admin/+page.server.ts`, `admin/+page.svelte` | `feat: add audit log viewer to admin dashboard` |
| 9. Filter dropdown | `+page.svelte` | `feat: wire up filter button with status dropdown` |
