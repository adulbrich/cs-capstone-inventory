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
  import { Filter, Search } from "@lucide/svelte";
  import { Input } from "$lib/components/ui/input";
  import { Separator } from "$lib/components/ui/separator";
  import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
  } from "$lib/components/ui/dropdown-menu";

  type Item = {
    id: string;
    title: string;
    description?: string;
    status: string;
    tags?: string[];
  };

  type Request = {
    id: string;
    item_id: string;
    status: string;
    created_at: string;
    item: Item;
  };

  type PageData = {
    items: Item[];
    userRequests: Request[];
    session: { user: { id: string } } | null;
  };

  const { data } = $props<{ data: PageData }>();

  let searchQuery = $state("");
  let statusFilter = $state("all");

  const session = $derived(data.session);
  const userRequests = $derived(data.userRequests || []);

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
      case "checked_in":
        return "bg-green-100 text-green-800";
      case "checked_out":
        return "bg-yellow-100 text-yellow-800";
      case "retired":
        return "bg-red-100 text-red-800";
      case "requested":
        return "bg-blue-100 text-blue-800";
      default:
        return "";
    }
  }

  function getStatusLabel(status: string) {
    switch (status) {
      case "checked_in":
        return "Available";
      case "checked_out":
        return "Checked Out";
      case "retired":
        return "Retired";
      case "requested":
        return "Requested";
      default:
        return status;
    }
  }

  function getRequestStatusColor(status: string) {
    switch (status) {
      case "pending":
        return "bg-yellow-100 text-yellow-800";
      case "approved":
        return "bg-green-100 text-green-800";
      case "refused":
        return "bg-red-100 text-red-800";
      case "cancelled":
        return "bg-gray-100 text-gray-800";
      default:
        return "";
    }
  }
</script>

<div class="space-y-8">
  <div
    class="flex flex-col md:flex-row md:items-center md:justify-between gap-4"
  >
    <div>
      <h1 class="text-3xl font-bold tracking-tight">Inventory</h1>
      <p class="text-muted-foreground">
        Browse available hardware for your capstone project.
      </p>
    </div>
    <div class="flex items-center gap-2">
      <div class="relative w-full md:w-64">
        <Search
          class="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground"
        />
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
          <DropdownMenuItem onclick={() => (statusFilter = "all")}>
            All
          </DropdownMenuItem>
          <DropdownMenuItem onclick={() => (statusFilter = "checked_in")}>
            Available
          </DropdownMenuItem>
          <DropdownMenuItem onclick={() => (statusFilter = "checked_out")}>
            Checked Out
          </DropdownMenuItem>
          <DropdownMenuItem onclick={() => (statusFilter = "requested")}>
            Requested
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  </div>

  {#if session && userRequests?.length > 0}
    <div class="space-y-4">
      <h2 class="text-xl font-semibold tracking-tight">My Requests</h2>
      <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {#each userRequests as request (request.id)}
          <Card>
            <CardHeader class="pb-2">
              <div class="flex justify-between items-start">
                <CardTitle class="text-base">{request.item.title}</CardTitle>
                <Badge class={getRequestStatusColor(request.status)}>
                  {request.status}
                </Badge>
              </div>
              <CardDescription class="text-xs">
                Requested on {new Date(request.created_at).toLocaleDateString()}
              </CardDescription>
            </CardHeader>
            <CardFooter class="pt-2">
              {#if request.status === "pending"}
                <form
                  action="?/cancelRequest"
                  method="POST"
                  use:enhance
                  class="w-full"
                >
                  <input type="hidden" name="requestId" value={request.id} />
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
                  {request.status === "approved" ? "Please pick up your item." : ""}
                  {request.status === "refused" ? "Request was refused." : ""}
                  {request.status === "cancelled" ? "Request cancelled." : ""}
                </div>
              {/if}
            </CardFooter>
          </Card>
        {/each}
      </div>
    </div>
    <Separator/>
  {/if}

  <div class="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
    {#each filteredItems as item}
      <Card class="flex flex-col h-full">
        <CardHeader>
          <div class="flex justify-between items-start gap-2">
            <CardTitle class="line-clamp-1" title={item.title}>
              {item.title}
            </CardTitle>
            <Badge class={getStatusColor(item.status)}
              >{getStatusLabel(item.status)}</Badge
            >
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
              <form
                action="?/requestItem"
                method="POST"
                use:enhance
                class="w-full"
              >
                <input type="hidden" name="itemId" value={item.id} />
                <Button class="w-full" type="submit">Request Item</Button>
              </form>
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
