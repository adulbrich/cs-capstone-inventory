<script lang="ts">
  import { goto, invalidateAll } from "$app/navigation";
  import { Button } from "$lib/components/ui/button";
  import {
    Card,
    CardContent,
    CardDescription,
    CardFooter,
    CardHeader,
    CardTitle,
  } from "$lib/components/ui/card";
  import { Input } from "$lib/components/ui/input";
  import { Label } from "$lib/components/ui/label";

  let { data } = $props();
  let { supabase } = $derived(data);

  let email = $state("");
  let password = $state("");
  let loading = $state(false);
  let error = $state("");

  async function handleLogin() {
    loading = true;
    error = "";
    const { data: authData, error: err } =
      await supabase.auth.signInWithPassword({
        email,
        password,
      });

    if (err) {
      error = err.message;
      loading = false;
    } else {
      // Fetch profile to determine redirect destination
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", authData.user.id)
        .single();

      await invalidateAll();
      const dest =
        profile?.role === "admin" || profile?.role === "instructor"
          ? "/admin"
          : "/";
      goto(dest);
    }
  }
</script>

<div class="flex items-center justify-center min-h-[calc(100vh-200px)]">
  <Card class="w-full max-w-md">
    <CardHeader>
      <CardTitle class="text-2xl">Login</CardTitle>
      <CardDescription>
        Enter your email below to login to your account.
      </CardDescription>
    </CardHeader>
    <CardContent class="grid gap-4">
      {#if error}
        <div class="text-red-500 text-sm">{error}</div>
      {/if}
      <div class="grid gap-2">
        <Label for="email">Email</Label>
        <Input
          id="email"
          type="email"
          placeholder="m@example.com"
          bind:value={email}
          required
        />
      </div>
      <div class="grid gap-2">
        <Label for="password">Password</Label>
        <Input id="password" type="password" bind:value={password} required/>
      </div>
    </CardContent>
    <CardFooter class="flex flex-col gap-4">
      <Button class="w-full" onclick={handleLogin} disabled={loading}>
        {loading ? "Logging in..." : "Sign in"}
      </Button>
      <div class="relative">
        <div class="absolute inset-0 flex items-center">
          <span class="w-full border-t"></span>
        </div>
        <div class="relative flex justify-center text-xs uppercase">
          <span class="bg-background px-2 text-muted-foreground"
            >Or continue with</span
          >
        </div>
      </div>
      <Button
        variant="outline"
        class="w-full"
        onclick={async () => {
          await supabase.auth.signInWithOAuth({
            provider: "google",
            options: {
              redirectTo: `${window.location.origin}/auth/callback`,
            },
          });
        }}
      >
        <svg
          class="mr-2 h-4 w-4"
          aria-hidden="true"
          focusable="false"
          data-prefix="fab"
          data-icon="google"
          role="img"
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 488 512"
        >
          <path
            fill="currentColor"
            d="M488 261.8C488 403.3 391.1 504 248 504 110.8 504 0 393.2 0 256S110.8 8 248 8c66.8 0 123 24.5 166.3 64.9l-67.5 64.9C258.5 52.6 94.3 116.6 94.3 256c0 86.5 69.1 156.6 153.7 156.6 98.2 0 135-70.4 140.8-106.9H248v-85.3h236.1c2.3 12.7 3.9 24.9 3.9 41.4z"
          ></path>
        </svg>
        Sign in with Google
      </Button>
    </CardFooter>
  </Card>
</div>
