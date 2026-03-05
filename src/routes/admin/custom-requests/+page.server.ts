import { fail } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({
  locals: { supabase },
}) => {
  // Role guard handled by src/routes/admin/+layout.server.ts
  const { data: customRequestsRaw, error } = await supabase
    .from("custom_requests")
    .select(
      "id, user_id, status, reason, alternatives, items, admin_note, reviewed_at, created_at"
    )
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error fetching custom requests:", error);
  }

  const userIds = [
    ...new Set((customRequestsRaw || []).map((r) => r.user_id)),
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

  // Fetch procurement items linked to these custom requests
  const requestIds = (customRequestsRaw || []).map((r) => r.id);
  let procItemsByRequestId: Record<string, { id: string; title: string; status: string; purchase_url: string | null }[]> = {};
  if (requestIds.length > 0) {
    const { data: linkedItems } = await supabase
      .from("items")
      .select("id, title, status, purchase_url, custom_request_id")
      .not("custom_request_id", "is", null)
      .in("custom_request_id", requestIds);
    for (const item of linkedItems || []) {
      if (!item.custom_request_id) continue;
      if (!procItemsByRequestId[item.custom_request_id]) {
        procItemsByRequestId[item.custom_request_id] = [];
      }
      procItemsByRequestId[item.custom_request_id].push(item);
    }
  }

  const requests = (customRequestsRaw || []).map((req) => ({
    ...req,
    user: profilesById[req.user_id] ?? {},
    procItems: procItemsByRequestId[req.id] || [],
  }));

  return { requests };
};

export const actions: Actions = {
  review: async ({ request, locals: { supabase, safeGetSession } }) => {
    const { session } = await safeGetSession();
    if (!session) {
      return fail(401, { message: "Unauthorized" });
    }

    const { data: reviewerProfile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", session.user.id)
      .single();
    if (
      !reviewerProfile ||
      !["admin", "instructor"].includes(reviewerProfile.role)
    ) {
      return fail(403, { message: "Forbidden" });
    }

    const formData = await request.formData();
    const customRequestId = formData.get("customRequestId") as string;
    const adminNote =
      (formData.get("adminNote") as string)?.trim() || null;
    const decision = (formData.get("decision") as string)?.trim();

    if (!customRequestId) {
      return fail(400, { message: "Request ID is required." });
    }

    const status = decision === "approved" || decision === "refused" ? decision : "reviewed";

    const { error } = await supabase
      .from("custom_requests")
      .update({
        status,
        admin_note: adminNote,
        reviewed_by: session.user.id,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", customRequestId);

    if (error) {
      return fail(500, { message: "Failed to mark as reviewed." });
    }

    return { success: true };
  },

  addToInventory: async ({ request, locals: { supabase, safeGetSession } }) => {
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
    const itemName = (formData.get("itemName") as string)?.trim();
    const itemUrl = (formData.get("itemUrl") as string)?.trim() || null;
    const customRequestId = formData.get("customRequestId") as string;
    const quantity = Math.max(
      1,
      Math.min(parseInt((formData.get("itemQuantity") as string) || "1", 10), 100)
    );

    if (!itemName) return fail(400, { message: "Item name is required." });

    const rows = Array.from({ length: quantity }, () => ({
      title: itemName,
      status: "procurement",
      purchase_url: itemUrl,
      notes: `Added from custom request ${customRequestId}`,
      custom_request_id: customRequestId || null,
    }));

    const { error } = await supabase.from("items").insert(rows);

    if (error) {
      console.error("Failed to add items to procurement:", error);
      return fail(500, { message: "Failed to add items to procurement." });
    }

    await supabase.from("transactions").insert({
      user_id: session.user.id,
      action: "note_added",
      notes: `${quantity}x "${itemName}" added to procurement from custom request ${customRequestId}`,
    });

    return { success: true };
  },

  forceCustomStatus: async ({ request, locals: { supabase, safeGetSession } }) => {
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
    const customRequestId = formData.get("customRequestId") as string;
    const newStatus = formData.get("newStatus") as string;
    const validStatuses = ["pending", "reviewed", "approved", "refused"];
    if (!customRequestId || !validStatuses.includes(newStatus)) {
      return fail(400, { message: "Invalid parameters." });
    }

    const { error } = await supabase
      .from("custom_requests")
      .update({ status: newStatus })
      .eq("id", customRequestId);
    if (error) return fail(500, { message: "Failed to force status." });

    await supabase.from("transactions").insert({
      user_id: session.user.id,
      action: "note_added",
      notes: `Admin forced custom request status to "${newStatus}"`,
    });

    return { success: true };
  },
};
