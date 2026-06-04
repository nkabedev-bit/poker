import { updateTournamentSettings } from "@/app/admin/settings/actions";
import { savePrizes } from "@/app/admin/extras/actions";
import {
  saveBlindTemplate,
  saveBlindLevels,
} from "@/app/admin/blinds/actions";
import { BlindsEditor } from "@/components/admin/blinds-editor";
import { PrizesEditor } from "@/components/admin/prizes-editor";
import { SettingsForm } from "@/components/admin/settings-form";
import { loadAdminState } from "@/lib/admin-state";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const state = await loadAdminState();

  if (!state) {
    return <div className="poker-panel">Турнир не найден.</div>;
  }

  return (
    <div className="settings-stack">
      <SettingsForm
        action={updateTournamentSettings}
        extras={state.extras}
        publicUrl={`/screen/${state.tournament.publicToken}`}
        tournament={state.tournament}
      />
      <BlindsEditor
        blindTemplates={state.extras.blindTemplates}
        levels={state.blindLevels}
        reentryEnabled={state.extras.settings.reentryEnabled}
        returnTo="/admin/settings"
        saveBlindTemplate={saveBlindTemplate}
        saveLevels={saveBlindLevels}
      />
      <PrizesEditor initialPlaces={state.extras.prizes} saveAction={savePrizes} />
    </div>
  );
}
