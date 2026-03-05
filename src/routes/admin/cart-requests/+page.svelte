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
  import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
  } from "$lib/components/ui/select";
  import { Textarea } from "$lib/components/ui/textarea";

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

  type PageData = { cartRequests: CartRequest[] };

  const { data } = $props<{ data: PageData }>();

  let isSheetOpen = $state(false);
  let reviewingCart = $state<CartRequest | null>(null);
  let reviewAdminNote = $state("");
  let reviewDecisions = $state<Record<string, string>>({});
  let dangerOpen = $state(false);
  let dangerCartStatus = $state("");

  function openCartSheet(cart: CartRequest) {
    reviewingCart = cart;
    reviewAdminNote = cart.admin_note || "";
    reviewDecisions = Object.fromEntries(
      cart.checkout_request_items.map((ci) => [
        ci.id,
        ci.status === "pending" ? "approved" : ci.status,
      ])
    );
    dangerOpen = false;
    dangerCartStatus = "";
    isSheetOpen = true;
  }

  function getCartDerivedStatus(req: CartRequest) {
    if (req.status === "pending") return "pending";
    if (req.status === "returned") return "returned";
    if (req.status === "picked_up") return "picked_up";
    const items = req.checkout_request_items;
    const approved = items.filter((i) => i.status === "approved").length;
    const refused = items.filter((i) => i.status === "refused").length;
    if (approved === items.length) return "approved";
    if (refused === items.length) return "refused";
    return "partial";
  }

  function getDerivedBadgeClass(derived: string) {
    switch (derived) {
      case "pending": return "bg-yellow-100 text-yellow-800";
      case "picked_up": return "bg-blue-100 text-blue-800";
      case "approved": return "bg-green-100 text-green-800";
      case "partial": return "bg-orange-100 text-orange-800";
      case "returned": return "bg-purple-100 text-purple-800";
      default: return "bg-red-100 text-red-800"; // refused
    }
  }

  function getDerivedLabel(derived: string) {
    switch (derived) {
      case "pending": return "Pending";
      case "picked_up": return "Picked Up";
      case "approved": return "Approved";
      case "partial": return "Partially Approved";
      case "returned": return "Returned";
      default: return "Refused";
    }
  }
</script>

<div class="space-y-6">
  <h1 class="text-3xl font-bold tracking-tight">Cart Requests</h1>

  <Card>
    <CardHeader>
      <CardTitle>All Cart Requests</CardTitle>
    </CardHeader>
    <CardContent>
      {#if data.cartRequests.length === 0}
        <p class="text-sm text-muted-foreground text-center py-8">
          No cart requests yet.
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
              {#each data.cartRequests as req (req.id)}
                {@const derived = getCartDerivedStatus(req)}
                <TableRow>
                  <TableCell class="text-sm text-muted-foreground">
                    {new Date(req.created_at).toLocaleDateString()}
                  </TableCell>
                  <TableCell>{req.user?.full_name || "Unknown User"}</TableCell>
                  <TableCell>{req.checkout_request_items.length}</TableCell>
                  <TableCell>
                    <Badge class={getDerivedBadgeClass(derived)}>
                      {getDerivedLabel(derived)}
                    </Badge>
                  </TableCell>
                  <TableCell class="flex gap-2 items-center">
                    {#if req.status === "pending"}
                      <Button size="sm" onclick={() => openCartSheet(req)}>
                        Review
                      </Button>
                    {:else}
                      <Button size="sm" variant="outline" onclick={() => openCartSheet(req)}>
                        View
                      </Button>
                      {#if req.status === "reviewed" && derived !== "refused"}
                        <form
                          method="POST"
                          action="?/markPickedUp"
                          use:enhance={() => {
                            return async ({ result }) => {
                              if (result.type === "success") {
                                await invalidateAll();
                              } else if (result.type === "failure") {
                                alert(result.data?.message || "Failed to mark as picked up");
                              }
                            };
                          }}
                        >
                          <input type="hidden" name="cartRequestId" value={req.id} />
                          <Button size="sm" variant="outline" type="submit">
                            Mark Picked Up
                          </Button>
                        </form>
                      {/if}
                      {#if req.status === "picked_up"}
                        <form
                          method="POST"
                          action="?/returnCart"
                          use:enhance={() => {
                            return async ({ result }) => {
                              if (result.type === "success") {
                                await invalidateAll();
                              } else if (result.type === "failure") {
                                alert(result.data?.message || "Failed to mark as returned");
                              }
                            };
                          }}
                        >
                          <input type="hidden" name="cartRequestId" value={req.id} />
                          <Button size="sm" variant="outline" type="submit">
                            Mark Returned
                          </Button>
                        </form>
                      {/if}
                    {/if}
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

<!-- Cart Review / View Sheet -->
<Sheet bind:open={isSheetOpen}>
  <SheetContent class="overflow-y-auto p-6">
    <SheetHeader class="p-0">
      <SheetTitle>
        {reviewingCart?.status === "pending" ? "Review Cart Request" : "Cart Request"}
      </SheetTitle>
      <SheetDescription>
        {reviewingCart?.user?.full_name || "Student"} — submitted
        {reviewingCart ? new Date(reviewingCart.created_at).toLocaleDateString() : ""}
      </SheetDescription>
    </SheetHeader>

    {#if reviewingCart}
      {@const derivedInSheet = getCartDerivedStatus(reviewingCart)}
      <div class="py-4 space-y-4">
        <div>
          <h3 class="text-sm font-semibold mb-2">Items</h3>
          <div class="space-y-2">
            {#each reviewingCart.checkout_request_items as cartItem (cartItem.id)}
              <div class="flex items-center justify-between py-2 border-b">
                <span class="text-sm">{cartItem.item?.title ?? "Item removed"}</span>
                {#if reviewingCart.status === "pending"}
                  <div class="inline-flex shrink-0 rounded-full border overflow-hidden text-xs font-medium leading-none">
                    <button
                      type="button"
                      class="w-16 py-1.5 text-center transition-colors {reviewDecisions[cartItem.id] === 'approved' ? 'bg-green-600 text-white' : 'text-muted-foreground hover:bg-muted'}"
                      onclick={() => (reviewDecisions[cartItem.id] = "approved")}
                    >
                      Approve
                    </button>
                    <div class="w-px shrink-0 bg-border"></div>
                    <button
                      type="button"
                      class="w-14 py-1.5 text-center transition-colors {reviewDecisions[cartItem.id] === 'refused' ? 'bg-red-600 text-white' : 'text-muted-foreground hover:bg-muted'}"
                      onclick={() => (reviewDecisions[cartItem.id] = "refused")}
                    >
                      Refuse
                    </button>
                  </div>
                {:else}
                  <Badge
                    class={cartItem.status === "approved"
                      ? "bg-green-100 text-green-800"
                      : cartItem.status === "refused"
                        ? "bg-red-100 text-red-800"
                        : "bg-yellow-100 text-yellow-800"}
                  >
                    {cartItem.status}
                  </Badge>
                {/if}
              </div>
            {/each}
          </div>
        </div>

        {#if reviewingCart.status === "pending"}
          <form
            method="POST"
            action="?/reviewCart"
            use:enhance={() => {
              return async ({ result }) => {
                if (result.type === "success") {
                  isSheetOpen = false;
                  await invalidateAll();
                } else if (result.type === "failure") {
                  alert(`Error: ${result.data?.message || "Failed to submit review"}`);
                }
              };
            }}
          >
            <input type="hidden" name="cartRequestId" value={reviewingCart.id} />
            {#each reviewingCart.checkout_request_items as cartItem (cartItem.id)}
              <input
                type="hidden"
                name="decision"
                value="{cartItem.id}:{reviewDecisions[cartItem.id] ?? 'approved'}"
              />
            {/each}
            <div class="grid gap-2">
              <Label for="adminNote">Admin Note (optional)</Label>
              <Textarea
                id="adminNote"
                name="adminNote"
                bind:value={reviewAdminNote}
                placeholder="Add a note for the student..."
              />
            </div>
            <SheetFooter class="mt-4">
              <Button type="submit">Submit Review</Button>
            </SheetFooter>
          </form>
        {:else}
          {#if reviewingCart.admin_note}
            <div>
              <h3 class="text-sm font-semibold mb-1">Admin Note</h3>
              <p class="text-sm text-muted-foreground italic">{reviewingCart.admin_note}</p>
            </div>
          {/if}
          {#if reviewingCart.status === "reviewed" && derivedInSheet !== "refused"}
            <SheetFooter>
              <form
                method="POST"
                action="?/markPickedUp"
                use:enhance={() => {
                  return async ({ result }) => {
                    if (result.type === "success") {
                      isSheetOpen = false;
                      await invalidateAll();
                    } else if (result.type === "failure") {
                      alert(result.data?.message || "Failed to mark as picked up");
                    }
                  };
                }}
              >
                <input type="hidden" name="cartRequestId" value={reviewingCart.id} />
                <Button type="submit">Mark as Picked Up</Button>
              </form>
            </SheetFooter>
          {:else if reviewingCart.status === "picked_up"}
            <SheetFooter>
              <form
                method="POST"
                action="?/returnCart"
                use:enhance={() => {
                  return async ({ result }) => {
                    if (result.type === "success") {
                      isSheetOpen = false;
                      await invalidateAll();
                    } else if (result.type === "failure") {
                      alert(result.data?.message || "Failed to mark as returned");
                    }
                  };
                }}
              >
                <input type="hidden" name="cartRequestId" value={reviewingCart.id} />
                <Button type="submit" variant="outline">Mark as Returned</Button>
              </form>
            </SheetFooter>
          {/if}
        {/if}

        <!-- Danger Zone -->
        <div class="mt-6">
          <Button
            variant="ghost"
            size="sm"
            class="text-destructive hover:text-destructive hover:bg-destructive/10 w-full justify-start"
            onclick={() => { dangerOpen = !dangerOpen; }}
          >
            ⚠ Danger Zone
          </Button>
          {#if dangerOpen}
            <div class="mt-2 border border-destructive/50 rounded-md p-4 space-y-3">
              <p class="text-sm text-muted-foreground">
                Forcefully override this request's status. Item statuses will be updated to match.
              </p>
              <form
                method="POST"
                action="?/forceCartStatus"
                use:enhance={() => {
                  return async ({ result }) => {
                    if (result.type === "success") {
                      isSheetOpen = false;
                      dangerOpen = false;
                      await invalidateAll();
                    } else if (result.type === "failure") {
                      alert((result.data as { message?: string })?.message || "Failed to update status.");
                    }
                  };
                }}
              >
                <input type="hidden" name="cartRequestId" value={reviewingCart?.id} />
                <input type="hidden" name="newStatus" value={dangerCartStatus} />
                <div class="grid gap-2">
                  <Label>Force Status To</Label>
                  <Select type="single" bind:value={dangerCartStatus}>
                    <SelectTrigger>
                      {dangerCartStatus || "Select a status..."}
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pending" label="Pending">Pending</SelectItem>
                      <SelectItem value="reviewed" label="Reviewed">Reviewed</SelectItem>
                      <SelectItem value="picked_up" label="Picked Up">Picked Up</SelectItem>
                      <SelectItem value="returned" label="Returned">Returned</SelectItem>
                      <SelectItem value="cancelled" label="Cancelled">Cancelled</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  type="submit"
                  variant="destructive"
                  class="mt-3 w-full"
                  disabled={!dangerCartStatus}
                >
                  Force Status Update
                </Button>
              </form>
            </div>
          {/if}
        </div>
      </div>
    {/if}
  </SheetContent>
</Sheet>
