"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getTelegramWebApp, useTMA } from "../layout";
import { isDealerLabel } from "@/lib/player-labels";
import { DEALER_KNOCKOUT_POINTS, getProgressiveHeadPoints, WANTED_KNOCKOUT_POINTS } from "@/lib/pts-rating";
import {
  describeMysteryPrize,
  MYSTERY_BIG_BLIND_AMOUNTS,
  MYSTERY_POINT_AMOUNTS,
  MYSTERY_JOKER_PRIZES,
  type MysteryBasePrize,
  type MysteryPrize,
} from "@/lib/mystery/prizes";
import { useVisiblePolling } from "../use-visible-polling";
import { Check, Search, Skull, Undo2, Users } from "lucide-react";
import { ScreenHeader, SectionLabel, TableChips } from "../ui";

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
// "jokerConfirm" stands between the Joker and the two cards it pays: it is the one card
// that doubles a knockout, and a misread of it cannot be taken back at the table.
type PrizeStage = "kind" | "bigBlinds" | "points" | "pass" | "jokerConfirm";

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
  // The cards a Joker has paid so far. Null while no Joker is being dealt; a list — even
  // an empty one — means the dealer is working through its two cards.
  const [jokerDraft, setJokerDraft] = useState<MysteryBasePrize[] | null>(null);
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
      // A card link reads the roster itself, just below.
      if (!new URLSearchParams(window.location.search).get("out")) void fetchPlayers();
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

  // `data` is the roster just read, for a knockout started from a player's card before
  // the screen's own state has caught up with it.
  const startElimination = (p: Player, data?: PlayersResponse) => {
    const bounty = data ? Boolean(data.isBounty) : isBounty;
    const type = data ? ((data.bountyType as BountyType) || "standard") : bountyType;
    const tg = getTelegramWebApp();
    tg?.HapticFeedback?.impactOccurred?.("medium");
    setEliminatedPlayer(p);
    setSelectedKillers([]);
    setIsMulti(false);
    setSearch("");
    setMysteryPrizes({});
    setPrizeKillerIndex(0);
    setPrizeStage("kind");
    setJokerDraft(null);
    clientRequestIdRef.current = null;
    // The "who knocked them out" step is only shown when the knockout can actually pay:
    // Dealer Revenge — only when the eliminated player carries the dealer label. In
    // Wanted Bounty every knockout pays (bounty points for a first bullet, wanted
    // points for a re-entered player), so the killer is always asked for.
    const needsKillerStep = bounty && (type === "dealer" ? isDealerLabel(p.label) : true);
    setStep(needsKillerStep ? 1 : 2);
  };

  // Opened from a player's card with "Выбыл": straight to who knocked them out. The link
  // is used up at once, so a reload does not start the same knockout again.
  useEffect(() => {
    const outId = new URLSearchParams(window.location.search).get("out");
    if (!outId) return;

    const timeout = window.setTimeout(() => {
      // Taken off inside the timer: React's development double run cancels the first
      // one, and the link must still be there for the second.
      window.history.replaceState(null, "", window.location.pathname);
      void fetchPlayers().then((data) => {
        const player = data?.players?.find((item) => item.id === outId && item.status === "active");
        if (player && data) startElimination(player, data);
      });
    }, 0);
    return () => window.clearTimeout(timeout);
    // Once, for the card that opened the screen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const returnToEliminationsList = useCallback(() => {
    setStep(0);
    setEliminatedPlayer(null);
    setSelectedKillers([]);
    setIsMulti(false);
    setSearch("");
    setMysteryPrizes({});
    setPrizeKillerIndex(0);
    setPrizeStage("kind");
    setJokerDraft(null);
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
        setJokerDraft(null);
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
        setJokerDraft(null);
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
            setJokerDraft(null);
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

  const hasPrizeStep = isBounty && bountyType === "mystery";
  const flowSteps = [
    { key: "out", label: "Вылет" },
    ...(step === 1 || selectedKillers.length > 0 ? [{ key: "killer", label: "Выбил" }] : []),
    ...(hasPrizeStep && selectedKillers.length > 0 ? [{ key: "prize", label: "Приз" }] : []),
    { key: "done", label: "Итог" },
  ];
  const currentFlowStep = step === 1 ? "killer" : step === 4 ? "prize" : "done";
  const flowProgress = (
    <div aria-hidden="true" className="tma-steps">
      {flowSteps.map((item, index) => {
        const currentIndex = flowSteps.findIndex((entry) => entry.key === currentFlowStep);
        const state = index < currentIndex ? " tma-steps__item--done" : index === currentIndex ? " tma-steps__item--current" : "";

        return (
          <span key={item.key} className={`tma-steps__item${state}`}>
            <span className="tma-steps__bar" />
            {index + 1} {item.label}
          </span>
        );
      })}
    </div>
  );

  if (step === 0) {
    const query = search.trim().toLowerCase();
    const listed = visibleActivePlayers.filter((player) => !query || player.name.toLowerCase().includes(query));
    // Players without a table go last: the room is worked table by table.
    const tables = Array.from(new Set(listed.map((player) => Number(player.table) || 0))).sort(
      (a, b) => (a || Infinity) - (b || Infinity),
    );

    return (
      <div className="tma-screen">
        <ScreenHeader title="Кто вылетел?" />

        <label className="tma-search">
          <Search size={18} />
          <input
            aria-label="Поиск игрока"
            placeholder="Поиск по нику"
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>

        <TableChips tables={tableOptions} value={tableFilter} onChange={setTableFilter} />

        {tables.map((tableNumber) => {
          const atTable = listed.filter((player) => (Number(player.table) || 0) === tableNumber);

          return (
            <div key={tableNumber} className="tma-card tma-card--flush">
              <div className="tma-card__head">
                <span>{tableNumber ? `Стол ${tableNumber}` : "Без стола"}</span>
                <span className="tma-card__head-meta">{atTable.length} игр.</span>
              </div>
              {atTable.map((p) => (
                <button
                  key={p.id}
                  className="tma-row"
                  disabled={isSubmitting}
                  type="button"
                  onClick={() => {
                    if (!isSubmitting) startElimination(p);
                  }}
                >
                  <span className="tma-row__body">
                    <span className="tma-row__title">{p.name}</span>
                    {(p.rebuys ?? 0) > 0 || isDealerLabel(p.label) ? (
                      <span className="tma-row__sub">
                        {[
                          isDealerLabel(p.label) ? "дилер" : "",
                          (p.rebuys ?? 0) > 0 ? `ре-энтри: ${p.rebuys}` : "",
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    ) : null}
                  </span>
                  <Skull className="tma-danger-text" size={18} />
                </button>
              ))}
            </div>
          );
        })}

        {listed.length === 0 && (
          <div className="tma-empty">
            {query
              ? "Никого не нашли"
              : tableFilter
                ? "Нет активных игроков за этим столом"
                : "Все выбыли"}
          </div>
        )}

        {lastElimId && (
          <div className="tma-cta-bar">
            <div className="tma-undo">
              <span className="tma-undo__text">
                Последний вылет: <b>{lastElimPlayerName ?? "—"}</b>
              </span>
              <button
                aria-label="Отменить последнее выбывание"
                disabled={isSubmitting}
                type="button"
                onClick={() => {
                  if (!isSubmitting) void handleUndo();
                }}
              >
                <Undo2 className="mr-1 inline" size={16} />
                Отменить
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  if (step === 1) {
    const filtered = activePlayers
      .filter(
        (p) =>
          p.id !== eliminatedPlayer?.id &&
          (!selectedTableNumber || p.table === eliminatedPlayer?.table) &&
          p.name.toLowerCase().includes(search.toLowerCase()),
      )
      // Whoever knocked the player out sat at the same table, so its players come first.
      .sort(
        (a, b) =>
          Number(b.table === eliminatedPlayer?.table) - Number(a.table === eliminatedPlayer?.table),
      );
    return (
      <div className="tma-screen">
        <ScreenHeader
          back={{
            ariaLabel: "Назад к списку",
            disabled: isSubmitting,
            label: "Вылеты",
            onClick: () => {
              if (!isSubmitting) returnToEliminationsList();
            },
          }}
          title="Кто выбил?"
        />

        {flowProgress}

        <div className="tma-card">
          <span className="tma-hint">Вылетает</span>
          <span className="tma-danger-text text-[20px] font-bold">
            {eliminatedPlayer?.name}
            {eliminatedPlayer?.table ? (
              <span className="tma-muted text-sm font-medium"> · стол {eliminatedPlayer.table}</span>
            ) : null}
          </span>
        </div>

        <label className="tma-search">
          <Search size={18} />
          <input
            placeholder="Поиск..."
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </label>

        <button
          aria-pressed={isMulti}
          className={`tma-btn${isMulti ? " tma-btn--primary" : ""}`}
          disabled={isSubmitting}
          type="button"
          onClick={() => {
            if (!isSubmitting) setIsMulti(!isMulti);
          }}
        >
          <Users size={18} /> Поделить баунти: {isMulti ? "вкл" : "выкл"}
        </button>
        {isMulti ? (
          <p className="tma-hint tma-hint--pad">
            Отметьте всех, кто выбил, и нажмите «Далее» внизу экрана.
          </p>
        ) : null}

        <div className="tma-card tma-card--flush">
          <div className="tma-card__head">
            <span>
              {selectedTableNumber
                ? `Соседи по столу ${eliminatedPlayer?.table ?? ""}`
                : eliminatedPlayer?.table
                  ? `Сначала стол ${eliminatedPlayer.table}`
                  : "Игроки в игре"}
            </span>
            <span className="tma-card__head-meta">{filtered.length}</span>
          </div>
          {filtered.map(p => {
            const isSelected = selectedKillers.some(k => k.id === p.id);
            return (
              <button
                key={p.id}
                aria-pressed={isMulti ? isSelected : undefined}
                className="tma-row"
                disabled={isSubmitting}
                type="button"
                onClick={() => {
                  if (!isSubmitting) toggleKiller(p);
                }}
              >
                <span className="tma-row__body">
                  <span className="tma-row__title">{p.name}</span>
                </span>
                {isMulti ? (
                  <span
                    className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md ${
                      isSelected ? "bg-[var(--tma-accent)] text-white" : "border-2 border-[var(--tma-surface-3)]"
                    }`}
                  >
                    {isSelected ? <Check size={16} /> : null}
                  </span>
                ) : null}
              </button>
            );
          })}
          {filtered.length === 0 ? <div className="tma-empty">Никого не нашли</div> : null}
        </div>
      </div>
    );
  }

  if (step === 2) {
    return (
      <div className="tma-screen">
        <ScreenHeader
          back={{
            disabled: isSubmitting,
            label: "Отмена",
            onClick: () => {
              if (!isSubmitting) returnToEliminationsList();
            },
          }}
          title="Итог вылета"
        />

        {flowProgress}

        <h2 className="px-1 text-[22px] font-bold">Всё верно?</h2>

        <div className="tma-card">
          <div className="flex items-center justify-between">
            <span className="tma-hint">Выбывает</span>
            <span className="tma-badge">Место #{activePlayers.length}</span>
          </div>
          <div className="tma-danger-text text-[22px] font-bold">{eliminatedPlayer?.name}</div>
          {isBounty ? (
            <>
              <div className="tma-divider" />
              <span className="tma-hint">Баунти</span>
              {selectedKillers.length === 0 ? (
                <div className="text-lg font-bold">Никто</div>
              ) : (
                <div className="flex flex-col gap-1">
                  {selectedKillers.map(k => (
                    <div key={k.id} className="text-lg font-bold">
                      {k.name} <span className="tma-muted text-sm font-medium">({(1 / selectedKillers.length).toFixed(2)})</span>
                    </div>
                  ))}
                </div>
              )}
              {bountyType === "mystery" && selectedKillers.length > 0 && (
                <PrizeLine label="Что выпало">
                  {selectedKillers.map((killer) => (
                    <div key={killer.id}>
                      {killer.name}: {mysteryPrizes[killer.id]
                        ? describeMysteryPrize(mysteryPrizes[killer.id])
                        : "не выбрано"}
                    </div>
                  ))}
                </PrizeLine>
              )}
              {bountyType === "dealer" && isDealerLabel(eliminatedPlayer?.label) && selectedKillers.length > 0 && (
                <PrizeLine label="Выбит дилер">
                  {selectedKillers.length > 1
                    ? `по ${Number((DEALER_KNOCKOUT_POINTS / selectedKillers.length).toFixed(2))} PTS + доля 3ББ каждому`
                    : `+${DEALER_KNOCKOUT_POINTS} PTS + 3ББ в стек`}
                </PrizeLine>
              )}
              {bountyType === "progressive" && selectedKillers.length > 0 && (
                <PrizeLine hint="После последней паузы — 1ББ" label="Голова игрока">
                  {selectedKillers.length > 1
                    ? `по ${Number((getProgressiveHeadPoints(eliminatedPlayer?.progressiveKnockouts) / selectedKillers.length).toFixed(2))} PTS + доля 2ББ каждому`
                    : `+${getProgressiveHeadPoints(eliminatedPlayer?.progressiveKnockouts)} PTS + 2ББ в стек`}
                </PrizeLine>
              )}
              {bountyType === "wanted" && selectedKillers.length > 0 && (
                (eliminatedPlayer?.rebuys ?? 0) > 0 ? (
                  <PrizeLine label="Выбит wanted-игрок">
                    {selectedKillers.length > 1
                      ? `по ${Number((WANTED_KNOCKOUT_POINTS / selectedKillers.length).toFixed(2))} PTS + доля 3ББ каждому`
                      : `+${WANTED_KNOCKOUT_POINTS} PTS + 3ББ в стек`}
                  </PrizeLine>
                ) : (
                  <PrizeLine label="Выбит игрок">
                    {selectedKillers.length > 1
                      ? `по ${Number((ptsBountyPoints / selectedKillers.length).toFixed(2))} PTS + доля 2ББ каждому`
                      : `+${ptsBountyPoints} PTS + 2ББ в стек`}
                  </PrizeLine>
                )
              )}
            </>
          ) : null}
        </div>

        <p className="tma-hint tma-hint--pad">
          Если у игрока есть ре-энтри, приложение спросит о нём следующим шагом. Отменить
          вылет можно сразу после записи — внизу списка вылетов.
        </p>

        <div className="tma-cta-bar">
          <button
            className="tma-btn tma-btn--danger tma-btn--big"
            disabled={isSubmitting}
            type="button"
            onClick={() => {
              if (!isSubmitting) void confirmElimination();
            }}
          >
            {isSubmitting ? "Сохраняем..." : "Подтвердить выбывание"}
          </button>
        </div>
      </div>
    );
  }

  if (step === 3) {
    return (
      <div className="tma-screen">
        <ScreenHeader
          back={{
            disabled: isSubmitting,
            label: "Назад",
            onClick: () => {
              if (!isSubmitting) setStep(2);
            },
          }}
          title="Ре-энтри"
        />

        <div className="tma-card">
          <span className="tma-hint">Игрок</span>
          <span className="tma-danger-text text-[22px] font-bold">{eliminatedPlayer?.name}</span>
        </div>

        <SectionLabel title="Использует ли игрок ре-энтри?" />

        <button
          className="tma-choice tma-choice--primary"
          disabled={isSubmitting}
          type="button"
          onClick={() => {
            if (!isSubmitting) void submitElimination(true, false);
          }}
        >
          <span className="tma-choice__body">
            <span className="tma-choice__title">
              {isSubmitting ? "Сохраняем..." : canOfferDoubleReentry ? "Одинарный ре-энтри" : "Да, ре-энтри"}
            </span>
            <span className="tma-choice__sub">Выбивание остаётся, ребай засчитывается</span>
          </span>
        </button>

        {canOfferDoubleReentry ? (
          <button
            className="tma-choice"
            disabled={isSubmitting}
            type="button"
            onClick={() => {
              if (!isSubmitting) void submitElimination(true, true);
            }}
          >
            <span className="tma-choice__body">
              <span className="tma-choice__title">{isSubmitting ? "Сохраняем..." : "Двойной (x2)"}</span>
              <span className="tma-choice__sub">Ре-энтри с отметкой x2</span>
            </span>
          </button>
        ) : null}

        <button
          className="tma-choice tma-choice--danger"
          disabled={isSubmitting}
          type="button"
          onClick={() => {
            if (!isSubmitting) void submitElimination(false);
          }}
        >
          <span className="tma-choice__body">
            <span className="tma-choice__title">{isSubmitting ? "Сохраняем..." : "Нет, вылетает"}</span>
            <span className="tma-choice__sub">Место в турнире фиксируется</span>
          </span>
        </button>
      </div>
    );
  }

  if (step === 4) {
    const prizeKiller = selectedKillers[prizeKillerIndex];
    if (!prizeKiller) return null;

    // What the killer ends up with. Called once a card is settled — for a Joker, once
    // both of its cards are.
    const commitPrize = (prize: MysteryPrize) => {
      setMysteryPrizes((current) => ({ ...current, [prizeKiller.id]: prize }));
      setJokerDraft(null);
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

    /**
     * One ordinary card tapped.
     *
     * Outside a Joker it is the whole prize. Inside one it is half of it: the first
     * card is kept and the question asked again, and the second settles the Joker.
     */
    const savePrize = (prize: MysteryBasePrize) => {
      if (!jokerDraft) {
        commitPrize(prize);
        return;
      }

      const drawn = [...jokerDraft, prize];
      if (drawn.length < MYSTERY_JOKER_PRIZES) {
        setJokerDraft(drawn);
        setPrizeStage("kind");
        getTelegramWebApp()?.HapticFeedback?.impactOccurred?.("light");
        return;
      }

      commitPrize({ kind: "joker", prizes: drawn });
    };

    const goBack = () => {
      if (isSubmitting) return;
      // Inside a card's own question (how many blinds, which pass) — back to the deck.
      if (prizeStage !== "kind") {
        setPrizeStage("kind");
        return;
      }
      // Working through a Joker: give back its last card, or the Joker itself.
      if (jokerDraft) {
        setJokerDraft(jokerDraft.length > 0 ? jokerDraft.slice(0, -1) : null);
        return;
      }
      if (prizeKillerIndex > 0) {
        setPrizeKillerIndex(prizeKillerIndex - 1);
        return;
      }
      setStep(1);
    };

    return (
      <div className="tma-screen">
        <ScreenHeader back={{ disabled: isSubmitting, label: "Назад", onClick: goBack }} title="Мистери-баунти" />

        {flowProgress}

        <div className="tma-card">
          <span className="tma-hint">
            Выбил {eliminatedPlayer?.name}
            {selectedKillers.length > 1
              ? ` · конверт ${prizeKillerIndex + 1} из ${selectedKillers.length}`
              : ""}
          </span>
          <span className="text-[20px] font-bold">Что вытянул {prizeKiller.name}?</span>
          {/* Which half of the Joker the dealer is on, so nobody loses count. */}
          {jokerDraft ? (
            <span className="tma-badge tma-badge--blue self-start">
              Джокер · приз {Math.min(jokerDraft.length + 1, MYSTERY_JOKER_PRIZES)} из{" "}
              {MYSTERY_JOKER_PRIZES}
              {jokerDraft.length > 0 ? `: уже ${describeMysteryPrize(jokerDraft[0])}` : ""}
            </span>
          ) : null}
        </div>

        {prizeStage === "kind" && (
          <div className="tma-options">
            <button className="tma-option" type="button" onClick={() => setPrizeStage("bigBlinds")}>
              Большой блайнд
            </button>
            <button className="tma-option" type="button" onClick={() => setPrizeStage("points")}>
              Рейтинговые очки
            </button>
            <button className="tma-option" type="button" onClick={() => setPrizeStage("pass")}>
              Проходка
            </button>
            {/* A Joker inside a Joker is not a card this club deals, so while one is
                being dealt the deck shows the four ordinary cards only. */}
            {jokerDraft ? null : (
              <button className="tma-option" type="button" onClick={() => setPrizeStage("jokerConfirm")}>
                🃏 Джокер
              </button>
            )}
            <button className="tma-option" type="button" onClick={() => savePrize({ kind: "other" })}>
              Другое
            </button>
          </div>
        )}

        {prizeStage === "jokerConfirm" && (
          <div className="flex flex-col gap-2">
            <div className="text-center">
              На карте точно <span className="font-bold">Джокер</span>?
            </div>
            <div className="tma-hint text-center">
              {prizeKiller.name} получит два приза — их нужно будет отметить по очереди.
            </div>
            <button
              className="tma-option tma-option--primary"
              type="button"
              onClick={() => {
                setJokerDraft([]);
                setPrizeStage("kind");
                getTelegramWebApp()?.HapticFeedback?.impactOccurred?.("medium");
              }}
            >
              Да, Джокер
            </button>
            <button className="tma-option" type="button" onClick={() => setPrizeStage("kind")}>
              Нет, вернуться
            </button>
          </div>
        )}

        {prizeStage === "bigBlinds" && (
          <>
            <SectionLabel title="Сколько больших блайндов?" />
            <div className="tma-options tma-options--3">
              {MYSTERY_BIG_BLIND_AMOUNTS.map((amount) => (
                <button
                  key={amount}
                  className="tma-option"
                  type="button"
                  onClick={() => savePrize({ amount, kind: "bigBlinds" })}
                >
                  {amount} ББ
                </button>
              ))}
            </div>
          </>
        )}

        {prizeStage === "points" && (
          <>
            <SectionLabel title="Сколько очков?" />
            <div className="tma-options tma-options--3">
              {MYSTERY_POINT_AMOUNTS.map((amount) => (
                <button
                  key={amount}
                  className="tma-option"
                  type="button"
                  onClick={() => savePrize({ amount, kind: "points" })}
                >
                  {amount}
                </button>
              ))}
            </div>
          </>
        )}

        {prizeStage === "pass" && (
          <>
            <SectionLabel title="Какая проходка?" />
            <div className="tma-options tma-options--2">
              <button
                className="tma-option"
                type="button"
                onClick={() => savePrize({ kind: "pass", pass: "regular" })}
              >
                Стандарт
              </button>
              <button
                className="tma-option"
                type="button"
                onClick={() => savePrize({ kind: "pass", pass: "vip" })}
              >
                VIP
              </button>
            </div>
          </>
        )}
      </div>
    );
  }

  return null;
}

/** What a knockout pays in tonight's bounty mode, under the killers' names. */
function PrizeLine({ children, hint, label }: { children: React.ReactNode; hint?: string; label: string }) {
  return (
    <div className="flex flex-col gap-1 pt-1">
      <span className="tma-hint">{label}</span>
      <div className="text-lg font-bold text-[var(--tma-gold)]">{children}</div>
      {hint ? <span className="tma-hint text-xs">{hint}</span> : null}
    </div>
  );
}
