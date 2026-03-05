<script lang="ts">
  import { enhance } from "$app/forms";
  import { Badge } from "$lib/components/ui/badge";
  import { Button } from "$lib/components/ui/button";
  import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
  } from "$lib/components/ui/card";
  import { Input } from "$lib/components/ui/input";
  import { Label } from "$lib/components/ui/label";
  import { Separator } from "$lib/components/ui/separator";

  type Profile = { full_name: string | null; role: string; email: string | null };
  type PageData = { profile: Profile | null };

  const { data } = $props<{ data: PageData }>();

  const initialName = data.profile?.full_name ?? "";
  let fullName = $state(initialName);
  let saved = $state(false);
  let saveError = $state("");

  const roleLabels: Record<string, string> = {
    student: "Student",
    instructor: "Instructor",
    admin: "Admin",
  };
</script>

<div class="max-w-lg mx-auto py-8 space-y-6">
  <div class="flex items-center justify-between">
    <h1 class="text-3xl font-bold tracking-tight">My Account</h1>
    <form method="POST" action="?/logout" use:enhance>
      <Button type="submit" variant="outline" size="sm">Logout</Button>
    </form>
  </div>

  <Card>
    <CardHeader>
      <CardTitle>Profile</CardTitle>
    </CardHeader>
    <CardContent class="space-y-5">
      <!-- Email (read-only) -->
      <div class="space-y-1">
        <Label class="text-xs text-muted-foreground uppercase tracking-wide">Email</Label>
        <p class="text-sm">{data.profile?.email ?? "—"}</p>
      </div>

      <Separator />

      <!-- Role (read-only) -->
      <div class="space-y-1">
        <Label class="text-xs text-muted-foreground uppercase tracking-wide">Role</Label>
        <div>
          <Badge variant="secondary">
            {roleLabels[data.profile?.role ?? ""] ?? data.profile?.role ?? "—"}
          </Badge>
        </div>
        <p class="text-xs text-muted-foreground mt-1">
          Contact an administrator to change your role.
        </p>
      </div>

      <Separator />

      <!-- Full name (editable) -->
      <form
        method="POST"
        action="?/updateName"
        use:enhance={() => {
          saved = false;
          saveError = "";
          return async ({ result }) => {
            if (result.type === "success") {
              saved = true;
            } else if (result.type === "failure") {
              saveError = (result.data?.message as string) || "Failed to save.";
            }
          };
        }}
        class="space-y-3"
      >
        <div class="space-y-1">
          <Label for="fullName" class="text-xs text-muted-foreground uppercase tracking-wide">
            Full Name
          </Label>
          <Input
            id="fullName"
            name="fullName"
            bind:value={fullName}
            placeholder="Your full name"
          />
        </div>

        {#if saved}
          <p class="text-sm text-green-600">Name updated successfully.</p>
        {/if}
        {#if saveError}
          <p class="text-sm text-destructive">{saveError}</p>
        {/if}

        <Button type="submit">Save Name</Button>
      </form>
    </CardContent>
  </Card>
</div>
