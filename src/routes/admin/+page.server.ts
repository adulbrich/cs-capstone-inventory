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

  // Pending counts for summary blocks
  const { count: pendingCartCount } = await supabase
    .from("checkout_requests")
    .select("*", { count: "exact", head: true })
    .eq("status", "pending");

  const { count: pendingCustomCount } = await supabase
    .from("custom_requests")
    .select("*", { count: "exact", head: true })
    .eq("status", "pending");

  // Find who requested each item currently in "requested" status
  const requestedItemIds = (items || [])
    .filter((i) => i.status === "requested")
    .map((i) => i.id);
  let requestedByMap: Record<string, string | null> = {};
  if (requestedItemIds.length > 0) {
    const { data: pendingCartItems } = await supabase
      .from("checkout_request_items")
      .select("item_id, checkout_requests!inner(user_id, status)")
      .in("item_id", requestedItemIds)
      .eq("status", "pending");
    const itemToUserId: Record<string, string> = {};
    for (const ci of (pendingCartItems as any[]) || []) {
      if (ci.checkout_requests?.status === "pending") {
        itemToUserId[ci.item_id] = ci.checkout_requests.user_id;
      }
    }
    const requesterIds = [...new Set(Object.values(itemToUserId))];
    if (requesterIds.length > 0) {
      const { data: requesterProfiles } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", requesterIds);
      const profileNames = Object.fromEntries(
        (requesterProfiles || []).map((p) => [p.id, p.full_name])
      );
      for (const [itemId, userId] of Object.entries(itemToUserId)) {
        requestedByMap[itemId] = profileNames[userId] ?? null;
      }
    }
  }
  const enrichedItems = (items || []).map((item) => ({
    ...item,
    requested_by: requestedByMap[item.id] ?? null,
  }));

  // Calculate statistics
  const totalItems = items?.length || 0;
  const checkedOut =
    items?.filter((item) => item.status === "checked_out").length || 0;
  const retired =
    items?.filter((item) => item.status === "retired").length || 0;

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

  // Procurement pipeline: items sourced from custom requests not yet available
  const { data: procurementItems } = await supabase
    .from("items")
    .select("id, title, status, purchase_url, created_at")
    .in("status", ["procurement", "purchased"])
    .order("created_at", { ascending: false });

  return {
    items: enrichedItems,
    procurementItems: procurementItems || [],
    auditLog,
    pendingCartCount: pendingCartCount ?? 0,
    pendingCustomCount: pendingCustomCount ?? 0,
    stats: {
      totalItems,
      checkedOut,
      retired,
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

    // Block edits while a checkout request is pending for this item
    const { data: currentItem } = await event.locals.supabase
      .from("items")
      .select("status")
      .eq("id", id)
      .single();
    if (currentItem?.status === "requested") {
      return fail(400, {
        error:
          "This item has a pending checkout request and cannot be edited until the request is processed.",
      });
    }

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

  bulkUpdate: async ({ request, locals: { supabase, safeGetSession } }) => {
    const { session } = await safeGetSession();
    if (!session) return fail(401, { error: "Unauthorized" });

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", session.user.id)
      .single();
    if (!profile || !["admin", "instructor"].includes(profile.role)) {
      return fail(403, { error: "Forbidden" });
    }

    const formData = await request.formData();
    const ids = formData.getAll("selectedId") as string[];
    if (ids.length === 0) return fail(400, { error: "No items selected." });

    const rawStatus = (formData.get("status") as string)?.trim();
    const location = (formData.get("location") as string)?.trim();
    const tagsRaw = (formData.get("tags") as string)?.trim();
    const checked_out_to = (formData.get("checked_out_to") as string)?.trim();

    const status = rawStatus === "available" ? "checked_in" : rawStatus;

    const updates: Record<string, unknown> = {};
    if (status) {
      updates.status = status;
      if (status === "checked_out") {
        if (!checked_out_to) return fail(400, { error: "Checked Out To is required when status is Checked Out." });
        updates.checked_out_to = checked_out_to;
      } else {
        updates.checked_out_to = null;
      }
    }
    if (location) updates.location = location;
    if (tagsRaw) {
      updates.tags = tagsRaw.split(",").map((t) => t.trim()).filter(Boolean);
    }

    if (Object.keys(updates).length === 0) {
      return fail(400, { error: "No changes specified." });
    }

    const { error } = await supabase.from("items").update(updates).in("id", ids);
    if (error) return fail(500, { error: "Failed to update items." });

    await supabase.from("transactions").insert({
      user_id: session.user.id,
      action: "note_added",
      notes: `Bulk updated ${ids.length} item(s): ${JSON.stringify(updates)}`,
    });

    return { success: true };
  },

  markPurchased: async ({ request, locals: { supabase, safeGetSession } }) => {
    const { session } = await safeGetSession();
    if (!session) return fail(401, { error: "Unauthorized" });

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", session.user.id)
      .single();
    if (!profile || !["admin", "instructor"].includes(profile.role)) {
      return fail(403, { error: "Forbidden" });
    }

    const formData = await request.formData();
    const id = formData.get("id") as string;
    if (!id) return fail(400, { error: "Item ID is required." });

    const { error } = await supabase
      .from("items")
      .update({ status: "purchased" })
      .eq("id", id)
      .eq("status", "procurement"); // guard: only procurement items

    if (error) return fail(500, { error: "Failed to mark as purchased." });

    await supabase.from("transactions").insert({
      item_id: id,
      user_id: session.user.id,
      action: "note_added",
      notes: "Marked as purchased (not yet available)",
    });

    return { success: true };
  },

} satisfies Actions;
