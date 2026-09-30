"use client";

import { useCallback, useEffect, useState } from "react";
import { getTelegramWebApp, useTMA } from "../layout";
import { useVisiblePolling } from "../use-visible-polling";
import { TMA_DESK_CHANGED_EVENT, useClockView } from "../tournament-clock";
import { ScreenHeader, SectionLabel } from "../ui";
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
    // The big clock on this screen comes from the header's timer; it is told at once
    // rather than on the next beat of the pulse.
    window.dispatchEvent(new Event(TMA_DESK_CHANGED_EVENT));
  };

  if (!state) return <div className="tma-empty">Загрузка…</div>;

  // One draw of each kind per tournament, so a finished one is shown rather than offered.
  const heldRegular = state.raffleHistory?.find((item) => item.kind === "regular");
  const heldVip = state.raffleHistory?.find((item) => item.kind === "vip");
  const timerStatus = state.timerState.status;
  const tournamentActive = timerStatus === "running" || timerStatus === "paused" || timerStatus === "break";
  const merging = Boolean(state.tableMerge);

  return (
    <div className="tma-screen">
      <ScreenHeader title="Турнир" />

      <TournamentClockCard />

      {tournamentActive ? (
        timerStatus === "paused" ? (
          <button className="tma-btn tma-btn--success tma-btn--big" type="button" onClick={() => handleAction("start")}>
            <Play size={20} /> Воспроизведение
          </button>
        ) : (
          <button className="tma-btn tma-btn--primary tma-btn--big" type="button" onClick={() => handleAction("pause")}>
            <Pause size={20} /> Пауза
          </button>
        )
      ) : (
        <button
          className="tma-btn tma-btn--success tma-btn--big"
          type="button"
          onClick={() => handleAction("start", true)}
        >
          <Play size={20} /> Начать турнир
        </button>
      )}

      <div className="tma-btn-grid">
        <button className="tma-btn" type="button" onClick={() => handleAction("previous", true)}>
          <SkipBack size={18} /> Предыдущий блайнд
        </button>
        <button className="tma-btn" type="button" onClick={() => handleAction("next", true)}>
          <SkipForward size={18} /> Следующий блайнд
        </button>
      </div>

      <SectionLabel title="Розыгрыши" />
      {state.raffle ? (
        <div className="tma-card">
          <div className="flex items-center justify-between">
            <span className="tma-hint">Сейчас на экранах в зале</span>
            <span className="tma-badge tma-badge--green">● Розыгрыш</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="tma-num text-[40px] font-bold leading-none">{state.raffle.winnerNumber}</span>
            <span className="text-lg font-bold">{state.raffle.winnerName}</span>
          </div>
          <button
            className="tma-btn tma-btn--inset"
            disabled={raffleBusy}
            type="button"
            onClick={() => void closeRaffle()}
          >
            <X size={18} /> Закрыть розыгрыш
          </button>
        </div>
      ) : null}
      <div className="tma-card tma-card--flush">
        <RaffleRow
          busy={raffleBusy || Boolean(state.raffle)}
          held={heldRegular}
          icon={<Gift size={18} />}
          label={heldRegular ? "Розыгрыш проведён" : "Провести розыгрыш"}
          title="Проходка"
          onRun={() => void runRaffle("regular")}
        />
        <RaffleRow
          busy={raffleBusy || Boolean(state.raffle)}
          held={heldVip}
          icon={<Crown className="text-[var(--tma-gold)]" size={18} />}
          label={heldVip ? "VIP розыгрыш проведён" : "Провести VIP розыгрыш"}
          title="VIP"
          onRun={() => void runRaffle("vip")}
        />
      </div>

      {/* Offered while there is a game to stop — and always while the room is being
          reseated, so the announcement can be taken back off the screens. */}
      {tournamentActive || merging ? (
        <>
          <SectionLabel
            meta={state.activeTables?.length ? `играют ${state.activeTables.length} стол.` : undefined}
            title="Столы"
          />
          <TablesCard
            activeTables={state.activeTables ?? []}
            busy={breakBusy}
            merge={state.tableMerge}
            onBreak={breakTable}
            onEnd={() => void handleAction("table-merge-end")}
            onPauseOnly={() => void handleAction("table-merge")}
          />
        </>
      ) : (
        <p className="tma-hint tma-hint--pad">Объединение столов появится после старта.</p>
      )}

      {tournamentActive ? (
        <button
          className="tma-btn tma-btn--danger-soft mt-2"
          type="button"
          onClick={() => handleAction("finish", true)}
        >
          <Square size={18} /> Завершить турнир
        </button>
      ) : null}
    </div>
  );
}

/**
 * The clock as the room sees it on the big screen, read from the header's timer. It
 * shows nothing until that timer is in, rather than a wrong zero.
 */
function TournamentClockCard() {
  const view = useClockView();
  if (!view) return null;

  const paused = view.status === "paused";
  const badge =
    view.status === "running"
      ? { className: "tma-badge--green", text: "● Идёт" }
      : paused
        ? { className: "tma-badge--amber", text: "Пауза" }
        : view.status === "break"
          ? { className: "tma-badge--blue", text: "Перерыв" }
          : view.status === "finished"
            ? { className: "", text: "Завершён" }
            : { className: "", text: "Не начат" };

  return (
    <div className="tma-card tma-clock">
      <div className="flex w-full items-center justify-between">
        <span className="tma-hint">
          {view.isBreak ? "Перерыв" : `Уровень ${view.levelNumber} из ${view.levelsCount}`}
        </span>
        <span className={`tma-badge ${badge.className}`}>{badge.text}</span>
      </div>
      <span className={`tma-clock__time${paused ? " tma-clock__time--paused" : ""}`}>{view.remaining}</span>
      {view.blinds ? (
        <span className="tma-clock__blinds">
          {view.blinds}
          {view.ante > 0 ? <span className="tma-muted text-base font-medium"> · анте {view.ante.toLocaleString("ru-RU")}</span> : null}
        </span>
      ) : null}
      {view.next ? (
        <span className="tma-hint">
          Далее: {view.next}
          {view.levelsToBreak !== null && view.levelsToBreak > 0 ? ` · перерыв через ${view.levelsToBreak} ур.` : ""}
        </span>
      ) : null}
    </div>
  );
}

/** One kind of draw: who won it tonight, or the button that runs it. */
function RaffleRow({
  busy,
  held,
  icon,
  label,
  onRun,
  title,
}: {
  busy: boolean;
  held: Raffle | undefined;
  icon: React.ReactNode;
  label: string;
  onRun: () => void;
  title: string;
}) {
  return (
    <div className="tma-row">
      <span className="tma-row__lead">{icon}</span>
      <span className="tma-row__body">
        <span className="tma-row__title">{title}</span>
        <span className="tma-row__sub">
          {held ? `№ ${held.winnerNumber} — ${held.winnerName}` : "не проводился"}
        </span>
      </span>
      {/* One draw of each kind a night: once held, there is nothing left to press. */}
      {held ? (
        <span aria-label={label} className="tma-badge tma-badge--green">
          проведён
        </span>
      ) : (
        <button
          className="tma-btn tma-btn--primary tma-btn--auto !min-h-10 !px-3 !text-sm"
          disabled={busy}
          type="button"
          onClick={onRun}
        >
          {label}
        </button>
      )}
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
      <div className="tma-card">
        <div className="tma-note tma-note--amber">
          <Pause size={18} />
          <span>Часы остановлены, на экранах объявление о пересадке.</span>
        </div>
        {merge.moves?.length ? (
          <div className="flex flex-col gap-2">
            <div className="text-sm font-semibold">
              {merge.brokenTable ? `Стол ${merge.brokenTable} расформирован` : "Пересадка"}
            </div>
            {/* The desk reads it out to the room, so a row per player, the chair lined up
                on the right — the screens in the hall carry the full sentence. */}
            <ul className="flex flex-col">
              {merge.moves.map((move) => (
                <li
                  key={move.playerId}
                  className="flex justify-between gap-3 border-t border-[var(--tma-line)] py-2.5 text-[16px]"
                >
                  <span className="truncate font-semibold">{move.name}</span>
                  <span className="tma-num shrink-0 font-bold">{formatTableMoveTarget(move)}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        <button className="tma-btn tma-btn--success tma-btn--big" type="button" onClick={onEnd}>
          <Shuffle size={18} /> Закончить рассадку
        </button>
      </div>
    );
  }

  if (!choosing) {
    return (
      <button className="tma-btn" type="button" onClick={() => setChoosing(true)}>
        <Shuffle className="text-[var(--tma-amber)]" size={18} /> Объединение столов
      </button>
    );
  }

  return (
    <div className="tma-card">
      <div className="text-base font-bold">Какой стол расформировать?</div>
      <p className="tma-hint">
        Игроки выбранного стола разойдутся по свободным местам, а список пересадки появится
        на экранах. Часы остановятся.
      </p>
      {activeTables.length > 1 ? (
        activeTables.map((table) => (
          <button
            key={table.number}
            className="tma-choice"
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
        <div className="tma-hint">Расформировывать нечего — играет один стол.</div>
      )}
      <button
        className="tma-btn tma-btn--inset"
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
        className="tma-btn tma-btn--ghost"
        disabled={busy}
        type="button"
        onClick={() => setChoosing(false)}
      >
        Отмена
      </button>
    </div>
  );
}
