import {
  saveBlindTemplate,
  saveBlindLevels,
} from "@/app/admin/blinds/actions";
import { BlindsEditor } from "@/components/admin/blinds-editor";
import { loadAdminState } from "@/lib/admin-state";

export const dynamic = "force-dynamic";

export default async function BlindsPage() {
  const state = await loadAdminState();

  if (!state) {
    return <div className="poker-panel">Турнир не найден.</div>;
  }

  return (
    <BlindsEditor
      blindTemplates={state.extras.blindTemplates}
      levels={state.blindLevels}
      reentryEnabled={state.extras.settings.reentryEnabled}
      returnTo="/admin/blinds"
      saveBlindTemplate={saveBlindTemplate}
      saveLevels={saveBlindLevels}
    />
  );
}
