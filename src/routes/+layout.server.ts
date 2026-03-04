import type { LayoutServerLoad } from "./$types";

export const load: LayoutServerLoad = async ({
  locals: { supabase, safeGetSession },
  cookies,
}) => {
  const { session, user } = await safeGetSession();

  let userRole: string | null = null;
  if (session) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", session.user.id)
      .single();
    userRole = profile?.role ?? null;
  }

  return {
    session,
    user,
    cookies: cookies.getAll(),
    userRole,
  };
};
