"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getTelegramWebApp, useTMA } from "../layout";
import { ChevronLeft, Skull, Search, Undo2, CheckSquare, Square } from "lucide-react";

type Player = { id: string; name: string; rebuys?: number; status: "active" | "eliminated"; table?: number | null };

export default function TMAEliminationsPage() {
  const { initData } = useTMA();
  const [players, setPlayers] = useState<Player[]>([]);
  const [isBounty, setIsBounty] = useState(false);
  const [reentryAvailable, setReentryAvailable] = useState(true);
  const [reentryEnabled, setReentryEnabled] = useState(false);
  const [maxReentries, setMaxReentries] = useState(1);
  const [tablesCount, setTablesCount] = useState(1);
  const [tableFilter, setTableFilter] = useState("");
  const [step, setStep] = useState<0 | 1 | 2 | 3>(0);
  
  const [eliminatedPlayer, setEliminatedPlayer] = useState<Player | null>(null);
  const [selectedKillers, setSelectedKillers] = useState<Player[]>([]);
  const [search, setSearch] = useState("");
  const [isMulti, setIsMulti] = useState(false);
  const [lastElimId, setLastElimId] = useState<string | null>(null);
  const [lastSheetInfo, setLastSheetInfo] = useState<{rowId: number, sheetName: string} | null>(null);

  const fetchPlayers = useCallback(async () => {
    const res = await fetch("/api/tma/players", { headers: { "X-Telegram-Init-Data": initData } });
    if (res.ok) {
      const data = await res.json();
      setIsBounty(Boolean(data.isBounty));
      setMaxReentries(Number(data.maxReentries) || 1);
      setReentryAvailable(data.reentryAvailable !== false);
      setReentryEnabled(Boolean(data.reentryEnabled));
      setTablesCount(Math.max(1, Number(data.tablesCount ?? 1)));
      setPlayers(data.players || []);
    }
  }, [initData]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void fetchPlayers();
      const storedId = localStorage.getItem("tma_last_elim");
      const storedSheet = localStorage.getItem("tma_last_elim_sheet");
      if (storedId) setLastElimId(storedId);
      if (storedSheet) setLastSheetInfo(JSON.parse(storedSheet));
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [fetchPlayers]);

  const tableOptions = useMemo(
    () => Array.from({ length: tablesCount }, (_, index) => index + 1),
    [tablesCount],
  );
  const selectedTableNumber = tableFilter ? Number(tableFilter) : null;
  const activePlayers = players.filter(p => p.status === "active");
  const visibleActivePlayers = selectedTableNumber
    ? activePlayers.filter((player) => player.table === selectedTableNumber)
    : activePlayers;
  const canAskForReentry = Boolean(
    eliminatedPlayer &&
    reentryEnabled &&
    reentryAvailable &&
    (eliminatedPlayer.rebuys ?? 0) < maxReentries,
  );

  const startElimination = (p: Player) => {
    const tg = getTelegramWebApp();
    tg?.HapticFeedback.impactOccurred("medium");
    setEliminatedPlayer(p);
    setSelectedKillers([]);
    setIsMulti(false);
    setSearch("");
    setStep(isBounty ? 1 : 2);
  };

  const returnToEliminationsList = () => {
    setStep(0);
    setEliminatedPlayer(null);
    setSelectedKillers([]);
    setIsMulti(false);
    setSearch("");
  };

  const toggleKiller = (p: Player) => {
    const tg = getTelegramWebApp();
    tg?.HapticFeedback.impactOccurred("light");
    if (!isMulti) {
      setSelectedKillers([p]);
      setStep(2); // Go straight to confirm
    } else {
      if (selectedKillers.find(k => k.id === p.id)) {
        setSelectedKillers(selectedKillers.filter(k => k.id !== p.id));
      } else {
        setSelectedKillers([...selectedKillers, p]);
      }
    }
  };

  const submitElimination = useCallback(async (usesReentry: boolean) => {
    const tg = getTelegramWebApp();
    tg?.MainButton.showProgress();
    
    try {
      const share = selectedKillers.length > 0 ? 1 / selectedKillers.length : 0;
      
      const payload = {
        eliminated_id: eliminatedPlayer!.id,
        bounty_split: isBounty && selectedKillers.length > 1,
        killers: isBounty ? selectedKillers.map(k => ({ id: k.id, name: k.name, share })) : [],
        uses_reentry: usesReentry,
      };

      const res = await fetch("/api/tma/eliminations", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Telegram-Init-Data": initData },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        const data = await res.json();
        tg?.HapticFeedback.notificationOccurred("success");
        
        localStorage.setItem("tma_last_elim", data.elimination.id);
        if (data.sheetsRowId) {
          const sheetInfo = { rowId: data.sheetsRowId, sheetName: data.sheetName };
          localStorage.setItem("tma_last_elim_sheet", JSON.stringify(sheetInfo));
          setLastSheetInfo(sheetInfo);
        }

        setLastElimId(data.elimination.id);
        setStep(0);
        setEliminatedPlayer(null);
        setSelectedKillers([]);
        void fetchPlayers();
      } else {
        tg?.showAlert("Ошибка сохранения");
      }
    } finally {
      tg?.MainButton.hideProgress();
      tg?.MainButton.hide();
    }
  }, [eliminatedPlayer, fetchPlayers, initData, isBounty, selectedKillers]);

  const handleUndo = async () => {
    const tg = getTelegramWebApp();
    tg?.showConfirm("Отменить последнее выбывание?", async (confirmed: boolean) => {
      if (confirmed && lastElimId) {
        await fetch(`/api/tma/eliminations/${lastElimId}/cancel`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Telegram-Init-Data": initData },
          body: JSON.stringify(lastSheetInfo || {})
        });
        tg.HapticFeedback.notificationOccurred("success");
        localStorage.removeItem("tma_last_elim");
        localStorage.removeItem("tma_last_elim_sheet");
        setLastElimId(null);
        setLastSheetInfo(null);
        void fetchPlayers();
      }
    });
  };

  // Telegram MainButton integration
  useEffect(() => {
    const tg = getTelegramWebApp();
    if (!tg) return;

    if (step === 1 && isBounty && isMulti) {
      tg.MainButton.setText(`ДАЛЕЕ (${selectedKillers.length})`);
      tg.MainButton.show();
      const onClick = () => setStep(2);
      tg.MainButton.onClick(onClick);
      return () => { tg.MainButton.offClick(onClick); tg.MainButton.hide(); };
    } 
    
    if (step === 2) {
      tg.MainButton.setText("✅ ПОДТВЕРДИТЬ ВЫБЫВАНИЕ");
      tg.MainButton.show();
      const onClick = () => {
        if (canAskForReentry) {
          setStep(3);
        } else {
          void submitElimination(false);
        }
      };
      tg.MainButton.onClick(onClick);
      return () => { tg.MainButton.offClick(onClick); tg.MainButton.hide(); };
    }

    tg.MainButton.hide();
  }, [step, isBounty, isMulti, selectedKillers, eliminatedPlayer, canAskForReentry, submitElimination]);

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
          <button onClick={handleUndo} className="w-full bg-[var(--tg-theme-secondary-bg-color)] text-[var(--tg-theme-hint-color)] p-3 rounded-lg flex items-center justify-center gap-2 mb-4">
            <Undo2 size={16} /> Отменить последнее выбывание
          </button>
        )}

        <div className="space-y-2">
          {visibleActivePlayers.map(p => (
            <button 
              key={p.id} 
              onClick={() => startElimination(p)}
              className="w-full text-left p-4 bg-[var(--tg-theme-secondary-bg-color)] rounded-lg font-semibold"
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
          className="flex items-center gap-2 text-[var(--tg-theme-button-color)]"
          type="button"
          onClick={returnToEliminationsList}
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
            onClick={() => setIsMulti(!isMulti)} 
            className={`flex-1 p-3 rounded-lg text-sm font-medium ${isMulti ? "bg-[var(--tg-theme-button-color)] text-white" : "bg-[var(--tg-theme-secondary-bg-color)] text-[var(--tg-theme-text-color)]"}`}
          >
            👥 Поделить баунти
          </button>
          <button 
            onClick={() => { setSelectedKillers([]); setStep(2); }} 
            className="flex-1 p-3 bg-red-900/30 text-red-400 rounded-lg text-sm font-medium"
          >
            🚫 Никто
          </button>
        </div>

        <div className="space-y-2 mt-4">
          {filtered.map(p => {
            const isSelected = selectedKillers.some(k => k.id === p.id);
            return (
              <button 
                key={p.id} 
                onClick={() => toggleKiller(p)}
                className={`w-full text-left p-4 rounded-lg flex items-center justify-between ${isSelected ? "bg-[var(--tg-theme-button-color)] text-white" : "bg-[var(--tg-theme-secondary-bg-color)]"}`}
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
            </div>
          ) : null}
        </div>

        <button 
          onClick={returnToEliminationsList}
          className="text-[var(--tg-theme-hint-color)] underline mt-4"
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
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => void submitElimination(true)}
            className="p-4 bg-[var(--tg-theme-button-color)] text-white rounded-lg font-semibold"
          >
            Да
          </button>
          <button
            onClick={() => void submitElimination(false)}
            className="p-4 bg-red-900/30 text-red-400 rounded-lg font-semibold"
          >
            Нет
          </button>
        </div>
        <button
          onClick={() => setStep(2)}
          className="text-[var(--tg-theme-hint-color)] underline mt-4"
        >
          Назад
        </button>
      </div>
    );
  }

  return null;
}
