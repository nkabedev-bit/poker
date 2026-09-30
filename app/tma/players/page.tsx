"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { getTelegramWebApp, useTMA } from "../layout";
import { useVisiblePolling } from "../use-visible-polling";
import {
  ArrowRight,
  ArrowRightLeft,
  BadgeMinus,
  BadgePlus,
  CheckSquare,
  ChevronRight,
  ClipboardList,
  Plus,
  RotateCcw,
  Search,
  Skull,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import {
  formatPlayerNameWithRegistrationNumber,
  isVipRegistrationNumber,
} from "@/lib/player-registration-number";
import { SeatingPicker } from "@/components/tma/seating-picker";
import { isVipTable, nameSeat } from "@/lib/tables/seating";
import { changeTableFormat, readTableFormatsFrom, type TableFormats } from "../table-formats";
import { ScreenHeader, SectionLabel, TableChips } from "../ui";

// The room list's own filter, next to the tables: everyone who is out.
const ELIMINATED_FILTER = "out";

// Addon chip amount credited by the TMA admin app: fixed, no manual input — the
// admin only confirms the "add N chips to player X?" dialog.
const ADDON_CHIPS = 6000;

// Why a bulk addon can be refused for a single player, in the admin's words.
const BULK_FAILURE_LABELS: Record<string, string> = {
  eliminated: "выбыл",
  error: "ошибка сохранения",
  limit: "лимит аддонов",
  not_found: "не найден",
};

// Why an addon could not be taken back, in the admin's words.
const CANCEL_ADDON_ERRORS: Record<string, string> = {
  "Addon already cancelled": "Аддоны игрока уже изменились — проверьте карточку ещё раз",
  "Addons disabled": "Аддоны выключены в настройках",
  "Player not found": "Игрок не найден — обновите список",
};

// Telegram truncates long confirm dialogs, so the confirmation names only the first
// few players and counts the rest.
const CONFIRM_NAMES_LIMIT = 10;

type Player = {
  addons?: number;
  addonChipsTotal?: number;
  /** Knockouts this player made; a knockout split between killers counts as a share. */
  bountyCount?: number;
  /** Double re-entries (x2) — counted in `rebuys` too. */
  doubleRebuys?: number;
  id: string;
  name: string;
  paid?: boolean;
  /** Every re-entry the player took, the doubles among them. */
  rebuys?: number;
  registrationNumber?: number | null;
  table: number;
  seat: number;
  stack: number;
  status: "active" | "eliminated";
  ticketType?: "regular" | "vip";
};

type SeatChoice = { seat: number; table: number };

const TICKET_LABELS = { regular: "обычный билет", vip: "VIP билет" } as const;

/** What the desk can hand a walk-in. A pair is a regular ticket sold for two. */
const NEW_PLAYER_TICKETS = ["regular", "duo", "vip"] as const;
type NewPlayerTicket = (typeof NEW_PLAYER_TICKETS)[number];

const NEW_PLAYER_TICKET_LABELS: Record<NewPlayerTicket, string> = {
  duo: "1+1",
  regular: "Обычный",
  vip: "VIP",
};

const NEW_PLAYER_TICKET_HINTS: Record<NewPlayerTicket, string> = {
  duo: "Половина цены билета — как и у того, кто его привёл. Номер и стол обычные.",
  regular: "Номер из обычного диапазона.",
  vip: "Номер из VIP-диапазона, игрок попадает в VIP-розыгрыш.",
};

/**
 * The ticket a player holds, as the screen can tell.
 *
 * Written down since the desk started picking it at the card; before that the number is
 * the only record there is, and above 20 means the VIP draw.
 */
function readPlayerTicket(player: Player): "regular" | "vip" {
  return player.ticketType ?? (isVipRegistrationNumber(player.registrationNumber) ? "vip" : "regular");
}

export default function TMAPlayersPage() {
  const { initData } = useTMA();
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  // The ticket a walk-in came in on, which only the desk knows. It decides two things at
  // once: the range their registration number is drawn from, and what they owe — half of
  // a "1+1" pays half, and the pair plays at the ordinary tables like anybody else.
  const [newTicket, setNewTicket] = useState<NewPlayerTicket>("regular");
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const [addonEnabled, setAddonEnabled] = useState(false);
  const [isBounty, setIsBounty] = useState(false);
  const [maxAddons, setMaxAddons] = useState(1);
  const [tablesCount, setTablesCount] = useState(1);
  // Each table is drawn in the format it is dealt in tonight, with the chairs the desk
  // brought over or took away.
  const [tableFormats, setTableFormats] = useState<TableFormats>(null);
  // The table whose chairs are being changed, so its buttons wait for the answer.
  const [changingTable, setChangingTable] = useState<number | null>(null);
  const [tableFilter, setTableFilter] = useState("");
  // Where the admin is sending this player: a chair, not just a table.
  const [moveSeat, setMoveSeat] = useState<SeatChoice | null>(null);
  const [isMovingSeat, setIsMovingSeat] = useState(false);
  // The chosen chair belongs to the other kind of table than the player's ticket, and
  // only the admin can say which of the two is right now.
  const [seatTicketChoiceOpen, setSeatTicketChoiceOpen] = useState(false);
  // A walk-in the desk already knows the ticket for: the number follows it, so picking
  // it here is what lets a VIP guest be seated with a VIP number straight away.
  const [newSeat, setNewSeat] = useState<SeatChoice | null>(null);
  const [reentryAvailable, setReentryAvailable] = useState(false);
  const [doubleReentryAvailable, setDoubleReentryAvailable] = useState(false);
  const [restoreChoiceOpen, setRestoreChoiceOpen] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [addonSelectionOpen, setAddonSelectionOpen] = useState(false);
  const [addonSelection, setAddonSelection] = useState<string[]>([]);
  const [isBulkAddonSaving, setIsBulkAddonSaving] = useState(false);
  
  const [search, setSearch] = useState("");
  const seatingRef = useRef<HTMLDivElement>(null);

  // Form State
  const [name, setName] = useState("");

  const fetchPlayers = useCallback(async () => {
    try {
      const res = await fetch("/api/tma/players", {
        headers: { "X-Telegram-Init-Data": initData },
      });
      if (res.ok) {
        const data = await res.json();
        setPlayers(data.players || []);
        setAddonEnabled(Boolean(data.addonEnabled));
        setIsBounty(Boolean(data.isBounty));
        setMaxAddons(Math.max(1, Number(data.maxAddons ?? 1)));
        setTablesCount(Math.max(1, Number(data.tablesCount ?? 1)));
        setTableFormats(readTableFormatsFrom(data));
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

  /** Brings a chair to a table or takes one away, and redraws the plan with it. */
  const handleTableFormat = async (table: number, direction: "add" | "remove") => {
    if (changingTable !== null) return;

    setChangingTable(table);
    try {
      const formats = await changeTableFormat(initData, table, direction);
      if (formats) setTableFormats(formats);
    } finally {
      setChangingTable(null);
    }
  };

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
            body: JSON.stringify({
              // A pair is a regular ticket that two people share: it changes the price,
              // never the range the number comes from.
              duoTicket: newTicket === "duo",
              name,
              ticketType: newTicket === "vip" ? "vip" : "regular",
              ...(newSeat ? { seat: newSeat.seat, table: newSeat.table } : {}),
            }),
          });
          if (res.ok) {
            const data = await res.json().catch(() => null);
            tg.HapticFeedback.notificationOccurred("success");
            setShowAddForm(false);
            setName("");
            setNewTicket("regular");
            setNewSeat(null);
            await fetchPlayers();

            // Say out loud whether the nickname found its questionnaire: a walk-in who
            // was not matched earns nothing tonight, and the admin should know now.
            if (data?.linkedTo) {
              const username = data.linkedTo.username ? ` (@${data.linkedTo.username})` : "";
              tg.showAlert(`Игрок привязан к анкете ${data.linkedTo.displayName}${username}. Достижения зачтутся.`);
            } else if (data?.nicknameAmbiguous) {
              tg.showAlert("Ник встречается у нескольких игроков — достижения не зачтутся. Уточните ник.");
            } else {
              tg.showAlert("Анкета с таким ником не найдена — достижения за эту игру не зачтутся.");
            }
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
  }, [showAddForm, name, newSeat, newTicket, initData, fetchPlayers]);

  const selectedPlayer = useMemo(
    () => players.find((player) => player.id === selectedPlayerId) ?? null,
    [players, selectedPlayerId],
  );

  const canReceiveAddon = (player: Player) =>
    player.status === "active" && Math.max(0, Number(player.addons ?? 0)) < maxAddons;

  const selectedPlayerAddons = Math.max(0, Number(selectedPlayer?.addons ?? 0));
  // `rebuys` counts every re-entry, the doubles included; the card shows the two apart,
  // the way the sheet and the bill do.
  const selectedPlayerDoubleRebuys = Math.max(0, Number(selectedPlayer?.doubleRebuys ?? 0));
  const selectedPlayerRebuys = Math.max(
    0,
    Number(selectedPlayer?.rebuys ?? 0) - selectedPlayerDoubleRebuys,
  );
  // A knockout split between killers gives each a share of the bounty, so the count can
  // read 2,5; two decimals are enough for a three-way split.
  const selectedPlayerBounties = Number(
    Math.max(0, Number(selectedPlayer?.bountyCount ?? 0)).toFixed(2),
  ).toLocaleString("ru-RU");
  const selectedPlayerCanAddon =
    Boolean(selectedPlayer) &&
    selectedPlayer?.status === "active" &&
    addonEnabled &&
    selectedPlayerAddons < maxAddons;

  const closePlayerDetails = () => {
    setSelectedPlayerId(null);
    setRestoreChoiceOpen(false);
    setSeatTicketChoiceOpen(false);
    setMoveSeat(null);
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

  // Takes back an addon ticked on the wrong player. The count on screen goes along, so a
  // second tap on a stale card cannot take off another one.
  const submitCancelAddon = async () => {
    const tg = getTelegramWebApp();
    if (!selectedPlayer || selectedPlayerAddons < 1) return;

    const chipsPerAddon = Math.round(Number(selectedPlayer.addonChipsTotal ?? 0) / selectedPlayerAddons);
    const confirmText =
      `Отменить аддон игроку «${selectedPlayer.name}»? ` +
      `Снимем ${chipsPerAddon.toLocaleString("ru-RU")} фишек со стека, аддон уйдёт из счёта.` +
      // The desk has already taken the money, and the sheet will no longer ask for it.
      (selectedPlayer.paid ? "\nИгрок уже отмечен оплатившим — верните ему деньги за аддон." : "");

    tg?.showConfirm(confirmText, async (confirmed: boolean) => {
      if (!confirmed) return;

      const res = await fetch(`/api/tma/players/${selectedPlayer.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "X-Telegram-Init-Data": initData,
        },
        body: JSON.stringify({ action: "cancel_addon", expectedAddons: selectedPlayerAddons }),
      });

      if (res.ok) {
        tg?.HapticFeedback.notificationOccurred("success");
        await fetchPlayers();
        return;
      }

      const data = await res.json().catch(() => null);
      tg?.HapticFeedback.notificationOccurred("error");
      tg?.showAlert(CANCEL_ADDON_ERRORS[data?.error] ?? data?.error ?? "Ошибка сохранения");
      // Whatever was refused, the card has to show what the server holds now.
      await fetchPlayers();
    });
  };

  const toggleAddonSelection = (id: string) => {
    setAddonSelection((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    );
  };

  const closeAddonSelection = () => {
    setAddonSelectionOpen(false);
    setAddonSelection([]);
  };

  // Bulk addon: one request for every ticked player, so the sheet is synced once and
  // the admin does not open a dozen profiles in a row.
  const submitBulkAddon = async () => {
    const tg = getTelegramWebApp();
    if (addonSelection.length === 0 || isBulkAddonSaving) return;

    const names = addonSelection
      .map((id) => players.find((player) => player.id === id)?.name)
      .filter((name): name is string => Boolean(name));
    const shownNames = names.slice(0, CONFIRM_NAMES_LIMIT).join(", ");
    const restCount = names.length - Math.min(names.length, CONFIRM_NAMES_LIMIT);
    const confirmText =
      `Добавить аддон (${ADDON_CHIPS.toLocaleString("ru-RU")} фишек) ${addonSelection.length} игрокам?\n` +
      `${shownNames}${restCount > 0 ? ` и ещё ${restCount}` : ""}`;

    tg?.showConfirm(confirmText, async (confirmed: boolean) => {
      if (!confirmed) return;

      setIsBulkAddonSaving(true);
      try {
        const res = await fetch("/api/tma/players/addons", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Telegram-Init-Data": initData,
          },
          body: JSON.stringify({ playerIds: addonSelection }),
        });
        const data = await res.json().catch(() => null);

        if (!res.ok) {
          tg?.HapticFeedback.notificationOccurred("error");
          tg?.showAlert(data?.error === "Addons disabled" ? "Аддоны выключены в настройках" : "Ошибка сохранения");
          return;
        }

        const applied: Array<{ name: string }> = data?.applied ?? [];
        const failed: Array<{ name: string; reason: string }> = data?.failed ?? [];
        tg?.HapticFeedback.notificationOccurred(failed.length > 0 ? "warning" : "success");

        const failedText = failed
          .map((item) => `${item.name || "игрок"} — ${BULK_FAILURE_LABELS[item.reason] ?? item.reason}`)
          .join("; ");
        tg?.showAlert(
          failed.length > 0
            ? `Аддон добавлен: ${applied.length}. Не прошли: ${failed.length} (${failedText})`
            : `Аддон добавлен ${applied.length} игрокам`,
        );

        closeAddonSelection();
        await fetchPlayers();
      } finally {
        setIsBulkAddonSaving(false);
      }
    });
  };

  /**
   * Sits the player in the chair the admin tapped.
   *
   * A ticket is only sent when the admin said out loud to change it — the number goes
   * with the ticket, and a player has been called by theirs all evening.
   */
  const submitMoveSeat = async (ticketType?: "regular" | "vip") => {
    const tg = getTelegramWebApp();
    if (!selectedPlayer || !moveSeat || isMovingSeat) return;

    setIsMovingSeat(true);
    try {
      const res = await fetch(`/api/tma/players/${selectedPlayer.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "X-Telegram-Init-Data": initData,
        },
        body: JSON.stringify({
          action: "move_seat",
          seat: moveSeat.seat,
          table: moveSeat.table,
          ...(ticketType ? { ticketType } : {}),
        }),
      });

      if (res.ok) {
        tg?.HapticFeedback.notificationOccurred("success");
        setSeatTicketChoiceOpen(false);
        await fetchPlayers();
        return;
      }

      const data = await res.json().catch(() => null);
      tg?.HapticFeedback.notificationOccurred("error");
      tg?.showAlert(data?.error ?? "Ошибка пересадки");
    } finally {
      setIsMovingSeat(false);
    }
  };

  const startMoveSeat = () => {
    if (!selectedPlayer || !moveSeat) return;

    // Two reasons to ask before the player is moved. A walk-in has no number yet, and it
    // is drawn from the range the ticket names — nobody but the desk knows which ticket
    // they came in on. And a player whose ticket disagrees with the table they are being
    // sent to may be changing tickets or may just be sitting elsewhere; both happen.
    const movingToVipTable = isVipTable(moveSeat.table, tablesCount);
    const hasNumber = Number(selectedPlayer.registrationNumber) > 0;

    if (!hasNumber || movingToVipTable !== (readPlayerTicket(selectedPlayer) === "vip")) {
      setSeatTicketChoiceOpen(true);
      return;
    }

    void submitMoveSeat();
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

  // Every table of the evening, and any a player still sits at after the room shrank.
  const tableOptions = useMemo(
    () =>
      Array.from(
        new Set([
          ...Array.from({ length: tablesCount }, (_, index) => index + 1),
          ...players.map((player) => Number(player.table)).filter((table) => table > 0),
        ]),
      ).sort((a, b) => a - b),
    [players, tablesCount],
  );
  const visiblePlayers =
    tableFilter === ELIMINATED_FILTER
      ? players.filter((player) => player.status === "eliminated")
      : tableFilter
        ? players.filter((player) => player.table === Number(tableFilter))
        : players;
  const activeCount = players.filter((p) => p.status === "active").length;
  const elimCount = players.filter((p) => p.status === "eliminated").length;
  const unseatedCount = players.filter((p) => p.status === "active" && !(p.table && p.seat)).length;

  if (loading) return <div className="tma-empty">Загрузка…</div>;

  if (showAddForm) {
    return (
      <div className="tma-screen">
        <ScreenHeader
          back={{
            label: "Зал",
            onClick: () => {
              setNewTicket("regular");
              setNewSeat(null);
              setShowAddForm(false);
            },
          }}
          title="Новый игрок"
        />

        <label className="tma-field" htmlFor="new-player-name">
          <span className="tma-field__label">Ник</span>
          <input
            id="new-player-name"
            placeholder="Ник в клубе"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <p className="tma-hint tma-hint--pad">
          По нику найдём анкету игрока — тогда ему зачтутся достижения.
        </p>

        <SectionLabel title="Билет" />
        <div className="tma-segment">
          {NEW_PLAYER_TICKETS.map((ticket) => (
            <button
              key={ticket}
              aria-pressed={newTicket === ticket}
              type="button"
              onClick={() => {
                setNewTicket(ticket);
                setNewSeat(null);
              }}
            >
              {NEW_PLAYER_TICKET_LABELS[ticket]}
            </button>
          ))}
        </div>
        <p className="tma-hint tma-hint--pad">{NEW_PLAYER_TICKET_HINTS[newTicket]}</p>

        <SectionLabel meta="можно выдать позже с картой" title="Место" />
        <div className="tma-card">
          <p className="tma-hint">
            {newSeat
              ? `Сажаем за стол ${newSeat.table}, место ${nameSeat(tableFormats, newSeat.table, newSeat.seat)} — игрок сразу получит номер.`
              : "Выберите место — игрок сразу получит номер. Можно пропустить: место и номер выдадут вместе с картой."}
          </p>
          <SeatingPicker
            changingTable={changingTable}
            players={players}
            selected={newSeat}
            tableFormats={tableFormats}
            tablesCount={tablesCount}
            onChangeTableFormat={(table, direction) => void handleTableFormat(table, direction)}
            onSelect={(choice) => {
              getTelegramWebApp()?.HapticFeedback.impactOccurred("light");
              setNewSeat(choice);
            }}
            onTakenSeat={(takenBy) => getTelegramWebApp()?.showAlert(`Место занято: ${takenBy}`)}
          />
        </div>
        <p className="tma-hint tma-hint--pad">Кнопка «Добавить игрока» — внизу экрана Telegram.</p>
      </div>
    );
  }

  if (addonSelectionOpen) {
    const candidates = visiblePlayers.filter((player) => player.status === "active");
    const selectedCount = addonSelection.length;

    return (
      <div className="tma-screen">
        <ScreenHeader back={{ label: "Зал", onClick: closeAddonSelection }} title="Аддон списком" />

        <p className="tma-hint tma-hint--pad">
          По {ADDON_CHIPS.toLocaleString("ru-RU")} фишек каждому отмеченному. Серые — лимит
          аддонов исчерпан.
        </p>

        <TableChips tables={tableOptions} value={tableFilter} onChange={setTableFilter} />

        <div className="tma-card tma-card--flush">
          {candidates.map((player) => {
            const available = canReceiveAddon(player);
            const checked = addonSelection.includes(player.id);

            return (
              <label key={player.id} className={`tma-row${available ? "" : " tma-row--dim"}`}>
                <input
                  aria-label={`Выбрать ${player.name}`}
                  checked={checked}
                  disabled={!available}
                  type="checkbox"
                  onChange={() => toggleAddonSelection(player.id)}
                />
                <span className="tma-row__body">
                  <PlayerName player={player} />
                  <span className="tma-row__sub">
                    {player.seat
                      ? `Ст. ${player.table} · м. ${nameSeat(tableFormats, Number(player.table), player.seat)}`
                      : "Ждёт посадки"}{" "}
                    · аддоны {Math.max(0, Number(player.addons ?? 0))}/{maxAddons}
                    {available ? "" : " · лимит"}
                  </span>
                </span>
              </label>
            );
          })}
          {candidates.length === 0 && <div className="tma-empty">Нет активных игроков</div>}
        </div>

        {/* Sticky inside the scroller, not pinned to the window: pinned, it slid under
            the navigation bar. */}
        <div className="tma-cta-bar">
          <button
            className="tma-btn tma-btn--primary tma-btn--big"
            disabled={selectedCount === 0 || isBulkAddonSaving}
            type="button"
            onClick={() => void submitBulkAddon()}
          >
            <BadgePlus size={18} />
            {selectedCount === 0 ? "Выберите игроков" : `Добавить аддон ${selectedCount} игрокам`}
          </button>
        </div>
      </div>
    );
  }

  if (selectedPlayer && seatTicketChoiceOpen && moveSeat) {
    const movingToVipTable = isVipTable(moveSeat.table, tablesCount);
    const hasNumber = Number(selectedPlayer.registrationNumber) > 0;
    // A player without a number is being given one, and the table is the best guess at
    // which range it comes from; one who has a number keeps the ticket they hold unless
    // the admin picks the other.
    const defaultTicket = hasNumber
      ? readPlayerTicket(selectedPlayer)
      : movingToVipTable
        ? "vip"
        : "regular";
    const otherTicket = defaultTicket === "vip" ? "regular" : "vip";

    return (
      <div className="tma-screen">
        <ScreenHeader
          back={{ disabled: isMovingSeat, label: "Назад", onClick: () => setSeatTicketChoiceOpen(false) }}
          title="Пересадка"
        />

        <div className="tma-card">
          <span className="tma-hint">Пересаживаем</span>
          <span className="text-[20px] font-bold">
            {selectedPlayer.name}
            {hasNumber ? <span className="tma-muted font-medium"> #{selectedPlayer.registrationNumber}</span> : null}
          </span>
          <span className="flex items-center gap-2 text-sm">
            <span className="tma-badge">
              {selectedPlayer.seat
                ? `Стол ${selectedPlayer.table} · м. ${nameSeat(tableFormats, Number(selectedPlayer.table), selectedPlayer.seat)}`
                : "без места"}
            </span>
            <ArrowRight className="tma-muted" size={16} />
            <span className="tma-badge tma-badge--blue">
              {movingToVipTable ? "VIP стол" : "Стол"} {moveSeat.table} · м.{" "}
              {nameSeat(tableFormats, moveSeat.table, moveSeat.seat)}
            </span>
          </span>
        </div>

        <div className="tma-note tma-note--amber">
          <TriangleAlert size={18} />
          <span>
            {hasNumber
              ? `У игрока ${TICKET_LABELS[readPlayerTicket(selectedPlayer)]} и номер #${selectedPlayer.registrationNumber}. Номер идёт за билетом, а не за столом — менять его нужно, только если игрок действительно перешёл на другой билет.`
              : "У игрока ещё нет номера для розыгрыша. Номер выдаётся по билету: VIP-билет получает номер из VIP-диапазона, обычный — из обычного."}
          </span>
        </div>

        <SectionLabel title="Билет" />
        <button
          className="tma-choice tma-choice--primary"
          disabled={isMovingSeat}
          type="button"
          onClick={() => void submitMoveSeat(defaultTicket)}
        >
          <span className="tma-choice__body">
            <span className="tma-choice__title">
              {hasNumber ? `Оставить ${TICKET_LABELS[defaultTicket]}` : TICKET_LABELS[defaultTicket]}
            </span>
            <span className="tma-choice__sub">
              {hasNumber
                ? "Пересадить, номер и цена не меняются"
                : `Выдать номер${defaultTicket === "vip" ? " из VIP-диапазона" : " из обычных"}`}
            </span>
          </span>
        </button>

        <button
          className="tma-choice"
          disabled={isMovingSeat}
          type="button"
          onClick={() => void submitMoveSeat(otherTicket)}
        >
          <span className="tma-choice__body">
            <span className="tma-choice__title">
              {hasNumber ? `Сменить на ${TICKET_LABELS[otherTicket]}` : TICKET_LABELS[otherTicket]}
            </span>
            <span className="tma-choice__sub">
              {hasNumber
                ? `Новый номер${otherTicket === "vip" ? " из VIP-диапазона, игрок попадёт в VIP-розыгрыш" : " из обычных"}, цена билета изменится`
                : `Выдать номер${otherTicket === "vip" ? " из VIP-диапазона" : " из обычных"}`}
            </span>
          </span>
        </button>
      </div>
    );
  }

  if (selectedPlayer && restoreChoiceOpen) {
    return (
      <div className="tma-screen">
        <ScreenHeader
          back={{ disabled: isRestoring, label: "Назад", onClick: () => setRestoreChoiceOpen(false) }}
          title="Вернуть в игру"
        />

        <div className="tma-card">
          <span className="text-[20px] font-bold">{formatPlayerNameWithRegistrationNumber(selectedPlayer)}</span>
          <span className="tma-row__badges">
            <span className="tma-badge tma-badge--red">Выбыл</span>
          </span>
        </div>

        <SectionLabel title={`Почему возвращается ${selectedPlayer.name}?`} />

        <button
          className="tma-choice"
          disabled={isRestoring}
          type="button"
          onClick={() => void submitRestorePlayer("none")}
        >
          <span className="tma-choice__body">
            <span className="tma-choice__title">Вылет по ошибке</span>
            <span className="tma-choice__sub">Выбывание стирается, ре-энтри не засчитывается</span>
          </span>
        </button>

        <button
          className="tma-choice"
          disabled={isRestoring || !reentryAvailable}
          type="button"
          onClick={() => void submitRestorePlayer("single")}
        >
          <span className="tma-choice__body">
            <span className="tma-choice__title">Ребай</span>
            <span className="tma-choice__sub">
              {reentryAvailable ? "Выбивание остаётся, игроку засчитывается ре-энтри" : "Ре-энтри сейчас недоступен"}
            </span>
          </span>
        </button>

        <button
          className="tma-choice"
          disabled={isRestoring || !doubleReentryAvailable}
          type="button"
          onClick={() => void submitRestorePlayer("double")}
        >
          <span className="tma-choice__body">
            <span className="tma-choice__title">Двойной ребай (x2)</span>
            <span className="tma-choice__sub">
              {doubleReentryAvailable ? "Ре-энтри + отметка x2" : "x2 недоступен на текущем уровне"}
            </span>
          </span>
        </button>
      </div>
    );
  }

  if (selectedPlayer) {
    const isActive = selectedPlayer.status === "active";
    const canCancelAddon = addonEnabled && selectedPlayerAddons > 0;
    const moveTargetIsCurrent =
      moveSeat?.table === selectedPlayer.table && moveSeat?.seat === selectedPlayer.seat;

    return (
      <div className="tma-screen">
        <ScreenHeader back={{ label: "Назад", onClick: closePlayerDetails }} title="Игрок" />

        <div className="flex items-center gap-3">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[var(--tma-surface-2)] text-lg font-bold">
            {initialsOf(selectedPlayer.name)}
          </span>
          <div className="flex min-w-0 flex-col gap-1">
            <span className="truncate text-[20px] font-bold">
              {formatPlayerNameWithRegistrationNumber(selectedPlayer)}
            </span>
            <span className="tma-row__badges">
              {isActive ? (
                <span className="tma-badge tma-badge--green">● В игре</span>
              ) : (
                <span className="tma-badge tma-badge--red">Выбыл</span>
              )}
              {readPlayerTicket(selectedPlayer) === "vip" ? (
                <span className="tma-badge tma-badge--gold">VIP билет</span>
              ) : (
                <span className="tma-badge">Обычный билет</span>
              )}
              {selectedPlayer.seat ? (
                <span className="tma-badge">
                  Стол {selectedPlayer.table} · м. {nameSeat(tableFormats, Number(selectedPlayer.table), selectedPlayer.seat)}
                </span>
              ) : selectedPlayer.table ? (
                <span className="tma-badge">Стол {selectedPlayer.table}</span>
              ) : isActive ? (
                <span className="tma-badge tma-badge--amber">без места</span>
              ) : null}
            </span>
          </div>
        </div>

        <div className="tma-card">
          <div className="tma-stats tma-stats--inline">
            <div className="tma-stat">
              <span className="tma-stat__label">Стек</span>
              <span className="tma-stat__value">{selectedPlayer.stack.toLocaleString("ru-RU")}</span>
            </div>
            <div className="tma-stat">
              <span className="tma-stat__label">Аддоны</span>
              <span className="tma-stat__value">{selectedPlayerAddons} / {maxAddons}</span>
            </div>
            <div className="tma-stat">
              <span className="tma-stat__label">Ребаи</span>
              <span className="tma-stat__value">{selectedPlayerRebuys}</span>
            </div>
            <div className="tma-stat">
              <span className="tma-stat__label">Двойные ребаи</span>
              <span className="tma-stat__value">{selectedPlayerDoubleRebuys}</span>
            </div>
            {/* Last, so the figures above stay put whether tonight pays bounties or not. */}
            {isBounty ? (
              <div className="tma-stat">
                <span className="tma-stat__label">Баунти</span>
                <span className="tma-stat__value">{selectedPlayerBounties}</span>
              </div>
            ) : null}
          </div>
        </div>

        {isActive ? (
          <div className="tma-tiles">
            <button
              className="tma-tile"
              disabled={!selectedPlayerCanAddon}
              type="button"
              onClick={() => void submitAddon()}
            >
              <BadgePlus size={22} />
              {addonEnabled && selectedPlayerAddons >= maxAddons ? "Аддон · лимит" : "Добавить аддон"}
            </button>
            <button
              className="tma-tile"
              type="button"
              onClick={() => seatingRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
            >
              <ArrowRightLeft className="text-[var(--tma-link)]" size={22} />
              Пересадить
            </button>
            <Link
              className="tma-tile tma-tile--danger"
              href={`/tma/eliminations?out=${encodeURIComponent(selectedPlayer.id)}`}
            >
              <Skull size={22} />
              Выбыл
            </Link>
          </div>
        ) : (
          <button
            className="tma-btn tma-btn--primary tma-btn--big"
            type="button"
            onClick={() => setRestoreChoiceOpen(true)}
          >
            <RotateCcw size={18} /> Вернуть в игру
          </button>
        )}

        {isActive ? (
          <>
            <div ref={seatingRef}>
              <SectionLabel meta="нажмите на свободное место" title="Пересадка" />
            </div>
            <div className="tma-card">
              <SeatingPicker
                changingTable={changingTable}
                ignorePlayerId={selectedPlayer.id}
                players={players}
                selected={moveSeat}
                tableFormats={tableFormats}
                tablesCount={tablesCount}
                onChangeTableFormat={(table, direction) => void handleTableFormat(table, direction)}
                onSelect={(choice) => {
                  getTelegramWebApp()?.HapticFeedback.impactOccurred("light");
                  setMoveSeat(choice);
                }}
                onTakenSeat={(takenBy) => getTelegramWebApp()?.showAlert(`Место занято: ${takenBy}`)}
              />
            </div>
          </>
        ) : null}

        {canCancelAddon || isActive ? (
          <div className="tma-btn-row">
            {/* Out or still playing, the addon stays on the bill until it is taken back. */}
            {canCancelAddon ? (
              <button
                className="tma-btn tma-btn--danger-text"
                type="button"
                onClick={() => void submitCancelAddon()}
              >
                <BadgeMinus size={18} /> Отменить аддон
              </button>
            ) : null}
            {isActive ? (
              <button
                className="tma-btn tma-btn--danger-text"
                type="button"
                onClick={() => handleDelete(selectedPlayer.id)}
              >
                <Trash2 size={18} /> Удалить
              </button>
            ) : null}
          </div>
        ) : null}

        {isActive ? (
          <div className="tma-cta-bar">
            <button
              className="tma-btn tma-btn--primary tma-btn--big"
              disabled={isMovingSeat || !moveSeat || moveTargetIsCurrent}
              type="button"
              onClick={startMoveSeat}
            >
              <ArrowRightLeft size={18} />
              {moveSeat && !moveTargetIsCurrent
                ? `Пересадить: стол ${moveSeat.table}, место ${nameSeat(tableFormats, moveSeat.table, moveSeat.seat)}`
                : "Выберите место для пересадки"}
            </button>
          </div>
        ) : null}
      </div>
    );
  }

  const openPlayer = (player: Player) => {
    setMoveSeat(player.table && player.seat ? { seat: player.seat, table: player.table } : null);
    setSeatTicketChoiceOpen(false);
    setSelectedPlayerId(player.id);
    getTelegramWebApp()?.HapticFeedback.impactOccurred("light");
  };

  const query = search.trim().toLowerCase();
  const matchesSearch = (player: Player) =>
    !query ||
    player.name.toLowerCase().includes(query) ||
    String(player.registrationNumber ?? "") === query.replace(/^#/, "");
  const shownPlayers = visiblePlayers.filter(matchesSearch);
  const seatedTables = Array.from(
    new Set(
      shownPlayers
        .filter((player) => player.status === "active" && player.table && player.seat)
        .map((player) => Number(player.table)),
    ),
  ).sort((a, b) => a - b);
  const unseated = shownPlayers.filter((player) => player.status === "active" && !(player.table && player.seat));
  const eliminated = shownPlayers.filter((player) => player.status === "eliminated");

  return (
    <div className="tma-screen">
      <ScreenHeader
        actions={
          <>
            {addonEnabled && (
              <button
                aria-label="Аддон списком"
                className="tma-icon-btn"
                type="button"
                onClick={() => {
                  setAddonSelection([]);
                  // Nobody who is out can take an add-on, so their filter does not carry over.
                  if (tableFilter === ELIMINATED_FILTER) setTableFilter("");
                  setAddonSelectionOpen(true);
                  getTelegramWebApp()?.HapticFeedback.impactOccurred("light");
                }}
              >
                <CheckSquare size={20} />
              </button>
            )}
            <button
              aria-label="Добавить игрока"
              className="tma-icon-btn tma-icon-btn--primary"
              type="button"
              onClick={() => {
                setShowAddForm(true);
                getTelegramWebApp()?.HapticFeedback.impactOccurred("light");
              }}
            >
              <Plus size={20} />
            </button>
          </>
        }
        title="Зал"
      />

      <div className="tma-stats">
        <div className="tma-stat tma-stat--tile">
          <span className="tma-stat__label">В игре</span>
          <span className="tma-stat__value">{activeCount}</span>
        </div>
        <div className="tma-stat tma-stat--tile">
          <span className="tma-stat__label">Выбыло</span>
          <span className="tma-stat__value">{elimCount}</span>
        </div>
        <div className="tma-stat tma-stat--tile">
          <span className="tma-stat__label">Без места</span>
          <span className={`tma-stat__value${unseatedCount > 0 ? " tma-stat__value--amber" : ""}`}>
            {unseatedCount}
          </span>
        </div>
      </div>

      <Link className="tma-banner" href="/tma/signups">
        <ClipboardList size={18} />
        <span className="tma-banner__text">Заявки на турнир</span>
        <ChevronRight size={18} />
      </Link>

      <label className="tma-search">
        <Search size={18} />
        <input
          aria-label="Поиск игрока"
          placeholder="Поиск по нику или номеру"
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </label>

      <TableChips
        extra={[{ label: "Выбывшие", value: ELIMINATED_FILTER }]}
        tables={tableOptions}
        value={tableFilter}
        onChange={setTableFilter}
      />

      {seatedTables.map((tableNumber) => {
        const atTable = shownPlayers
          .filter((player) => player.status === "active" && Number(player.table) === tableNumber && player.seat)
          .sort((a, b) => a.seat - b.seat);

        return (
          <div key={tableNumber} className="tma-card tma-card--flush">
            <div className="tma-card__head">
              <span>
                {isVipTable(tableNumber, tablesCount) ? "VIP · " : ""}Стол {tableNumber}
              </span>
              <span className="tma-card__head-meta">{atTable.length} игр.</span>
            </div>
            {atTable.map((player) => (
              <PlayerRow
                key={player.id}
                lead={nameSeat(tableFormats, tableNumber, player.seat)}
                player={player}
                onOpen={openPlayer}
              />
            ))}
          </div>
        );
      })}

      {unseated.length > 0 ? (
        <div className="tma-card tma-card--flush">
          <div className="tma-card__head">
            <span>Без места</span>
            <span className="tma-card__head-meta">{unseated.length}</span>
          </div>
          {unseated.map((player) => (
            <PlayerRow key={player.id} lead="—" player={player} onOpen={openPlayer} />
          ))}
        </div>
      ) : null}

      {eliminated.length > 0 ? (
        <div className="tma-card tma-card--flush">
          <div className="tma-card__head">
            <span>Выбывшие</span>
            <span className="tma-card__head-meta">{eliminated.length}</span>
          </div>
          {eliminated.map((player) => (
            <PlayerRow key={player.id} out player={player} onOpen={openPlayer} />
          ))}
        </div>
      ) : null}

      {shownPlayers.length === 0 && (
        <div className="tma-empty">{query ? "Никого не нашли" : "Нет игроков"}</div>
      )}
    </div>
  );
}

/** The two letters on a player's card, in place of a photo. */
function initialsOf(name: string) {
  const letters = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? "");
  return letters.join("") || "?";
}

/** The nickname, with the number the room calls the player by after it. */
function PlayerName({ player }: { player: Player }) {
  const number = Number(player.registrationNumber);

  return (
    <span className="tma-row__title">
      <span>{player.name}</span>
      {Number.isInteger(number) && number > 0 ? <span className="tma-muted font-medium"> #{number}</span> : null}
    </span>
  );
}

/** One player in the room list: the chair, the name, what they bought and their stack. */
function PlayerRow({
  lead,
  onOpen,
  out = false,
  player,
}: {
  lead?: string;
  onOpen: (player: Player) => void;
  out?: boolean;
  player: Player;
}) {
  const addons = Math.max(0, Number(player.addons ?? 0));
  const doubles = Math.max(0, Number(player.doubleRebuys ?? 0));
  const rebuys = Math.max(0, Number(player.rebuys ?? 0) - doubles);

  return (
    <button className="tma-row" type="button" onClick={() => onOpen(player)}>
      <span className={`tma-row__lead${out ? " tma-row__lead--out" : ""}`}>
        {out ? <Skull size={16} /> : lead}
      </span>
      <span className="tma-row__body">
        <PlayerName player={player} />
        {addons + rebuys + doubles > 0 || out ? (
          <span className="tma-row__badges">
            {out ? <span className="tma-badge tma-badge--red">выбыл</span> : null}
            {addons > 0 ? <span className="tma-badge">A{addons}</span> : null}
            {rebuys > 0 ? <span className="tma-badge">R{rebuys}</span> : null}
            {doubles > 0 ? <span className="tma-badge">x2·{doubles}</span> : null}
          </span>
        ) : null}
      </span>
      {out ? null : <span className="tma-row__end">{player.stack.toLocaleString("ru-RU")}</span>}
    </button>
  );
}
