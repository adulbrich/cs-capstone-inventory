import { redirect } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

/**
 * Handles the OAuth/SSO redirect callback.
 * Supabase sends ?code=... after the user authenticates with an external provider
 * (OSU ONID, etc). We exchange that code for a session server-side, then redirect.
 */
export const GET: RequestHandler = async ({ url, locals: { supabase } }) => {
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next") ?? "/";

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      throw redirect(303, next);
    }
  }

  // Something went wrong — send to login with an error hint
  throw redirect(303, "/login?error=sso_failed");
};
