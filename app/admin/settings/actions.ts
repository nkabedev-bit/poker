"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { broadcastPublicState } from "@/lib/realtime/broadcast";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const settingsSchema = z.object({
  name: z.string().trim().min(1).max(80),
  startingStack: z.coerce.number().int().positive(),
  registrationMinutes: z.coerce.number().int().min(0).max(1440),
});

export async function updateTournamentSettings(formData: FormData) {
  const parsed = settingsSchema.safeParse({
    name: formData.get("name"),
    startingStack: formData.get("startingStack"),
    registrationMinutes: formData.get("registrationMinutes"),
  });

  if (!parsed.success) {
    redirect("/admin/settings?error=invalid_settings");
  }

  const supabase = await createSupabaseServerClient();
  const { data: tournament } = await supabase
    .from("tournaments")
    .select("id, public_token, logo_url")
    .limit(1)
    .single();

  if (!tournament) {
    redirect("/admin/settings?error=no_tournament");
  }

  let logoUrl = tournament.logo_url as string | null;
  const logo = formData.get("logo");

  if (logo instanceof File && logo.size > 0) {
    const extension = logo.name.split(".").pop() ?? "png";
    const path = `${tournament.id}/${Date.now()}.${extension}`;
    const { error: uploadError } = await supabase.storage
      .from("tournament-logos")
      .upload(path, logo, { upsert: true });

    if (uploadError) {
      redirect("/admin/settings?error=logo_upload");
    }

    const { data } = supabase.storage.from("tournament-logos").getPublicUrl(path);
    logoUrl = data.publicUrl;
  }

  await supabase
    .from("tournaments")
    .update({
      name: parsed.data.name,
      starting_stack: parsed.data.startingStack,
      registration_minutes: parsed.data.registrationMinutes,
      logo_url: logoUrl,
    })
    .eq("id", tournament.id);

  await broadcastPublicState(tournament.public_token as string);
  revalidatePath("/admin/settings");
  redirect("/admin/settings");
}
