import { savePlayers } from "@/app/admin/extras/actions";
import { PlayersManager } from "@/components/admin/players-manager";
import { loadAdminState } from "@/lib/admin-state";
import { defaultTournamentExtras } from "@/lib/tournament-extras-shared";

export default async function PlayersPage() {
  const state = await loadAdminState();
  return (
    <PlayersManager
      extras={state?.extras ?? defaultTournamentExtras}
      saveAction={savePlayers}
      startingStack={state?.tournament.startingStack ?? 10000}
    />
  );
}
