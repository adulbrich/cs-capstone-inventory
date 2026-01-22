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

  let userRequests = [];
  if (session) {
    const { data: requests, error: requestsError } = await supabase
      .from("requests")
      .select("*, item:items(*)")
      .eq("user_id", session.user.id)
      .order("created_at", { ascending: false });

    if (requestsError) {
      console.error("Error fetching requests:", requestsError);
    } else {
      userRequests = requests;
    }
  }

  return {
    items: items || [],
    userRequests: userRequests || [],
    session,
  };
};

export const actions: Actions = {
  requestItem: async ({ request, locals: { supabase, safeGetSession } }) => {
    const { session } = await safeGetSession();
    if (!session) {
      return fail(401, { message: "You must be logged in to request items." });
    }

    const formData = await request.formData();
    const itemId = formData.get("itemId") as string;

    if (!itemId) {
      return fail(400, { message: "Item ID is required." });
    }

    // Check if item is available
    const { data: item, error: itemError } = await supabase
      .from("items")
      .select("status")
      .eq("id", itemId)
      .single();

    if (itemError || !item) {
      return fail(404, { message: "Item not found." });
    }

    if (item.status !== "checked_in") {
      return fail(400, { message: "Item is not available." });
    }

    // Start transaction to create request and update item status
    // Note: Supabase doesn't support transactions via client directly easily without RPC,
    // but we can do optimistic updates or sequential operations.
    // Ideally this should be an RPC or we rely on RLS and constraints.
    // For now, sequential operations.

    const { error: requestError } = await supabase.from("requests").insert({
      user_id: session.user.id,
      item_id: itemId,
      status: "pending",
    });

    if (requestError) {
      return fail(500, { message: "Failed to create request." });
    }

    const { error: updateError } = await supabase
      .from("items")
      .update({ status: "requested" })
      .eq("id", itemId);

    if (updateError) {
      // Rollback request if possible, or just log error.
      // In a real app, use RPC.
      console.error("Failed to update item status:", updateError);
      return fail(500, { message: "Failed to update item status." });
    }

    return { success: true };
  },

  cancelRequest: async ({ request, locals: { supabase, safeGetSession } }) => {
    const { session } = await safeGetSession();
    if (!session) {
      return fail(401, { message: "You must be logged in." });
    }

    const formData = await request.formData();
    const requestId = formData.get("requestId") as string;

    if (!requestId) {
      return fail(400, { message: "Request ID is required." });
    }

    // Get request to find item_id
    const { data: reqData, error: reqError } = await supabase
      .from("requests")
      .select("item_id, status")
      .eq("id", requestId)
      .eq("user_id", session.user.id) // Ensure ownership
      .single();

    if (reqError || !reqData) {
      return fail(404, { message: "Request not found." });
    }

    if (reqData.status !== "pending") {
      return fail(400, { message: "Can only cancel pending requests." });
    }

    // Update request status
    const { error: updateReqError } = await supabase
      .from("requests")
      .update({ status: "cancelled" })
      .eq("id", requestId);

    if (updateReqError) {
      return fail(500, { message: "Failed to cancel request." });
    }

    // Update item status back to checked_in
    const { error: updateItemError } = await supabase
      .from("items")
      .update({ status: "checked_in" })
      .eq("id", reqData.item_id);

    if (updateItemError) {
      console.error("Failed to revert item status:", updateItemError);
      return fail(500, { message: "Failed to revert item status." });
    }

    return { success: true };
  },
};
