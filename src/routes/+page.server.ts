import { fail } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({
  locals: { supabase, safeGetSession },
}) => {
  const { session } = await safeGetSession();

  const { data: items, error: itemsError } = await supabase
    .from("items")
    .select("*")
    .neq("status", "retired")
    .order("title", { ascending: true });

  if (itemsError) {
    console.error("Error fetching items:", itemsError);
  }

  let userCartRequests: Record<string, unknown>[] = [];
  let hasPendingCart = false;
  if (session) {
    const { data: cartRequests, error: cartError } = await supabase
      .from("checkout_requests")
      .select(
        "id, status, admin_note, created_at, checkout_request_items(id, status, item:items(id, title))"
      )
      .eq("user_id", session.user.id)
      .order("created_at", { ascending: false });

    if (cartError) {
      console.error("Error fetching cart requests:", cartError);
    } else {
      userCartRequests = cartRequests || [];
      hasPendingCart = (cartRequests || []).some((r) => r.status === "pending");
    }
  }

  return {
    items: items || [],
    userCartRequests,
    hasPendingCart,
    session,
  };
};

export const actions: Actions = {
  submitCart: async ({ request, locals: { supabase, safeGetSession } }) => {
    const { session } = await safeGetSession();
    if (!session) {
      return fail(401, { message: "You must be logged in to submit a request." });
    }

    const formData = await request.formData();
    const itemIds = formData.getAll("itemId") as string[];

    if (itemIds.length === 0) {
      return fail(400, { message: "Cart is empty." });
    }

    // Block duplicate pending cart
    const { data: existing } = await supabase
      .from("checkout_requests")
      .select("id")
      .eq("user_id", session.user.id)
      .eq("status", "pending")
      .limit(1)
      .maybeSingle();

    if (existing) {
      return fail(400, { message: "You already have a pending request." });
    }

    // Verify all items are still checked_in
    const { data: itemsData, error: itemsError } = await supabase
      .from("items")
      .select("id, status")
      .in("id", itemIds);

    if (itemsError || !itemsData) {
      return fail(500, { message: "Failed to verify items." });
    }

    const unavailable = itemsData.filter((i) => i.status !== "checked_in");
    if (unavailable.length > 0) {
      return fail(400, { message: "One or more items are no longer available." });
    }

    // Create checkout_request
    const { data: cartRequest, error: cartError } = await supabase
      .from("checkout_requests")
      .insert({ user_id: session.user.id, status: "pending" })
      .select("id")
      .single();

    if (cartError || !cartRequest) {
      return fail(500, { message: "Failed to create request." });
    }

    // Create checkout_request_items
    const { error: itemsInsertError } = await supabase
      .from("checkout_request_items")
      .insert(
        itemIds.map((id) => ({
          checkout_request_id: cartRequest.id,
          item_id: id,
          status: "pending",
        }))
      );

    if (itemsInsertError) {
      return fail(500, { message: "Failed to add items to request." });
    }

    // Update each item to requested
    const { error: updateError } = await supabase
      .from("items")
      .update({ status: "requested" })
      .in("id", itemIds);

    if (updateError) {
      console.error("Failed to update item statuses:", updateError);
      return fail(500, { message: "Failed to update item statuses." });
    }

    // Audit log (non-fatal)
    for (const itemId of itemIds) {
      const { error: txError } = await supabase.from("transactions").insert({
        item_id: itemId,
        user_id: session.user.id,
        action: "check_out",
        notes: "Item added to cart request",
      });
      if (txError) console.error("Failed to log transaction:", txError);
    }

    return { success: true };
  },

  cancelCart: async ({ request, locals: { supabase, safeGetSession } }) => {
    const { session } = await safeGetSession();
    if (!session) {
      return fail(401, { message: "You must be logged in." });
    }

    const formData = await request.formData();
    const cartRequestId = formData.get("cartRequestId") as string;

    if (!cartRequestId) {
      return fail(400, { message: "Request ID is required." });
    }

    // Verify ownership and pending status
    const { data: cartReq, error: cartReqError } = await supabase
      .from("checkout_requests")
      .select("id, status")
      .eq("id", cartRequestId)
      .eq("user_id", session.user.id)
      .single();

    if (cartReqError || !cartReq) {
      return fail(404, { message: "Request not found." });
    }

    if (cartReq.status !== "pending") {
      return fail(400, { message: "Can only cancel pending requests." });
    }

    // Fetch the item IDs to revert
    const { data: cartItems, error: itemsFetchError } = await supabase
      .from("checkout_request_items")
      .select("item_id")
      .eq("checkout_request_id", cartRequestId);

    if (itemsFetchError) {
      return fail(500, { message: "Failed to fetch cart items." });
    }

    // Cancel the request
    const { error: cancelError } = await supabase
      .from("checkout_requests")
      .update({ status: "cancelled" })
      .eq("id", cartRequestId);

    if (cancelError) {
      return fail(500, { message: "Failed to cancel request." });
    }

    // Revert items to checked_in
    const itemIds = (cartItems || [])
      .map((ci) => ci.item_id)
      .filter(Boolean) as string[];

    if (itemIds.length > 0) {
      const { error: revertError } = await supabase
        .from("items")
        .update({ status: "checked_in" })
        .in("id", itemIds);

      if (revertError) {
        console.error("Failed to revert item statuses:", revertError);
      }

      for (const itemId of itemIds) {
        const { error: txError } = await supabase.from("transactions").insert({
          item_id: itemId,
          user_id: session.user.id,
          action: "check_in",
          notes: "Cart request cancelled by user",
        });
        if (txError) console.error("Failed to log transaction:", txError);
      }
    }

    return { success: true };
  },
};
