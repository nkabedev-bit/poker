import {
  closeRegistration,
  finishTournament,
  nextLevel,
  pauseTimer,
  previousLevel,
  resumeTimer,
  startTimer,
  restartTournament,
} from "@/app/admin/timer/actions";
import { getEffectiveTimerState } from "@/lib/timer/calculate";
import type { BlindLevel, TimerState, TournamentExtras } from "@/lib/timer/types";
import { SubmitButton } from "@/components/admin/submit-button";
import { ConfirmForm } from "@/components/admin/confirm-form";
import { AdminTimerClock } from "@/components/admin/admin-timer-clock";

type TimerControlsProps = {
  blindLevels: BlindLevel[];
  extras: TournamentExtras;
  timerState: TimerState;
  registrationStatus: "open" | "closed";
  serverNowIso: string;
};

function formatBlinds(level: BlindLevel | null) {
  if (!level) return "—";
  if (level.isBreak) return "Перерыв";
  return `${level.smallBlind} / ${level.bigBlind}`;
}

export function TimerControls({
  blindLevels,
  extras,
  timerState,
  registrationStatus,
  serverNowIso,
}: TimerControlsProps) {
  const { currentLevelIndex } = getEffectiveTimerState(timerState, blindLevels, new Date(serverNowIso));
  const current = blindLevels[currentLevelIndex] ?? null;
  const next = blindLevels[currentLevelIndex + 1] ?? null;
  const isRunning = timerState.status === "running" || timerState.status === "break";
  const activePlayers = extras.players.filter((player) => player.status === "active");
  const averageStack =
    activePlayers.length > 0
      ? Math.round(activePlayers.reduce((sum, player) => sum + player.stack, 0) / activePlayers.length)
      : 0;

  return (
    <div className="timer-admin-grid">
      <section className="poker-panel timer-control-panel">
        <p className="eyebrow">⏱️ Уровень {currentLevelIndex + 1}</p>
        <div className="admin-blinds-current">{formatBlinds(current)}</div>
        <AdminTimerClock timerState={timerState} blindLevels={blindLevels} serverNowIso={serverNowIso} />
        <div className="button-row centered">
          <form action={previousLevel}>
            <SubmitButton className="ghost-button" pendingText="◀ ...">
              ◀ Пред. уровень
            </SubmitButton>
          </form>
          {isRunning ? (
            <form action={pauseTimer}>
              <SubmitButton className="gold-outline-button" pendingText="⏸️ Ставим на паузу...">
                ⏸️ Пауза
              </SubmitButton>
            </form>
          ) : timerState.status === "paused" ? (
            <form action={resumeTimer}>
              <SubmitButton className="gold-button" pendingText="▶️ Запускаем...">
                ▶️ Продолжить
              </SubmitButton>
            </form>
          ) : timerState.status === "finished" ? (
            <ConfirmForm action={restartTournament} confirmMessage="Вы уверены, что хотите начать новый турнир?">
              <SubmitButton className="gold-button" pendingText="▶️ Начинаем...">
                ▶️ Начать турнир
              </SubmitButton>
            </ConfirmForm>
          ) : (
            <form action={startTimer}>
              <SubmitButton className="gold-button" pendingText="▶️ Запускаем...">
                ▶️ Старт
              </SubmitButton>
            </form>
          )}
          <form action={nextLevel}>
            <SubmitButton className="ghost-button" pendingText="... ▶">
              След. уровень ▶
            </SubmitButton>
          </form>
          <form action={closeRegistration}>
            <SubmitButton className="green-button" disabled={registrationStatus === "closed"} pendingText="✅ Закрываем...">
              ✅ Закрыть регистрацию
            </SubmitButton>
          </form>
          {timerState.status !== "finished" && (
            <ConfirmForm
              action={finishTournament}
              confirmMessage="Вы уверены, что хотите НЕМЕДЛЕННО завершить турнир?"
            >
              <SubmitButton
                className="red-button"
                pendingText="🏆 Завершаем..."
              >
                🏆 Завершить турнир
              </SubmitButton>
            </ConfirmForm>
          )}
        </div>
      </section>
      <section className="poker-panel timer-summary">
        <h2>Игроки</h2>
        <p className="muted">Всего: {extras.players.length}</p>
        <p className="muted">Активных: {activePlayers.length}</p>
        <p className="muted">Средний стек: {averageStack.toLocaleString("ru-RU")}</p>
        <h2>Призы</h2>
        {extras.prizes.slice(0, 3).map((prize) => (
          <p className="muted" key={prize.place}>
            {prize.place} место: 🏆
          </p>
        ))}
        <h2>🏆 Следующий уровень</h2>
        <div className="next-blinds">{formatBlinds(next)}</div>
        <p className="muted">
          Регистрация: {registrationStatus === "open" ? "открыта" : "закрыта"}
        </p>
        <p className="muted">Статус таймера: {timerState.status}</p>
      </section>
    </div>
  );
}
