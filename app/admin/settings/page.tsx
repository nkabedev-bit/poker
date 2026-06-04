import { updateTournamentSettings } from "@/app/admin/settings/actions";
import { SettingsForm } from "@/components/admin/settings-form";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Tournament } from "@/lib/timer/types";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("tournaments")
    .select("id, name, logo_url, starting_stack, registration_minutes, registration_status, public_token")
    .limit(1)
    .single();

  if (!data) {
    return <div className="poker-panel">Турнир не найден.</div>;
  }

  const tournament: Tournament = {
    id: data.id as string,
    name: data.name as string,
    logoUrl: data.logo_url as string | null,
    startingStack: data.starting_stack as number,
    registrationMinutes: data.registration_minutes as number,
    registrationStatus: data.registration_status as Tournament["registrationStatus"],
    publicToken: data.public_token as string,
  };

  return (
    <SettingsForm
      action={updateTournamentSettings}
      publicUrl={`/screen/${tournament.publicToken}`}
      tournament={tournament}
    />
  );
}
