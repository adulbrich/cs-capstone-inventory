# Cart & Custom Requests Design
Date: 2026-03-03

## Overview

Two new features:
1. **Cart-based checkout requests** — Users add multiple inventory items to a cart and submit a single checkout request. Admins review the cart, approve or refuse each item individually, and add an optional note.
2. **Custom hardware requests** — A dedicated form for requesting items not in the inventory. Users describe their need, list alternatives, and enumerate the hardware they need with quantity and unit price.

---

## Feature 1: Cart-Based Checkout Requests

### Data Model

**`checkout_requests`**

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | gen_random_uuid() |
| user_id | uuid FK → auth.users | cascade delete |
| status | text | CHECK: pending \| reviewed |
| admin_note | text nullable | optional note from admin on review |
| reviewed_by | uuid FK → auth.users nullable | admin who reviewed |
| reviewed_at | timestamptz nullable | when reviewed |
| created_at | timestamptz | default now() |

**`checkout_request_items`**

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | gen_random_uuid() |
| checkout_request_id | uuid FK → checkout_requests | cascade delete |
| item_id | uuid FK → items | set null on delete |
| status | text | CHECK: pending \| approved \| refused |
| created_at | timestamptz | default now() |

**RLS:**
- Users: INSERT and SELECT own rows (user_id = auth.uid() on checkout_requests; join-based on checkout_request_items)
- Admins: SELECT and UPDATE all rows on both tables

**Constraint:** A user may not submit a new checkout_request while they have an existing one with status = pending. Enforced in the server action.

**Item status flow (unchanged item.status column):**
- Adding to cart: no change to `items.status`
- On cart submit: each item → `requested`
- On admin approve item: item → `checked_out`, `checked_out_to = user.full_name`
- On admin refuse item: item → `checked_in`

The existing `requests` table is preserved as historical data but no longer written to by the new flow.

### Cart Client State

Cart stored as `$state` in `+layout.svelte`:
```typescript
let cartItems = $state<{ id: string; title: string }[]>([]);
```
Shared to child routes via Svelte context. Lost on page refresh (no draft persistence — intentional).

### User-Facing Changes (`/`)

**Inventory grid:**
- "Request Item" button replaced by "Add to Cart"
- Only shown for `checked_in` items
- Button label changes to "In Cart" (disabled) if item is already in cart
- Items with status `requested` still show "Requested" (disabled)

**Cart bar / Sheet:**
- A persistent bar at the bottom of the inventory page shows cart item count when cart is non-empty
- Clicking opens a `<Sheet>` (side panel) with:
  - List of cart items with a Remove button each
  - "Submit Request" button (disabled if empty or if user already has a pending cart)
  - On submit: creates `checkout_requests` + `checkout_request_items` rows, sets each item to `requested`, clears cart state

**My Requests section (top of `/`):**
- Each `checkout_requests` row shown as a single card: "Cart Request — N items — [status badge]"
- Clicking expands to show each item's individual status (pending / approved / refused)
- Cancel button available while status = pending (cancels the checkout_request and reverts all items to `checked_in`)

### Admin UX (`/admin`)

The existing "Item Requests" table is replaced with a **"Cart Requests"** section.

**Table columns:** Date | User | # Items | Status | Actions

**Status display (derived, not stored):**
- All items pending → "Pending" (yellow)
- Status reviewed, all approved → "Approved" (green)
- Status reviewed, some refused → "Partially Approved" (blue)
- Status reviewed, all refused → "Refused" (red)

**Review flow:**
1. Admin clicks a pending cart row → opens Sheet
2. Sheet shows: user name, submission date, optional admin note textarea
3. Item list with per-item Approve / Refuse toggle (defaults to Approve)
4. "Submit Review" button
5. On submit: server action processes all items, updates `checkout_request_items.status`, updates `items.status` accordingly, sets `checkout_requests.status = reviewed`, records `reviewed_by` and `reviewed_at`, writes audit log entries

---

## Feature 2: Custom Hardware Requests

### Data Model

**`custom_requests`**

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | gen_random_uuid() |
| user_id | uuid FK → auth.users | cascade delete |
| status | text | CHECK: pending \| reviewed |
| reason | text | why the user needs this hardware |
| alternatives | text | alternatives considered |
| items | jsonb | array of { name: string, quantity: number, unit_price: number \| null } |
| admin_note | text nullable | optional note from admin on review |
| reviewed_by | uuid FK → auth.users nullable | |
| reviewed_at | timestamptz nullable | |
| created_at | timestamptz | default now() |

**RLS:**
- Users: INSERT and SELECT own rows
- Admins: SELECT and UPDATE all rows

Note: `status` on `custom_requests` is simply `pending | reviewed`. There is no approve/refuse distinction at the row level — the admin note communicates the decision. This can be extended later.

### User-Facing Form (`/request/custom`)

Requires authentication (redirect to `/login` if not logged in).

**Accessible from:** A "Can't find what you need? Submit a custom request →" link at the bottom of the inventory page, visible to logged-in users only.

**Form sections:**
1. **Why do you need this hardware?** — `<Textarea>` (required)
2. **What alternatives did you consider?** — `<Textarea>` (required)
3. **Hardware items needed** — Dynamic list. Each row:
   - Item name `<Input>` (required)
   - Quantity `<Input type="number">` (required, min 1)
   - Unit price `<Input type="number">` (optional, step 0.01)
   - Remove row button
   - "Add another item" button below the list
4. **Submit** button

On submit: server action creates `custom_requests` row with status `pending`. User redirected to `/` with a success toast/message.

### Admin UX (`/admin/custom-requests`)

New dedicated page, linked from the admin nav.

**List view:** Table showing all custom requests — Date | User | Items (count) | Status | Actions

**Review Sheet:** Clicking a request opens a Sheet showing:
- User name and submission date
- "Reason" section
- "Alternatives Considered" section
- Hardware items table: Name | Quantity | Unit Price
- "Admin Note" textarea
- **Mark as Reviewed** button (single action — approval/refusal communicated via note)

On action: server action updates `custom_requests.status = reviewed`, records admin_note, reviewed_by, reviewed_at. Writes audit log entry.

---

## Files Changed / Created

### Migrations
- `supabase/migrations/<timestamp>_checkout_requests.sql` — checkout_requests + checkout_request_items tables + RLS
- `supabase/migrations/<timestamp>_custom_requests.sql` — custom_requests table + RLS

### New Routes
- `src/routes/request/custom/+page.svelte` — custom request form
- `src/routes/request/custom/+page.server.ts` — load (auth check) + submit action
- `src/routes/admin/custom-requests/+page.svelte` — admin custom requests list + review sheet
- `src/routes/admin/custom-requests/+page.server.ts` — load + review action

### Modified Files
- `src/routes/+layout.svelte` — add cart state, add "Custom Requests" admin nav link
- `src/routes/+layout.server.ts` — expose cart context if needed
- `src/routes/+page.svelte` — replace Request button with Add to Cart, cart bar, cart Sheet, updated My Requests section, custom request link
- `src/routes/+page.server.ts` — replace requestItem/cancelRequest with submitCart/cancelCart actions
- `src/routes/admin/+page.svelte` — replace Item Requests section with Cart Requests section
- `src/routes/admin/+page.server.ts` — replace approveRequest/refuseRequest with reviewCart action; add cart requests to load
