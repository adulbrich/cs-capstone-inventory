<script lang="ts">
  import "./layout.css";
  import { onMount } from "svelte";
  import { setContext } from "svelte";
  import { goto, invalidate, invalidateAll } from "$app/navigation";
  import { Button } from "$lib/components/ui/button";
  import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
  } from "$lib/components/ui/dropdown-menu";
  import { ChevronDown } from "@lucide/svelte";

  let { data, children } = $props();
  let { supabase, session } = $derived(data);

  // Cart state — in-memory, intentionally lost on page refresh
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
      <nav class="flex items-center gap-4">
        <a href="/" class="font-semibold text-sm">Search Inventory</a>

        {#if data.userRole === "admin" || data.userRole === "instructor"}
          <!-- Mobile: dropdown for admin links -->
          <div class="md:hidden">
            <DropdownMenu>
              <DropdownMenuTrigger>
                {#snippet child({ props })}
                  <Button variant="ghost" size="sm" class="gap-1 px-2" {...props}>
                    Admin
                    <ChevronDown class="h-3 w-3" />
                  </Button>
                {/snippet}
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuItem onclick={() => goto("/admin")}>Manage Inventory</DropdownMenuItem>
                <DropdownMenuItem onclick={() => goto("/admin/cart-requests")}>Cart Requests</DropdownMenuItem>
                <DropdownMenuItem onclick={() => goto("/admin/custom-requests")}>Custom Requests</DropdownMenuItem>
                {#if data.userRole === "admin"}
                  <DropdownMenuItem onclick={() => goto("/admin/users")}>Users</DropdownMenuItem>
                {/if}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <!-- Desktop: inline links -->
          <a href="/admin" class="font-semibold text-sm hidden md:block">Manage Inventory</a>
          <a href="/admin/cart-requests" class="font-semibold text-sm hidden md:block">Cart Requests</a>
          <a href="/admin/custom-requests" class="font-semibold text-sm hidden md:block">Custom Requests</a>
        {/if}
        {#if data.userRole === "admin"}
          <a href="/admin/users" class="font-semibold text-sm hidden md:block">Users</a>
        {/if}

        <div class="ml-auto flex items-center gap-2">
          {#if session}
            <Button variant="ghost" size="sm" href="/account">My Account</Button>
            <Button
              variant="outline"
              size="sm"
              class="hidden sm:inline-flex"
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
            </Button>
          {:else}
            <Button variant="outline" size="sm" href="/login">Login</Button>
          {/if}
        </div>
      </nav>
    </div>
  </header>

  <main class="container mx-auto px-4 py-8">{@render children()}</main>
</div>
