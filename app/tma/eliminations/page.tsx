"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getTelegramWebApp, useTMA } from "../layout";
import { isDealerLabel } from "@/lib/player-labels";
import { DEALER_KNOCKOUT_POINTS } from "@/lib/pts-rating";
import { useVisiblePolling } from "../use-visible-polling";
import { ChevronLeft, Skull, Search, Undo2, CheckSquare, Square } from "lucide-react";

type Player = { id: string; name: string; rebuys?: number; status: "active" | "eliminated"; table?: number | null; label?: string | null };
type BountyType = "standard" | "mystery" | "dealer";
type PlayersResponse = {
  bountyType?: BountyType;
  isBounty?: boolean;
  maxReentries?: number;
  players?: Player[];
  reentryAvailable?: boolean;
  doubleReentryAvailable?: boolean;
  reentryEnabled?: boolean;
  tablesCount?: number;
};

function createClientRequestId() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
}

export default function TMAEliminationsPage() {
  const { initData } = useTMA();
  const [players, setPlayers] = useState<Player[]>([]);
  const [isBounty, setIsBounty] = useState(false);
  const [bountyType, setBountyType] = useState<BountyType>("standard");
  const [reentryAvailable, setReentryAvailable] = useState(true);
  const [doubleReentryAvailable, setDoubleReentryAvailable] = useState(false);
  const [reentryEnabled, setReentryEnabled] = useState(false);
  const [maxReentries, setMaxReentries] = useState(1);
  const [tablesCount, setTablesCount] = useState(1);
  const [tableFilter, setTableFilter] = useState("");
  const [step, setStep] = useState<0 | 1 | 2 | 3 | 4>(0);
  
  const [eliminatedPlayer, setEliminatedPlayer] = useState<Player | null>(null);
  const [selectedKillers, setSelectedKillers] = useState<Player[]>([]);
  const [search, setSearch] = useState("");
  const [isMulti, setIsMulti] = useState(false);
  const [mysteryPoints, setMysteryPoints] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [lastElimId, setLastElimId] = useState<string | null>(null);
  const [lastElimPlayerName, setLastElimPlayerName] = useState<string | null>(null);
  const [lastSheetInfo, setLastSheetInfo] = useState<{rowId: number, sheetName: string} | null>(null);
  const confirmInFlightRef = useRef(false);
  const submitInFlightRef = useRef(false);
  const clientRequestIdRef = useRef<string | null>(null);

  const applyPlayersResponse = useCallback((data: PlayersResponse) => {
    setIsBounty(Boolean(data.isBounty));
    setBountyType((data.bountyType as BountyType) || "standard");
    setMaxReentries(Number(data.maxReentries) || 1);
    setReentryAvailable(data.reentryAvailable !== false);
    setDoubleReentryAvailable(Boolean(data.doubleReentryAvailable));
    setReentryEnabled(Boolean(data.reentryEnabled));
    setTablesCount(Math.max(1, Number(data.tablesCount ?? 1)));
    setPlayers(data.players || []);
  }, []);

  const fetchPlayers = useCallback(async () => {
    const res = await fetch("/api/tma/players", { headers: { "X-Telegram-Init-Data": initData } });
    if (res.ok) {
      const data = (await res.json()) as PlayersResponse;
      applyPlayersResponse(data);
      return data;
    }
    return null;
  }, [applyPlayersResponse, initData]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void fetchPlayers();
      const storedId = localStorage.getItem("tma_last_elim");
      const storedPlayerName = localStorage.getItem("tma_last_elim_player_name");
      const storedSheet = localStorage.getItem("tma_last_elim_sheet");
      if (storedId) setLastElimId(storedId);
      if (storedPlayerName) setLastElimPlayerName(storedPlayerName);
      if (storedSheet) setLastSheetInfo(JSON.parse(storedSheet));
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [fetchPlayers]);
  useVisiblePolling(() => void fetchPlayers(), step === 0);

  const tableOptions = useMemo(
    () => Array.from({ length: tablesCount }, (_, index) => index + 1),
    [tablesCount],
  );
  const selectedTableNumber = tableFilter ? Number(tableFilter) : null;
  const activePlayers = players.filter(p => p.status === "active");
  const visibleActivePlayers = selectedTableNumber
    ? activePlayers.filter((player) => player.table === selectedTableNumber)
    : activePlayers;
  const canPlayerUseReentry = useCallback(
    (player: Player | null, data?: PlayersResponse | null) => {
      if (!player) return false;

      const latestMaxReentries = Number(data?.maxReentries ?? maxReentries) || 1;
      const latestReentryEnabled = data ? Boolean(data.reentryEnabled) : reentryEnabled;
      const latestReentryAvailable = data ? data.reentryAvailable !== false : reentryAvailable;

      return (
        latestReentryEnabled &&
        latestReentryAvailable &&
        (player.rebuys ?? 0) < latestMaxReentries
      );
    },
    [maxReentries, reentryAvailable, reentryEnabled],
  );

  const startElimination = (p: Player) => {
    const tg = getTelegramWebApp();
    tg?.HapticFeedback?.impactOccurred?.("medium");
    setEliminatedPlayer(p);
    setSelectedKillers([]);
    setIsMulti(false);
    setSearch("");
    setMysteryPoints("");
    clientRequestIdRef.current = null;
    setStep(isBounty ? 1 : 2);
  };

  const returnToEliminationsList = useCallback(() => {
    setStep(0);
    setEliminatedPlayer(null);
    setSelectedKillers([]);
    setIsMulti(false);
    setSearch("");
    setMysteryPoints("");
    clientRequestIdRef.current = null;
  }, []);

  const toggleKiller = (p: Player) => {
    const tg = getTelegramWebApp();
    tg?.HapticFeedback?.impactOccurred?.("light");
    if (!isMulti) {
      setSelectedKillers([p]);
      if (isBounty && bountyType === "mystery") {
        setStep(4); // Go to mystery points input
      } else {
        setStep(2); // Go straight to confirm
      }
    } else {
      if (selectedKillers.find(k => k.id === p.id)) {
        setSelectedKillers(selectedKillers.filter(k => k.id !== p.id));
      } else {
        setSelectedKillers([...selectedKillers, p]);
      }
    }
  };

  const submitElimination = useCallback(async (usesReentry: boolean, reentryDouble = false) => {
    if (!eliminatedPlayer || submitInFlightRef.current) return;

    submitInFlightRef.current = true;
    setIsSubmitting(true);
    const tg = getTelegramWebApp();
    tg?.MainButton?.showProgress?.();
    
    try {
      const share = selectedKillers.length > 0 ? 1 / selectedKillers.length : 0;
      clientRequestIdRef.current ||= createClientRequestId();
      
      const mysteryPointsValue = bountyType === "mystery" ? Number(mysteryPoints) || 0 : 0;
      
      const payload = {
        client_request_id: clientRequestIdRef.current,
        eliminated_id: eliminatedPlayer!.id,
        bounty_split: isBounty && selectedKillers.length > 1,
        killers: isBounty ? selectedKillers.map(k => ({ id: k.id, name: k.name, share })) : [],
        mystery_bounty_points: mysteryPointsValue,
        uses_reentry: usesReentry,
        reentry_double: usesReentry && reentryDouble,
      };

      const res = await fetch("/api/tma/eliminations", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Telegram-Init-Data": initData },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        const data = await res.json();
        tg?.HapticFeedback?.notificationOccurred?.("success");
        
        localStorage.setItem("tma_last_elim", data.elimination.id);
        localStorage.setItem("tma_last_elim_player_name", data.elimination.eliminated_name || eliminatedPlayer.name);
        if (data.sheetsRowId) {
          const sheetInfo = { rowId: data.sheetsRowId, sheetName: data.sheetName };
          localStorage.setItem("tma_last_elim_sheet", JSON.stringify(sheetInfo));
          setLastSheetInfo(sheetInfo);
        }

        setLastElimId(data.elimination.id);
        setLastElimPlayerName(data.elimination.eliminated_name || eliminatedPlayer.name);
        setStep(0);
        setEliminatedPlayer(null);
        setSelectedKillers([]);
        setMysteryPoints("");
        clientRequestIdRef.current = null;
        void fetchPlayers();
      } else {
        tg?.showAlert("Ошибка сохранения");
      }
    } finally {
      submitInFlightRef.current = false;
      setIsSubmitting(false);
      tg?.MainButton?.hideProgress?.();
      tg?.MainButton?.hide?.();
    }
  }, [eliminatedPlayer, fetchPlayers, initData, isBounty, bountyType, mysteryPoints, selectedKillers]);

  const confirmElimination = useCallback(async () => {
    if (confirmInFlightRef.current || submitInFlightRef.current) return;

    confirmInFlightRef.current = true;
    setIsSubmitting(true);
    try {
      const data = await fetchPlayers();
      const latestPlayer =
        data?.players?.find((player) => player.id === eliminatedPlayer?.id) ?? eliminatedPlayer;

      if (data && latestPlayer?.status !== "active") {
        const tg = getTelegramWebApp();
        tg?.showAlert("Игрок уже выбыл");
        returnToEliminationsList();
        return;
      }

      if (canPlayerUseReentry(latestPlayer, data)) {
        setEliminatedPlayer(latestPlayer);
        setStep(3);
        return;
      }

      await submitElimination(false);
    } finally {
      confirmInFlightRef.current = false;
      if (!submitInFlightRef.current) setIsSubmitting(false);
    }
  }, [canPlayerUseReentry, eliminatedPlayer, fetchPlayers, returnToEliminationsList, submitElimination]);

  const handleUndo = async () => {
    const tg = getTelegramWebApp();
    const fallbackPlayerName = players.find((player) => player.status === "eliminated")?.name;
    const playerName = lastElimPlayerName || fallbackPlayerName || "выбранного игрока";
    tg?.showConfirm(`Вы уверены, что хотите отменить выбивание игрока ${playerName}?`, async (confirmed: boolean) => {
      if (confirmed && lastElimId) {
        await fetch(`/api/tma/eliminations/${lastElimId}/cancel`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Telegram-Init-Data": initData },
          body: JSON.stringify(lastSheetInfo || {})
        });
        tg.HapticFeedback?.notificationOccurred?.("success");
        localStorage.removeItem("tma_last_elim");
        localStorage.removeItem("tma_last_elim_player_name");
        localStorage.removeItem("tma_last_elim_sheet");
        setLastElimId(null);
        setLastElimPlayerName(null);
        setLastSheetInfo(null);
        void fetchPlayers();
      }
    });
  };

  const disabledClass = isSubmitting ? " opacity-60 cursor-not-allowed" : "";

  // Telegram MainButton integration
  useEffect(() => {
    const tg = getTelegramWebApp();
    const mainButton = tg?.MainButton;
    if (!mainButton) return;

    if (step === 1 && isBounty && isMulti) {
      const hasKillers = selectedKillers.length > 0;
      mainButton.setText(isSubmitting ? "СОХРАНЯЕМ..." : `ДАЛЕЕ (${selectedKillers.length})`);
      if (hasKillers) {
        mainButton.enable?.();
        mainButton.show();
      } else {
        mainButton.disable?.();
        mainButton.show();
      }
      const onClick = () => {
        if (!isSubmitting && selectedKillers.length > 0) {
          if (bountyType === "mystery") {
            setStep(4); // Go to mystery points input
          } else {
            setStep(2);
          }
        }
      };
      mainButton.onClick(onClick);
      return () => { mainButton.offClick(onClick); mainButton.hide(); };
    }
    
    if (step === 2) {
      mainButton.setText(isSubmitting ? "СОХРАНЯЕМ..." : "✅ ПОДТВЕРДИТЬ ВЫБЫВАНИЕ");
      mainButton.show();
      const onClick = () => {
        if (isSubmitting) return;
        void confirmElimination();
      };
      mainButton.onClick(onClick);
      return () => { mainButton.offClick(onClick); mainButton.hide(); };
    }

    mainButton.hide();
  }, [step, isBounty, bountyType, isMulti, selectedKillers, eliminatedPlayer, confirmElimination, isSubmitting]);

  if (step === 0) {
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-bold flex items-center gap-2 mb-4">
          <Skull size={20} /> Выбывания
        </h1>
        <div className="bg-[var(--tg-theme-secondary-bg-color)] p-4 rounded-xl text-sm mb-4">
          Нажмите на игрока, чтобы зафиксировать его вылет из турнира.
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
        
        {lastElimId && (
          <button
            className={`w-full bg-[var(--tg-theme-secondary-bg-color)] text-[var(--tg-theme-hint-color)] p-3 rounded-lg flex items-center justify-center gap-2 mb-4${disabledClass}`}
            disabled={isSubmitting}
            onClick={() => {
              if (!isSubmitting) void handleUndo();
            }}
          >
            <Undo2 size={16} /> Отменить последнее выбывание
          </button>
        )}

        <div className="space-y-2">
          {visibleActivePlayers.map(p => (
            <button 
              disabled={isSubmitting}
              key={p.id} 
              onClick={() => {
                if (!isSubmitting) startElimination(p);
              }}
              className={`w-full text-left p-4 bg-[var(--tg-theme-secondary-bg-color)] rounded-lg font-semibold${disabledClass}`}
            >
              🟢 {p.name}
            </button>
          ))}
          {visibleActivePlayers.length === 0 && <div className="text-center text-gray-500 py-10">{selectedTableNumber ? "Нет активных игроков за этим столом" : "Все выбыли"}</div>}
        </div>
      </div>
    );
  }

  if (step === 1) {
    const filtered = activePlayers.filter(
      (p) =>
        p.id !== eliminatedPlayer?.id &&
        (!selectedTableNumber || p.table === eliminatedPlayer?.table) &&
        p.name.toLowerCase().includes(search.toLowerCase()),
    );
    return (
      <div className="space-y-4">
        <button
          className={`flex items-center gap-2 text-[var(--tg-theme-button-color)]${disabledClass}`}
          disabled={isSubmitting}
          type="button"
          onClick={() => {
            if (!isSubmitting) returnToEliminationsList();
          }}
        >
          <ChevronLeft size={18} /> Назад к списку
        </button>

        <h2 className="text-lg font-bold">Кто выбил: <span className="text-red-400">{eliminatedPlayer?.name}</span>?</h2>
        
        <div className="relative">
          <Search className="absolute left-3 top-3 text-[var(--tg-theme-hint-color)]" size={18} />
          <input 
            type="text" 
            placeholder="Поиск..." 
            className="w-full bg-[var(--tg-theme-secondary-bg-color)] border-none rounded-lg p-3 pl-10 outline-none"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        <div className="flex gap-2">
          <button
            disabled={isSubmitting}
            onClick={() => {
              if (!isSubmitting) setIsMulti(!isMulti);
            }}
            className={`flex-1 p-3 rounded-lg text-sm font-medium ${isMulti ? "bg-[var(--tg-theme-button-color)] text-white" : "bg-[var(--tg-theme-secondary-bg-color)] text-[var(--tg-theme-text-color)]"}${disabledClass}`}
          >
            👥 Поделить баунти
          </button>
        </div>

        <div className="space-y-2 mt-4">
          {filtered.map(p => {
            const isSelected = selectedKillers.some(k => k.id === p.id);
            return (
              <button 
                disabled={isSubmitting}
                key={p.id} 
                onClick={() => {
                  if (!isSubmitting) toggleKiller(p);
                }}
                className={`w-full text-left p-4 rounded-lg flex items-center justify-between ${isSelected ? "bg-[var(--tg-theme-button-color)] text-white" : "bg-[var(--tg-theme-secondary-bg-color)]"}${disabledClass}`}
              >
                <span>{p.name}</span>
                {isMulti && (isSelected ? <CheckSquare size={18} /> : <Square size={18} />)}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  if (step === 2) {
    return (
      <div className="space-y-6 text-center pt-8">
        <h2 className="text-2xl font-bold mb-6">✅ Всё верно?</h2>
        
        <div className="bg-[var(--tg-theme-secondary-bg-color)] p-6 rounded-xl space-y-4">
          <div>
            <div className="text-[var(--tg-theme-hint-color)] text-sm mb-1">Выбывает</div>
            <div className="text-xl font-bold text-red-400">{eliminatedPlayer?.name}</div>
            <div className="text-sm mt-1">Место: #{activePlayers.length}</div>
          </div>
          <div className="h-px bg-[var(--tg-theme-hint-color)] opacity-20"></div>
          {isBounty ? (
            <div>
              <div className="text-[var(--tg-theme-hint-color)] text-sm mb-1">Баунти</div>
              {selectedKillers.length === 0 ? (
                <div className="text-lg font-bold">Никто</div>
              ) : (
                <div className="space-y-1">
                  {selectedKillers.map(k => (
                    <div key={k.id} className="text-lg font-bold">
                      {k.name} <span className="text-sm text-[var(--tg-theme-hint-color)]">({(1 / selectedKillers.length).toFixed(2)})</span>
                    </div>
                  ))}
                </div>
              )}
              {bountyType === "mystery" && (
                <div className="mt-3">
                  <div className="text-[var(--tg-theme-hint-color)] text-sm mb-1">🎲 Очки из конверта</div>
                  <div className="text-xl font-bold text-yellow-400">{Number(mysteryPoints) || 0} PTS</div>
                </div>
              )}
              {bountyType === "dealer" && isDealerLabel(eliminatedPlayer?.label) && selectedKillers.length > 0 && (
                <div className="mt-3">
                  <div className="text-[var(--tg-theme-hint-color)] text-sm mb-1">🎯 Выбит дилер</div>
                  <div className="text-xl font-bold text-yellow-400">
                    {selectedKillers.length > 1
                      ? `по ${Number((DEALER_KNOCKOUT_POINTS / selectedKillers.length).toFixed(2))} PTS каждому`
                      : `+${DEALER_KNOCKOUT_POINTS} PTS`}
                  </div>
                </div>
              )}
            </div>
          ) : null}
        </div>

        <button
          disabled={isSubmitting}
          onClick={() => {
            if (!isSubmitting) void confirmElimination();
          }}
          className={`w-full p-4 bg-[var(--tg-theme-button-color)] text-white rounded-lg font-semibold${disabledClass}`}
        >
          {isSubmitting ? "Сохраняем..." : "Подтвердить выбывание"}
        </button>

        <button 
          disabled={isSubmitting}
          onClick={() => {
            if (!isSubmitting) returnToEliminationsList();
          }}
          className={`text-[var(--tg-theme-hint-color)] underline mt-4${disabledClass}`}
        >
          Отмена (назад)
        </button>
      </div>
    );
  }

  if (step === 3) {
    return (
      <div className="space-y-6 text-center pt-8">
        <h2 className="text-2xl font-bold">Использует ли игрок ре-энтри?</h2>
        <div className="bg-[var(--tg-theme-secondary-bg-color)] p-6 rounded-xl">
          <div className="text-[var(--tg-theme-hint-color)] text-sm mb-1">Игрок</div>
          <div className="text-xl font-bold text-red-400">{eliminatedPlayer?.name}</div>
        </div>
        {doubleReentryAvailable ? (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <button
                disabled={isSubmitting}
                onClick={() => {
                  if (!isSubmitting) void submitElimination(true, false);
                }}
                className={`p-4 bg-[var(--tg-theme-button-color)] text-white rounded-lg font-semibold${disabledClass}`}
              >
                {isSubmitting ? "Сохраняем..." : "Одинарный"}
              </button>
              <button
                disabled={isSubmitting}
                onClick={() => {
                  if (!isSubmitting) void submitElimination(true, true);
                }}
                className={`p-4 bg-[var(--tg-theme-button-color)] text-white rounded-lg font-semibold${disabledClass}`}
              >
                {isSubmitting ? "Сохраняем..." : "Двойной (x2)"}
              </button>
            </div>
            <button
              disabled={isSubmitting}
              onClick={() => {
                if (!isSubmitting) void submitElimination(false);
              }}
              className={`w-full p-4 bg-red-900/30 text-red-400 rounded-lg font-semibold${disabledClass}`}
            >
              {isSubmitting ? "Сохраняем..." : "Нет"}
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <button
              disabled={isSubmitting}
              onClick={() => {
                if (!isSubmitting) void submitElimination(true);
              }}
              className={`p-4 bg-[var(--tg-theme-button-color)] text-white rounded-lg font-semibold${disabledClass}`}
            >
              {isSubmitting ? "Сохраняем..." : "Да"}
            </button>
            <button
              disabled={isSubmitting}
              onClick={() => {
                if (!isSubmitting) void submitElimination(false);
              }}
              className={`p-4 bg-red-900/30 text-red-400 rounded-lg font-semibold${disabledClass}`}
            >
              {isSubmitting ? "Сохраняем..." : "Нет"}
            </button>
          </div>
        )}
        <button
          disabled={isSubmitting}
          onClick={() => {
            if (!isSubmitting) setStep(2);
          }}
          className={`text-[var(--tg-theme-hint-color)] underline mt-4${disabledClass}`}
        >
          Назад
        </button>
      </div>
    );
  }

  if (step === 4) {
    return (
      <div className="space-y-6 text-center pt-8">
        <button
          className={`flex items-center gap-2 text-[var(--tg-theme-button-color)]${disabledClass}`}
          disabled={isSubmitting}
          type="button"
          onClick={() => {
            if (!isSubmitting) setStep(1);
          }}
        >
          <ChevronLeft size={18} /> Назад
        </button>

        <h2 className="text-2xl font-bold">🎲 Mystery Bounty</h2>
        <div className="bg-[var(--tg-theme-secondary-bg-color)] p-6 rounded-xl space-y-4">
          <div>
            <div className="text-[var(--tg-theme-hint-color)] text-sm mb-1">Выбывает</div>
            <div className="text-xl font-bold text-red-400">{eliminatedPlayer?.name}</div>
          </div>
          <div className="h-px bg-[var(--tg-theme-hint-color)] opacity-20"></div>
          <div>
            <div className="text-[var(--tg-theme-hint-color)] text-sm mb-2">Сколько очков в конверте?</div>
            <input
              autoFocus
              className="w-full bg-[var(--tg-theme-bg-color)] border border-[var(--tg-theme-hint-color)] rounded-lg p-4 text-center text-2xl font-bold outline-none"
              inputMode="decimal"
              min={0}
              placeholder="0"
              type="number"
              value={mysteryPoints}
              onChange={(e) => setMysteryPoints(e.target.value)}
            />
            <div className="text-[var(--tg-theme-hint-color)] text-xs mt-2">Введите 0, если очки не выпали</div>
          </div>
        </div>

        <button
          disabled={isSubmitting}
          onClick={() => {
            if (!isSubmitting) setStep(2);
          }}
          className={`w-full p-4 bg-[var(--tg-theme-button-color)] text-white rounded-lg font-semibold${disabledClass}`}
        >
          Далее →
        </button>
      </div>
    );
  }

  return null;
}
