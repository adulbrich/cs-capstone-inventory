<script lang="ts">
  import { enhance } from "$app/forms";
  import { invalidateAll } from "$app/navigation";
  import { Badge } from "$lib/components/ui/badge";
  import { Button } from "$lib/components/ui/button";
  import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
  } from "$lib/components/ui/card";
  import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
  } from "$lib/components/ui/select";
  import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
  } from "$lib/components/ui/table";

  type Profile = {
    id: string;
    full_name: string | null;
    email: string | null;
    role: string;
    created_at: string;
  };

  type PageData = { users: Profile[]; currentUserId: string };

  const { data } = $props<{ data: PageData }>();

  // Track the in-flight select value per user row
  let pendingRoles = $state<Record<string, string>>({});

  function roleColor(role: string) {
    switch (role) {
      case "admin": return "bg-red-100 text-red-800";
      case "instructor": return "bg-blue-100 text-blue-800";
      default: return "bg-gray-100 text-gray-700";
    }
  }
</script>

<div class="space-y-6">
  <h1 class="text-3xl font-bold tracking-tight">Users</h1>

  <Card>
    <CardHeader>
      <CardTitle>All Users ({data.users.length})</CardTitle>
    </CardHeader>
    <CardContent>
      {#if data.users.length === 0}
        <p class="text-sm text-muted-foreground text-center py-8">No users yet.</p>
      {:else}
        <div class="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Current Role</TableHead>
                <TableHead>Joined</TableHead>
                <TableHead>Change Role</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {#each data.users as user (user.id)}
                {@const isSelf = user.id === data.currentUserId}
                <TableRow>
                  <TableCell class="font-medium">
                    {user.full_name || "—"}
                    {#if isSelf}
                      <span class="ml-1 text-xs text-muted-foreground">(you)</span>
                    {/if}
                  </TableCell>
                  <TableCell class="text-sm text-muted-foreground">
                    {user.email || "—"}
                  </TableCell>
                  <TableCell>
                    <Badge class={roleColor(user.role)}>{user.role}</Badge>
                  </TableCell>
                  <TableCell class="text-sm text-muted-foreground whitespace-nowrap">
                    {new Date(user.created_at).toLocaleDateString()}
                  </TableCell>
                  <TableCell>
                    {#if isSelf}
                      <span class="text-xs text-muted-foreground">Cannot change own role</span>
                    {:else}
                      <form
                        method="POST"
                        action="?/changeRole"
                        class="flex items-center gap-2"
                        use:enhance={() => {
                          return async ({ result }) => {
                            if (result.type === "success") {
                              await invalidateAll();
                            } else if (result.type === "failure") {
                              alert(result.data?.message || "Failed to change role.");
                            }
                          };
                        }}
                      >
                        <input type="hidden" name="userId" value={user.id} />
                        <Select
                          type="single"
                          value={pendingRoles[user.id] ?? user.role}
                          onValueChange={(v) => (pendingRoles[user.id] = v)}
                        >
                          <SelectTrigger class="w-32">
                            {pendingRoles[user.id] ?? user.role}
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="student" label="Student">Student</SelectItem>
                            <SelectItem value="instructor" label="Instructor">Instructor</SelectItem>
                            <SelectItem value="admin" label="Admin">Admin</SelectItem>
                          </SelectContent>
                        </Select>
                        <input type="hidden" name="role" value={pendingRoles[user.id] ?? user.role} />
                        <Button
                          type="submit"
                          size="sm"
                          disabled={(pendingRoles[user.id] ?? user.role) === user.role}
                        >
                          Save
                        </Button>
                      </form>
                    {/if}
                  </TableCell>
                </TableRow>
              {/each}
            </TableBody>
          </Table>
        </div>
      {/if}
    </CardContent>
  </Card>
</div>
