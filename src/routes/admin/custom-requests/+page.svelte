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
  import { Label } from "$lib/components/ui/label";
  import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetFooter,
    SheetHeader,
    SheetTitle,
  } from "$lib/components/ui/sheet";
  import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
  } from "$lib/components/ui/table";
  import { Textarea } from "$lib/components/ui/textarea";

  type HardwareItem = {
    name: string;
    quantity: number;
    unit_price: number | null;
  };

  type CustomRequest = {
    id: string;
    status: string;
    reason: string;
    alternatives: string;
    items: HardwareItem[];
    admin_note: string | null;
    reviewed_at: string | null;
    created_at: string;
    user: { full_name?: string | null };
  };

  type PageData = { requests: CustomRequest[] };

  const { data } = $props<{ data: PageData }>();

  let isSheetOpen = $state(false);
  let viewingRequest = $state<CustomRequest | null>(null);
  let adminNote = $state("");

  function openSheet(req: CustomRequest) {
    viewingRequest = req;
    adminNote = req.admin_note || "";
    isSheetOpen = true;
  }
</script>

<div class="space-y-6">
  <h1 class="text-3xl font-bold tracking-tight">Custom Requests</h1>

  <Card>
    <CardHeader>
      <CardTitle>All Custom Requests</CardTitle>
    </CardHeader>
    <CardContent>
      {#if data.requests.length === 0}
        <p class="text-sm text-muted-foreground text-center py-8">
          No custom requests yet.
        </p>
      {:else}
        <div class="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>User</TableHead>
                <TableHead># Items</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {#each data.requests as req (req.id)}
                <TableRow>
                  <TableCell class="text-sm text-muted-foreground">
                    {new Date(req.created_at).toLocaleDateString()}
                  </TableCell>
                  <TableCell>{req.user?.full_name || "Unknown User"}</TableCell>
                  <TableCell>{req.items.length}</TableCell>
                  <TableCell>
                    <Badge
                      class={req.status === "pending"
                        ? "bg-yellow-100 text-yellow-800"
                        : "bg-green-100 text-green-800"}
                    >
                      {req.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Button
                      size="sm"
                      variant="outline"
                      onclick={() => openSheet(req)}
                    >
                      {req.status === "pending" ? "Review" : "View"}
                    </Button>
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

<!-- Review Sheet -->
<Sheet bind:open={isSheetOpen}>
  <SheetContent class="overflow-y-auto p-6 w-full sm:max-w-lg">
    <SheetHeader class="p-0">
      <SheetTitle>Custom Request</SheetTitle>
      <SheetDescription>
        {viewingRequest?.user?.full_name || "Student"} —
        {viewingRequest
          ? new Date(viewingRequest.created_at).toLocaleDateString()
          : ""}
      </SheetDescription>
    </SheetHeader>

    {#if viewingRequest}
      <div class="py-4 space-y-4">
        <div>
          <h3 class="text-sm font-semibold mb-1">Why they need it</h3>
          <p class="text-sm text-muted-foreground">{viewingRequest.reason}</p>
        </div>
        <div>
          <h3 class="text-sm font-semibold mb-1">Alternatives considered</h3>
          <p class="text-sm text-muted-foreground">
            {viewingRequest.alternatives}
          </p>
        </div>
        <div>
          <h3 class="text-sm font-semibold mb-2">Hardware items</h3>
          <div class="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Qty</TableHead>
                  <TableHead>Unit Price</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {#each viewingRequest.items as hw, i (i)}
                  <TableRow>
                    <TableCell>{hw.name}</TableCell>
                    <TableCell>{hw.quantity}</TableCell>
                    <TableCell>
                      {hw.unit_price != null
                        ? `$${hw.unit_price.toFixed(2)}`
                        : "—"}
                    </TableCell>
                  </TableRow>
                {/each}
              </TableBody>
            </Table>
          </div>
        </div>

        {#if viewingRequest.status === "pending"}
          <form
            method="POST"
            action="?/review"
            use:enhance={() => {
              return async ({ result }) => {
                if (result.type === "success") {
                  isSheetOpen = false;
                  await invalidateAll();
                } else if (result.type === "failure") {
                  alert(
                    `Error: ${result.data?.message || "Failed to submit review"}`
                  );
                }
              };
            }}
          >
            <input
              type="hidden"
              name="customRequestId"
              value={viewingRequest.id}
            />
            <div class="grid gap-2 mt-2">
              <Label for="adminNote">Admin Note (optional)</Label>
              <Textarea
                id="adminNote"
                name="adminNote"
                bind:value={adminNote}
                placeholder="Approval/refusal reasoning..."
              />
            </div>
            <SheetFooter class="mt-4">
              <Button type="submit">Mark as Reviewed</Button>
            </SheetFooter>
          </form>
        {:else}
          {#if viewingRequest.admin_note}
            <div>
              <h3 class="text-sm font-semibold mb-1">Admin Note</h3>
              <p class="text-sm text-muted-foreground italic">
                {viewingRequest.admin_note}
              </p>
            </div>
          {/if}
          <p class="text-sm text-muted-foreground">
            Reviewed on
            {viewingRequest.reviewed_at
              ? new Date(viewingRequest.reviewed_at).toLocaleDateString()
              : "N/A"}
          </p>
        {/if}
      </div>
    {/if}
  </SheetContent>
</Sheet>
