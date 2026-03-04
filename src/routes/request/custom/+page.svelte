<script lang="ts">
  import { enhance } from "$app/forms";
  import { Button } from "$lib/components/ui/button";
  import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
  } from "$lib/components/ui/card";
  import { Input } from "$lib/components/ui/input";
  import { Label } from "$lib/components/ui/label";
  import { Textarea } from "$lib/components/ui/textarea";
  import { Plus, Trash2 } from "@lucide/svelte";

  type HardwareItem = { name: string; quantity: number; unit_price: string };

  let items = $state<HardwareItem[]>([{ name: "", quantity: 1, unit_price: "" }]);
  let isSubmitting = $state(false);

  function addItem() {
    items = [...items, { name: "", quantity: 1, unit_price: "" }];
  }

  function removeItem(index: number) {
    items = items.filter((_, i) => i !== index);
  }
</script>

<div class="max-w-2xl mx-auto space-y-6">
  <div>
    <h1 class="text-3xl font-bold tracking-tight">Custom Hardware Request</h1>
    <p class="text-muted-foreground">
      Request hardware that isn't available in the inventory.
    </p>
  </div>

  <form
    method="POST"
    action="?/submit"
    use:enhance={() => {
      isSubmitting = true;
      return async ({ result, update }) => {
        isSubmitting = false;
        await update();
      };
    }}
    class="space-y-6"
  >
    <Card>
      <CardHeader>
        <CardTitle>Why do you need this hardware?</CardTitle>
        <CardDescription>
          Explain your project need and how this hardware will be used.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Textarea
          name="reason"
          placeholder="Describe your need..."
          rows={4}
          required
        />
      </CardContent>
    </Card>

    <Card>
      <CardHeader>
        <CardTitle>What alternatives did you consider?</CardTitle>
        <CardDescription>
          List alternatives you evaluated before making this request.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Textarea
          name="alternatives"
          placeholder="List alternatives..."
          rows={3}
          required
        />
      </CardContent>
    </Card>

    <Card>
      <CardHeader>
        <CardTitle>Hardware Items Needed</CardTitle>
        <CardDescription>
          List each item with quantity and estimated unit price.
        </CardDescription>
      </CardHeader>
      <CardContent class="space-y-4">
        {#each items as item, i (i)}
          <div class="flex gap-2 items-end">
            <div class="flex-1 grid gap-1">
              <Label for="itemName-{i}">Item Name</Label>
              <Input
                id="itemName-{i}"
                name="itemName"
                bind:value={item.name}
                placeholder="e.g. Raspberry Pi 5"
                required
              />
            </div>
            <div class="w-24 grid gap-1">
              <Label for="itemQty-{i}">Qty</Label>
              <Input
                id="itemQty-{i}"
                name="itemQuantity"
                type="number"
                min="1"
                bind:value={item.quantity}
                required
              />
            </div>
            <div class="w-32 grid gap-1">
              <Label for="itemPrice-{i}">Unit Price ($)</Label>
              <Input
                id="itemPrice-{i}"
                name="itemPrice"
                type="number"
                min="0"
                step="0.01"
                bind:value={item.unit_price}
                placeholder="Optional"
              />
            </div>
            {#if items.length > 1}
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onclick={() => removeItem(i)}
                class="text-muted-foreground hover:text-destructive mb-0.5"
              >
                <Trash2 class="h-4 w-4" />
              </Button>
            {/if}
          </div>
        {/each}
        <Button
          type="button"
          variant="outline"
          size="sm"
          onclick={addItem}
          class="mt-2"
        >
          <Plus class="mr-2 h-4 w-4" />
          Add another item
        </Button>
      </CardContent>
    </Card>

    <div class="flex justify-end gap-4">
      <Button variant="outline" href="/">Cancel</Button>
      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting ? "Submitting..." : "Submit Request"}
      </Button>
    </div>
  </form>
</div>
