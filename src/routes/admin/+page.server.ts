import { fail, redirect } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({
  locals: { supabase },
}) => {
  // Fetch all items
  const { data: items, error: itemsError } = await supabase
    .from("items")
    .select("*")
    .order("created_at", { ascending: false });

  if (itemsError) {
    console.error("Error fetching items:", itemsError);
  }

  // Fetch all checkout_requests with their items
  const { data: cartRequestsRaw, error: cartRequestsError } = await supabase
    .from("checkout_requests")
    .select(
      "id, user_id, status, admin_note, reviewed_at, created_at, checkout_request_items(id, status, item:items(id, title))"
    )
    .order("created_at", { ascending: false });

  if (cartRequestsError) {
    console.error("Error fetching cart requests:", cartRequestsError);
  }

  // Fetch profiles for cart request users
  const cartUserIds = [
    ...new Set((cartRequestsRaw || []).map((r) => r.user_id)),
  ];
  let cartProfilesById: Record<string, { full_name: string | null }> = {};
  if (cartUserIds.length > 0) {
    const { data: cartProfiles } = await supabase
      .from("profiles")
      .select("id, full_name")
      .in("id", cartUserIds);
    if (cartProfiles) {
      cartProfilesById = Object.fromEntries(
        cartProfiles.map((p) => [p.id, { full_name: p.full_name }])
      );
    }
  }

  const cartRequests = (cartRequestsRaw || []).map((req) => ({
    ...req,
    user: cartProfilesById[req.user_id] ?? {},
  }));

  // Calculate statistics
  const totalItems = items?.length || 0;
  const checkedOut =
    items?.filter((item) => item.status === "checked_out").length || 0;
  const retired =
    items?.filter((item) => item.status === "retired").length || 0;
  const pendingRequests = (cartRequestsRaw || []).filter(
    (req) => req.status === "pending"
  ).length;

  const { count: activeUsers } = await supabase
    .from("profiles")
    .select("*", { count: "exact", head: true })
    .neq("role", "admin");

  // Fetch 50 most recent transactions with item title
  const { data: transactionLogs } = await supabase
    .from("transactions")
    .select("*, item:items(title)")
    .order("created_at", { ascending: false })
    .limit(50);

  // Resolve user names for transactions
  const txUserIds = [
    ...new Set(
      (transactionLogs || []).map((t) => t.user_id).filter(Boolean)
    ),
  ] as string[];
  let txProfilesById: Record<string, { full_name: string | null }> = {};
  if (txUserIds.length > 0) {
    const { data: txProfiles } = await supabase
      .from("profiles")
      .select("id, full_name")
      .in("id", txUserIds);
    if (txProfiles) {
      txProfilesById = Object.fromEntries(
        txProfiles.map((p) => [p.id, { full_name: p.full_name }])
      );
    }
  }

  const auditLog = (transactionLogs || []).map((t) => ({
    ...t,
    user: txProfilesById[t.user_id] ?? {},
  }));

  return {
    items: items || [],
    cartRequests,
    auditLog,
    stats: {
      totalItems,
      checkedOut,
      retired,
      pendingRequests,
      activeUsers: activeUsers ?? 0,
    },
  };
};

export const actions = {
  create: async ({ request, locals: { supabase, safeGetSession } }) => {
    const { session } = await safeGetSession();
    if (!session) {
      return fail(401, { error: "Unauthorized" });
    }

    const { data: creatorProfile } = await supabase.from("profiles").select("role").eq("id", session.user.id).single();
    if (!creatorProfile || !["admin", "instructor"].includes(creatorProfile.role)) {
      return fail(403, { error: "Forbidden" });
    }

    const formData = await request.formData();
    const title = formData.get("title") as string;
    const description = formData.get("description") as string;
    const location = formData.get("location") as string;
    const status = formData.get("status") as string;
    const tag_label = formData.get("tag_label") as string;
    const checked_out_to = formData.get("checked_out_to") as string;
    const tags = (formData.get("tags") as string)
      ?.split(",")
      .map((tag) => tag.trim())
      .filter((tag) => tag.length > 0);

    const { data, error } = await supabase
      .from("items")
      .insert({
        title,
        description,
        location,
        status,
        tag_label,
        checked_out_to: status === "checked_out" ? checked_out_to : null,
        tags,
      })
      .select()
      .single();

    if (error) {
      console.error("Supabase create error:", error);
      return fail(500, {
        error: error.message,
      });
    }

    // Log to audit trail (non-fatal)
    if (session) {
      const { error: txError } = await supabase.from("transactions").insert({
        item_id: data.id,
        user_id: session.user.id,
        action: "note_added",
        notes: `Item created: ${title}`,
      });
      if (txError) console.error("Failed to log transaction:", txError);
    }

    return {
      success: true,
      item: data,
    };
  },

  update: async (event) => {
    const { session } = await event.locals.safeGetSession();
    if (!session) {
      throw redirect(303, "/login");
    }

    const { data: updaterProfile } = await event.locals.supabase.from("profiles").select("role").eq("id", session.user.id).single();
    if (!updaterProfile || !["admin", "instructor"].includes(updaterProfile.role)) {
      return fail(403, { error: "Forbidden" });
    }

    const formData = await event.request.formData();
    const id = formData.get("id") as string;
    const title = formData.get("title") as string;
    const description = formData.get("description") as string;
    const location = formData.get("location") as string;
    const status = formData.get("status") as string;
    const tag_label = formData.get("tag_label") as string;
    const checked_out_to = formData.get("checked_out_to") as string;
    const tags = (formData.get("tags") as string)
      ?.split(",")
      .map((tag) => tag.trim())
      .filter((tag) => tag.length > 0);

    const { data, error } = await event.locals.supabase
      .from("items")
      .update({
        title,
        description,
        location,
        status,
        tag_label,
        checked_out_to: status === "checked_out" ? checked_out_to : null,
        tags,
      })
      .eq("id", id)
      .select()
      .single();

    if (error) {
      console.error("Error updating item:", error);
      return fail(500, { error: error.message || "Failed to update item" });
    }

    // Log to audit trail (non-fatal)
    if (session) {
      const { error: txError } = await event.locals.supabase.from("transactions").insert({
        item_id: id,
        user_id: session.user.id,
        action: "note_added",
        notes: `Item updated: ${title}`,
      });
      if (txError) console.error("Failed to log transaction:", txError);
    }

    return { success: true };
  },

  delete: async ({ request, locals: { supabase, safeGetSession } }) => {
    const { session } = await safeGetSession();
    if (!session) {
      return fail(401, { error: "Unauthorized" });
    }

    const { data: deleterProfile } = await supabase.from("profiles").select("role").eq("id", session.user.id).single();
    if (!deleterProfile || !["admin", "instructor"].includes(deleterProfile.role)) {
      return fail(403, { error: "Forbidden" });
    }

    const formData = await request.formData();
    const id = formData.get("id") as string;

    const { error } = await supabase.from("items").delete().eq("id", id);

    if (error) {
      console.error("Error deleting item:", error);
      return fail(500, { error: error.message || "Failed to delete item" });
    }

    // Log to audit trail (non-fatal)
    if (session) {
      const { error: txError } = await supabase.from("transactions").insert({
        item_id: id,
        user_id: session.user.id,
        action: "note_added",
        notes: `Item deleted (id: ${id})`,
      });
      if (txError) console.error("Failed to log transaction:", txError);
    }

    return { success: true };
  },

  reviewCart: async ({ request, locals: { supabase, safeGetSession } }) => {
    const { session } = await safeGetSession();
    if (!session) {
      return fail(401, { message: "Unauthorized" });
    }

    const { data: reviewerProfile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", session.user.id)
      .single();
    if (!reviewerProfile || !["admin", "instructor"].includes(reviewerProfile.role)) {
      return fail(403, { error: "Forbidden" });
    }

    const formData = await request.formData();
    const cartRequestId = formData.get("cartRequestId") as string;
    const adminNote = (formData.get("adminNote") as string)?.trim() || null;
    // decisions format: "checkoutItemId:approved" or "checkoutItemId:refused"
    const decisions = formData.getAll("decision") as string[];

    if (!cartRequestId) {
      return fail(400, { message: "Cart request ID is required." });
    }

    // Fetch cart items to process
    const { data: cartItems, error: fetchError } = await supabase
      .from("checkout_request_items")
      .select("id, item_id")
      .eq("checkout_request_id", cartRequestId);

    if (fetchError || !cartItems) {
      return fail(404, { message: "Cart request not found." });
    }

    // Parse decisions map: checkoutItemId → "approved" | "refused"
    const decisionMap = new Map<string, string>();
    for (const d of decisions) {
      const [id, status] = d.split(":");
      if (id && (status === "approved" || status === "refused")) {
        decisionMap.set(id, status);
      }
    }

    // Get the requesting user's name for checked_out_to
    const { data: cartRequest } = await supabase
      .from("checkout_requests")
      .select("user_id")
      .eq("id", cartRequestId)
      .single();

    let checkedOutToName = "Student";
    if (cartRequest?.user_id) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", cartRequest.user_id)
        .single();
      checkedOutToName = profile?.full_name || "Student";
    }

    // Process each item decision
    for (const cartItem of cartItems) {
      const decision = decisionMap.get(cartItem.id) ?? "approved";

      await supabase
        .from("checkout_request_items")
        .update({ status: decision })
        .eq("id", cartItem.id);

      if (!cartItem.item_id) continue;

      if (decision === "approved") {
        await supabase
          .from("items")
          .update({ status: "checked_out", checked_out_to: checkedOutToName })
          .eq("id", cartItem.item_id);

        const { error: txError } = await supabase.from("transactions").insert({
          item_id: cartItem.item_id,
          user_id: session.user.id,
          action: "check_out",
          notes: `Approved for ${checkedOutToName}`,
        });
        if (txError) console.error("Failed to log transaction:", txError);
      } else {
        await supabase
          .from("items")
          .update({ status: "checked_in" })
          .eq("id", cartItem.item_id);

        const { error: txError } = await supabase.from("transactions").insert({
          item_id: cartItem.item_id,
          user_id: session.user.id,
          action: "check_in",
          notes: "Refused in cart review",
        });
        if (txError) console.error("Failed to log transaction:", txError);
      }
    }

    // Mark checkout_request as reviewed
    const { error: reviewError } = await supabase
      .from("checkout_requests")
      .update({
        status: "reviewed",
        admin_note: adminNote,
        reviewed_by: session.user.id,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", cartRequestId);

    if (reviewError) {
      return fail(500, { message: "Failed to mark request as reviewed." });
    }

    return { success: true };
  },
} satisfies Actions;
