import { redirect } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ locals: { safeGetSession } }) => {
  const { session } = await safeGetSession();

  // Redirect to admin if already authenticated
  if (session) {
    throw redirect(303, "/admin");
  }

  return {};
};
