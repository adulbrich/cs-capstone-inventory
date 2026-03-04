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
