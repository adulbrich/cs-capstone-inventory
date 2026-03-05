<script lang="ts">
  import { goto, invalidateAll } from "$app/navigation";
  import { page } from "$app/stores";
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
  let ssoLoading = $state(false);
  let error = $state(
    $page.url.searchParams.get("error") === "sso_failed"
      ? "SSO authentication failed. Please try again."
      : "",
  );

  async function handleLogin() {
    loading = true;
    error = "";
    const { data: authData, error: err } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (err) {
      error = err.message;
      loading = false;
    } else {
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", authData.user.id)
        .single();
      await invalidateAll();
      goto(profile?.role === "admin" || profile?.role === "instructor" ? "/admin" : "/");
    }
  }

  async function handleOsuLogin() {
    ssoLoading = true;
    error = "";

    // ── Supabase SAML SSO for Oregon State University ONID ──────────────────
    // After registering with OSU IT and adding their IdP metadata in Supabase
    // Dashboard → Authentication → SSO Providers, replace the domain below
    // with the providerId shown in the dashboard if automatic domain resolution
    // doesn't work. See: https://supabase.com/docs/guides/auth/sso/auth-sso-saml
    const { data: ssoData, error: ssoErr } = await supabase.auth.signInWithSSO({
      domain: "oregonstate.edu",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });

    if (ssoErr) {
      error = ssoErr.message;
      ssoLoading = false;
    } else if (ssoData?.url) {
      window.location.href = ssoData.url;
    }
  }
</script>

<div class="flex items-center justify-center min-h-[calc(100vh-200px)]">
  <Card class="w-full max-w-md">
    <CardHeader>
      <CardTitle class="text-2xl">Login</CardTitle>
      <CardDescription>Sign in with your OSU ONID or email account.</CardDescription>
    </CardHeader>

    <form onsubmit={(e) => { e.preventDefault(); handleLogin(); }}>
      <CardContent class="grid gap-4">
        {#if error}
          <div class="text-red-500 text-sm">{error}</div>
        {/if}
        <div class="grid gap-2">
          <Label for="email">Email</Label>
          <Input
            id="email"
            type="email"
            placeholder="you@oregonstate.edu"
            bind:value={email}
            required
          />
        </div>
        <div class="grid gap-2">
          <Label for="password">Password</Label>
          <Input id="password" type="password" bind:value={password} required />
        </div>
      </CardContent>
      <CardFooter class="flex flex-col gap-4 pt-6">
        <Button type="submit" class="w-full" disabled={loading || ssoLoading}>
          {loading ? "Signing in..." : "Sign in"}
        </Button>
        <div class="relative w-full">
          <div class="absolute inset-0 flex items-center">
            <span class="w-full border-t"></span>
          </div>
          <div class="relative flex justify-center text-xs uppercase">
            <span class="bg-background px-2 text-muted-foreground">Or</span>
          </div>
        </div>
        <Button
          type="button"
          variant="outline"
          class="w-full gap-2"
          onclick={handleOsuLogin}
          disabled={loading || ssoLoading}
        >
          <svg
            class="h-4 w-4"
            viewBox="0 0 32 32"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
          >
            <rect width="32" height="32" rx="4" fill="#DC4405" />
            <text x="16" y="22" text-anchor="middle" fill="white" font-size="14" font-weight="bold" font-family="serif">O</text>
          </svg>
          {ssoLoading ? "Redirecting..." : "Sign in with Oregon State University"}
        </Button>
      </CardFooter>
    </form>
  </Card>
</div>
