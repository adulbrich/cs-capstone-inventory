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
  import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
  } from "$lib/components/ui/select";
  import { Separator } from "$lib/components/ui/separator";
  import { Textarea } from "$lib/components/ui/textarea";

  type HardwareItem = {
    name: string;
    quantity: number;
    unit_price: number | null;
    url?: string | null;
  };

  type ProcItem = {
    id: string;
    title: string;
    status: string;
    purchase_url: string | null;
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
    procItems: ProcItem[];
  };

  type PageData = { requests: CustomRequest[] };

  const { data } = $props<{ data: PageData }>();

  let isSheetOpen = $state(false);
  let viewingRequest = $state<CustomRequest | null>(null);
  let adminNote = $state("");
  let addedItemIndices = $state(new Set<number>());
  let reviewDecision = $state("approved");
  let dangerCustomStatus = $state("");

  function openSheet(req: CustomRequest) {
    viewingRequest = req;
    adminNote = req.admin_note || "";
    addedItemIndices = new Set();
    reviewDecision = "approved";
    dangerCustomStatus = "";
    isSheetOpen = true;
  }

  function getCustomStatusColor(status: string) {
    switch (status) {
      case "pending": return "bg-yellow-100 text-yellow-800";
      case "approved": return "bg-green-100 text-green-800";
      case "refused": return "bg-red-100 text-red-800";
      default: return "bg-gray-100 text-gray-800";
    }
  }

  function getCustomStatusLabel(status: string) {
    switch (status) {
      case "pending": return "Pending";
      case "approved": return "Approved";
      case "refused": return "Refused";
      default: return status;
    }
  }

  function getProcStatusColor(status: string) {
    switch (status) {
      case "procurement": return "bg-orange-100 text-orange-800";
      case "purchased": return "bg-blue-100 text-blue-800";
      case "checked_in": return "bg-green-100 text-green-800";
      case "checked_out": return "bg-yellow-100 text-yellow-800";
      default: return "bg-gray-100 text-gray-800";
    }
  }

  function getProcStatusLabel(status: string) {
    switch (status) {
      case "procurement": return "To Purchase";
      case "purchased": return "Purchased";
      case "checked_in": return "Available";
      case "checked_out": return "Checked Out";
      default: return status;
    }
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
                    <Badge class={getCustomStatusColor(req.status)}>
                      {getCustomStatusLabel(req.status)}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Button
                      size="sm"
                      variant={req.status === "pending" ? "default" : "outline"}
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
          <div class="space-y-2">
            {#each viewingRequest.items as hw, i (i)}
              <div class="rounded-md border p-3 space-y-1">
                <div class="flex items-center justify-between gap-2">
                  <span class="text-sm font-medium">{hw.name}</span>
                  <form
                    method="POST"
                    action="?/addToInventory"
                    use:enhance={() => {
                      return async ({ result }) => {
                        if (result.type === "success") {
                          addedItemIndices = new Set([...addedItemIndices, i]);
                        } else if (result.type === "failure") {
                          alert(result.data?.message || "Failed to add to procurement.");
                        }
                      };
                    }}
                  >
                    <input type="hidden" name="customRequestId" value={viewingRequest.id} />
                    <input type="hidden" name="itemName" value={hw.name} />
                    <input type="hidden" name="itemUrl" value={hw.url || ""} />
                    <input type="hidden" name="itemQuantity" value={hw.quantity} />
                    <Button
                      type="submit"
                      size="sm"
                      variant="outline"
                      disabled={addedItemIndices.has(i)}
                    >
                      {addedItemIndices.has(i) ? "Added" : "Add to Procurement"}
                    </Button>
                  </form>
                </div>
                <div class="flex gap-4 text-xs text-muted-foreground">
                  <span>Qty: {hw.quantity}</span>
                  <span>
                    {hw.unit_price != null ? `$${hw.unit_price.toFixed(2)} each` : "No price"}
                  </span>
                  {#if hw.url}
                    <a
                      href={hw.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      class="underline truncate max-w-[180px]"
                    >
                      {hw.url}
                    </a>
                  {/if}
                </div>
              </div>
            {/each}
          </div>
        </div>

        {#if viewingRequest.procItems.length > 0}
          <Separator />
          <div>
            <h3 class="text-sm font-semibold mb-2">Procurement Items</h3>
            <div class="space-y-1">
              {#each viewingRequest.procItems as pi (pi.id)}
                <div class="flex items-center justify-between py-2 border-b text-sm">
                  <span>{pi.title}</span>
                  <div class="flex items-center gap-2">
                    <Badge class={getProcStatusColor(pi.status)}>
                      {getProcStatusLabel(pi.status)}
                    </Badge>
                    {#if pi.purchase_url}
                      <a
                        href={pi.purchase_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        class="text-xs underline text-muted-foreground"
                      >
                        Link
                      </a>
                    {/if}
                  </div>
                </div>
              {/each}
            </div>
          </div>
        {/if}

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
                    `Error: ${(result.data as { message?: string })?.message || "Failed to submit review"}`
                  );
                }
              };
            }}
          >
            <input type="hidden" name="customRequestId" value={viewingRequest.id} />
            <input type="hidden" name="decision" value={reviewDecision} />
            <div class="grid gap-3 mt-2">
              <div class="grid gap-1">
                <Label>Decision</Label>
                <Select type="single" bind:value={reviewDecision}>
                  <SelectTrigger>
                    {reviewDecision === "refused" ? "Refuse" : "Approve"}
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="approved" label="Approve">Approve</SelectItem>
                    <SelectItem value="refused" label="Refuse">Refuse</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div class="grid gap-1">
                <Label for="adminNote">Admin Note (optional)</Label>
                <Textarea
                  id="adminNote"
                  name="adminNote"
                  bind:value={adminNote}
                  placeholder="Approval/refusal reasoning..."
                />
              </div>
            </div>
            <SheetFooter class="mt-4">
              <Button type="submit" variant={reviewDecision === "refused" ? "destructive" : "default"}>
                {reviewDecision === "refused" ? "Refuse Request" : "Approve Request"}
              </Button>
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
            Decision: <span class="font-medium">{getCustomStatusLabel(viewingRequest.status)}</span>
            {viewingRequest.reviewed_at
              ? `on ${new Date(viewingRequest.reviewed_at).toLocaleDateString()}`
              : ""}
          </p>
        {/if}

        <!-- Danger Zone -->
        <div class="mt-6 border border-destructive/50 rounded-md p-4 space-y-3">
          <p class="text-sm font-semibold text-destructive">⚠ Danger Zone</p>
          <p class="text-sm text-muted-foreground">
            Forcefully override this request's status.
          </p>
          <form
            method="POST"
            action="?/forceCustomStatus"
            use:enhance={() => {
              return async ({ result }) => {
                if (result.type === "success") {
                  isSheetOpen = false;
                  await invalidateAll();
                } else if (result.type === "failure") {
                  alert((result.data as { message?: string })?.message || "Failed to update status.");
                }
              };
            }}
          >
            <input type="hidden" name="customRequestId" value={viewingRequest.id} />
            <input type="hidden" name="newStatus" value={dangerCustomStatus} />
            <div class="grid gap-2">
              <Label>Force Status To</Label>
              <Select type="single" bind:value={dangerCustomStatus}>
                <SelectTrigger>
                  {dangerCustomStatus ? getCustomStatusLabel(dangerCustomStatus) : "Select a status..."}
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending" label="Pending">Pending</SelectItem>
                  <SelectItem value="approved" label="Approved">Approved</SelectItem>
                  <SelectItem value="refused" label="Refused">Refused</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button
              type="submit"
              variant="destructive"
              class="mt-3 w-full"
              disabled={!dangerCustomStatus}
            >
              Force Status Update
            </Button>
          </form>
        </div>
      </div>
    {/if}
  </SheetContent>
</Sheet>
