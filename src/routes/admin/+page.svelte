<script lang="ts">
  import {
    AlertCircle,
    CheckCircle2,
    Package,
    Plus,
    Users,
  } from "@lucide/svelte";
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
  import { Input } from "$lib/components/ui/input";
  import { Label } from "$lib/components/ui/label";
  import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
  } from "$lib/components/ui/select";
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

  type Item = {
    id: string;
    title: string;
    tag_label?: string;
    description?: string;
    location?: string;
    status: string;
    checked_out_to?: string;
    tags?: string[];
    created_at: string;
    requested_by?: string | null;
  };

  type Transaction = {
    id: string;
    item_id: string | null;
    user_id: string | null;
    action: string;
    notes: string | null;
    created_at: string;
    item: { title: string } | null;
    user: { full_name?: string | null };
  };

  type ProcurementItem = {
    id: string;
    title: string;
    status: string;
    purchase_url: string | null;
    created_at: string;
  };

  type PageData = {
    items: Item[];
    auditLog: Transaction[];
    procurementItems: ProcurementItem[];
    pendingCartCount: number;
    pendingCustomCount: number;
    stats: {
      totalItems: number;
      checkedOut: number;
      retired: number;
      activeUsers: number;
    };
  };

  const { data } = $props<{ data: PageData }>();

  let isSheetOpen = $state(false);
  let editingItem = $state<Item | null>(null);

  let title = $state("");
  let tag_label = $state("");
  let description = $state("");
  let location = $state("");
  let selectValue = $state("available");
  let checked_out_to = $state("");
  let tags = $state("");

  // Bulk edit state
  let selectedIds = $state(new Set<string>());
  let bulkStatus = $state("");
  let bulkCheckedOutTo = $state("");
  let bulkLocation = $state("");
  let bulkTags = $state("");

  function openAddSheet() {
    isSheetOpen = true;
    editingItem = null;
    title = "";
    tag_label = "";
    description = "";
    location = "";
    selectValue = "available";
    checked_out_to = "";
    tags = "";
  }

  function openEditSheet(item: Item) {
    isSheetOpen = true;
    editingItem = item;
    title = item.title || "";
    tag_label = item.tag_label || "";
    description = item.description || "";
    location = item.location || "";
    selectValue = item.status === "checked_in" ? "available" : item.status;
    checked_out_to = item.checked_out_to || "";
    tags = item.tags?.join(", ") || "";
  }

  function getStatusLabel(status: string) {
    switch (status) {
      case "checked_in": return "Available";
      case "checked_out": return "Checked Out";
      case "retired": return "Retired";
      case "requested": return "Requested";
      case "procurement": return "Procurement";
      case "purchased": return "Purchased";
      default: return status;
    }
  }

</script>

<div class="space-y-6">
  <div class="flex items-center justify-between">
    <h1 class="text-3xl font-bold tracking-tight">Admin Dashboard</h1>
    <Button onclick={openAddSheet}>
      <Plus class="mr-2 h-4 w-4"/>
      Add Item
    </Button>
  </div>

  <!-- Statistics Cards -->
  <div class="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
    <Card class="py-3 gap-2 sm:py-6 sm:gap-6">
      <CardHeader
        class="flex flex-row items-center justify-between space-y-0 pb-1 sm:pb-2"
      >
        <CardTitle class="text-sm font-medium">Total Items</CardTitle>
        <Package class="h-4 w-4 text-muted-foreground"/>
      </CardHeader>
      <CardContent>
        <div class="text-xl sm:text-2xl font-bold">{data?.stats?.totalItems || 0}</div>
        <p class="text-xs text-muted-foreground">Across all categories</p>
      </CardContent>
    </Card>
    <Card class="py-3 gap-2 sm:py-6 sm:gap-6">
      <CardHeader
        class="flex flex-row items-center justify-between space-y-0 pb-1 sm:pb-2"
      >
        <CardTitle class="text-sm font-medium">Checked Out</CardTitle>
        <CheckCircle2 class="h-4 w-4 text-muted-foreground"/>
      </CardHeader>
      <CardContent>
        <div class="text-xl sm:text-2xl font-bold">{data?.stats?.checkedOut || 0}</div>
        <p class="text-xs text-muted-foreground">Active loans</p>
      </CardContent>
    </Card>
    <Card class="py-3 gap-2 sm:py-6 sm:gap-6">
      <CardHeader
        class="flex flex-row items-center justify-between space-y-0 pb-1 sm:pb-2"
      >
        <CardTitle class="text-sm font-medium">Retired Items</CardTitle>
        <AlertCircle class="h-4 w-4 text-muted-foreground"/>
      </CardHeader>
      <CardContent>
        <div class="text-xl sm:text-2xl font-bold">{data?.stats?.retired || 0}</div>
        <p class="text-xs text-muted-foreground">Out of circulation</p>
      </CardContent>
    </Card>
    <Card class="py-3 gap-2 sm:py-6 sm:gap-6">
      <CardHeader
        class="flex flex-row items-center justify-between space-y-0 pb-1 sm:pb-2"
      >
        <CardTitle class="text-sm font-medium">Active Users</CardTitle>
        <Users class="h-4 w-4 text-muted-foreground"/>
      </CardHeader>
      <CardContent>
        <div class="text-xl sm:text-2xl font-bold">
          {data?.stats?.activeUsers || "N/A"}
        </div>
        <p class="text-xs text-muted-foreground">Students & Instructors</p>
      </CardContent>
    </Card>
  </div>

  <!-- Pending Requests Summary -->
  <div class="grid gap-2 sm:grid-cols-2">
    <Card class="py-3 gap-2 sm:py-6 sm:gap-6">
      <CardHeader class="flex flex-row items-center justify-between space-y-0 pb-1 sm:pb-2">
        <CardTitle class="text-sm font-medium">Cart Requests</CardTitle>
      </CardHeader>
      <CardContent>
        <div class="text-xl sm:text-2xl font-bold">{data.pendingCartCount}</div>
        <p class="text-xs text-muted-foreground mb-2">Pending checkout requests</p>
        <Button variant="outline" size="sm" href="/admin/cart-requests">
          View Cart Requests →
        </Button>
      </CardContent>
    </Card>
    <Card class="py-3 gap-2 sm:py-6 sm:gap-6">
      <CardHeader class="flex flex-row items-center justify-between space-y-0 pb-1 sm:pb-2">
        <CardTitle class="text-sm font-medium">Custom Requests</CardTitle>
      </CardHeader>
      <CardContent>
        <div class="text-xl sm:text-2xl font-bold">{data.pendingCustomCount}</div>
        <p class="text-xs text-muted-foreground mb-2">Pending hardware requests</p>
        <Button variant="outline" size="sm" href="/admin/custom-requests">
          View Custom Requests →
        </Button>
      </CardContent>
    </Card>
  </div>

  <!-- Procurement Pipeline -->
  {#if data.procurementItems && data.procurementItems.length > 0}
    <Card>
      <CardHeader>
        <CardTitle>Procurement</CardTitle>
      </CardHeader>
      <CardContent>
        <div class="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Item</TableHead>
                <TableHead>Purchase URL</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Added</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {#each data.procurementItems as pi (pi.id)}
                <TableRow>
                  <TableCell class="font-medium">{pi.title}</TableCell>
                  <TableCell class="max-w-[200px]">
                    {#if pi.purchase_url}
                      <a
                        href={pi.purchase_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        class="text-sm underline truncate block"
                      >
                        {pi.purchase_url}
                      </a>
                    {:else}
                      <span class="text-muted-foreground text-sm">—</span>
                    {/if}
                  </TableCell>
                  <TableCell>
                    <Badge
                      class={pi.status === "procurement"
                        ? "bg-orange-100 text-orange-800"
                        : "bg-blue-100 text-blue-800"}
                    >
                      {pi.status === "procurement" ? "To Purchase" : "Purchased"}
                    </Badge>
                  </TableCell>
                  <TableCell class="text-sm text-muted-foreground whitespace-nowrap">
                    {new Date(pi.created_at).toLocaleDateString()}
                  </TableCell>
                  <TableCell>
                    {#if pi.status === "procurement"}
                      <form
                        method="POST"
                        action="?/markPurchased"
                        use:enhance={() => {
                          return async ({ result }) => {
                            if (result.type === "success") await invalidateAll();
                            else alert("Failed to update status.");
                          };
                        }}
                      >
                        <input type="hidden" name="id" value={pi.id} />
                        <Button size="sm" variant="outline" type="submit">
                          Mark Purchased
                        </Button>
                      </form>
                    {/if}
                  </TableCell>
                </TableRow>
              {/each}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  {/if}

  <!-- Data Table -->
  <Card>
    <CardHeader>
      <CardTitle>Inventory Items</CardTitle>
    </CardHeader>
    <CardContent>
      {#if selectedIds.size > 0}
        <div class="mb-4 p-4 border rounded-lg bg-muted/50 space-y-3">
          <div class="flex items-center justify-between">
            <span class="text-sm font-medium">{selectedIds.size} item{selectedIds.size !== 1 ? "s" : ""} selected</span>
            <Button variant="ghost" size="sm" onclick={() => { selectedIds = new Set(); }}>Clear</Button>
          </div>
          <form
            method="POST"
            action="?/bulkUpdate"
            use:enhance={() => {
              return async ({ result }) => {
                if (result.type === "success") {
                  selectedIds = new Set();
                  bulkStatus = "";
                  bulkCheckedOutTo = "";
                  bulkLocation = "";
                  bulkTags = "";
                  await invalidateAll();
                } else if (result.type === "failure") {
                  alert((result.data as { error?: string })?.error || "Bulk update failed.");
                }
              };
            }}
          >
            {#each [...selectedIds] as id (id)}
              <input type="hidden" name="selectedId" value={id} />
            {/each}
            <input type="hidden" name="status" value={bulkStatus === "available" ? "checked_in" : bulkStatus} />
            <div class="grid gap-3 sm:grid-cols-2">
              <div class="grid gap-1">
                <Label>Status</Label>
                <Select type="single" bind:value={bulkStatus}>
                  <SelectTrigger>
                    {bulkStatus === "" ? "— no change —" : bulkStatus === "available" ? "Available" : bulkStatus === "checked_out" ? "Checked Out" : "Retired"}
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="" label="— no change —">— no change —</SelectItem>
                    <SelectItem value="available" label="Available">Available</SelectItem>
                    <SelectItem value="checked_out" label="Checked Out">Checked Out</SelectItem>
                    <SelectItem value="retired" label="Retired">Retired</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {#if bulkStatus === "checked_out"}
                <div class="grid gap-1">
                  <Label>Checked Out To</Label>
                  <Input name="checked_out_to" bind:value={bulkCheckedOutTo} placeholder="Name or contact info" required />
                </div>
              {/if}
              <div class="grid gap-1">
                <Label>Location</Label>
                <Input name="location" bind:value={bulkLocation} placeholder="Leave empty to keep current" />
              </div>
              <div class="grid gap-1">
                <Label>Categories</Label>
                <Input name="tags" bind:value={bulkTags} placeholder="Leave empty to keep current" />
              </div>
            </div>
            <Button type="submit" class="mt-3">
              Apply to {selectedIds.size} item{selectedIds.size !== 1 ? "s" : ""}
            </Button>
          </form>
        </div>
      {/if}
      <div class="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead class="w-10">
                <input
                  type="checkbox"
                  class="h-4 w-4 cursor-pointer"
                  checked={selectedIds.size === data.items.length && data.items.length > 0}
                  onchange={(e) => {
                    if ((e.target as HTMLInputElement).checked) {
                      selectedIds = new Set(data.items.map((i: Item) => i.id));
                    } else {
                      selectedIds = new Set();
                    }
                  }}
                />
              </TableHead>
              <TableHead>Title</TableHead>
              <TableHead>Asset Tag</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Location</TableHead>
              <TableHead>Categories</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {#each data.items as item (item.id)}
              <TableRow
                class="cursor-pointer hover:bg-muted/50"
                onclick={() => openEditSheet(item)}
              >
                <TableCell onclick={(e) => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    class="h-4 w-4 cursor-pointer"
                    checked={selectedIds.has(item.id)}
                    onchange={() => {
                      if (selectedIds.has(item.id)) {
                        selectedIds = new Set([...selectedIds].filter((id) => id !== item.id));
                      } else {
                        selectedIds = new Set([...selectedIds, item.id]);
                      }
                    }}
                  />
                </TableCell>
                <TableCell class="font-medium">{item.title}</TableCell>
                <TableCell>{item.tag_label || "-"}</TableCell>
                <TableCell>
                  <Badge
                    variant={item.status === "checked_in" ? "default" : "secondary"}
                    class={item.status === "requested" ? "bg-blue-100 text-blue-800" : ""}
                  >
                    {getStatusLabel(item.status)}
                  </Badge>
                </TableCell>
                <TableCell>{item.location || "N/A"}</TableCell>
                <TableCell class="max-w-[200px] truncate">
                  {item.tags?.join(", ") || "None"}
                </TableCell>
              </TableRow>
            {/each}
          </TableBody>
        </Table>
      </div>
    </CardContent>
  </Card>

  <!-- Audit Log -->
  {#if data.auditLog && data.auditLog.length > 0}
    <Card>
      <CardHeader>
        <CardTitle>Audit Log</CardTitle>
      </CardHeader>
      <CardContent>
        <div class="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Item</TableHead>
                <TableHead>User</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Notes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {#each data.auditLog as entry (entry.id)}
                <TableRow>
                  <TableCell class="text-xs text-muted-foreground whitespace-nowrap">
                    {new Date(entry.created_at).toLocaleString()}
                  </TableCell>
                  <TableCell class="font-medium">
                    {entry.item?.title || "—"}
                  </TableCell>
                  <TableCell>
                    {entry.user?.full_name || "—"}
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary" class="text-xs">
                      {entry.action.replace("_", " ")}
                    </Badge>
                  </TableCell>
                  <TableCell class="text-sm text-muted-foreground max-w-[200px] truncate">
                    {entry.notes || "—"}
                  </TableCell>
                </TableRow>
              {/each}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  {/if}
</div>

<!-- Edit/Add Item Sheet -->
<Sheet bind:open={isSheetOpen}>
  <SheetContent class="overflow-y-auto p-6">
    <SheetHeader class="p-0">
      <SheetTitle>{editingItem ? "Edit Item" : "Add New Item"}</SheetTitle>
      <SheetDescription>
        Make changes to the inventory item here. Click save when you're done.
      </SheetDescription>
    </SheetHeader>

    <form
      method="POST"
      action="?/{editingItem ? 'update' : 'create'}"
      use:enhance={() => {
        return async ({ result }) => {
          console.log("Form result:", result);
          if (result.type === "success") {
            isSheetOpen = false;
            await invalidateAll();
          } else if (result.type === "failure") {
            console.error("Form action failed:", result.data);
            alert(`Error: ${result.data?.error || "Failed to save item"}`);
          }
        };
      }}
    >
      {#if editingItem}
        <input type="hidden" name="id" value={editingItem.id}>
      {/if}

      <div class="grid gap-4 py-4">
        <div class="grid gap-2">
          <Label for="title">Title</Label>
          <Input id="title" name="title" bind:value={title} required/>
        </div>
        <div class="grid gap-2">
          <Label for="tag_label">Asset Tag</Label>
          <Input
            id="tag_label"
            name="tag_label"
            bind:value={tag_label}
            placeholder="e.g. RPi-001 (optional)"
          />
        </div>
        <div class="grid gap-2">
          <Label for="description">Description</Label>
          <Textarea
            id="description"
            name="description"
            bind:value={description}
          />
        </div>
        <div class="grid gap-2">
          <Label for="location">Location</Label>
          <Input id="location" name="location" bind:value={location}/>
        </div>
        <div class="grid gap-2">
          <Label for="status">Status</Label>
          {#if editingItem?.status === "requested"}
            <div class="flex items-center gap-2 py-1">
              <Badge class="bg-blue-100 text-blue-800">Requested</Badge>
              <span class="text-sm text-muted-foreground">
                by {editingItem.requested_by ?? "Unknown"}
              </span>
            </div>
            <p class="text-xs text-muted-foreground">
              Cannot edit while a checkout request is pending.
            </p>
          {:else}
            <input
              type="hidden"
              name="status"
              value={selectValue === "available" ? "checked_in" : selectValue}
            >
            <Select type="single" bind:value={selectValue}>
              <SelectTrigger>
                {selectValue === "available"
                  ? "Available"
                  : selectValue === "checked_out"
                    ? "Checked Out"
                    : selectValue === "procurement"
                      ? "Procurement"
                      : selectValue === "purchased"
                        ? "Purchased"
                        : "Retired"}
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="available" label="Available">Available</SelectItem>
                <SelectItem value="checked_out" label="Checked Out">Checked Out</SelectItem>
                <SelectItem value="retired" label="Retired">Retired</SelectItem>
                <SelectItem value="procurement" label="Procurement">Procurement</SelectItem>
                <SelectItem value="purchased" label="Purchased">Purchased</SelectItem>
              </SelectContent>
            </Select>
          {/if}
        </div>
        {#if selectValue === "checked_out" && editingItem?.status !== "requested"}
          <div class="grid gap-2">
            <Label for="checked_out_to">Checked Out To</Label>
            <Input
              id="checked_out_to"
              name="checked_out_to"
              bind:value={checked_out_to}
              required
              placeholder="Name or Contact Info"
            />
          </div>
        {/if}
        <div class="grid gap-2">
          <Label for="tags">Categories</Label>
          <Input
            id="tags"
            name="tags"
            bind:value={tags}
            placeholder="Comma separated, e.g. electronics, microcontroller"
          />
        </div>
      </div>

      <SheetFooter>
        <Button type="submit" disabled={editingItem?.status === "requested"}>
          Save changes
        </Button>
      </SheetFooter>
    </form>
  </SheetContent>
</Sheet>

