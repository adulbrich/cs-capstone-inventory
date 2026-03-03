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

  // Fetch all requests (without joins to avoid missing FK relationship errors)
  const { data: requests, error: requestsError } = await supabase
    .from("requests")
    .select("*")
    .order("created_at", { ascending: false });

  if (requestsError) {
    console.error("Error fetching requests:", requestsError);
  }

  // Calculate statistics
  const totalItems = items?.length || 0;
  const checkedOut =
    items?.filter((item) => item.status === "checked_out").length || 0;
  const retired =
    items?.filter((item) => item.status === "retired").length || 0;
  const pendingRequests =
    requests?.filter((req) => req.status === "pending").length || 0;

  const { count: activeUsers } = await supabase
    .from("profiles")
    .select("*", { count: "exact", head: true });

  // Fetch profiles for request users (second query to avoid FK join issues)
  const requestUserIds = [...new Set((requests || []).map((r) => r.user_id))];
  let profilesById: Record<string, { full_name: string | null }> = {};
  if (requestUserIds.length > 0) {
    const { data: requestProfiles } = await supabase
      .from("profiles")
      .select("id, full_name")
      .in("id", requestUserIds);
    if (requestProfiles) {
      profilesById = Object.fromEntries(
        requestProfiles.map((p) => [p.id, { full_name: p.full_name }])
      );
    }
  }

  // Merge user and item data into requests
  const requestsWithData = (requests || []).map((req) => ({
    ...req,
    user: profilesById[req.user_id] ?? {},
    item: (items || []).find((item) => item.id === req.item_id) ?? null,
  }));

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
    requests: requestsWithData,
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

    // Log to audit trail (non-fatal) — item_id will become null after deletion (FK set null)
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

  approveRequest: async ({ request, locals: { supabase, safeGetSession } }) => {
    const { session } = await safeGetSession();
    if (!session) {
      return fail(401, { message: "Unauthorized" });
    }

    const { data: approverProfile } = await supabase.from("profiles").select("role").eq("id", session.user.id).single();
    if (!approverProfile || !["admin", "instructor"].includes(approverProfile.role)) {
      return fail(403, { error: "Forbidden" });
    }

    const formData = await request.formData();
    const requestId = formData.get("requestId") as string;

    // Get request details
    const { data: reqData, error: reqError } = await supabase
      .from("requests")
      .select("*, user:profiles(*)")
      .eq("id", requestId)
      .single();

    if (reqError || !reqData) {
      return fail(404, { message: "Request not found" });
    }

    // Update request status
    const { error: updateReqError } = await supabase
      .from("requests")
      .update({ status: "approved" })
      .eq("id", requestId);

    if (updateReqError) {
      return fail(500, { message: "Failed to approve request" });
    }

    // Update item status to checked_out
    const { error: updateItemError } = await supabase
      .from("items")
      .update({
        status: "checked_out",
        checked_out_to:
          reqData.user.full_name || reqData.user.email || "Student",
      })
      .eq("id", reqData.item_id);

    if (updateItemError) {
      console.error("Failed to update item status:", updateItemError);
      return fail(500, { message: "Failed to update item status" });
    }

    // Log to audit trail (non-fatal)
    const { error: txError } = await supabase.from("transactions").insert({
      item_id: reqData.item_id,
      user_id: session.user.id,
      action: "check_out",
      notes: `Approved for ${reqData.user?.full_name || "student"}`,
    });
    if (txError) console.error("Failed to log transaction:", txError);

    return { success: true };
  },

  refuseRequest: async ({ request, locals: { supabase, safeGetSession } }) => {
    const { session } = await safeGetSession();
    if (!session) {
      return fail(401, { message: "Unauthorized" });
    }

    const { data: refuserProfile } = await supabase.from("profiles").select("role").eq("id", session.user.id).single();
    if (!refuserProfile || !["admin", "instructor"].includes(refuserProfile.role)) {
      return fail(403, { error: "Forbidden" });
    }

    const formData = await request.formData();
    const requestId = formData.get("requestId") as string;

    // Get request details
    const { data: reqData, error: reqError } = await supabase
      .from("requests")
      .select("item_id")
      .eq("id", requestId)
      .single();

    if (reqError || !reqData) {
      return fail(404, { message: "Request not found" });
    }

    // Update request status
    const { error: updateReqError } = await supabase
      .from("requests")
      .update({ status: "refused" })
      .eq("id", requestId);

    if (updateReqError) {
      return fail(500, { message: "Failed to refuse request" });
    }

    // Update item status back to checked_in
    const { error: updateItemError } = await supabase
      .from("items")
      .update({ status: "checked_in" })
      .eq("id", reqData.item_id);

    if (updateItemError) {
      console.error("Failed to revert item status:", updateItemError);
      return fail(500, { message: "Failed to revert item status" });
    }

    // Log to audit trail (non-fatal)
    const { error: txError } = await supabase.from("transactions").insert({
      item_id: reqData.item_id,
      user_id: session.user.id,
      action: "check_in",
      notes: "Request refused by admin",
    });
    if (txError) console.error("Failed to log transaction:", txError);

    return { success: true };
  },
} satisfies Actions;
