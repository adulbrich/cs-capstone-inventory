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
  };

  type Request = {
    id: string;
    user_id: string;
    item_id: string;
    status: string;
    created_at: string;
    item: Item;
    user: {
      full_name?: string;
      email?: string;
    };
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

  type PageData = {
    items: Item[];
    requests: Request[];
    auditLog: Transaction[];
    stats: {
      totalItems: number;
      checkedOut: number;
      retired: number;
      pendingRequests: number;
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
      case "checked_in":
        return "Available";
      case "checked_out":
        return "Checked Out";
      case "retired":
        return "Retired";
      default:
        return status;
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
  <div class="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
    <Card>
      <CardHeader
        class="flex flex-row items-center justify-between space-y-0 pb-2"
      >
        <CardTitle class="text-sm font-medium">Total Items</CardTitle>
        <Package class="h-4 w-4 text-muted-foreground"/>
      </CardHeader>
      <CardContent>
        <div class="text-2xl font-bold">{data?.stats?.totalItems || 0}</div>
        <p class="text-xs text-muted-foreground">Across all categories</p>
      </CardContent>
    </Card>
    <Card>
      <CardHeader
        class="flex flex-row items-center justify-between space-y-0 pb-2"
      >
        <CardTitle class="text-sm font-medium">Checked Out</CardTitle>
        <CheckCircle2 class="h-4 w-4 text-muted-foreground"/>
      </CardHeader>
      <CardContent>
        <div class="text-2xl font-bold">{data?.stats?.checkedOut || 0}</div>
        <p class="text-xs text-muted-foreground">Active loans</p>
      </CardContent>
    </Card>
    <Card>
      <CardHeader
        class="flex flex-row items-center justify-between space-y-0 pb-2"
      >
        <CardTitle class="text-sm font-medium">Retired Items</CardTitle>
        <AlertCircle class="h-4 w-4 text-muted-foreground"/>
      </CardHeader>
      <CardContent>
        <div class="text-2xl font-bold">{data?.stats?.retired || 0}</div>
        <p class="text-xs text-muted-foreground">Out of circulation</p>
      </CardContent>
    </Card>
    <Card>
      <CardHeader
        class="flex flex-row items-center justify-between space-y-0 pb-2"
      >
        <CardTitle class="text-sm font-medium">Active Users</CardTitle>
        <Users class="h-4 w-4 text-muted-foreground"/>
      </CardHeader>
      <CardContent>
        <div class="text-2xl font-bold">
          {data?.stats?.activeUsers || "N/A"}
        </div>
        <p class="text-xs text-muted-foreground">Students & Instructors</p>
      </CardContent>
    </Card>
  </div>

  <!-- Requests Table -->
  {#if data?.requests && data.requests.length > 0}
    <Card>
      <CardHeader>
        <CardTitle>Item Requests</CardTitle>
      </CardHeader>
      <CardContent>
        <div class="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Item</TableHead>
                <TableHead>User</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {#each data.requests as request (request.id)}
                <TableRow>
                  <TableCell class="font-medium"
                    >{request.item?.title || "Unknown Item"}</TableCell
                  >
                  <TableCell>
                    <div class="flex flex-col">
                      <span>{request.user?.full_name || "Unknown User"}</span>
                      <span class="text-xs text-muted-foreground"
                        >{request.user?.email || ""}</span
                      >
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={request.status === "pending"
                        ? "outline"
                        : "secondary"}
                      class={request.status === "pending"
                        ? "bg-yellow-100 text-yellow-800 border-yellow-200"
                        : request.status === "approved"
                          ? "bg-green-100 text-green-800"
                          : request.status === "refused"
                            ? "bg-red-100 text-red-800"
                            : ""}
                    >
                      {request.status}
                    </Badge>
                  </TableCell>
                  <TableCell
                    >{new Date(
                      request.created_at,
                    ).toLocaleDateString()}</TableCell
                  >
                  <TableCell>
                    {#if request.status === "pending"}
                      <div class="flex gap-2">
                        <form
                          action="?/approveRequest"
                          method="POST"
                          use:enhance
                        >
                          <input
                            type="hidden"
                            name="requestId"
                            value={request.id}
                          />
                          <Button size="sm" variant="default" type="submit"
                            >Approve</Button
                          >
                        </form>
                        <form
                          action="?/refuseRequest"
                          method="POST"
                          use:enhance
                        >
                          <input
                            type="hidden"
                            name="requestId"
                            value={request.id}
                          />
                          <Button size="sm" variant="destructive" type="submit"
                            >Refuse</Button
                          >
                        </form>
                      </div>
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
      <div class="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Title</TableHead>
              <TableHead>Tag Label</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Location</TableHead>
              <TableHead>Tags</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {#each data.items as item (item.id)}
              <TableRow
                class="cursor-pointer hover:bg-muted/50"
                onclick={() => openEditSheet(item)}
              >
                <TableCell class="font-medium">{item.title}</TableCell>
                <TableCell>{item.tag_label || "-"}</TableCell>
                <TableCell>
                  <Badge
                    variant={item.status === "checked_in"
                      ? "default"
                      : "secondary"}
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
          <Label for="tag_label">Tag Label</Label>
          <Input
            id="tag_label"
            name="tag_label"
            bind:value={tag_label}
            placeholder="Optional"
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
                  : "Retired"}
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="available" label="Available">
                Available
              </SelectItem>
              <SelectItem value="checked_out" label="Checked Out">
                Checked Out
              </SelectItem>
              <SelectItem value="retired" label="Retired">Retired</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {#if selectValue === "checked_out"}
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
          <Label for="tags">Tags</Label>
          <Input
            id="tags"
            name="tags"
            bind:value={tags}
            placeholder="Comma separated"
          />
        </div>
      </div>

      <SheetFooter>
        <Button type="submit">Save changes</Button>
      </SheetFooter>
    </form>
  </SheetContent>
</Sheet>
