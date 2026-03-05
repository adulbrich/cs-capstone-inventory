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
  import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
  } from "$lib/components/ui/table";
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

  type CustomRequest = {
    id: string;
    status: string;
    created_at: string;
    items: { name: string; quantity: number }[];
    reason: string;
  };

  type PageData = {
    items: Item[];
    userCartRequests: CartRequest[];
    hasPendingCart: boolean;
    userCustomRequests: CustomRequest[];
    session: { user: { id: string } } | null;
  };

  const { data } = $props<{ data: PageData }>();
  const cart = getContext<CartContext>("cart");

  let searchQuery = $state("");
  let statusFilter = $state("all");
  let isCartOpen = $state(false);
  let isSubmitting = $state(false);
  let isRequestDetailOpen = $state(false);
  let viewingCartRequest = $state<CartRequest | null>(null);

  function openRequestDetail(req: CartRequest) {
    viewingCartRequest = req;
    isRequestDetailOpen = true;
  }

  const session = $derived(data.session);
  const hasPendingCart = $derived(data.hasPendingCart);

  const userCartRequests = $derived(
    [...(data.userCartRequests || [])].sort((a, b) => {
      const da = getCartDerivedStatus(a);
      const db = getCartDerivedStatus(b);
      return (STATUS_SORT[da] ?? 99) - (STATUS_SORT[db] ?? 99);
    })
  );

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

  const STATUS_SORT: Record<string, number> = {
    pending: 0,
    picked_up: 1,
    approved: 2,
    partial: 3,
    refused: 4,
    returned: 5,
    cancelled: 6,
  };

  function getCartDerivedStatus(req: CartRequest) {
    if (req.status === "pending") return "pending";
    if (req.status === "cancelled") return "cancelled";
    if (req.status === "returned") return "returned";
    if (req.status === "picked_up") return "picked_up";
    // For "reviewed": derive from item decisions
    const items = req.checkout_request_items;
    const approved = items.filter((i) => i.status === "approved").length;
    const refused = items.filter((i) => i.status === "refused").length;
    if (approved === items.length) return "approved";
    if (refused === items.length) return "refused";
    return "partial";
  }

  function getCartRequestStatusColor(derived: string) {
    switch (derived) {
      case "pending": return "bg-yellow-100 text-yellow-800";
      case "picked_up": return "bg-blue-100 text-blue-800";
      case "approved": return "bg-green-100 text-green-800";
      case "partial": return "bg-orange-100 text-orange-800";
      case "refused": return "bg-red-100 text-red-800";
      case "returned": return "bg-purple-100 text-purple-800";
      case "cancelled": return "bg-gray-100 text-gray-800";
      default: return "";
    }
  }

  function getCartRequestStatusLabel(derived: string) {
    switch (derived) {
      case "pending": return "Pending";
      case "picked_up": return "Picked Up";
      case "approved": return "Approved";
      case "partial": return "Partially Approved";
      case "refused": return "Refused";
      case "returned": return "Returned";
      case "cancelled": return "Cancelled";
      default: return derived;
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

  function getCustomRequestStatusColor(status: string) {
    switch (status) {
      case "pending": return "bg-yellow-100 text-yellow-800";
      case "approved": return "bg-green-100 text-green-800";
      case "refused": return "bg-red-100 text-red-800";
      default: return "bg-gray-100 text-gray-800";
    }
  }

  function getCustomRequestStatusLabel(status: string) {
    switch (status) {
      case "pending": return "Pending";
      case "approved": return "Approved";
      case "refused": return "Refused";
      default: return status;
    }
  }

  const userCustomRequests = $derived(data.userCustomRequests || []);
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
    <div class="space-y-3">
      <h2 class="text-xl font-semibold tracking-tight">My Requests</h2>
      <div class="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead># Items</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {#each userCartRequests as req (req.id)}
              {@const derived = getCartDerivedStatus(req)}
              <TableRow>
                <TableCell class="text-sm text-muted-foreground whitespace-nowrap">
                  {new Date(req.created_at).toLocaleDateString()}
                </TableCell>
                <TableCell>
                  {req.checkout_request_items.length}
                </TableCell>
                <TableCell>
                  <Badge class={getCartRequestStatusColor(derived)}>
                    {getCartRequestStatusLabel(derived)}
                  </Badge>
                </TableCell>
                <TableCell class="flex gap-2 items-center">
                  <Button
                    size="sm"
                    variant="outline"
                    onclick={() => openRequestDetail(req)}
                  >
                    View
                  </Button>
                  {#if req.status === "pending"}
                    <form action="?/cancelCart" method="POST" use:enhance>
                      <input type="hidden" name="cartRequestId" value={req.id} />
                      <Button
                        size="sm"
                        variant="outline"
                        class="text-red-500 hover:text-red-600"
                        type="submit"
                      >
                        Cancel
                      </Button>
                    </form>
                  {/if}
                </TableCell>
              </TableRow>
            {/each}
          </TableBody>
        </Table>
      </div>
    </div>
    <Separator />
  {/if}

  {#if session && userCustomRequests.length > 0}
    <div class="space-y-3">
      <h2 class="text-xl font-semibold tracking-tight">My Custom Requests</h2>
      <div class="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead># Items</TableHead>
              <TableHead>Reason</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {#each userCustomRequests as req (req.id)}
              <TableRow>
                <TableCell class="text-sm text-muted-foreground whitespace-nowrap">
                  {new Date(req.created_at).toLocaleDateString()}
                </TableCell>
                <TableCell>
                  {req.items?.length ?? 0}
                </TableCell>
                <TableCell class="max-w-[200px] truncate text-sm text-muted-foreground">
                  {req.reason}
                </TableCell>
                <TableCell>
                  <Badge class={getCustomRequestStatusColor(req.status)}>
                    {getCustomRequestStatusLabel(req.status)}
                  </Badge>
                </TableCell>
              </TableRow>
            {/each}
          </TableBody>
        </Table>
      </div>
    </div>
    <Separator />
  {/if}

  {#if session}
    <p class="text-sm text-muted-foreground">
      Can't find what you need?
      <a href="/request/custom" class="underline font-medium">
        Submit a custom request →
      </a>
    </p>
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
            {#each item.tags ?? [] as tag, i (i)}
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

<!-- Request Detail Sheet -->
<Sheet bind:open={isRequestDetailOpen}>
  <SheetContent class="overflow-y-auto p-6">
    <SheetHeader class="p-0">
      <SheetTitle>Request Details</SheetTitle>
      <SheetDescription>
        Submitted {viewingCartRequest ? new Date(viewingCartRequest.created_at).toLocaleDateString() : ""}
        — {viewingCartRequest ? getCartRequestStatusLabel(getCartDerivedStatus(viewingCartRequest)) : ""}
      </SheetDescription>
    </SheetHeader>
    {#if viewingCartRequest}
      <div class="py-4 space-y-4">
        <div class="space-y-2">
          {#each viewingCartRequest.checkout_request_items as cartItem (cartItem.id)}
            <div class="flex items-center justify-between py-2 border-b text-sm">
              <span>{cartItem.item?.title ?? "Item removed"}</span>
              {#if viewingCartRequest.status !== "pending" && viewingCartRequest.status !== "cancelled"}
                <Badge class={getItemDecisionColor(cartItem.status)}>
                  {cartItem.status}
                </Badge>
              {/if}
            </div>
          {/each}
        </div>
        {#if viewingCartRequest.admin_note}
          <div>
            <p class="text-sm font-semibold mb-1">Note from admin</p>
            <p class="text-sm text-muted-foreground italic">{viewingCartRequest.admin_note}</p>
          </div>
        {/if}
        {#if viewingCartRequest.status === "cancelled"}
          <p class="text-sm text-muted-foreground">This request was cancelled.</p>
        {:else if viewingCartRequest.status === "returned"}
          <p class="text-sm text-muted-foreground">Items have been returned.</p>
        {:else if viewingCartRequest.status === "picked_up"}
          <p class="text-sm text-muted-foreground">Items are checked out.</p>
        {/if}
      </div>
    {/if}
  </SheetContent>
</Sheet>

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
