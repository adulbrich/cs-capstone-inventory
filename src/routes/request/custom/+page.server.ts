import { fail, redirect } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({
  locals: { safeGetSession },
}) => {
  const { session } = await safeGetSession();
  if (!session) {
    throw redirect(303, "/login");
  }
  return { session };
};

export const actions: Actions = {
  submit: async ({ request, locals: { supabase, safeGetSession } }) => {
    const { session } = await safeGetSession();
    if (!session) {
      return fail(401, { message: "You must be logged in." });
    }

    const formData = await request.formData();
    const reason = (formData.get("reason") as string)?.trim();
    const alternatives = (formData.get("alternatives") as string)?.trim();
    const itemNamesRaw = formData.getAll("itemName") as string[];
    const itemQuantitiesRaw = formData.getAll("itemQuantity") as string[];
    const itemPricesRaw = formData.getAll("itemPrice") as string[];

    if (!reason) {
      return fail(400, { message: "Reason is required." });
    }
    if (!alternatives) {
      return fail(400, { message: "Alternatives are required." });
    }
    if (itemNamesRaw.length === 0 || itemNamesRaw.every((n) => !n.trim())) {
      return fail(400, { message: "At least one hardware item is required." });
    }

    const items = itemNamesRaw.map((name, i) => ({
      name: name.trim(),
      quantity: parseInt(itemQuantitiesRaw[i] || "1", 10),
      unit_price: itemPricesRaw[i] ? parseFloat(itemPricesRaw[i]) : null,
    }));

    const { error } = await supabase.from("custom_requests").insert({
      user_id: session.user.id,
      status: "pending",
      reason,
      alternatives,
      items,
    });

    if (error) {
      console.error("Failed to create custom request:", error);
      return fail(500, { message: "Failed to submit request." });
    }

    throw redirect(303, "/");
  },
};
