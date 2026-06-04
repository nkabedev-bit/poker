import { TimerControls } from "@/components/admin/timer-controls";
import { loadAdminState } from "@/lib/admin-state";

export const dynamic = "force-dynamic";

export default async function TimerPage() {
  const state = await loadAdminState();

  if (!state) return <div className="poker-panel">Турнир не найден.</div>;

  return (
    <TimerControls
      blindLevels={state.blindLevels}
      extras={state.extras}
      registrationStatus={state.tournament.registrationStatus}
      timerState={state.timerState}
    />
  );
}
