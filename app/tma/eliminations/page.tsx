"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getTelegramWebApp, useTMA } from "../layout";
import { isDealerLabel } from "@/lib/player-labels";
import { DEALER_KNOCKOUT_POINTS, getProgressiveHeadPoints, WANTED_KNOCKOUT_POINTS } from "@/lib/pts-rating";
import {
  describeMysteryPrize,
  MYSTERY_BIG_BLIND_AMOUNTS,
  MYSTERY_POINT_AMOUNTS,
  type MysteryPrize,
} from "@/lib/mystery/prizes";
import { useVisiblePolling } from "../use-visible-polling";
import { ChevronLeft, Skull, Search, Undo2, CheckSquare, Square } from "lucide-react";

type Player = { id: string; name: string; progressiveKnockouts?: number; rebuys?: number; doubleRebuys?: number; status: "active" | "eliminated"; table?: number | null; label?: string | null };
type BountyType = "standard" | "mystery" | "dealer" | "wanted" | "progressive";
type PlayersResponse = {
  bountyType?: BountyType;
  isBounty?: boolean;
  maxReentries?: number;
  players?: Player[];
  ptsBountyPoints?: number;
  reentryAvailable?: boolean;
  doubleReentryAvailable?: boolean;
  reentryEnabled?: boolean;
  tablesCount?: number;
};

// The prize deck the dealer reads off the card, in the order the questions are asked.
type PrizeStage = "kind" | "bigBlinds" | "points" | "pass";

type MysteryPassNote = { nickname: string; vip: boolean };

function createClientRequestId() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
}

// A failed elimination must be impossible to miss: the admin has to know to repeat it.
// showAlert is missing outside Telegram (and on old clients), so fall back to the browser
// dialog rather than letting the failure pass unseen.
function notifyEliminationFailed(
  tg: ReturnType<typeof getTelegramWebApp>,
  message: string,
) {
  tg?.HapticFeedback?.notificationOccurred?.("error");

  if (tg?.showAlert) {
    tg.showAlert(message);
    return;
  }

  globalThis.alert?.(message);
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
  const [ptsBountyPoints, setPtsBountyPoints] = useState(0);
  const [tablesCount, setTablesCount] = useState(1);
  const [tableFilter, setTableFilter] = useState("");
  const [step, setStep] = useState<0 | 1 | 2 | 3 | 4>(0);
  
  const [eliminatedPlayer, setEliminatedPlayer] = useState<Player | null>(null);
  const [selectedKillers, setSelectedKillers] = useState<Player[]>([]);
  const [search, setSearch] = useState("");
  const [isMulti, setIsMulti] = useState(false);
  // Mystery Bounty: every killer draws their own card, so the prize is kept per killer.
  const [mysteryPrizes, setMysteryPrizes] = useState<Record<string, MysteryPrize>>({});
  const [prizeKillerIndex, setPrizeKillerIndex] = useState(0);
  const [prizeStage, setPrizeStage] = useState<PrizeStage>("kind");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [lastElimId, setLastElimId] = useState<string | null>(null);
  const [lastElimPlayerName, setLastElimPlayerName] = useState<string | null>(null);
  const [lastSheetInfo, setLastSheetInfo] = useState<{rowId: number, sheetName: string} | null>(null);
  // Passes the last knockout paid out, so undoing a misclick can take them back.
  const [lastElimPasses, setLastElimPasses] = useState<MysteryPassNote[]>([]);
  const confirmInFlightRef = useRef(false);
  const submitInFlightRef = useRef(false);
  const clientRequestIdRef = useRef<string | null>(null);

  const applyPlayersResponse = useCallback((data: PlayersResponse) => {
    setIsBounty(Boolean(data.isBounty));
    setBountyType((data.bountyType as BountyType) || "standard");
    setMaxReentries(Number(data.maxReentries) || 1);
    setPtsBountyPoints(Math.max(0, Number(data.ptsBountyPoints) || 0));
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
      const storedPasses = localStorage.getItem("tma_last_elim_passes");
      if (storedId) setLastElimId(storedId);
      if (storedPlayerName) setLastElimPlayerName(storedPlayerName);
      if (storedSheet) setLastSheetInfo(JSON.parse(storedSheet));
      if (storedPasses) setLastElimPasses(JSON.parse(storedPasses));
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
      const latestBountyType = data ? ((data.bountyType as BountyType) || "standard") : bountyType;

      // Wanted Bounty: re-entries are unlimited while the re-entry window is open.
      return (
        latestReentryEnabled &&
        latestReentryAvailable &&
        (latestBountyType === "wanted" || (player.rebuys ?? 0) < latestMaxReentries)
      );
    },
    [bountyType, maxReentries, reentryAvailable, reentryEnabled],
  );

  const startElimination = (p: Player) => {
    const tg = getTelegramWebApp();
    tg?.HapticFeedback?.impactOccurred?.("medium");
    setEliminatedPlayer(p);
    setSelectedKillers([]);
    setIsMulti(false);
    setSearch("");
    setMysteryPrizes({});
    setPrizeKillerIndex(0);
    setPrizeStage("kind");
    clientRequestIdRef.current = null;
    // The "who knocked them out" step is only shown when the knockout can actually pay:
    // Dealer Revenge — only when the eliminated player carries the dealer label. In
    // Wanted Bounty every knockout pays (bounty points for a first bullet, wanted
    // points for a re-entered player), so the killer is always asked for.
    const needsKillerStep =
      isBounty && (bountyType === "dealer" ? isDealerLabel(p.label) : true);
    setStep(needsKillerStep ? 1 : 2);
  };

  const returnToEliminationsList = useCallback(() => {
    setStep(0);
    setEliminatedPlayer(null);
    setSelectedKillers([]);
    setIsMulti(false);
    setSearch("");
    setMysteryPrizes({});
    setPrizeKillerIndex(0);
    setPrizeStage("kind");
    clientRequestIdRef.current = null;
  }, []);

  const toggleKiller = (p: Player) => {
    const tg = getTelegramWebApp();
    tg?.HapticFeedback?.impactOccurred?.("light");
    if (!isMulti) {
      setSelectedKillers([p]);
      if (isBounty && bountyType === "mystery") {
        setPrizeKillerIndex(0);
        setPrizeStage("kind");
        setStep(4); // Ask what the killer drew from the prize deck
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
      
      const prizeEntries = bountyType === "mystery"
        ? selectedKillers.flatMap((killer) => {
          const prize = mysteryPrizes[killer.id];
          return prize ? [{ killerId: killer.id, prize }] : [];
        })
        : [];
      
      const payload = {
        client_request_id: clientRequestIdRef.current,
        eliminated_id: eliminatedPlayer!.id,
        bounty_split: isBounty && selectedKillers.length > 1,
        killers: isBounty ? selectedKillers.map(k => ({ id: k.id, name: k.name, share })) : [],
        mystery_prizes: prizeEntries,
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
        setMysteryPrizes({});
        setPrizeKillerIndex(0);
        setPrizeStage("kind");
        clientRequestIdRef.current = null;
        void fetchPlayers();

        // A pass is money: the admin is told whether it landed in the profile or has to
        // be handed over by name, and the knockout remembers it in case it is undone.
        const passes: MysteryPassNote[] = Array.isArray(data.mysteryPasses)
          ? data.mysteryPasses.map((pass: { granted?: boolean; nickname?: string; vip?: boolean }) => ({
            granted: Boolean(pass.granted),
            nickname: String(pass.nickname ?? ""),
            vip: Boolean(pass.vip),
          }))
          : [];

        if (typeof data.prizeWarning === "string" && data.prizeWarning) {
          notifyEliminationFailed(tg, `${data.prizeWarning}. Вылет записан, фишки выдайте вручную.`);
        }

        if (passes.length > 0) {
          localStorage.setItem("tma_last_elim_passes", JSON.stringify(passes));
          setLastElimPasses(passes);
          tg?.showAlert?.(
            (data.mysteryPasses as Array<{ granted: boolean; nickname: string; vip: boolean }>)
              .map((pass) => {
                const kind = pass.vip ? "VIP проходка" : "Проходка";
                return pass.granted
                  ? `${kind} начислена в профиль: ${pass.nickname}`
                  : `${kind} для ${pass.nickname}: игрок не привязан к Telegram — выдайте командой /free ${pass.vip ? "vip " : ""}${pass.nickname}`;
              })
              .join("\n"),
          );
        } else {
          localStorage.removeItem("tma_last_elim_passes");
          setLastElimPasses([]);
        }
      } else {
        // The server says what went wrong; without it the admin only sees a number and
        // nobody can tell a full table from a broken database.
        const failure = await res.json().catch(() => null);
        const reason = typeof failure?.error === "string" ? failure.error.slice(0, 300) : "";

        notifyEliminationFailed(
          tg,
          `Ошибка сохранения (код ${res.status}). Вылет НЕ записан, повтори.${
            reason ? `\n\n${reason}` : ""
          }`,
        );
      }
    } catch {
      // A rejected fetch (lost connection, request killed when the WebView is backgrounded)
      // used to escape through the `finally` unhandled: the spinner stopped, no alert was
      // shown, and the elimination was silently lost. The retry stays safe because
      // clientRequestIdRef is kept — the server deduplicates by it.
      notifyEliminationFailed(tg, "Нет связи с сервером. Вылет НЕ записан, повтори.");
    } finally {
      submitInFlightRef.current = false;
      setIsSubmitting(false);
      tg?.MainButton?.hideProgress?.();
      tg?.MainButton?.hide?.();
    }
  }, [eliminatedPlayer, fetchPlayers, initData, isBounty, bountyType, mysteryPrizes, selectedKillers]);

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

  const cancelLastElimination = useCallback(async (revokePasses: boolean) => {
    if (!lastElimId) return;

    const tg = getTelegramWebApp();
    await fetch(`/api/tma/eliminations/${lastElimId}/cancel`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Telegram-Init-Data": initData },
      body: JSON.stringify({ ...(lastSheetInfo || {}), revoke_passes: revokePasses }),
    });
    tg?.HapticFeedback?.notificationOccurred?.("success");
    localStorage.removeItem("tma_last_elim");
    localStorage.removeItem("tma_last_elim_player_name");
    localStorage.removeItem("tma_last_elim_sheet");
    localStorage.removeItem("tma_last_elim_passes");
    setLastElimId(null);
    setLastElimPlayerName(null);
    setLastSheetInfo(null);
    setLastElimPasses([]);
    void fetchPlayers();
  }, [fetchPlayers, initData, lastElimId, lastSheetInfo]);

  const handleUndo = async () => {
    const tg = getTelegramWebApp();
    const fallbackPlayerName = players.find((player) => player.status === "eliminated")?.name;
    const playerName = lastElimPlayerName || fallbackPlayerName || "выбранного игрока";
    tg?.showConfirm(`Вы уверены, что хотите отменить выбивание игрока ${playerName}?`, async (confirmed: boolean) => {
      if (!confirmed || !lastElimId) return;

      // A misclick takes the mystery pass back; a knockout undone because the player is
      // re-entering leaves the pass with whoever won it.
      if (lastElimPasses.length > 0) {
        const names = lastElimPasses
          .map((pass) => `${pass.nickname} — ${pass.vip ? "VIP проходка" : "проходка"}`)
          .join("\n");
        tg.showConfirm(
          `В этом выбивании выпала проходка:\n${names}\n\nСнять её? Да — если это был промах. Нет — если игрок делает ре-энтри.`,
          async (revoke: boolean) => {
            await cancelLastElimination(revoke);
          },
        );
        return;
      }

      await cancelLastElimination(false);
    });
  };

  const disabledClass = isSubmitting ? " opacity-60 cursor-not-allowed" : "";

  // Wanted Bounty: the double (x2) re-entry is a once-per-tournament option, so the
  // button is hidden as soon as the player has a double on record. Other modes keep
  // the level-driven availability as is.
  const canOfferDoubleReentry =
    doubleReentryAvailable &&
    !(bountyType === "wanted" && (eliminatedPlayer?.doubleRebuys ?? 0) > 0);

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
            setPrizeKillerIndex(0);
            setPrizeStage("kind");
            setStep(4); // Ask what each killer drew from the prize deck
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
          {visibleActivePlayers.length === 0 && <div className="py-10 text-center text-[var(--tg-theme-hint-color)]">{selectedTableNumber ? "Нет активных игроков за этим столом" : "Все выбыли"}</div>}
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
          <Search
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--tg-theme-hint-color)]"
            size={18}
          />
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
            className={`flex-1 p-3 rounded-lg text-sm font-medium ${isMulti ? "bg-[var(--tg-theme-button-color)] text-[var(--tg-theme-button-text-color)]" : "bg-[var(--tg-theme-secondary-bg-color)] text-[var(--tg-theme-text-color)]"}${disabledClass}`}
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
                className={`w-full text-left p-4 rounded-lg flex items-center justify-between ${isSelected ? "bg-[var(--tg-theme-button-color)] text-[var(--tg-theme-button-text-color)]" : "bg-[var(--tg-theme-secondary-bg-color)]"}${disabledClass}`}
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
              {bountyType === "mystery" && selectedKillers.length > 0 && (
                <div className="mt-3">
                  <div className="text-[var(--tg-theme-hint-color)] text-sm mb-1">🎲 Что выпало</div>
                  <div className="space-y-1">
                    {selectedKillers.map((killer) => (
                      <div key={killer.id} className="text-lg font-bold text-yellow-400">
                        {killer.name}: {mysteryPrizes[killer.id]
                          ? describeMysteryPrize(mysteryPrizes[killer.id])
                          : "не выбрано"}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {bountyType === "dealer" && isDealerLabel(eliminatedPlayer?.label) && selectedKillers.length > 0 && (
                <div className="mt-3">
                  <div className="text-[var(--tg-theme-hint-color)] text-sm mb-1">🎯 Выбит дилер</div>
                  <div className="text-xl font-bold text-yellow-400">
                    {selectedKillers.length > 1
                      ? `по ${Number((DEALER_KNOCKOUT_POINTS / selectedKillers.length).toFixed(2))} PTS + доля 3ББ каждому`
                      : `+${DEALER_KNOCKOUT_POINTS} PTS + 3ББ в стек`}
                  </div>
                </div>
              )}
              {bountyType === "progressive" && selectedKillers.length > 0 && (
                <div className="mt-3">
                  <div className="text-[var(--tg-theme-hint-color)] text-sm mb-1">🔥 Голова игрока</div>
                  <div className="text-xl font-bold text-yellow-400">
                    {selectedKillers.length > 1
                      ? `по ${Number((getProgressiveHeadPoints(eliminatedPlayer?.progressiveKnockouts) / selectedKillers.length).toFixed(2))} PTS каждому`
                      : `+${getProgressiveHeadPoints(eliminatedPlayer?.progressiveKnockouts)} PTS`}
                  </div>
                </div>
              )}
              {bountyType === "wanted" && selectedKillers.length > 0 && (
                (eliminatedPlayer?.rebuys ?? 0) > 0 ? (
                  <div className="mt-3">
                    <div className="text-[var(--tg-theme-hint-color)] text-sm mb-1">🤠 Выбит wanted-игрок</div>
                    <div className="text-xl font-bold text-yellow-400">
                      {selectedKillers.length > 1
                        ? `по ${Number((WANTED_KNOCKOUT_POINTS / selectedKillers.length).toFixed(2))} PTS + доля 3ББ каждому`
                        : `+${WANTED_KNOCKOUT_POINTS} PTS + 3ББ в стек`}
                    </div>
                  </div>
                ) : (
                  <div className="mt-3">
                    <div className="text-[var(--tg-theme-hint-color)] text-sm mb-1">♠️ Выбит игрок</div>
                    <div className="text-xl font-bold text-yellow-400">
                      {selectedKillers.length > 1
                        ? `по ${Number((ptsBountyPoints / selectedKillers.length).toFixed(2))} PTS + доля 2ББ каждому`
                        : `+${ptsBountyPoints} PTS + 2ББ в стек`}
                    </div>
                  </div>
                )
              )}
            </div>
          ) : null}
        </div>

        <button
          disabled={isSubmitting}
          onClick={() => {
            if (!isSubmitting) void confirmElimination();
          }}
          className={`w-full p-4 bg-[var(--tg-theme-button-color)] text-[var(--tg-theme-button-text-color)] rounded-lg font-semibold${disabledClass}`}
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
        {canOfferDoubleReentry ? (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <button
                disabled={isSubmitting}
                onClick={() => {
                  if (!isSubmitting) void submitElimination(true, false);
                }}
                className={`p-4 bg-[var(--tg-theme-button-color)] text-[var(--tg-theme-button-text-color)] rounded-lg font-semibold${disabledClass}`}
              >
                {isSubmitting ? "Сохраняем..." : "Одинарный"}
              </button>
              <button
                disabled={isSubmitting}
                onClick={() => {
                  if (!isSubmitting) void submitElimination(true, true);
                }}
                className={`p-4 bg-[var(--tg-theme-button-color)] text-[var(--tg-theme-button-text-color)] rounded-lg font-semibold${disabledClass}`}
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
              className={`p-4 bg-[var(--tg-theme-button-color)] text-[var(--tg-theme-button-text-color)] rounded-lg font-semibold${disabledClass}`}
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
    const prizeKiller = selectedKillers[prizeKillerIndex];
    if (!prizeKiller) return null;

    const savePrize = (prize: MysteryPrize) => {
      setMysteryPrizes((current) => ({ ...current, [prizeKiller.id]: prize }));
      getTelegramWebApp()?.HapticFeedback?.impactOccurred?.("light");

      // Each killer draws their own card, so the question repeats until every one of
      // them has an answer.
      if (prizeKillerIndex + 1 < selectedKillers.length) {
        setPrizeKillerIndex(prizeKillerIndex + 1);
        setPrizeStage("kind");
        return;
      }

      setStep(2);
    };

    const goBack = () => {
      if (isSubmitting) return;
      if (prizeStage !== "kind") {
        setPrizeStage("kind");
        return;
      }
      if (prizeKillerIndex > 0) {
        setPrizeKillerIndex(prizeKillerIndex - 1);
        return;
      }
      setStep(1);
    };

    const optionClass =
      "w-full rounded-lg bg-[var(--tg-theme-bg-color)] p-4 text-lg font-semibold text-[var(--tg-theme-text-color)]";

    return (
      <div className="space-y-6 pt-8">
        <button
          className={`flex items-center gap-2 text-[var(--tg-theme-button-color)]${disabledClass}`}
          disabled={isSubmitting}
          type="button"
          onClick={goBack}
        >
          <ChevronLeft size={18} /> Назад
        </button>

        <h2 className="text-center text-2xl font-bold">🎲 Что получает игрок?</h2>

        <div className="space-y-4 rounded-xl bg-[var(--tg-theme-secondary-bg-color)] p-6">
          <div className="text-center">
            <div className="text-[var(--tg-theme-hint-color)] text-sm mb-1">
              Выбил {eliminatedPlayer?.name}
              {selectedKillers.length > 1
                ? ` · конверт ${prizeKillerIndex + 1} из ${selectedKillers.length}`
                : ""}
            </div>
            <div className="text-xl font-bold">{prizeKiller.name}</div>
          </div>

          {prizeStage === "kind" && (
            <div className="space-y-2">
              <button className={optionClass} type="button" onClick={() => setPrizeStage("bigBlinds")}>
                Большой блайнд
              </button>
              <button className={optionClass} type="button" onClick={() => setPrizeStage("points")}>
                Рейтинговые очки
              </button>
              <button className={optionClass} type="button" onClick={() => setPrizeStage("pass")}>
                Проходка
              </button>
              <button className={optionClass} type="button" onClick={() => savePrize({ kind: "other" })}>
                Другое
              </button>
            </div>
          )}

          {prizeStage === "bigBlinds" && (
            <div>
              <div className="text-[var(--tg-theme-hint-color)] text-sm mb-2 text-center">
                Сколько больших блайндов?
              </div>
              <div className="grid grid-cols-3 gap-2">
                {MYSTERY_BIG_BLIND_AMOUNTS.map((amount) => (
                  <button
                    key={amount}
                    className={optionClass}
                    type="button"
                    onClick={() => savePrize({ amount, kind: "bigBlinds" })}
                  >
                    {amount} ББ
                  </button>
                ))}
              </div>
            </div>
          )}

          {prizeStage === "points" && (
            <div>
              <div className="text-[var(--tg-theme-hint-color)] text-sm mb-2 text-center">
                Сколько очков?
              </div>
              <div className="grid grid-cols-3 gap-2">
                {MYSTERY_POINT_AMOUNTS.map((amount) => (
                  <button
                    key={amount}
                    className={optionClass}
                    type="button"
                    onClick={() => savePrize({ amount, kind: "points" })}
                  >
                    {amount}
                  </button>
                ))}
              </div>
            </div>
          )}

          {prizeStage === "pass" && (
            <div>
              <div className="text-[var(--tg-theme-hint-color)] text-sm mb-2 text-center">
                Какая проходка?
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  className={optionClass}
                  type="button"
                  onClick={() => savePrize({ kind: "pass", pass: "regular" })}
                >
                  Стандарт
                </button>
                <button
                  className={optionClass}
                  type="button"
                  onClick={() => savePrize({ kind: "pass", pass: "vip" })}
                >
                  VIP
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  return null;
}
