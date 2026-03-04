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

  const requests = (customRequestsRaw || []).map((req) => ({
    ...req,
    user: profilesById[req.user_id] ?? {},
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

    if (!customRequestId) {
      return fail(400, { message: "Request ID is required." });
    }

    const { error } = await supabase
      .from("custom_requests")
      .update({
        status: "reviewed",
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
};
