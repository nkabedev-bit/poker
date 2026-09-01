"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { getTelegramWebApp, useTMA } from "../layout";
import { useVisiblePolling } from "../use-visible-polling";
import { ArrowRightLeft, BadgePlus, ChevronLeft, ClipboardList, RotateCcw, Plus, Trash2, Users } from "lucide-react";
import { formatPlayerNameWithRegistrationNumber } from "@/lib/player-registration-number";

// Addon chip amount credited by the TMA admin app: fixed, no manual input — the
// admin only confirms the "add N chips to player X?" dialog.
const ADDON_CHIPS = 6000;

type Player = {
  addons?: number;
  addonChipsTotal?: number;
  id: string;
  name: string;
  registrationNumber?: number | null;
  table: number;
  seat: number;
  stack: number;
  status: "active" | "eliminated";
};

export default function TMAPlayersPage() {
  const { initData } = useTMA();
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const [addonEnabled, setAddonEnabled] = useState(false);
  const [maxAddons, setMaxAddons] = useState(1);
  const [tablesCount, setTablesCount] = useState(1);
  const [tableFilter, setTableFilter] = useState("");
  const [moveTable, setMoveTable] = useState("1");
  const [reentryAvailable, setReentryAvailable] = useState(false);
  const [doubleReentryAvailable, setDoubleReentryAvailable] = useState(false);
  const [restoreChoiceOpen, setRestoreChoiceOpen] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  
  // Form State
  const [name, setName] = useState("");
  const [table, setTable] = useState("1");
  const [seat] = useState("1");

  const fetchPlayers = useCallback(async () => {
    try {
      const res = await fetch("/api/tma/players", {
        headers: { "X-Telegram-Init-Data": initData },
      });
      if (res.ok) {
        const data = await res.json();
        setPlayers(data.players || []);
        setAddonEnabled(Boolean(data.addonEnabled));
        setMaxAddons(Math.max(1, Number(data.maxAddons ?? 1)));
        setTablesCount(Math.max(1, Number(data.tablesCount ?? 1)));
        setReentryAvailable(Boolean(data.reentryEnabled) && data.reentryAvailable !== false);
        setDoubleReentryAvailable(Boolean(data.doubleReentryAvailable));
      }
    } finally {
      setLoading(false);
    }
  }, [initData]);

  useEffect(() => {
    const timeout = window.setTimeout(() => void fetchPlayers(), 0);
    return () => window.clearTimeout(timeout);
  }, [fetchPlayers]);
  useVisiblePolling(() => void fetchPlayers());

  useEffect(() => {
    const tg = getTelegramWebApp();
    if (!tg) return;

    if (showAddForm) {
      tg.MainButton.setText("ДОБАВИТЬ ИГРОКА");
      tg.MainButton.show();
      const onClick = async () => {
        if (!name) return tg.showAlert("Введите имя");
        
        tg.MainButton.showProgress();
        try {
          const res = await fetch("/api/tma/players", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-Telegram-Init-Data": initData,
            },
            body: JSON.stringify({ name, table, seat }),
          });
          if (res.ok) {
            tg.HapticFeedback.notificationOccurred("success");
            setShowAddForm(false);
            setName("");
            await fetchPlayers();
          } else {
            const data = await res.json().catch(() => null);
            tg.HapticFeedback.notificationOccurred("error");
            tg.showAlert(data?.error ?? "Ошибка добавления игрока");
          }
        } finally {
          tg.MainButton.hideProgress();
        }
      };
      tg.MainButton.onClick(onClick);
      return () => {
        tg.MainButton.offClick(onClick);
        tg.MainButton.hide();
      };
    } else {
      tg.MainButton.hide();
    }
  }, [showAddForm, name, table, seat, initData, fetchPlayers]);

  const selectedPlayer = useMemo(
    () => players.find((player) => player.id === selectedPlayerId) ?? null,
    [players, selectedPlayerId],
  );

  const selectedPlayerAddons = Math.max(0, Number(selectedPlayer?.addons ?? 0));
  const selectedPlayerCanAddon =
    Boolean(selectedPlayer) &&
    selectedPlayer?.status === "active" &&
    addonEnabled &&
    selectedPlayerAddons < maxAddons;

  const closePlayerDetails = () => {
    setSelectedPlayerId(null);
    setRestoreChoiceOpen(false);
  };

  const handleDelete = async (id: string) => {
    const tg = getTelegramWebApp();
    tg?.showConfirm("Удалить игрока (если он добавлен по ошибке)?", async (confirmed: boolean) => {
      if (confirmed) {
        await fetch(`/api/tma/players/${id}`, {
          method: "DELETE",
          headers: { "X-Telegram-Init-Data": initData },
        });
        tg?.HapticFeedback.impactOccurred("medium");
        void fetchPlayers();
      }
    });
  };

  const submitAddon = async () => {
    const tg = getTelegramWebApp();
    if (!selectedPlayer) return;

    const confirmText = `Добавить игроку «${selectedPlayer.name}» ${ADDON_CHIPS.toLocaleString("ru-RU")} фишек?`;
    tg?.showConfirm(confirmText, async (confirmed: boolean) => {
      if (!confirmed) return;

      const res = await fetch(`/api/tma/players/${selectedPlayer.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "X-Telegram-Init-Data": initData,
        },
        body: JSON.stringify({ action: "add_addon", chips: ADDON_CHIPS }),
      });

      if (res.ok) {
        tg?.HapticFeedback.notificationOccurred("success");
        await fetchPlayers();
        return;
      }

      const data = await res.json().catch(() => null);
      tg?.HapticFeedback.notificationOccurred("error");
      tg?.showAlert(data?.error === "Addon limit reached" ? "Лимит аддонов уже использован" : "Ошибка сохранения");
    });
  };

  const submitMoveTable = async () => {
    const tg = getTelegramWebApp();
    if (!selectedPlayer) return;

    const tableNumber = Number(moveTable);
    if (!Number.isInteger(tableNumber) || tableNumber < 1 || tableNumber > tablesCount) {
      tg?.showAlert("Выберите стол");
      return;
    }

    const res = await fetch(`/api/tma/players/${selectedPlayer.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "X-Telegram-Init-Data": initData,
      },
      body: JSON.stringify({ action: "move_table", table: tableNumber }),
    });

    if (res.ok) {
      tg?.HapticFeedback.notificationOccurred("success");
      await fetchPlayers();
      return;
    }

    tg?.HapticFeedback.notificationOccurred("error");
    tg?.showAlert("Ошибка пересадки");
  };

  // Returning a player has to say WHY: an erroneous knockout is erased, while a re-entry
  // keeps the knockout on record and credits the player with a rebuy — otherwise a player
  // who waits for the x2 window comes back unmarked in the bot and in the sheet.
  const submitRestorePlayer = async (reentry: "none" | "single" | "double") => {
    const tg = getTelegramWebApp();
    if (!selectedPlayer || isRestoring) return;

    setIsRestoring(true);
    try {
      const res = await fetch(`/api/tma/players/${selectedPlayer.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "X-Telegram-Init-Data": initData,
        },
        body: JSON.stringify({ action: "restore_player", reentry }),
      });

      if (res.ok) {
        tg?.HapticFeedback.notificationOccurred("success");
        setRestoreChoiceOpen(false);
        await fetchPlayers();
        return;
      }

      const data = await res.json().catch(() => null);
      tg?.HapticFeedback.notificationOccurred("error");
      tg?.showAlert(data?.error ?? "Ошибка возврата игрока");
    } finally {
      setIsRestoring(false);
    }
  };

  const tableOptions = useMemo(
    () => Array.from({ length: tablesCount }, (_, index) => index + 1),
    [tablesCount],
  );
  const selectedTableNumber = tableFilter ? Number(tableFilter) : null;
  const visiblePlayers = selectedTableNumber
    ? players.filter((player) => player.table === selectedTableNumber)
    : players;
  const activeCount = visiblePlayers.filter(p => p.status === "active").length;
  const elimCount = visiblePlayers.filter(p => p.status === "eliminated").length;

  if (loading) return <div>Загрузка...</div>;

  if (showAddForm) {
    return (
      <div className="space-y-4">
        <h2 className="text-xl font-bold mb-4">Новый игрок</h2>
        <div>
          <label className="block text-xs text-[var(--tg-theme-hint-color)] mb-1" htmlFor="new-player-name">Имя</label>
          <input
            id="new-player-name"
            type="text"
            className="w-full bg-[var(--tg-theme-secondary-bg-color)] text-black font-semibold border-none rounded p-3 outline-none"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Иван Иванов"
          />
        </div>
        <div>
          <label className="block text-xs text-[var(--tg-theme-hint-color)] mb-1" htmlFor="new-player-table">Стол</label>
          <input
            id="new-player-table"
            type="number"
            className="w-full bg-[var(--tg-theme-secondary-bg-color)] text-black font-semibold border-none rounded p-3 outline-none"
            value={table}
            onChange={(e) => setTable(e.target.value)}
          />
        </div>
        <button 
          onClick={() => setShowAddForm(false)}
          className="mt-4 w-full p-3 text-[var(--tg-theme-button-color)]"
        >
          Отмена
        </button>
      </div>
    );
  }

  if (selectedPlayer && restoreChoiceOpen) {
    const restoreDisabledClass = isRestoring ? " opacity-60 cursor-not-allowed" : "";

    return (
      <div className="space-y-4">
        <button
          className={`flex items-center gap-2 text-[var(--tg-theme-button-color)]${restoreDisabledClass}`}
          disabled={isRestoring}
          type="button"
          onClick={() => setRestoreChoiceOpen(false)}
        >
          <ChevronLeft size={18} /> Назад
        </button>

        <h2 className="text-lg font-bold">
          Почему возвращается <span className="text-red-400">{selectedPlayer.name}</span>?
        </h2>

        <button
          className={`w-full bg-[var(--tg-theme-secondary-bg-color)] text-[var(--tg-theme-text-color)] p-4 rounded-lg text-left${restoreDisabledClass}`}
          disabled={isRestoring}
          type="button"
          onClick={() => void submitRestorePlayer("none")}
        >
          <div className="font-semibold">Вылет по ошибке</div>
          <div className="text-xs text-[var(--tg-theme-hint-color)]">Выбывание стирается, ре-энтри не засчитывается</div>
        </button>

        <button
          className={`w-full bg-[var(--tg-theme-button-color)] text-[var(--tg-theme-button-text-color)] p-4 rounded-lg text-left disabled:bg-[var(--tg-theme-secondary-bg-color)] disabled:text-[var(--tg-theme-hint-color)]${restoreDisabledClass}`}
          disabled={isRestoring || !reentryAvailable}
          type="button"
          onClick={() => void submitRestorePlayer("single")}
        >
          <div className="font-semibold">Ребай</div>
          <div className="text-xs opacity-80">
            {reentryAvailable ? "Выбивание остаётся, игроку засчитывается ре-энтри" : "Ре-энтри сейчас недоступен"}
          </div>
        </button>

        <button
          className={`w-full bg-[var(--tg-theme-button-color)] text-[var(--tg-theme-button-text-color)] p-4 rounded-lg text-left disabled:bg-[var(--tg-theme-secondary-bg-color)] disabled:text-[var(--tg-theme-hint-color)]${restoreDisabledClass}`}
          disabled={isRestoring || !doubleReentryAvailable}
          type="button"
          onClick={() => void submitRestorePlayer("double")}
        >
          <div className="font-semibold">Двойной ребай (x2)</div>
          <div className="text-xs opacity-80">
            {doubleReentryAvailable ? "Ре-энтри + отметка x2" : "x2 недоступен на текущем уровне"}
          </div>
        </button>
      </div>
    );
  }

  if (selectedPlayer) {
    return (
      <div className="space-y-4">
        <button
          className="flex items-center gap-2 text-[var(--tg-theme-button-color)]"
          type="button"
          onClick={closePlayerDetails}
        >
          <ChevronLeft size={18} /> Назад
        </button>

        <div className="bg-[var(--tg-theme-secondary-bg-color)] rounded-lg p-4 space-y-3">
          <div>
            <h1 className="text-xl font-bold">{formatPlayerNameWithRegistrationNumber(selectedPlayer)}</h1>
            <p className="text-sm text-[var(--tg-theme-hint-color)]">
              {selectedPlayer.status === "active" ? "Активен" : "Выбыл"}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <div className="text-[var(--tg-theme-hint-color)]">Стек</div>
              <div className="font-semibold">{selectedPlayer.stack.toLocaleString("ru-RU")}</div>
            </div>
            <div>
              <div className="text-[var(--tg-theme-hint-color)]">Аддоны</div>
              <div className="font-semibold">{selectedPlayerAddons} / {maxAddons}</div>
            </div>
            <div>
              <div className="text-[var(--tg-theme-hint-color)]">Стол</div>
              <div className="font-semibold">{selectedPlayer.table}</div>
            </div>
            <div>
              <div className="text-[var(--tg-theme-hint-color)]">Место</div>
              <div className="font-semibold">{selectedPlayer.seat}</div>
            </div>
          </div>
        </div>

        {selectedPlayer.status === "active" && (
          <div className="bg-[var(--tg-theme-secondary-bg-color)] rounded-lg p-4 space-y-3">
            <label className="block text-xs text-[var(--tg-theme-hint-color)]">
              Пересадить за стол
              <select
                className="mt-1 w-full bg-[var(--tg-theme-bg-color)] text-[var(--tg-theme-text-color)] border-none rounded p-3 outline-none"
                value={moveTable}
                onChange={(event) => setMoveTable(event.target.value)}
              >
                {tableOptions.map((tableNumber) => (
                  <option key={tableNumber} value={tableNumber}>
                    Стол {tableNumber}
                  </option>
                ))}
              </select>
            </label>
            <button
              className="w-full bg-[var(--tg-theme-button-color)] disabled:bg-[var(--tg-theme-bg-color)] text-[var(--tg-theme-button-text-color)] disabled:text-[var(--tg-theme-hint-color)] p-3 rounded flex items-center justify-center gap-2"
              disabled={Number(moveTable) === selectedPlayer.table}
              type="button"
              onClick={() => void submitMoveTable()}
            >
              <ArrowRightLeft size={18} /> Сохранить стол
            </button>
          </div>
        )}

        {selectedPlayer.status === "eliminated" && (
          <button
            className="w-full bg-[var(--tg-theme-button-color)] text-[var(--tg-theme-button-text-color)] p-3 rounded flex items-center justify-center gap-2"
            type="button"
            onClick={() => setRestoreChoiceOpen(true)}
          >
            <RotateCcw size={18} /> Вернуть в игру
          </button>
        )}

        {selectedPlayer.status === "active" ? (
          <button
            className="w-full bg-[var(--tg-theme-button-color)] disabled:bg-[var(--tg-theme-secondary-bg-color)] text-[var(--tg-theme-button-text-color)] disabled:text-[var(--tg-theme-hint-color)] p-3 rounded flex items-center justify-center gap-2"
            disabled={!selectedPlayerCanAddon}
            type="button"
            onClick={() => void submitAddon()}
          >
            <BadgePlus size={18} /> Добавить аддон
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-xl font-bold flex items-center gap-2">
          <Users size={20} /> Игроки сегодня
        </h1>
        <button 
          aria-label="Добавить игрока"
          onClick={() => {
            setShowAddForm(true);
            getTelegramWebApp()?.HapticFeedback.impactOccurred("light");
          }}
          className="bg-[var(--tg-theme-button-color)] text-[var(--tg-theme-button-text-color)] p-2 rounded-full"
        >
          <Plus size={20} />
        </button>
      </div>

      <Link
        className="mb-4 flex items-center justify-center gap-2 bg-[var(--tg-theme-secondary-bg-color)] p-3 rounded-lg text-sm font-medium"
        href="/tma/signups"
      >
        <ClipboardList size={16} /> Заявки на турнир
      </Link>

      <div className="flex justify-between text-sm text-[var(--tg-theme-hint-color)] mb-4 bg-[var(--tg-theme-secondary-bg-color)] p-3 rounded-lg">
        <span>Активных: <strong className="text-white">{activeCount}</strong></span>
        <span>Выбыло: <strong className="text-white">{elimCount}</strong></span>
      </div>

      <label className="block text-xs text-[var(--tg-theme-hint-color)] mb-4">
        Фильтр по столу
        <select
          className="mt-1 w-full bg-[var(--tg-theme-secondary-bg-color)] text-[var(--tg-theme-text-color)] border-none rounded p-3 outline-none"
          value={tableFilter}
          onChange={(event) => setTableFilter(event.target.value)}
        >
          <option value="">Все столы</option>
          {tableOptions.map((tableNumber) => (
            <option key={tableNumber} value={tableNumber}>
              Стол {tableNumber}
            </option>
          ))}
        </select>
      </label>

      <div className="space-y-2">
        {visiblePlayers.map((p) => (
          <div
            key={p.id}
            className="flex items-center justify-between p-3 bg-[var(--tg-theme-secondary-bg-color)] rounded-lg"
          >
            <button
              className="flex items-center gap-3 min-w-0 text-left flex-1"
              type="button"
              onClick={() => {
                setMoveTable(String(p.table || 1));
                setSelectedPlayerId(p.id);
                getTelegramWebApp()?.HapticFeedback.impactOccurred("light");
              }}
            >
              <div className={`w-3 h-3 rounded-full ${p.status === "active" ? "bg-green-500" : "bg-red-500"}`} />
              <div className="min-w-0">
                <div className="font-semibold">{formatPlayerNameWithRegistrationNumber(p)}</div>
                <div className="text-xs text-[var(--tg-theme-hint-color)]">
                  {p.status === "active" ? `Ст. ${p.table} / Место ${p.seat} / Стек: ${p.stack}` : "Выбыл"}
                </div>
              </div>
            </button>
            {p.status === "active" && (
               <button onClick={() => handleDelete(p.id)} className="text-red-400 p-2">
                 <Trash2 size={16} />
               </button>
            )}
          </div>
        ))}
        {visiblePlayers.length === 0 && (
          <div className="text-center text-[var(--tg-theme-hint-color)] py-10">
            Нет игроков
          </div>
        )}
      </div>
    </div>
  );
}
