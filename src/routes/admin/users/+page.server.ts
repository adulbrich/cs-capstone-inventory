import { fail, redirect } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ locals: { supabase, safeGetSession } }) => {
  const { session } = await safeGetSession();
  if (!session) throw redirect(303, "/login");

  // Only full admins can manage users (not instructors)
  const { data: self } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", session.user.id)
    .single();
  if (self?.role !== "admin") throw redirect(303, "/admin");

  const { data: users, error } = await supabase
    .from("profiles")
    .select("id, full_name, email, role, created_at")
    .order("created_at", { ascending: false });

  if (error) console.error("Error fetching users:", error);

  return { users: users || [], currentUserId: session.user.id };
};

export const actions: Actions = {
  changeRole: async ({ request, locals: { supabase, safeGetSession } }) => {
    const { session } = await safeGetSession();
    if (!session) return fail(401, { message: "Unauthorized" });

    const { data: self } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", session.user.id)
      .single();
    if (self?.role !== "admin") return fail(403, { message: "Only admins can change roles." });

    const formData = await request.formData();
    const userId = formData.get("userId") as string;
    const newRole = formData.get("role") as string;

    if (!userId || !newRole) return fail(400, { message: "Missing fields." });
    if (!["student", "instructor", "admin"].includes(newRole)) {
      return fail(400, { message: "Invalid role." });
    }
    if (userId === session.user.id) {
      return fail(400, { message: "You cannot change your own role." });
    }

    const { error } = await supabase
      .from("profiles")
      .update({ role: newRole })
      .eq("id", userId);

    if (error) return fail(500, { message: "Failed to update role." });

    return { success: true };
  },
};
