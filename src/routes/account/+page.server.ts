import { fail, redirect } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({
  locals: { supabase, safeGetSession },
}) => {
  const { session } = await safeGetSession();
  if (!session) throw redirect(303, "/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, role, email")
    .eq("id", session.user.id)
    .single();

  // Fall back to the auth session email if profiles.email is not yet populated
  return {
    profile: {
      full_name: profile?.full_name ?? null,
      role: profile?.role ?? "student",
      email: profile?.email ?? session.user.email ?? null,
    },
  };
};

export const actions: Actions = {
  logout: async ({ locals: { supabase } }) => {
    await supabase.auth.signOut().catch(() => {});
    throw redirect(303, "/");
  },

  updateName: async ({ request, locals: { supabase, safeGetSession } }) => {
    const { session } = await safeGetSession();
    if (!session) return fail(401, { message: "Unauthorized" });

    const formData = await request.formData();
    const fullName = (formData.get("fullName") as string)?.trim();

    if (!fullName) return fail(400, { message: "Name cannot be empty." });

    const { error } = await supabase
      .from("profiles")
      .update({ full_name: fullName })
      .eq("id", session.user.id);

    if (error) return fail(500, { message: "Failed to update name." });

    return { success: true };
  },
};
