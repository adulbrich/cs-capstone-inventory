<script lang="ts">
  import "./layout.css";
  import { onMount } from "svelte";
  import { invalidate } from "$app/navigation";
  import { page } from "$app/stores";

  let { data, children } = $props();
  let { supabase, session } = $derived(data);

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
        {#if !session}
          <a href="/login" class="font-semibold">Login</a>
        {/if}
      </nav>
    </div>
  </header>

  <main class="container mx-auto px-4 py-8">{@render children()}</main>
</div>
