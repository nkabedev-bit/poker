"use client";

import { useCallback, useEffect, useState } from "react";
import { getTelegramWebApp, useTMA } from "../layout";
import { useVisiblePolling } from "../use-visible-polling";
import { Crown, Gift, Pause, Play, Shuffle, SkipBack, SkipForward, Square, X } from "lucide-react";
import type { TableMerge, TimerState } from "@/lib/timer/types";
import type { Raffle } from "@/lib/raffle/raffle";
import {
  describeActiveTable,
  describeTableBreakQuestion,
  type ActiveTable,
} from "@/lib/tables/table-break";
import { formatTableMoveTarget } from "@/lib/timer/table-merge";

const CONFIRM_MESSAGE = "Вы уверены?";

export default function TMAControlPage() {
  const { initData } = useTMA();
  const [state, setState] = useState<{
    /** The tables somebody is playing at, for the desk to choose one to break. */
    activeTables?: ActiveTable[];
    raffle: Raffle | null;
    raffleHistory?: Raffle[];
    tableMerge: TableMerge | null;
    timerState: TimerState;
  } | null>(null);
  const [raffleBusy, setRaffleBusy] = useState(false);
  const [breakBusy, setBreakBusy] = useState(false);

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

  const confirmAction = (message = CONFIRM_MESSAGE) => {
    const tg = getTelegramWebApp();
    if (tg?.showConfirm) {
      return new Promise<boolean>((resolve) => tg.showConfirm(message, resolve));
    }

    return Promise.resolve(window.confirm(message));
  };

  /**
   * Breaks a table up: the server deals its players out to the other tables and puts
   * the list on the screens. True once it is done, so the choice can close.
   */
  const breakTable = async (table: ActiveTable) => {
    const tg = getTelegramWebApp();
    if (breakBusy) return false;
    if (!(await confirmAction(describeTableBreakQuestion(table, state?.activeTables ?? [])))) {
      return false;
    }

    setBreakBusy(true);
    try {
      const res = await fetch("/api/tma/timer/table-merge", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Telegram-Init-Data": initData },
        body: JSON.stringify({ table: table.number }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        tg?.HapticFeedback.notificationOccurred("error");
        tg?.showAlert(data?.error ?? "Не удалось расформировать стол");
        return false;
      }

      tg?.HapticFeedback.notificationOccurred("success");
      await fetchState();
      return true;
    } finally {
      setBreakBusy(false);
    }
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
  const merging = Boolean(state.tableMerge);

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

      {/* Offered while there is a game to stop — and always while the room is being
          reseated, so the announcement can be taken back off the screens. */}
      {tournamentActive || merging ? (
        <div className="rounded-xl bg-[var(--tg-theme-secondary-bg-color)] p-6 text-center">
          <h2 className="mb-4 text-sm font-semibold tracking-wider text-[var(--tg-theme-hint-color)]">
            СТОЛЫ
          </h2>
          <TablesCard
            activeTables={state.activeTables ?? []}
            busy={breakBusy}
            merge={state.tableMerge}
            onBreak={breakTable}
            onEnd={() => void handleAction("table-merge-end")}
            onPauseOnly={() => void handleAction("table-merge")}
          />
        </div>
      ) : null}
    </div>
  );
}

/**
 * The merge, and while it lasts, who goes where.
 *
 * Calling it asks which table to break: the app deals that table's players out to the
 * others and puts the list up on the screens. The desk can still just stop the clock and
 * reseat the room by hand, the way it always could.
 */
function TablesCard({
  activeTables,
  busy,
  merge,
  onBreak,
  onEnd,
  onPauseOnly,
}: {
  activeTables: ActiveTable[];
  busy: boolean;
  merge: TableMerge | null;
  onBreak: (table: ActiveTable) => Promise<boolean>;
  onEnd: () => void;
  onPauseOnly: () => void;
}) {
  const [choosing, setChoosing] = useState(false);

  if (merge) {
    return (
      <>
        <button
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-green-600 py-3 font-medium text-white"
          type="button"
          onClick={onEnd}
        >
          <Shuffle size={18} /> Закончить рассадку
        </button>
        <p className="mt-3 text-sm text-[var(--tg-theme-hint-color)]">
          Часы остановлены, на экранах объявление о пересадке.
        </p>
        {merge.moves?.length ? (
          <div className="mt-4 space-y-2 text-left">
            <div className="text-sm font-semibold">
              {merge.brokenTable ? `Стол ${merge.brokenTable} расформирован` : "Пересадка"}
            </div>
            {/* The desk reads it out to the room, so a row per player, the chair lined up
                on the right — the screens in the hall carry the full sentence. */}
            <ul className="space-y-1 text-sm">
              {merge.moves.map((move) => (
                <li key={move.playerId} className="flex justify-between gap-3">
                  <span className="truncate font-semibold">{move.name}</span>
                  <span className="shrink-0">{formatTableMoveTarget(move)}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </>
    );
  }

  if (!choosing) {
    return (
      <button
        className="flex w-full items-center justify-center gap-2 rounded-lg bg-orange-600 py-3 font-medium text-white"
        type="button"
        onClick={() => setChoosing(true)}
      >
        <Shuffle size={18} /> Объединение столов
      </button>
    );
  }

  return (
    <div className="space-y-2">
      <div className="pb-1 text-base font-semibold">Какой стол расформировать?</div>
      {activeTables.length > 1 ? (
        activeTables.map((table) => (
          <button
            key={table.number}
            className="w-full rounded-lg bg-orange-600 py-3 font-medium text-white disabled:opacity-60"
            disabled={busy}
            type="button"
            onClick={async () => {
              if (await onBreak(table)) setChoosing(false);
            }}
          >
            {describeActiveTable(table)}
          </button>
        ))
      ) : (
        <div className="text-sm text-[var(--tg-theme-hint-color)]">
          Расформировывать нечего — играет один стол.
        </div>
      )}
      <button
        className="w-full rounded-lg bg-[var(--tg-theme-bg-color)] py-3 font-medium disabled:opacity-60"
        disabled={busy}
        type="button"
        onClick={() => {
          setChoosing(false);
          onPauseOnly();
        }}
      >
        Только пауза — рассажу сам
      </button>
      <button
        className="w-full py-2 text-sm text-[var(--tg-theme-hint-color)] disabled:opacity-60"
        disabled={busy}
        type="button"
        onClick={() => setChoosing(false)}
      >
        Отмена
      </button>
    </div>
  );
}
