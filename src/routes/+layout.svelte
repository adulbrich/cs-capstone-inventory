<script lang="ts">
  import "./layout.css";
  import { onMount } from "svelte";
  import { setContext } from "svelte";
  import { goto, invalidate, invalidateAll } from "$app/navigation";

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
