# Cart & Custom Requests Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace single-item request flow with a cart-based checkout system, and add a custom hardware request form for non-inventory items.

**Architecture:** Cart state lives in-memory in `+layout.svelte` via Svelte context (`setContext`/`getContext`). Two new DB tables (`checkout_requests` + `checkout_request_items`) persist submitted carts. A third table (`custom_requests`) handles non-inventory requests. Old `requests` table is preserved for historical data but no longer written to.

**Tech Stack:** SvelteKit 5, Svelte 5 runes (`$state`, `$derived`, `setContext`/`getContext`), Supabase Postgres + RLS, shadcn-svelte (bits-ui v2) Sheet/DropdownMenu components, Tailwind CSS v4, Biome

---

### Task 1: DB Migration — checkout_requests tables

**Files:**
- Create: `supabase/migrations/20260303100000_checkout_requests.sql`

**Step 1: Write the migration file**

```sql
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
```

**Step 2: Apply the migration**

Run: `bun supabase db push`
Or paste directly in Supabase Studio → SQL Editor → Run.

**Step 3: Verify**

In Supabase Studio → Table Editor, confirm both `checkout_requests` and `checkout_request_items` tables exist with the correct columns.

**Step 4: Commit**

```bash
git add supabase/migrations/20260303100000_checkout_requests.sql
git commit -m "feat: add checkout_requests and checkout_request_items tables with RLS"
```

---

### Task 2: DB Migration — custom_requests table

**Files:**
- Create: `supabase/migrations/20260303100001_custom_requests.sql`

**Step 1: Write the migration file**

```sql
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
```

**Step 2: Apply and verify**

Same as Task 1 — apply via `bun supabase db push` or Studio, confirm table exists.

**Step 3: Commit**

```bash
git add supabase/migrations/20260303100001_custom_requests.sql
git commit -m "feat: add custom_requests table with RLS"
```

---

### Task 3: Update root layout server to expose userRole

**Files:**
- Modify: `src/routes/+layout.server.ts`

Current file returns `session`, `user`, `cookies`. We need `userRole` to show/hide the "Custom Requests" admin nav link.

**Step 1: Replace the entire file**

```typescript
import type { LayoutServerLoad } from "./$types";

export const load: LayoutServerLoad = async ({
  locals: { supabase, safeGetSession },
  cookies,
}) => {
  const { session, user } = await safeGetSession();

  let userRole: string | null = null;
  if (session) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", session.user.id)
      .single();
    userRole = profile?.role ?? null;
  }

  return {
    session,
    user,
    cookies: cookies.getAll(),
    userRole,
  };
};
```

**Step 2: Run type check**

Run: `bun run check`
Expected: no errors

**Step 3: Commit**

```bash
git add src/routes/+layout.server.ts
git commit -m "feat: expose userRole from root layout server"
```

---

### Task 4: Update +layout.svelte — cart context and admin nav link

**Files:**
- Modify: `src/routes/+layout.svelte`

**Step 1: Replace the entire file**

```svelte
<script lang="ts">
  import "./layout.css";
  import { onMount } from "svelte";
  import { setContext } from "svelte";
  import { goto, invalidate, invalidateAll } from "$app/navigation";

  let { data, children } = $props();
  let { supabase, session } = $derived(data);

  // Cart state — in-memory, lost on page refresh (intentional per design)
  let cartItems = $state<{ id: string; title: string }[]>([]);

  setContext("cart", {
    get items() {
      return cartItems;
    },
    add(item: { id: string; title: string }) {
      if (!cartItems.some((i) => i.id === item.id)) {
        cartItems = [...cartItems, item];
      }
    },
    remove(id: string) {
      cartItems = cartItems.filter((i) => i.id !== id);
    },
    clear() {
      cartItems = [];
    },
  });

  onMount(() => {
    const { data: authData } = supabase.auth.onAuthStateChange(
      (event, _session) => {
        if (_session?.expires_at !== session?.expires_at) {
          invalidate("supabase:auth");
        }
      }
    );

    return () => authData.subscription.unsubscribe();
  });
</script>

<div class="min-h-screen bg-background">
  <header class="border-b">
    <div class="container mx-auto px-4 py-4">
      <nav class="flex items-center space-x-4">
        <a href="/" class="font-semibold">Search Inventory</a>
        <a href="/admin" class="font-semibold">Manage Inventory</a>
        {#if data.userRole === "admin" || data.userRole === "instructor"}
          <a href="/admin/custom-requests" class="font-semibold">Custom Requests</a>
        {/if}
        {#if session}
          <button
            class="font-semibold cursor-pointer border-none bg-transparent p-0"
            onclick={async () => {
              try {
                await supabase.auth.signOut();
              } catch {
                // ignore signOut errors, still navigate home
              }
              await invalidateAll();
              await goto("/");
            }}
          >
            Logout
          </button>
        {:else}
          <a href="/login" class="font-semibold">Login</a>
        {/if}
      </nav>
    </div>
  </header>

  <main class="container mx-auto px-4 py-8">{@render children()}</main>
</div>
```

**Step 2: Run type check**

Run: `bun run check`
Expected: no errors

**Step 3: Commit**

```bash
git add src/routes/+layout.svelte
git commit -m "feat: add cart context and Custom Requests nav link to layout"
```

---

### Task 5: Update +page.server.ts — replace load function

**Files:**
- Modify: `src/routes/+page.server.ts` (load function only; keep existing actions temporarily)

**Step 1: Replace the `load` export (lines 4–39) with the following**

```typescript
export const load: PageServerLoad = async ({
  locals: { supabase, safeGetSession },
}) => {
  const { session } = await safeGetSession();

  const { data: items, error: itemsError } = await supabase
    .from("items")
    .select("*")
    .neq("status", "retired")
    .order("title", { ascending: true });

  if (itemsError) {
    console.error("Error fetching items:", itemsError);
  }

  let userCartRequests: Record<string, unknown>[] = [];
  let hasPendingCart = false;
  if (session) {
    const { data: cartRequests, error: cartError } = await supabase
      .from("checkout_requests")
      .select(
        "id, status, admin_note, created_at, checkout_request_items(id, status, item:items(id, title))"
      )
      .eq("user_id", session.user.id)
      .order("created_at", { ascending: false });

    if (cartError) {
      console.error("Error fetching cart requests:", cartError);
    } else {
      userCartRequests = cartRequests || [];
      hasPendingCart = (cartRequests || []).some((r) => r.status === "pending");
    }
  }

  return {
    items: items || [],
    userCartRequests,
    hasPendingCart,
    session,
  };
};
```

**Step 2: Run type check**

Run: `bun run check`
Expected: no errors (the old actions still reference `requests` table but TypeScript won't complain about that)

**Step 3: Commit**

```bash
git add src/routes/+page.server.ts
git commit -m "feat: update page load to fetch checkout_requests"
```

---

### Task 6: Replace old actions with submitCart and cancelCart

**Files:**
- Modify: `src/routes/+page.server.ts` (replace the entire `actions` export)

**Step 1: Replace everything from `export const actions: Actions = {` to the end of the file with:**

```typescript
export const actions: Actions = {
  submitCart: async ({ request, locals: { supabase, safeGetSession } }) => {
    const { session } = await safeGetSession();
    if (!session) {
      return fail(401, { message: "You must be logged in to submit a request." });
    }

    const formData = await request.formData();
    const itemIds = formData.getAll("itemId") as string[];

    if (itemIds.length === 0) {
      return fail(400, { message: "Cart is empty." });
    }

    // Block duplicate pending cart
    const { data: existing } = await supabase
      .from("checkout_requests")
      .select("id")
      .eq("user_id", session.user.id)
      .eq("status", "pending")
      .limit(1)
      .maybeSingle();

    if (existing) {
      return fail(400, { message: "You already have a pending request." });
    }

    // Verify all items are still checked_in
    const { data: itemsData, error: itemsError } = await supabase
      .from("items")
      .select("id, status")
      .in("id", itemIds);

    if (itemsError || !itemsData) {
      return fail(500, { message: "Failed to verify items." });
    }

    const unavailable = itemsData.filter((i) => i.status !== "checked_in");
    if (unavailable.length > 0) {
      return fail(400, { message: "One or more items are no longer available." });
    }

    // Create checkout_request
    const { data: cartRequest, error: cartError } = await supabase
      .from("checkout_requests")
      .insert({ user_id: session.user.id, status: "pending" })
      .select("id")
      .single();

    if (cartError || !cartRequest) {
      return fail(500, { message: "Failed to create request." });
    }

    // Create checkout_request_items
    const { error: itemsInsertError } = await supabase
      .from("checkout_request_items")
      .insert(
        itemIds.map((id) => ({
          checkout_request_id: cartRequest.id,
          item_id: id,
          status: "pending",
        }))
      );

    if (itemsInsertError) {
      return fail(500, { message: "Failed to add items to request." });
    }

    // Update each item to requested
    const { error: updateError } = await supabase
      .from("items")
      .update({ status: "requested" })
      .in("id", itemIds);

    if (updateError) {
      console.error("Failed to update item statuses:", updateError);
      return fail(500, { message: "Failed to update item statuses." });
    }

    // Audit log (non-fatal)
    for (const itemId of itemIds) {
      const { error: txError } = await supabase.from("transactions").insert({
        item_id: itemId,
        user_id: session.user.id,
        action: "check_out",
        notes: "Item added to cart request",
      });
      if (txError) console.error("Failed to log transaction:", txError);
    }

    return { success: true };
  },

  cancelCart: async ({ request, locals: { supabase, safeGetSession } }) => {
    const { session } = await safeGetSession();
    if (!session) {
      return fail(401, { message: "You must be logged in." });
    }

    const formData = await request.formData();
    const cartRequestId = formData.get("cartRequestId") as string;

    if (!cartRequestId) {
      return fail(400, { message: "Request ID is required." });
    }

    // Verify ownership and pending status
    const { data: cartReq, error: cartReqError } = await supabase
      .from("checkout_requests")
      .select("id, status")
      .eq("id", cartRequestId)
      .eq("user_id", session.user.id)
      .single();

    if (cartReqError || !cartReq) {
      return fail(404, { message: "Request not found." });
    }

    if (cartReq.status !== "pending") {
      return fail(400, { message: "Can only cancel pending requests." });
    }

    // Fetch the item IDs in this cart to revert
    const { data: cartItems, error: itemsFetchError } = await supabase
      .from("checkout_request_items")
      .select("item_id")
      .eq("checkout_request_id", cartRequestId);

    if (itemsFetchError) {
      return fail(500, { message: "Failed to fetch cart items." });
    }

    // Cancel the request
    const { error: cancelError } = await supabase
      .from("checkout_requests")
      .update({ status: "cancelled" })
      .eq("id", cartRequestId);

    if (cancelError) {
      return fail(500, { message: "Failed to cancel request." });
    }

    // Revert items to checked_in
    const itemIds = (cartItems || [])
      .map((ci) => ci.item_id)
      .filter(Boolean) as string[];

    if (itemIds.length > 0) {
      const { error: revertError } = await supabase
        .from("items")
        .update({ status: "checked_in" })
        .in("id", itemIds);

      if (revertError) {
        console.error("Failed to revert item statuses:", revertError);
      }

      for (const itemId of itemIds) {
        const { error: txError } = await supabase.from("transactions").insert({
          item_id: itemId,
          user_id: session.user.id,
          action: "check_in",
          notes: "Cart request cancelled by user",
        });
        if (txError) console.error("Failed to log transaction:", txError);
      }
    }

    return { success: true };
  },
};
```

**Step 2: Run type check**

Run: `bun run check`
Expected: no errors

**Step 3: Commit**

```bash
git add src/routes/+page.server.ts
git commit -m "feat: replace requestItem/cancelRequest with submitCart/cancelCart actions"
```

---

### Task 7: Update +page.svelte — cart UI, Add to Cart, My Requests redesign

**Files:**
- Modify: `src/routes/+page.svelte`

**Step 1: Replace the entire file content**

```svelte
<script lang="ts">
  // biome-ignore assist/source/organizeImports: bug in biome
  import { Badge } from "$lib/components/ui/badge";
  import { Button } from "$lib/components/ui/button";
  import {
    Card,
    CardContent,
    CardDescription,
    CardFooter,
    CardHeader,
    CardTitle,
  } from "$lib/components/ui/card";
  import { enhance } from "$app/forms";
  import { Filter, Search, ShoppingCart, X } from "@lucide/svelte";
  import { Input } from "$lib/components/ui/input";
  import { Separator } from "$lib/components/ui/separator";
  import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
  } from "$lib/components/ui/dropdown-menu";
  import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetFooter,
    SheetHeader,
    SheetTitle,
  } from "$lib/components/ui/sheet";
  import { getContext } from "svelte";

  type CartItem = { id: string; title: string };
  type CartContext = {
    items: CartItem[];
    add: (item: CartItem) => void;
    remove: (id: string) => void;
    clear: () => void;
  };

  type Item = {
    id: string;
    title: string;
    description?: string;
    status: string;
    tags?: string[];
  };

  type CartRequestItem = {
    id: string;
    status: string;
    item: { id: string; title: string } | null;
  };

  type CartRequest = {
    id: string;
    status: string;
    admin_note: string | null;
    created_at: string;
    checkout_request_items: CartRequestItem[];
  };

  type PageData = {
    items: Item[];
    userCartRequests: CartRequest[];
    hasPendingCart: boolean;
    session: { user: { id: string } } | null;
  };

  const { data } = $props<{ data: PageData }>();
  const cart = getContext<CartContext>("cart");

  let searchQuery = $state("");
  let statusFilter = $state("all");
  let isCartOpen = $state(false);
  let isSubmitting = $state(false);

  const session = $derived(data.session);
  const userCartRequests = $derived(data.userCartRequests || []);
  const hasPendingCart = $derived(data.hasPendingCart);

  const filteredItems = $derived(
    data.items.filter((item: Item) => {
      const matchesSearch =
        !searchQuery ||
        item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.description?.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesStatus =
        statusFilter === "all" || item.status === statusFilter;
      return matchesSearch && matchesStatus;
    }),
  );

  function getStatusColor(status: string) {
    switch (status) {
      case "checked_in": return "bg-green-100 text-green-800";
      case "checked_out": return "bg-yellow-100 text-yellow-800";
      case "retired": return "bg-red-100 text-red-800";
      case "requested": return "bg-blue-100 text-blue-800";
      default: return "";
    }
  }

  function getStatusLabel(status: string) {
    switch (status) {
      case "checked_in": return "Available";
      case "checked_out": return "Checked Out";
      case "retired": return "Retired";
      case "requested": return "Requested";
      default: return status;
    }
  }

  function getCartRequestStatusColor(status: string) {
    switch (status) {
      case "pending": return "bg-yellow-100 text-yellow-800";
      case "reviewed": return "bg-blue-100 text-blue-800";
      case "cancelled": return "bg-gray-100 text-gray-800";
      default: return "";
    }
  }

  function getItemDecisionColor(status: string) {
    switch (status) {
      case "approved": return "bg-green-100 text-green-800";
      case "refused": return "bg-red-100 text-red-800";
      default: return "bg-yellow-100 text-yellow-800";
    }
  }

  function isInCart(itemId: string) {
    return cart.items.some((i) => i.id === itemId);
  }
</script>

<div class="space-y-8 pb-24">
  <div class="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
    <div>
      <h1 class="text-3xl font-bold tracking-tight">Inventory</h1>
      <p class="text-muted-foreground">
        Browse available hardware for your capstone project.
      </p>
    </div>
    <div class="flex items-center gap-2">
      <div class="relative w-full md:w-64">
        <Search class="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          type="search"
          placeholder="Search..."
          class="pl-8"
          bind:value={searchQuery}
        />
      </div>
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
          <DropdownMenuItem onclick={() => (statusFilter = "all")}>All</DropdownMenuItem>
          <DropdownMenuItem onclick={() => (statusFilter = "checked_in")}>Available</DropdownMenuItem>
          <DropdownMenuItem onclick={() => (statusFilter = "checked_out")}>Checked Out</DropdownMenuItem>
          <DropdownMenuItem onclick={() => (statusFilter = "requested")}>Requested</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  </div>

  {#if session && userCartRequests.length > 0}
    <div class="space-y-4">
      <h2 class="text-xl font-semibold tracking-tight">My Requests</h2>
      <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {#each userCartRequests as req (req.id)}
          <Card>
            <CardHeader class="pb-2">
              <div class="flex justify-between items-start">
                <CardTitle class="text-base">
                  Cart Request — {req.checkout_request_items.length} item{req.checkout_request_items.length !== 1 ? "s" : ""}
                </CardTitle>
                <Badge class={getCartRequestStatusColor(req.status)}>
                  {req.status}
                </Badge>
              </div>
              <CardDescription class="text-xs">
                Submitted {new Date(req.created_at).toLocaleDateString()}
              </CardDescription>
            </CardHeader>
            <CardContent class="pb-2">
              <div class="space-y-1">
                {#each req.checkout_request_items as cartItem (cartItem.id)}
                  <div class="flex justify-between items-center text-sm">
                    <span class="text-muted-foreground">
                      {cartItem.item?.title ?? "Item removed"}
                    </span>
                    {#if req.status === "reviewed"}
                      <Badge class={getItemDecisionColor(cartItem.status)}>
                        {cartItem.status}
                      </Badge>
                    {/if}
                  </div>
                {/each}
              </div>
              {#if req.admin_note}
                <p class="text-xs text-muted-foreground mt-2 italic">
                  Note: {req.admin_note}
                </p>
              {/if}
            </CardContent>
            <CardFooter class="pt-2">
              {#if req.status === "pending"}
                <form
                  action="?/cancelCart"
                  method="POST"
                  use:enhance
                  class="w-full"
                >
                  <input type="hidden" name="cartRequestId" value={req.id} />
                  <Button
                    variant="outline"
                    size="sm"
                    class="w-full text-red-500 hover:text-red-600"
                    type="submit"
                  >
                    Cancel Request
                  </Button>
                </form>
              {:else}
                <div class="text-sm text-muted-foreground w-full text-center">
                  {req.status === "cancelled" ? "Request cancelled." : "Review complete."}
                </div>
              {/if}
            </CardFooter>
          </Card>
        {/each}
      </div>
    </div>
    <Separator />
  {/if}

  <div class="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
    {#each filteredItems as item (item.id)}
      <Card class="flex flex-col h-full">
        <CardHeader>
          <div class="flex justify-between items-start gap-2">
            <CardTitle class="line-clamp-1" title={item.title}>
              {item.title}
            </CardTitle>
            <Badge class={getStatusColor(item.status)}>
              {getStatusLabel(item.status)}
            </Badge>
          </div>
          <CardDescription class="line-clamp-2">
            {item.description}
          </CardDescription>
        </CardHeader>
        <CardContent class="grow">
          <div class="flex flex-wrap gap-1">
            {#each item.tags ?? [] as tag}
              <Badge variant="secondary" class="text-xs">{tag}</Badge>
            {/each}
          </div>
        </CardContent>
        <CardFooter>
          {#if item.status === "checked_in"}
            {#if session}
              {#if isInCart(item.id)}
                <Button class="w-full" variant="secondary" disabled>
                  In Cart
                </Button>
              {:else}
                <Button
                  class="w-full"
                  onclick={() => cart.add({ id: item.id, title: item.title })}
                >
                  Add to Cart
                </Button>
              {/if}
            {:else}
              <Button class="w-full" href="/login" variant="secondary">
                Login to Request
              </Button>
            {/if}
          {:else}
            <Button class="w-full" variant="secondary" disabled>
              {item.status === "requested" ? "Requested" : "Unavailable"}
            </Button>
          {/if}
        </CardFooter>
      </Card>
    {/each}
  </div>

  {#if filteredItems.length === 0}
    <div class="text-center py-12">
      <p class="text-muted-foreground text-lg">
        No items found matching your criteria.
      </p>
      <Button
        variant="link"
        onclick={() => {
          searchQuery = "";
          statusFilter = "all";
        }}
      >
        Clear filters
      </Button>
    </div>
  {/if}

  {#if session}
    <p class="text-center text-sm text-muted-foreground">
      Can't find what you need?
      <a href="/request/custom" class="underline font-medium">
        Submit a custom request →
      </a>
    </p>
  {/if}
</div>

<!-- Sticky Cart Bar -->
{#if session && cart.items.length > 0}
  <div class="fixed bottom-0 left-0 right-0 bg-background border-t shadow-lg p-4 flex items-center justify-between z-50">
    <div class="flex items-center gap-2">
      <ShoppingCart class="h-5 w-5" />
      <span class="font-medium">
        {cart.items.length} item{cart.items.length !== 1 ? "s" : ""} in cart
      </span>
    </div>
    <Button onclick={() => (isCartOpen = true)}>Review Cart</Button>
  </div>
{/if}

<!-- Cart Sheet -->
<Sheet bind:open={isCartOpen}>
  <SheetContent class="overflow-y-auto p-6">
    <SheetHeader class="p-0">
      <SheetTitle>Your Cart</SheetTitle>
      <SheetDescription>
        Review your items before submitting the request.
      </SheetDescription>
    </SheetHeader>
    <div class="py-4 space-y-2">
      {#each cart.items as cartItem (cartItem.id)}
        <div class="flex items-center justify-between py-2 border-b">
          <span class="text-sm font-medium">{cartItem.title}</span>
          <Button
            variant="ghost"
            size="icon"
            onclick={() => cart.remove(cartItem.id)}
            class="h-7 w-7 text-muted-foreground hover:text-destructive"
          >
            <X class="h-4 w-4" />
          </Button>
        </div>
      {/each}
      {#if cart.items.length === 0}
        <p class="text-sm text-muted-foreground text-center py-4">
          Your cart is empty.
        </p>
      {/if}
    </div>
    <SheetFooter>
      <form
        action="?/submitCart"
        method="POST"
        use:enhance={() => {
          isSubmitting = true;
          return async ({ result, update }) => {
            isSubmitting = false;
            if (result.type === "success") {
              cart.clear();
              isCartOpen = false;
            }
            await update();
          };
        }}
        class="w-full"
      >
        {#each cart.items as cartItem (cartItem.id)}
          <input type="hidden" name="itemId" value={cartItem.id} />
        {/each}
        <Button
          type="submit"
          class="w-full"
          disabled={cart.items.length === 0 || hasPendingCart || isSubmitting}
        >
          {hasPendingCart ? "Already have a pending request" : "Submit Request"}
        </Button>
      </form>
    </SheetFooter>
  </SheetContent>
</Sheet>
```

**Step 2: Run type check**

Run: `bun run check`
Expected: no errors

**Step 3: Manual test in browser**

1. Log in as a student
2. Verify "Add to Cart" button on `checked_in` items; "Login to Request" when logged out
3. Add 2 items → sticky cart bar appears at bottom
4. Click "Review Cart" → Sheet opens with item list
5. Remove one item from sheet → count updates
6. Submit → items show as `requested`, cart clears, My Requests shows the cart card
7. Try submitting again → button is disabled ("Already have a pending request")
8. Cancel the cart → items revert to `checked_in`

**Step 4: Commit**

```bash
git add src/routes/+page.svelte
git commit -m "feat: update inventory page with cart UI and My Requests redesign"
```

---

### Task 8: Update admin/+page.server.ts — load and reviewCart action

**Files:**
- Modify: `src/routes/admin/+page.server.ts`

**Step 1: Replace the entire `load` function**

Replace everything from `export const load` through the closing `};` of the load function with:

```typescript
export const load: PageServerLoad = async ({
  locals: { supabase },
}) => {
  // Fetch all items
  const { data: items, error: itemsError } = await supabase
    .from("items")
    .select("*")
    .order("created_at", { ascending: false });

  if (itemsError) {
    console.error("Error fetching items:", itemsError);
  }

  // Fetch all checkout_requests with their items
  const { data: cartRequestsRaw, error: cartRequestsError } = await supabase
    .from("checkout_requests")
    .select(
      "id, user_id, status, admin_note, reviewed_at, created_at, checkout_request_items(id, status, item:items(id, title))"
    )
    .order("created_at", { ascending: false });

  if (cartRequestsError) {
    console.error("Error fetching cart requests:", cartRequestsError);
  }

  // Fetch profiles for cart request users
  const cartUserIds = [
    ...new Set((cartRequestsRaw || []).map((r) => r.user_id)),
  ];
  let cartProfilesById: Record<string, { full_name: string | null }> = {};
  if (cartUserIds.length > 0) {
    const { data: cartProfiles } = await supabase
      .from("profiles")
      .select("id, full_name")
      .in("id", cartUserIds);
    if (cartProfiles) {
      cartProfilesById = Object.fromEntries(
        cartProfiles.map((p) => [p.id, { full_name: p.full_name }])
      );
    }
  }

  const cartRequests = (cartRequestsRaw || []).map((req) => ({
    ...req,
    user: cartProfilesById[req.user_id] ?? {},
  }));

  // Calculate statistics
  const totalItems = items?.length || 0;
  const checkedOut =
    items?.filter((item) => item.status === "checked_out").length || 0;
  const retired =
    items?.filter((item) => item.status === "retired").length || 0;
  const pendingRequests = (cartRequestsRaw || []).filter(
    (req) => req.status === "pending"
  ).length;

  const { count: activeUsers } = await supabase
    .from("profiles")
    .select("*", { count: "exact", head: true })
    .neq("role", "admin");

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
  ] as string[];
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

  return {
    items: items || [],
    cartRequests,
    auditLog,
    stats: {
      totalItems,
      checkedOut,
      retired,
      pendingRequests,
      activeUsers: activeUsers ?? 0,
    },
  };
};
```

**Step 2: Add reviewCart action to the actions object**

Add `reviewCart` inside the `export const actions = { ... }` block, after the existing `refuseRequest` action:

```typescript
  reviewCart: async ({ request, locals: { supabase, safeGetSession } }) => {
    const { session } = await safeGetSession();
    if (!session) {
      return fail(401, { message: "Unauthorized" });
    }

    const { data: reviewerProfile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", session.user.id)
      .single();
    if (!reviewerProfile || !["admin", "instructor"].includes(reviewerProfile.role)) {
      return fail(403, { error: "Forbidden" });
    }

    const formData = await request.formData();
    const cartRequestId = formData.get("cartRequestId") as string;
    const adminNote = (formData.get("adminNote") as string)?.trim() || null;
    // decisions format: "checkoutItemId:approved" or "checkoutItemId:refused"
    const decisions = formData.getAll("decision") as string[];

    if (!cartRequestId) {
      return fail(400, { message: "Cart request ID is required." });
    }

    // Fetch cart items to process
    const { data: cartItems, error: fetchError } = await supabase
      .from("checkout_request_items")
      .select("id, item_id")
      .eq("checkout_request_id", cartRequestId);

    if (fetchError || !cartItems) {
      return fail(404, { message: "Cart request not found." });
    }

    // Parse decisions map: checkoutItemId → "approved" | "refused"
    const decisionMap = new Map<string, string>();
    for (const d of decisions) {
      const [id, status] = d.split(":");
      if (id && (status === "approved" || status === "refused")) {
        decisionMap.set(id, status);
      }
    }

    // Get the user's name for checked_out_to
    const { data: cartRequest } = await supabase
      .from("checkout_requests")
      .select("user_id")
      .eq("id", cartRequestId)
      .single();

    let checkedOutToName = "Student";
    if (cartRequest?.user_id) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", cartRequest.user_id)
        .single();
      checkedOutToName = profile?.full_name || "Student";
    }

    // Process each item
    for (const cartItem of cartItems) {
      const decision = decisionMap.get(cartItem.id) ?? "approved";

      await supabase
        .from("checkout_request_items")
        .update({ status: decision })
        .eq("id", cartItem.id);

      if (!cartItem.item_id) continue;

      if (decision === "approved") {
        await supabase
          .from("items")
          .update({ status: "checked_out", checked_out_to: checkedOutToName })
          .eq("id", cartItem.item_id);

        const { error: txError } = await supabase.from("transactions").insert({
          item_id: cartItem.item_id,
          user_id: session.user.id,
          action: "check_out",
          notes: `Approved for ${checkedOutToName}`,
        });
        if (txError) console.error("Failed to log transaction:", txError);
      } else {
        await supabase
          .from("items")
          .update({ status: "checked_in" })
          .eq("id", cartItem.item_id);

        const { error: txError } = await supabase.from("transactions").insert({
          item_id: cartItem.item_id,
          user_id: session.user.id,
          action: "check_in",
          notes: "Refused in cart review",
        });
        if (txError) console.error("Failed to log transaction:", txError);
      }
    }

    // Mark checkout_request as reviewed
    const { error: reviewError } = await supabase
      .from("checkout_requests")
      .update({
        status: "reviewed",
        admin_note: adminNote,
        reviewed_by: session.user.id,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", cartRequestId);

    if (reviewError) {
      return fail(500, { message: "Failed to mark request as reviewed." });
    }

    return { success: true };
  },
```

**Step 3: Run type check**

Run: `bun run check`
Expected: no errors

**Step 4: Commit**

```bash
git add src/routes/admin/+page.server.ts
git commit -m "feat: update admin load to use checkout_requests and add reviewCart action"
```

---

### Task 9: Update admin/+page.svelte — Cart Requests section and review Sheet

**Files:**
- Modify: `src/routes/admin/+page.svelte`

**Step 1: Update the `Request` type to `CartRequest` and update `PageData`**

In the `<script>` block, replace the `type Request` and `type PageData` with:

```typescript
type CartRequestItem = {
  id: string;
  status: string;
  item: { id: string; title: string } | null;
};

type CartRequest = {
  id: string;
  user_id: string;
  status: string;
  admin_note: string | null;
  reviewed_at: string | null;
  created_at: string;
  checkout_request_items: CartRequestItem[];
  user: { full_name?: string | null };
};

type PageData = {
  items: Item[];
  cartRequests: CartRequest[];
  auditLog: Transaction[];
  stats: {
    totalItems: number;
    checkedOut: number;
    retired: number;
    pendingRequests: number;
    activeUsers: number;
  };
};
```

**Step 2: Add review sheet state variables and helper functions**

After `let tags = $state("");`, add:

```typescript
let isReviewSheetOpen = $state(false);
let reviewingCart = $state<CartRequest | null>(null);
let reviewAdminNote = $state("");
let reviewDecisions = $state<Record<string, string>>({});

function openReviewSheet(cart: CartRequest) {
  reviewingCart = cart;
  reviewAdminNote = "";
  reviewDecisions = Object.fromEntries(
    cart.checkout_request_items.map((ci) => [ci.id, "approved"])
  );
  isReviewSheetOpen = true;
}

function getCartDerivedStatus(req: CartRequest) {
  if (req.status === "pending") return "pending";
  const items = req.checkout_request_items;
  const approved = items.filter((i) => i.status === "approved").length;
  const refused = items.filter((i) => i.status === "refused").length;
  if (approved === items.length) return "approved";
  if (refused === items.length) return "refused";
  return "partial";
}
```

**Step 3: Replace the "Item Requests" section in the template**

Find and replace the entire `{#if data?.requests && data.requests.length > 0}` block (the Card showing the old "Item Requests" table) with:

```svelte
<!-- Cart Requests Table -->
{#if data?.cartRequests && data.cartRequests.length > 0}
  <Card>
    <CardHeader>
      <CardTitle>Cart Requests</CardTitle>
    </CardHeader>
    <CardContent>
      <div class="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>User</TableHead>
              <TableHead># Items</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {#each data.cartRequests as req (req.id)}
              {@const derived = getCartDerivedStatus(req)}
              <TableRow>
                <TableCell class="text-sm text-muted-foreground">
                  {new Date(req.created_at).toLocaleDateString()}
                </TableCell>
                <TableCell>{req.user?.full_name || "Unknown User"}</TableCell>
                <TableCell>{req.checkout_request_items.length}</TableCell>
                <TableCell>
                  <Badge
                    class={
                      derived === "pending" ? "bg-yellow-100 text-yellow-800" :
                      derived === "approved" ? "bg-green-100 text-green-800" :
                      derived === "partial" ? "bg-blue-100 text-blue-800" :
                      "bg-red-100 text-red-800"
                    }
                  >
                    {derived === "pending" ? "Pending" :
                     derived === "approved" ? "Approved" :
                     derived === "partial" ? "Partially Approved" :
                     "Refused"}
                  </Badge>
                </TableCell>
                <TableCell>
                  {#if req.status === "pending"}
                    <Button size="sm" onclick={() => openReviewSheet(req)}>
                      Review
                    </Button>
                  {/if}
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

**Step 4: Add the Cart Review Sheet at the very end of the file** (after the existing item edit/add Sheet closing `</Sheet>` tag):

```svelte
<!-- Cart Review Sheet -->
<Sheet bind:open={isReviewSheetOpen}>
  <SheetContent class="overflow-y-auto p-6">
    <SheetHeader class="p-0">
      <SheetTitle>Review Cart Request</SheetTitle>
      <SheetDescription>
        {reviewingCart?.user?.full_name || "Student"} — submitted {reviewingCart ? new Date(reviewingCart.created_at).toLocaleDateString() : ""}
      </SheetDescription>
    </SheetHeader>

    {#if reviewingCart}
      <form
        method="POST"
        action="?/reviewCart"
        use:enhance={() => {
          return async ({ result }) => {
            if (result.type === "success") {
              isReviewSheetOpen = false;
              await invalidateAll();
            } else if (result.type === "failure") {
              alert(`Error: ${result.data?.message || "Failed to submit review"}`);
            }
          };
        }}
      >
        <input type="hidden" name="cartRequestId" value={reviewingCart.id} />
        <div class="py-4 space-y-4">
          <div>
            <h3 class="text-sm font-semibold mb-2">Items</h3>
            <div class="space-y-2">
              {#each reviewingCart.checkout_request_items as cartItem (cartItem.id)}
                <div class="flex items-center justify-between py-2 border-b">
                  <span class="text-sm">{cartItem.item?.title ?? "Item removed"}</span>
                  <div class="flex gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant={reviewDecisions[cartItem.id] === "approved" ? "default" : "outline"}
                      onclick={() => (reviewDecisions[cartItem.id] = "approved")}
                    >
                      Approve
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={reviewDecisions[cartItem.id] === "refused" ? "destructive" : "outline"}
                      onclick={() => (reviewDecisions[cartItem.id] = "refused")}
                    >
                      Refuse
                    </Button>
                    <input
                      type="hidden"
                      name="decision"
                      value="{cartItem.id}:{reviewDecisions[cartItem.id] ?? 'approved'}"
                    />
                  </div>
                </div>
              {/each}
            </div>
          </div>
          <div class="grid gap-2">
            <Label for="adminNote">Admin Note (optional)</Label>
            <Textarea
              id="adminNote"
              name="adminNote"
              bind:value={reviewAdminNote}
              placeholder="Add a note for the student..."
            />
          </div>
        </div>
        <SheetFooter>
          <Button type="submit">Submit Review</Button>
        </SheetFooter>
      </form>
    {/if}
  </SheetContent>
</Sheet>
```

**Step 5: Run type check**

Run: `bun run check`
Expected: no errors

**Step 6: Manual test in browser**

1. Log in as admin, go to `/admin`
2. See "Cart Requests" table; pending carts show "Pending" badge and "Review" button
3. Click Review → Sheet opens with per-item Approve/Refuse toggles (default: Approve)
4. Toggle one item to Refuse, add a note, click Submit Review
5. Table updates to show "Partially Approved"; items have correct statuses

**Step 7: Commit**

```bash
git add src/routes/admin/+page.svelte
git commit -m "feat: replace Item Requests with Cart Requests table and review Sheet in admin"
```

---

### Task 10: Create /request/custom/+page.server.ts

**Files:**
- Create: `src/routes/request/custom/+page.server.ts`

**Step 1: Create the directory and file**

```typescript
import { fail, redirect } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({
  locals: { safeGetSession },
}) => {
  const { session } = await safeGetSession();
  if (!session) {
    throw redirect(303, "/login");
  }
  return { session };
};

export const actions: Actions = {
  submit: async ({ request, locals: { supabase, safeGetSession } }) => {
    const { session } = await safeGetSession();
    if (!session) {
      return fail(401, { message: "You must be logged in." });
    }

    const formData = await request.formData();
    const reason = (formData.get("reason") as string)?.trim();
    const alternatives = (formData.get("alternatives") as string)?.trim();
    const itemNamesRaw = formData.getAll("itemName") as string[];
    const itemQuantitiesRaw = formData.getAll("itemQuantity") as string[];
    const itemPricesRaw = formData.getAll("itemPrice") as string[];

    if (!reason) {
      return fail(400, { message: "Reason is required." });
    }
    if (!alternatives) {
      return fail(400, { message: "Alternatives are required." });
    }
    if (itemNamesRaw.length === 0 || itemNamesRaw.every((n) => !n.trim())) {
      return fail(400, { message: "At least one hardware item is required." });
    }

    const items = itemNamesRaw.map((name, i) => ({
      name: name.trim(),
      quantity: parseInt(itemQuantitiesRaw[i] || "1", 10),
      unit_price: itemPricesRaw[i] ? parseFloat(itemPricesRaw[i]) : null,
    }));

    const { error } = await supabase.from("custom_requests").insert({
      user_id: session.user.id,
      status: "pending",
      reason,
      alternatives,
      items,
    });

    if (error) {
      console.error("Failed to create custom request:", error);
      return fail(500, { message: "Failed to submit request." });
    }

    throw redirect(303, "/");
  },
};
```

**Step 2: Run type check**

Run: `bun run check`
Expected: no errors

**Step 3: Commit**

```bash
git add src/routes/request/custom/+page.server.ts
git commit -m "feat: add custom request server load and submit action"
```

---

### Task 11: Create /request/custom/+page.svelte

**Files:**
- Create: `src/routes/request/custom/+page.svelte`

**Step 1: Write the form page**

```svelte
<script lang="ts">
  import { enhance } from "$app/forms";
  import { Button } from "$lib/components/ui/button";
  import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
  } from "$lib/components/ui/card";
  import { Input } from "$lib/components/ui/input";
  import { Label } from "$lib/components/ui/label";
  import { Textarea } from "$lib/components/ui/textarea";
  import { Plus, Trash2 } from "@lucide/svelte";

  type HardwareItem = { name: string; quantity: number; unit_price: string };

  let items = $state<HardwareItem[]>([{ name: "", quantity: 1, unit_price: "" }]);
  let isSubmitting = $state(false);

  function addItem() {
    items = [...items, { name: "", quantity: 1, unit_price: "" }];
  }

  function removeItem(index: number) {
    items = items.filter((_, i) => i !== index);
  }
</script>

<div class="max-w-2xl mx-auto space-y-6">
  <div>
    <h1 class="text-3xl font-bold tracking-tight">Custom Hardware Request</h1>
    <p class="text-muted-foreground">
      Request hardware that isn't available in the inventory.
    </p>
  </div>

  <form
    method="POST"
    action="?/submit"
    use:enhance={() => {
      isSubmitting = true;
      return async ({ result, update }) => {
        isSubmitting = false;
        await update();
      };
    }}
    class="space-y-6"
  >
    <Card>
      <CardHeader>
        <CardTitle>Why do you need this hardware?</CardTitle>
        <CardDescription>
          Explain your project need and how this hardware will be used.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Textarea
          name="reason"
          placeholder="Describe your need..."
          rows={4}
          required
        />
      </CardContent>
    </Card>

    <Card>
      <CardHeader>
        <CardTitle>What alternatives did you consider?</CardTitle>
        <CardDescription>
          List alternatives you evaluated before making this request.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Textarea
          name="alternatives"
          placeholder="List alternatives..."
          rows={3}
          required
        />
      </CardContent>
    </Card>

    <Card>
      <CardHeader>
        <CardTitle>Hardware Items Needed</CardTitle>
        <CardDescription>
          List each item with quantity and estimated unit price.
        </CardDescription>
      </CardHeader>
      <CardContent class="space-y-4">
        {#each items as item, i (i)}
          <div class="flex gap-2 items-end">
            <div class="flex-1 grid gap-1">
              <Label for="itemName-{i}">Item Name</Label>
              <Input
                id="itemName-{i}"
                name="itemName"
                bind:value={item.name}
                placeholder="e.g. Raspberry Pi 5"
                required
              />
            </div>
            <div class="w-24 grid gap-1">
              <Label for="itemQty-{i}">Qty</Label>
              <Input
                id="itemQty-{i}"
                name="itemQuantity"
                type="number"
                min="1"
                bind:value={item.quantity}
                required
              />
            </div>
            <div class="w-32 grid gap-1">
              <Label for="itemPrice-{i}">Unit Price ($)</Label>
              <Input
                id="itemPrice-{i}"
                name="itemPrice"
                type="number"
                min="0"
                step="0.01"
                bind:value={item.unit_price}
                placeholder="Optional"
              />
            </div>
            {#if items.length > 1}
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onclick={() => removeItem(i)}
                class="text-muted-foreground hover:text-destructive mb-0.5"
              >
                <Trash2 class="h-4 w-4" />
              </Button>
            {/if}
          </div>
        {/each}
        <Button
          type="button"
          variant="outline"
          size="sm"
          onclick={addItem}
          class="mt-2"
        >
          <Plus class="mr-2 h-4 w-4" />
          Add another item
        </Button>
      </CardContent>
    </Card>

    <div class="flex justify-end gap-4">
      <Button variant="outline" href="/">Cancel</Button>
      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting ? "Submitting..." : "Submit Request"}
      </Button>
    </div>
  </form>
</div>
```

**Step 2: Run type check**

Run: `bun run check`
Expected: no errors

**Step 3: Manual test in browser**

1. Log in as a student, go to `/`
2. Click "Submit a custom request →" link at bottom
3. Fill in reason, alternatives, add 2 items with name and quantity
4. Submit → redirected back to `/`
5. Try navigating to `/request/custom` while logged out → redirected to `/login`

**Step 4: Commit**

```bash
git add src/routes/request/custom/
git commit -m "feat: add custom hardware request form page"
```

---

### Task 12: Create /admin/custom-requests/+page.server.ts

**Files:**
- Create: `src/routes/admin/custom-requests/+page.server.ts`

Note: Role guard is handled by `src/routes/admin/+layout.server.ts` — no need to repeat it here.

**Step 1: Write the file**

```typescript
import { fail } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({
  locals: { supabase },
}) => {
  const { data: customRequestsRaw, error } = await supabase
    .from("custom_requests")
    .select(
      "id, user_id, status, reason, alternatives, items, admin_note, reviewed_at, created_at"
    )
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error fetching custom requests:", error);
  }

  const userIds = [
    ...new Set((customRequestsRaw || []).map((r) => r.user_id)),
  ];
  let profilesById: Record<string, { full_name: string | null }> = {};
  if (userIds.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, full_name")
      .in("id", userIds);
    if (profiles) {
      profilesById = Object.fromEntries(
        profiles.map((p) => [p.id, { full_name: p.full_name }])
      );
    }
  }

  const requests = (customRequestsRaw || []).map((req) => ({
    ...req,
    user: profilesById[req.user_id] ?? {},
  }));

  return { requests };
};

export const actions: Actions = {
  review: async ({ request, locals: { supabase, safeGetSession } }) => {
    const { session } = await safeGetSession();
    if (!session) {
      return fail(401, { message: "Unauthorized" });
    }

    const { data: reviewerProfile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", session.user.id)
      .single();
    if (
      !reviewerProfile ||
      !["admin", "instructor"].includes(reviewerProfile.role)
    ) {
      return fail(403, { message: "Forbidden" });
    }

    const formData = await request.formData();
    const customRequestId = formData.get("customRequestId") as string;
    const adminNote =
      (formData.get("adminNote") as string)?.trim() || null;

    if (!customRequestId) {
      return fail(400, { message: "Request ID is required." });
    }

    const { error } = await supabase
      .from("custom_requests")
      .update({
        status: "reviewed",
        admin_note: adminNote,
        reviewed_by: session.user.id,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", customRequestId);

    if (error) {
      return fail(500, { message: "Failed to mark as reviewed." });
    }

    return { success: true };
  },
};
```

**Step 2: Run type check**

Run: `bun run check`
Expected: no errors

**Step 3: Commit**

```bash
git add src/routes/admin/custom-requests/+page.server.ts
git commit -m "feat: add admin custom requests page server load and review action"
```

---

### Task 13: Create /admin/custom-requests/+page.svelte

**Files:**
- Create: `src/routes/admin/custom-requests/+page.svelte`

**Step 1: Write the page**

```svelte
<script lang="ts">
  import { enhance } from "$app/forms";
  import { invalidateAll } from "$app/navigation";
  import { Badge } from "$lib/components/ui/badge";
  import { Button } from "$lib/components/ui/button";
  import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
  } from "$lib/components/ui/card";
  import { Label } from "$lib/components/ui/label";
  import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetFooter,
    SheetHeader,
    SheetTitle,
  } from "$lib/components/ui/sheet";
  import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
  } from "$lib/components/ui/table";
  import { Textarea } from "$lib/components/ui/textarea";

  type HardwareItem = {
    name: string;
    quantity: number;
    unit_price: number | null;
  };

  type CustomRequest = {
    id: string;
    status: string;
    reason: string;
    alternatives: string;
    items: HardwareItem[];
    admin_note: string | null;
    reviewed_at: string | null;
    created_at: string;
    user: { full_name?: string | null };
  };

  type PageData = { requests: CustomRequest[] };

  const { data } = $props<{ data: PageData }>();

  let isSheetOpen = $state(false);
  let viewingRequest = $state<CustomRequest | null>(null);
  let adminNote = $state("");

  function openSheet(req: CustomRequest) {
    viewingRequest = req;
    adminNote = req.admin_note || "";
    isSheetOpen = true;
  }
</script>

<div class="space-y-6">
  <h1 class="text-3xl font-bold tracking-tight">Custom Requests</h1>

  <Card>
    <CardHeader>
      <CardTitle>All Custom Requests</CardTitle>
    </CardHeader>
    <CardContent>
      {#if data.requests.length === 0}
        <p class="text-sm text-muted-foreground text-center py-8">
          No custom requests yet.
        </p>
      {:else}
        <div class="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>User</TableHead>
                <TableHead># Items</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {#each data.requests as req (req.id)}
                <TableRow>
                  <TableCell class="text-sm text-muted-foreground">
                    {new Date(req.created_at).toLocaleDateString()}
                  </TableCell>
                  <TableCell>{req.user?.full_name || "Unknown User"}</TableCell>
                  <TableCell>{req.items.length}</TableCell>
                  <TableCell>
                    <Badge
                      class={req.status === "pending"
                        ? "bg-yellow-100 text-yellow-800"
                        : "bg-green-100 text-green-800"}
                    >
                      {req.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Button
                      size="sm"
                      variant="outline"
                      onclick={() => openSheet(req)}
                    >
                      {req.status === "pending" ? "Review" : "View"}
                    </Button>
                  </TableCell>
                </TableRow>
              {/each}
            </TableBody>
          </Table>
        </div>
      {/if}
    </CardContent>
  </Card>
</div>

<!-- Review Sheet -->
<Sheet bind:open={isSheetOpen}>
  <SheetContent class="overflow-y-auto p-6 w-full sm:max-w-lg">
    <SheetHeader class="p-0">
      <SheetTitle>Custom Request</SheetTitle>
      <SheetDescription>
        {viewingRequest?.user?.full_name || "Student"} —
        {viewingRequest
          ? new Date(viewingRequest.created_at).toLocaleDateString()
          : ""}
      </SheetDescription>
    </SheetHeader>

    {#if viewingRequest}
      <div class="py-4 space-y-4">
        <div>
          <h3 class="text-sm font-semibold mb-1">Why they need it</h3>
          <p class="text-sm text-muted-foreground">{viewingRequest.reason}</p>
        </div>
        <div>
          <h3 class="text-sm font-semibold mb-1">Alternatives considered</h3>
          <p class="text-sm text-muted-foreground">
            {viewingRequest.alternatives}
          </p>
        </div>
        <div>
          <h3 class="text-sm font-semibold mb-2">Hardware items</h3>
          <div class="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Qty</TableHead>
                  <TableHead>Unit Price</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {#each viewingRequest.items as hw, i (i)}
                  <TableRow>
                    <TableCell>{hw.name}</TableCell>
                    <TableCell>{hw.quantity}</TableCell>
                    <TableCell>
                      {hw.unit_price != null
                        ? `$${hw.unit_price.toFixed(2)}`
                        : "—"}
                    </TableCell>
                  </TableRow>
                {/each}
              </TableBody>
            </Table>
          </div>
        </div>

        {#if viewingRequest.status === "pending"}
          <form
            method="POST"
            action="?/review"
            use:enhance={() => {
              return async ({ result }) => {
                if (result.type === "success") {
                  isSheetOpen = false;
                  await invalidateAll();
                } else if (result.type === "failure") {
                  alert(
                    `Error: ${result.data?.message || "Failed to submit review"}`
                  );
                }
              };
            }}
          >
            <input
              type="hidden"
              name="customRequestId"
              value={viewingRequest.id}
            />
            <div class="grid gap-2 mt-2">
              <Label for="adminNote">Admin Note (optional)</Label>
              <Textarea
                id="adminNote"
                name="adminNote"
                bind:value={adminNote}
                placeholder="Approval/refusal reasoning..."
              />
            </div>
            <SheetFooter class="mt-4">
              <Button type="submit">Mark as Reviewed</Button>
            </SheetFooter>
          </form>
        {:else}
          {#if viewingRequest.admin_note}
            <div>
              <h3 class="text-sm font-semibold mb-1">Admin Note</h3>
              <p class="text-sm text-muted-foreground italic">
                {viewingRequest.admin_note}
              </p>
            </div>
          {/if}
          <p class="text-sm text-muted-foreground">
            Reviewed on
            {viewingRequest.reviewed_at
              ? new Date(viewingRequest.reviewed_at).toLocaleDateString()
              : "N/A"}
          </p>
        {/if}
      </div>
    {/if}
  </SheetContent>
</Sheet>
```

**Step 2: Run type check**

Run: `bun run check`
Expected: no errors

**Step 3: Manual test in browser**

1. Log in as admin
2. Click "Custom Requests" in the nav → see the list
3. Click "Review" on the test request from Task 11
4. Verify reason, alternatives, and hardware items table display correctly
5. Add an admin note, click "Mark as Reviewed" → status updates to `reviewed`
6. Click "View" on the reviewed request → note is visible, no action button

**Step 4: Commit**

```bash
git add src/routes/admin/custom-requests/
git commit -m "feat: add admin custom requests list page with review Sheet"
```

---

## Full Manual Test Checklist

Run through this after all 13 tasks are done:

**Cart flow:**
- [ ] Student logs in → inventory shows "Add to Cart" on available items
- [ ] "Login to Request" shown on checked-in items when not logged in
- [ ] "In Cart" (disabled) shown when item already in cart
- [ ] Sticky cart bar appears at bottom when cart has items
- [ ] Cart Sheet opens: shows items with Remove buttons
- [ ] Removing an item from Sheet updates count
- [ ] Submitting cart: items switch to `requested`, cart clears, Sheet closes, My Requests shows cart card
- [ ] Submitting again is blocked ("Already have a pending request")
- [ ] Cancel button on pending cart reverts all items to `checked_in`
- [ ] Admin sees "Cart Requests" table with Pending badge + Review button
- [ ] Admin opens Review Sheet: per-item Approve/Refuse toggles (default Approve)
- [ ] Submitting review with one refusal: cart shows "Partially Approved", approved items → `checked_out`, refused → `checked_in`
- [ ] Audit log records each item's action

**Custom request flow:**
- [ ] "Submit a custom request →" link visible at bottom of inventory when logged in
- [ ] Navigating to `/request/custom` when logged out → redirects to `/login`
- [ ] Form: can add/remove hardware rows, requires reason + alternatives + at least one item name
- [ ] Submitting form → redirected to `/`
- [ ] Admin sees "Custom Requests" nav link (hidden for student role)
- [ ] `/admin/custom-requests` shows the request in table
- [ ] Admin opens Review Sheet: reason, alternatives, hardware table visible
- [ ] Admin adds note, clicks "Mark as Reviewed" → status changes, note visible on re-open

**Regression:**
- [ ] Admin can still create/edit/delete inventory items
- [ ] Audit log still updates on item changes
- [ ] Filter dropdown still works (All / Available / Checked Out / Requested)
- [ ] Logout works
- [ ] Role-based login redirect (admin → `/admin`, student → `/`)
- [ ] Admin layout guard still redirects non-admins away from `/admin`
