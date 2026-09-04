"use client";

import { useCallback, useEffect, useState } from "react";
import { getTelegramWebApp, useTMA } from "../layout";
import { useVisiblePolling } from "../use-visible-polling";
import { Crown, Gift, Pause, Play, SkipBack, SkipForward, Square, X } from "lucide-react";
import type { TimerState } from "@/lib/timer/types";
import type { Raffle } from "@/lib/raffle/raffle";

const CONFIRM_MESSAGE = "Вы уверены?";

export default function TMAControlPage() {
  const { initData } = useTMA();
  const [state, setState] = useState<{
    raffle: Raffle | null;
    raffleHistory?: Raffle[];
    timerState: TimerState;
  } | null>(null);
  const [raffleBusy, setRaffleBusy] = useState(false);

  const fetchState = useCallback(async () => {
    const res = await fetch("/api/tma/timer?scope=control", { headers: { "X-Telegram-Init-Data": initData } });
    if (res.ok) {
      const data = await res.json();
      setState(data);
    }
  }, [initData]);

  useEffect(() => {
    const timeout = window.setTimeout(() => void fetchState(), 0);
    return () => window.clearTimeout(timeout);
  }, [fetchState]);
  useVisiblePolling(() => void fetchState());

  const confirmAction = () => {
    const tg = getTelegramWebApp();
    if (tg?.showConfirm) {
      return new Promise<boolean>((resolve) => tg.showConfirm(CONFIRM_MESSAGE, resolve));
    }

    return Promise.resolve(window.confirm(CONFIRM_MESSAGE));
  };

  /**
   * Runs a draw on the big screen. The winner is decided on the server, so what comes
   * back is only news: whether the prize reached the player's profile by itself.
   */
  const runRaffle = async (kind: "regular" | "vip") => {
    const tg = getTelegramWebApp();
    if (raffleBusy) return;

    const question =
      kind === "vip"
        ? "Запустить VIP розыгрыш на экране?"
        : "Запустить розыгрыш бесплатной проходки на экране?";

    if (!(await new Promise<boolean>((resolve) =>
      tg?.showConfirm ? tg.showConfirm(question, resolve) : resolve(window.confirm(question)),
    ))) {
      return;
    }

    setRaffleBusy(true);
    try {
      const res = await fetch("/api/tma/raffle", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Telegram-Init-Data": initData },
        body: JSON.stringify({ kind }),
      });
      const data = await res.json().catch(() => null);

      if (!res.ok) {
        tg?.HapticFeedback.notificationOccurred("error");
        tg?.showAlert(data?.error ?? "Не удалось запустить розыгрыш");
        return;
      }

      tg?.HapticFeedback.notificationOccurred("success");
      const raffle = data.raffle as Raffle;
      const winner = `Победил номер ${raffle.winnerNumber} — ${raffle.winnerName}.`;

      tg?.showAlert(
        raffle.prize === "granted"
          ? `${winner}\n\nПроходка начислена в профиль.`
          : raffle.prize === "manual"
            ? `${winner}\n\nИгрок не привязан к Telegram — начислите проходку вручную командой /free ${raffle.winnerName}`
            : winner,
      );

      void fetchState();
    } finally {
      setRaffleBusy(false);
    }
  };

  const closeRaffle = async () => {
    const tg = getTelegramWebApp();
    setRaffleBusy(true);
    try {
      await fetch("/api/tma/raffle", {
        method: "DELETE",
        headers: { "X-Telegram-Init-Data": initData },
      });
      tg?.HapticFeedback.impactOccurred("light");
      void fetchState();
    } finally {
      setRaffleBusy(false);
    }
  };

  const handleAction = async (action: string, confirm = false) => {
    if (confirm && !(await confirmAction())) return;

    const tg = getTelegramWebApp();
    tg?.HapticFeedback.impactOccurred("medium");
    await fetch(`/api/tma/timer/${action}`, {
      method: "POST",
      headers: { "X-Telegram-Init-Data": initData },
    });
    void fetchState();
  };

  if (!state) return <div>Загрузка...</div>;

  // One draw of each kind per tournament, so a finished one is shown rather than offered.
  const heldRegular = state.raffleHistory?.find((item) => item.kind === "regular");
  const heldVip = state.raffleHistory?.find((item) => item.kind === "vip");
  const timerStatus = state.timerState.status;
  const tournamentActive = timerStatus === "running" || timerStatus === "paused" || timerStatus === "break";

  return (
    <div className="space-y-6">
      <div className="bg-[var(--tg-theme-secondary-bg-color)] rounded-xl p-6 text-center">
        <h2 className="text-[var(--tg-theme-hint-color)] text-sm mb-4 font-semibold tracking-wider">УПРАВЛЕНИЕ</h2>
        <div className="flex flex-wrap justify-center gap-3">
          {tournamentActive ? (
            <button
              onClick={() => handleAction("finish", true)}
              className="min-w-[calc(50%-0.375rem)] flex-1 bg-red-600 text-white py-3 rounded-lg flex items-center justify-center gap-2 font-medium"
            >
              <Square size={18} /> Завершить турнир
            </button>
          ) : (
            <button
              onClick={() => handleAction("start", true)}
              className="min-w-[calc(50%-0.375rem)] flex-1 bg-green-600 text-white py-3 rounded-lg flex items-center justify-center gap-2 font-medium"
            >
              <Play size={18} /> Начать турнир
            </button>
          )}
          {timerStatus === "paused" ? (
            <button
              onClick={() => handleAction("start")}
              className="min-w-[calc(50%-0.375rem)] flex-1 bg-green-600 text-white py-3 rounded-lg flex items-center justify-center gap-2 font-medium"
            >
              <Play size={18} /> Воспроизведение
            </button>
          ) : (
            <button
              onClick={() => handleAction("pause")}
              className="min-w-[calc(50%-0.375rem)] flex-1 bg-yellow-600 text-white py-3 rounded-lg flex items-center justify-center gap-2 font-medium"
            >
              <Pause size={18} /> Пауза
            </button>
          )}
          <button
            onClick={() => handleAction("previous", true)}
            className="min-w-[calc(50%-0.375rem)] flex-1 bg-[var(--tg-theme-button-color)] text-[var(--tg-theme-button-text-color)] py-3 rounded-lg flex items-center justify-center gap-2 font-medium"
          >
            <SkipBack size={18} /> Предыдущий блайнд
          </button>
          <button
            onClick={() => handleAction("next", true)}
            className="min-w-[calc(50%-0.375rem)] flex-1 bg-[var(--tg-theme-button-color)] text-[var(--tg-theme-button-text-color)] py-3 rounded-lg flex items-center justify-center gap-2 font-medium"
          >
            <SkipForward size={18} /> Следующий блайнд
          </button>
        </div>
      </div>

      <div className="rounded-xl bg-[var(--tg-theme-secondary-bg-color)] p-6 text-center">
        <h2 className="mb-4 text-sm font-semibold tracking-wider text-[var(--tg-theme-hint-color)]">
          РОЗЫГРЫШИ
        </h2>

        {heldRegular || heldVip ? (
          <div className="mb-4 space-y-1 text-sm text-[var(--tg-theme-hint-color)]">
            {heldRegular ? (
              <p>
                Розыгрыш проходки: номер {heldRegular.winnerNumber} — {heldRegular.winnerName}
              </p>
            ) : null}
            {heldVip ? (
              <p>
                VIP розыгрыш: номер {heldVip.winnerNumber} — {heldVip.winnerName}
              </p>
            ) : null}
          </div>
        ) : null}

        {state.raffle ? (
          <div className="space-y-3">
            <p className="text-sm">
              На экране: номер {state.raffle.winnerNumber} — {state.raffle.winnerName}
            </p>
            <button
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-[var(--tg-theme-button-color)] py-3 font-medium text-[var(--tg-theme-button-text-color)] disabled:opacity-60"
              disabled={raffleBusy}
              type="button"
              onClick={() => void closeRaffle()}
            >
              <X size={18} /> Закрыть розыгрыш
            </button>
          </div>
        ) : (
          <div className="flex flex-wrap justify-center gap-3">
            <button
              className="flex min-w-[calc(50%-0.375rem)] flex-1 items-center justify-center gap-2 rounded-lg bg-[var(--tg-theme-button-color)] py-3 font-medium text-[var(--tg-theme-button-text-color)] disabled:opacity-60"
              disabled={raffleBusy || Boolean(heldRegular)}
              type="button"
              onClick={() => void runRaffle("regular")}
            >
              <Gift size={18} /> {heldRegular ? "Розыгрыш проведён" : "Провести розыгрыш"}
            </button>
            <button
              className="flex min-w-[calc(50%-0.375rem)] flex-1 items-center justify-center gap-2 rounded-lg bg-[#e9c07a] py-3 font-medium text-black disabled:opacity-60"
              disabled={raffleBusy || Boolean(heldVip)}
              type="button"
              onClick={() => void runRaffle("vip")}
            >
              <Crown size={18} /> {heldVip ? "VIP розыгрыш проведён" : "Провести VIP розыгрыш"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
