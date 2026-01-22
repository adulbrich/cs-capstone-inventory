<script lang="ts">
  import { Package, Search, User } from "@lucide/svelte";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import { Separator } from "$lib/components/ui/separator";
</script>

<nav class="border-b bg-background">
  <div class="flex h-16 items-center px-4 container mx-auto">
    <a href="/" class="flex items-center gap-2 font-semibold text-lg">
      <Package class="h-6 w-6"/>
      <span>CS Capstone Inventory</span>
    </a>
    <div class="ml-auto flex items-center space-x-4">
      <div class="relative w-full max-w-sm hidden md:block">
        <Search
          class="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground"
        />
        <Input
          type="search"
          placeholder="Search items..."
          class="w-64 pl-8 md:w-80"
        />
      </div>
      <Separator orientation="vertical" class="h-6"/>
      <Button variant="ghost" size="icon" href="/login">
        <User class="h-5 w-5"/>
        <span class="sr-only">Login</span>
      </Button>
    </div>
  </div>
</nav>
