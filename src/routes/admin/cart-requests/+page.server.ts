import { fail } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ locals: { supabase } }) => {
  // Role guard handled by src/routes/admin/+layout.server.ts

  const { data: cartRequestsRaw, error } = await supabase
    .from("checkout_requests")
    .select(
      "id, user_id, status, admin_note, reviewed_at, created_at, checkout_request_items(id, status, item:items(id, title))"
    )
    .order("created_at", { ascending: false });

  if (error) console.error("Error fetching cart requests:", error);

  const userIds = [
    ...new Set((cartRequestsRaw || []).map((r) => r.user_id)),
  ];
  let profilesById: Record<string, { full_name: string | null }> = {};
  if (userIds.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, full_name")
      .in("id", userIds);
    if (profiles) {
      profilesById = Object.fromEntries(
        profiles.map((p) => [p.id, { full_name: p.full_name }])
      );
    }
  }

  const cartRequests = (cartRequestsRaw || []).map((req) => ({
    ...req,
    user: profilesById[req.user_id] ?? {},
  }));

  return { cartRequests };
};

export const actions: Actions = {
  reviewCart: async ({ request, locals: { supabase, safeGetSession } }) => {
    const { session } = await safeGetSession();
    if (!session) return fail(401, { message: "Unauthorized" });

    const { data: reviewerProfile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", session.user.id)
      .single();
    if (!reviewerProfile || !["admin", "instructor"].includes(reviewerProfile.role)) {
      return fail(403, { message: "Forbidden" });
    }

    const formData = await request.formData();
    const cartRequestId = formData.get("cartRequestId") as string;
    const adminNote = (formData.get("adminNote") as string)?.trim() || null;
    const decisions = formData.getAll("decision") as string[];

    if (!cartRequestId) return fail(400, { message: "Cart request ID is required." });

    const { data: cartItems, error: fetchError } = await supabase
      .from("checkout_request_items")
      .select("id, item_id")
      .eq("checkout_request_id", cartRequestId);

    if (fetchError || !cartItems) return fail(404, { message: "Cart request not found." });

    const decisionMap = new Map<string, string>();
    for (const d of decisions) {
      const [id, status] = d.split(":");
      if (id && (status === "approved" || status === "refused")) {
        decisionMap.set(id, status);
      }
    }

    for (const cartItem of cartItems) {
      const decision = decisionMap.get(cartItem.id) ?? "approved";

      await supabase
        .from("checkout_request_items")
        .update({ status: decision })
        .eq("id", cartItem.id);

      if (!cartItem.item_id) continue;

      if (decision === "approved") {
        // Approved items stay in "requested" status — items are held but not yet checked out.
        // They transition to "checked_out" only when admin clicks "Mark Picked Up".
        await supabase.from("transactions").insert({
          item_id: cartItem.item_id,
          user_id: session.user.id,
          action: "note_added",
          notes: "Cart request approved — awaiting pickup",
        });
      } else {
        // Refused items are immediately returned to available inventory.
        await supabase
          .from("items")
          .update({ status: "checked_in" })
          .eq("id", cartItem.item_id);
        await supabase.from("transactions").insert({
          item_id: cartItem.item_id,
          user_id: session.user.id,
          action: "check_in",
          notes: "Refused in cart review",
        });
      }
    }

    const { error: reviewError } = await supabase
      .from("checkout_requests")
      .update({
        status: "reviewed",
        admin_note: adminNote,
        reviewed_by: session.user.id,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", cartRequestId);

    if (reviewError) return fail(500, { message: "Failed to mark request as reviewed." });

    return { success: true };
  },

  markPickedUp: async ({ request, locals: { supabase, safeGetSession } }) => {
    const { session } = await safeGetSession();
    if (!session) return fail(401, { message: "Unauthorized" });

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", session.user.id)
      .single();
    if (!profile || !["admin", "instructor"].includes(profile.role)) {
      return fail(403, { message: "Forbidden" });
    }

    const formData = await request.formData();
    const cartRequestId = formData.get("cartRequestId") as string;
    if (!cartRequestId) return fail(400, { message: "Cart request ID is required." });

    const { data: cartRequest } = await supabase
      .from("checkout_requests")
      .select("status, user_id")
      .eq("id", cartRequestId)
      .single();
    if (!cartRequest || cartRequest.status !== "reviewed") {
      return fail(400, { message: "Only reviewed requests can be marked as picked up." });
    }

    // Resolve the requester's display name — fall back to email if no full_name set.
    let checkedOutToName = "Student";
    if (cartRequest.user_id) {
      const { data: requesterProfile } = await supabase
        .from("profiles")
        .select("full_name, email")
        .eq("id", cartRequest.user_id)
        .single();
      checkedOutToName =
        requesterProfile?.full_name || requesterProfile?.email || "Student";
    }

    const { data: cartItems } = await supabase
      .from("checkout_request_items")
      .select("id, item_id, status")
      .eq("checkout_request_id", cartRequestId);

    for (const ci of cartItems || []) {
      if (ci.status !== "approved" || !ci.item_id) continue;
      await supabase
        .from("items")
        .update({ status: "checked_out", checked_out_to: checkedOutToName })
        .eq("id", ci.item_id);
      await supabase.from("transactions").insert({
        item_id: ci.item_id,
        user_id: session.user.id,
        action: "check_out",
        notes: `Picked up by ${checkedOutToName}`,
      });
    }

    const { error } = await supabase
      .from("checkout_requests")
      .update({ status: "picked_up" })
      .eq("id", cartRequestId);
    if (error) return fail(500, { message: "Failed to mark as picked up." });

    return { success: true };
  },

  forceCartStatus: async ({ request, locals: { supabase, safeGetSession } }) => {
    const { session } = await safeGetSession();
    if (!session) return fail(401, { message: "Unauthorized" });

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", session.user.id)
      .single();
    if (!profile || !["admin", "instructor"].includes(profile.role)) {
      return fail(403, { message: "Forbidden" });
    }

    const formData = await request.formData();
    const cartRequestId = formData.get("cartRequestId") as string;
    const newStatus = formData.get("newStatus") as string;
    const validStatuses = ["pending", "reviewed", "picked_up", "returned", "cancelled"];
    if (!cartRequestId || !validStatuses.includes(newStatus)) {
      return fail(400, { message: "Invalid parameters." });
    }

    const { data: cartRequest } = await supabase
      .from("checkout_requests")
      .select("user_id")
      .eq("id", cartRequestId)
      .single();
    if (!cartRequest) return fail(404, { message: "Cart request not found." });

    const { data: cartItems } = await supabase
      .from("checkout_request_items")
      .select("id, item_id, status")
      .eq("checkout_request_id", cartRequestId);

    const allItemIds = (cartItems || []).map((ci) => ci.item_id).filter(Boolean) as string[];
    const approvedItemIds = (cartItems || [])
      .filter((ci) => ci.status === "approved")
      .map((ci) => ci.item_id)
      .filter(Boolean) as string[];
    const refusedItemIds = (cartItems || [])
      .filter((ci) => ci.status === "refused")
      .map((ci) => ci.item_id)
      .filter(Boolean) as string[];

    if (newStatus === "pending" || newStatus === "cancelled") {
      if (allItemIds.length > 0) {
        await supabase.from("items").update({ status: "checked_in", checked_out_to: null }).in("id", allItemIds);
      }
    } else if (newStatus === "reviewed") {
      if (approvedItemIds.length > 0) {
        await supabase.from("items").update({ status: "requested" }).in("id", approvedItemIds);
      }
      if (refusedItemIds.length > 0) {
        await supabase.from("items").update({ status: "checked_in" }).in("id", refusedItemIds);
      }
    } else if (newStatus === "picked_up") {
      let checkedOutToName = "Student";
      if (cartRequest.user_id) {
        const { data: requesterProfile } = await supabase
          .from("profiles")
          .select("full_name, email")
          .eq("id", cartRequest.user_id)
          .single();
        checkedOutToName = requesterProfile?.full_name || requesterProfile?.email || "Student";
      }
      if (approvedItemIds.length > 0) {
        await supabase.from("items").update({ status: "checked_out", checked_out_to: checkedOutToName }).in("id", approvedItemIds);
      }
    } else if (newStatus === "returned") {
      if (approvedItemIds.length > 0) {
        await supabase.from("items").update({ status: "checked_in", checked_out_to: null }).in("id", approvedItemIds);
      }
    }

    const { error } = await supabase
      .from("checkout_requests")
      .update({ status: newStatus })
      .eq("id", cartRequestId);
    if (error) return fail(500, { message: "Failed to update request status." });

    await supabase.from("transactions").insert({
      user_id: session.user.id,
      action: "note_added",
      notes: `Admin forced cart request status to "${newStatus}"`,
    });

    return { success: true };
  },

  returnCart: async ({ request, locals: { supabase, safeGetSession } }) => {
    const { session } = await safeGetSession();
    if (!session) return fail(401, { message: "Unauthorized" });

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", session.user.id)
      .single();
    if (!profile || !["admin", "instructor"].includes(profile.role)) {
      return fail(403, { message: "Forbidden" });
    }

    const formData = await request.formData();
    const cartRequestId = formData.get("cartRequestId") as string;
    if (!cartRequestId) return fail(400, { message: "Cart request ID is required." });

    const { data: cartRequest } = await supabase
      .from("checkout_requests")
      .select("status")
      .eq("id", cartRequestId)
      .single();
    if (!cartRequest || cartRequest.status !== "picked_up") {
      return fail(400, { message: "Only picked up requests can be marked as returned." });
    }

    const { data: cartItems } = await supabase
      .from("checkout_request_items")
      .select("id, item_id, status")
      .eq("checkout_request_id", cartRequestId);

    for (const ci of cartItems || []) {
      if (ci.status !== "approved" || !ci.item_id) continue;
      await supabase
        .from("items")
        .update({ status: "checked_in", checked_out_to: null })
        .eq("id", ci.item_id);
      await supabase.from("transactions").insert({
        item_id: ci.item_id,
        user_id: session.user.id,
        action: "check_in",
        notes: `Returned — cart request ${cartRequestId}`,
      });
    }

    const { error } = await supabase
      .from("checkout_requests")
      .update({ status: "returned" })
      .eq("id", cartRequestId);
    if (error) return fail(500, { message: "Failed to mark as returned." });

    return { success: true };
  },
};
