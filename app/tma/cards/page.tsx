"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Check,
  ChevronLeft,
  CreditCard,
  Dices,
  Keyboard,
  QrCode,
  RotateCcw,
  Search,
  Ticket,
  UserPlus,
  Wallet,
} from "lucide-react";
import { ScreenHeader, SectionLabel } from "../ui";
import { confirmSeated, getTelegramWebApp, useTMA } from "../layout";
import { ClientProfileCard } from "../client-profile-card";
import { CashTabs } from "../cash-tabs";
import { formatRubles } from "@/lib/debts/ledger";
import { buildNicknameKey } from "@/lib/players/nickname-key";
import { formatEventTimeLabel } from "@/lib/events/types";
import { isVipRegistrationNumber } from "@/lib/player-registration-number";
import { SeatingPicker } from "@/components/tma/seating-picker";
import { nameSeat } from "@/lib/tables/seating";
import {
  changeTableFormat,
  drawSeatOrGrowTable,
  readTableFormatsFrom,
  type TableFormats,
} from "../table-formats";
import {
  buildCardCodeFromDigits,
  CARD_CODE_PREFIX,
  CARD_CODE_PREFIXES,
  type CardCodePrefix,
  type CardSession,
  type TicketType,
} from "@/lib/cards/card-code";
import type { ChargeLine } from "@/lib/finance/player-charge";

type Signup = {
  id: string;
  name: string;
  seated: boolean;
  ticketType: TicketType;
  usePass: "none" | "regular" | "vip";
  userId?: string | null;
  username: string | null;
};

/** What a player still owes from past evenings, as the desk sees it next to the name. */
type PastDebt = { accountId: string | null; owed: number; playerName: string };

/** Tonight's own bill is on the row already; the badge is about the evenings before it. */
const TONIGHT_MS = 12 * 60 * 60 * 1000;

type Player = {
  cardCode?: string | null;
  id: string;
  name: string;
  registrationNumber?: number | null;
  seat?: number | null;
  status: "active" | "eliminated";
  table?: number | null;
};

type SeatChoice = { seat: number; table: number };

/** A card is handed either to a sign-up or to a player already at a table. */
type SeatingTarget =
  | { kind: "signup"; signup: Signup }
  | { kind: "player"; player: Player };

function targetName(target: SeatingTarget) {
  return target.kind === "signup" ? target.signup.name : target.player.name;
}

const TICKET_LABELS: Record<TicketType, string> = {
  regular: "Обычный билет",
  vip: "VIP билет",
};

const PASS_LABELS: Record<TicketType, string> = {
  regular: "проходка",
  vip: "VIP проходка",
};

export default function TMACardsPage() {
  const { initData } = useTMA();
  const [players, setPlayers] = useState<Player[]>([]);
  const [signups, setSignups] = useState<Signup[]>([]);
  const [tablesCount, setTablesCount] = useState(1);
  // Each table's format tonight, so the plan is not drawn with one chair too many.
  const [tableFormats, setTableFormats] = useState<TableFormats>(null);
  // The table whose chairs are being changed, so its buttons wait for the answer.
  const [changingTable, setChangingTable] = useState<number | null>(null);
  // Who the card is being handed to, waiting for a chair: someone who signed up in the
  // app, or a walk-in already in the roster.
  const [seating, setSeating] = useState<SeatingTarget | null>(null);
  const [seatChoice, setSeatChoice] = useState<SeatChoice | null>(null);
  const [manualOpen, setManualOpen] = useState(false);
  const [manualPrefix, setManualPrefix] = useState<CardCodePrefix>(CARD_CODE_PREFIX);
  const [manualCode, setManualCode] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [session, setSession] = useState<CardSession | null>(null);
  // Every card that is out tonight, so the desk can see who still owes money.
  const [issued, setIssued] = useState<CardSession[]>([]);
  // Whether the club is handing out its printed cards tonight. Without them the desk
  // works from the same list, found by name rather than by scanner.
  const [cardsEnabled, setCardsEnabled] = useState(true);
  const [scannedCode, setScannedCode] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [ticketType, setTicketType] = useState<TicketType>("regular");
  const [pastDebts, setPastDebts] = useState<PastDebt[]>([]);

  const loadPlayers = useCallback(async () => {
    try {
      const [playersRes, signupsRes, issuedRes] = await Promise.all([
        fetch("/api/tma/players", { headers: { "X-Telegram-Init-Data": initData } }),
        fetch("/api/tma/event-signups", { headers: { "X-Telegram-Init-Data": initData } }),
        fetch("/api/tma/cards", { headers: { "X-Telegram-Init-Data": initData } }),
      ]);

      if (issuedRes.ok) {
        const data = await issuedRes.json();
        setIssued(data.issued ?? []);
        setCardsEnabled(data.cardsEnabled !== false);
      }

      if (playersRes.ok) {
        const data = await playersRes.json();
        setPlayers(data.players ?? []);
        setTablesCount(Math.max(1, Number(data.tablesCount ?? 1)));
        setTableFormats(readTableFormatsFrom(data));
      }

      if (signupsRes.ok) {
        const data = await signupsRes.json();
        setSignups(data.signups ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, [initData]);

  // Read once when the desk opens the tab: a debt from another evening does not change
  // while tonight's room is being seated.
  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const res = await fetch("/api/tma/debts", { headers: { "X-Telegram-Init-Data": initData } });
        if (!res.ok || cancelled) return;

        const data = await res.json();
        const now = Date.now();
        const debts = (data.debtors ?? []) as Array<{
          accountId: string | null;
          games: Array<{ gameStartedAt: string; left: number }>;
          playerName: string;
        }>;

        setPastDebts(
          debts
            .map((debtor) => ({
              accountId: debtor.accountId,
              owed: debtor.games
                .filter((game) => now - Date.parse(game.gameStartedAt) > TONIGHT_MS)
                .reduce((sum, game) => sum + game.left, 0),
              playerName: debtor.playerName,
            }))
            .filter((debt) => debt.owed > 0),
        );
      } catch {
        // The badge is a reminder for the desk, not something to stop the evening over.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [initData]);

  useEffect(() => {
    const timeout = window.setTimeout(() => void loadPlayers(), 0);
    return () => window.clearTimeout(timeout);
  }, [loadPlayers]);

  const readCard = useCallback(
    async (code: string) => {
      const tg = getTelegramWebApp();
      setBusy(true);
      try {
        const res = await fetch(`/api/tma/cards?code=${encodeURIComponent(code)}`, {
          headers: { "X-Telegram-Init-Data": initData },
        });
        const data = await res.json().catch(() => null);

        if (!res.ok) {
          tg?.showAlert(data?.error ?? "Не удалось прочитать карту");
          return;
        }

        setScannedCode(code);
        setSession(data.session);
        tg?.HapticFeedback.notificationOccurred(data.session ? "success" : "warning");
      } finally {
        setBusy(false);
      }
    },
    [initData],
  );

  const scan = () => {
    const tg = getTelegramWebApp();

    if (!tg?.showScanQrPopup) {
      // An old Telegram client has no camera to open, so the code is typed in instead
      // of the screen becoming useless. In a browser the desk draws its own scanner.
      setManualOpen(true);
      return;
    }

    tg.showScanQrPopup({ text: "Наведите на QR-код карты" }, (text: string) => {
      const code = text.trim();
      if (!code) return false;

      tg.closeScanQrPopup?.();
      void readCard(code);
      return true;
    });
  };

  const assign = async (player: Player, choice: SeatChoice) => {
    const tg = getTelegramWebApp();
    if (busy || (cardsEnabled && !scannedCode)) return;

    setBusy(true);
    try {
      const res = await fetch("/api/tma/cards", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Telegram-Init-Data": initData },
        body: JSON.stringify({
          cardCode: scannedCode ?? "",
          playerId: player.id,
          seat: choice.seat,
          table: choice.table,
          ticketType,
        }),
      });
      const data = await res.json().catch(() => null);

      if (!res.ok) {
        tg?.HapticFeedback.notificationOccurred("error");
        tg?.showAlert(data?.error ?? (cardsEnabled ? "Не удалось выдать карту" : "Не удалось посадить игрока"));
        return;
      }

      tg?.HapticFeedback.notificationOccurred("success");
      await confirmSeated(player.name, {
        ...choice,
        label: nameSeat(tableFormats, choice.table, choice.seat),
      });
      setSession(null);
      setScannedCode(null);
      setSeating(null);
      setSeatChoice(null);
      setSearch("");
      await loadPlayers();
    } finally {
      setBusy(false);
    }
  };

  /**
   * A free entry is club money, so the desk is told about it before anything else —
   * the admin acknowledges the pass, and only then picks the chair.
   */
  const startSeating = (signup: Signup) => {
    const tg = getTelegramWebApp();
    const openPlan = () => {
      // The player already said which ticket they wanted; the admin can still change it.
      setTicketType(signup.ticketType);
      setSeatChoice(null);
      setSeating({ kind: "signup", signup });
    };

    if (signup.usePass === "none" || !tg?.showAlert) {
      openPlan();
      return;
    }

    tg.showAlert(
      signup.usePass === "vip"
        ? "Игрок использовал бесплатную VIP проходку"
        : "Игрок использовал бесплатную проходку",
      openPlan,
    );
  };

  /**
   * A walk-in already in the roster: the card is handed over on the same screen, so the
   * chair is chosen rather than left at whatever the roster defaulted to.
   */
  const startSeatingPlayer = (player: Player) => {
    // A VIP registration number means a VIP seat, so the ticket is pre-picked to match
    // and the admin only overrides the exception.
    setTicketType(isVipRegistrationNumber(player.registrationNumber) ? "vip" : "regular");
    setSeatChoice(
      player.table && player.seat ? { seat: player.seat, table: player.table } : null,
    );
    setSeating({ kind: "player", player });
  };

  /**
   * Sends the player to a free seat the club drew for them. The ticket decides the
   * room: a VIP ticket — bought or covered by a VIP pass — belongs at the VIP table,
   * a regular one at the regular tables. With the room full, the desk is offered a chair
   * at the emptiest table that can still take one.
   */
  const seatAtRandom = async (target: SeatingTarget) => {
    const seated =
      target.kind === "player"
        ? players.filter((item) => item.id !== target.player.id)
        : players;
    const picked = await drawSeatOrGrowTable({
      initData,
      onFormatsChanged: setTableFormats,
      players: seated,
      tableFormats,
      tablesCount,
      ticket: ticketType,
    });
    if (!picked) return;

    setSeatChoice(picked);
    void handOverCard(target, picked);
  };

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

  /** Hands the card over, whichever kind of player is on the other side of the desk. */
  const handOverCard = async (target: SeatingTarget, choice: SeatChoice) => {
    if (target.kind === "signup") {
      await seatAndAssign(target.signup, choice);
      return;
    }

    await assign(target.player, choice);
  };

  const seatAndAssign = async (signup: Signup, choice: SeatChoice) => {
    const tg = getTelegramWebApp();
    if (busy || (cardsEnabled && !scannedCode)) return;

    setBusy(true);
    try {
      const res = await fetch(`/api/tma/event-signups/${signup.id}/seat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Telegram-Init-Data": initData },
        body: JSON.stringify({
          cardCode: scannedCode ?? "",
          seat: choice.seat,
          table: choice.table,
          ticketType,
        }),
      });
      const data = await res.json().catch(() => null);

      if (!res.ok) {
        tg?.HapticFeedback.notificationOccurred("error");
        tg?.showAlert(data?.error ?? "Не удалось посадить игрока");
        return;
      }

      // Said first and waited on: an alert opened while another is still up is dropped by
      // some Telegram clients, and the seat is the one thing the admin came here for.
      await confirmSeated(signup.name, {
        ...choice,
        label: nameSeat(tableFormats, choice.table, choice.seat),
      });

      // The pass was announced before the seat was picked, so the only thing left to
      // say is when the club could not actually take one — it was spent elsewhere, or
      // an admin removed it between the sign-up and the door.
      if (signup.usePass !== "none" && !data?.passUsed) {
        tg?.showAlert("Проходку списать не удалось — у игрока её больше нет. Возьмите оплату.");
      }

      // The seat is saved even when the card clashed, so the two outcomes are told apart.
      if (data?.cardError) {
        tg?.HapticFeedback.notificationOccurred("error");
        tg?.showAlert(`${data.cardError}. Игрок посажен — отсканируйте другую карту.`);
        setScannedCode(null);
      } else {
        tg?.HapticFeedback.notificationOccurred("success");
        setSession(null);
        setScannedCode(null);
      }

      setSeating(null);
      setSeatChoice(null);
      setSearch("");
      await loadPlayers();
    } finally {
      setBusy(false);
    }
  };

  /** Flips a player between "paid" and "owes", for the amount their bill stands at. */
  const setPaid = async (card: CardSession, paid: boolean) => {
    const tg = getTelegramWebApp();
    if (busy) return;

    setBusy(true);
    try {
      const res = await fetch("/api/tma/cards/paid", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Telegram-Init-Data": initData },
        body: JSON.stringify({ cardCode: card.cardCode, paid, playerId: card.playerId }),
      });
      const data = await res.json().catch(() => null);

      if (!res.ok) {
        tg?.HapticFeedback.notificationOccurred("error");
        tg?.showAlert(data?.error ?? "Не удалось отметить оплату");
        return;
      }

      tg?.HapticFeedback.impactOccurred("light");
      if (session?.playerId === card.playerId) setSession(data.session);
      await loadPlayers();
    } finally {
      setBusy(false);
    }
  };

  const release = () => {
    const tg = getTelegramWebApp();
    if (!scannedCode || !session) return;

    const question = session.paid
      ? `${session.name} оплатил. Принять карту?`
      : `${session.name} НЕ оплатил: ${session.charge.total.toLocaleString("ru-RU")} ₽. Принять карту?`;

    tg?.showConfirm(question, async (confirmed: boolean) => {
      if (!confirmed) return;

      setBusy(true);
      try {
        const res = await fetch(`/api/tma/cards?code=${encodeURIComponent(scannedCode)}`, {
          method: "DELETE",
          headers: { "X-Telegram-Init-Data": initData },
        });

        if (res.ok) {
          tg?.HapticFeedback.notificationOccurred("success");
          setSession(null);
          setScannedCode(null);
          await loadPlayers();
          return;
        }

        const data = await res.json().catch(() => null);
        tg?.showAlert(data?.error ?? "Не удалось принять карту");
      } finally {
        setBusy(false);
      }
    });
  };

  if (loading) return <div className="tma-empty">Загрузка…</div>;

  // Seating takes over the screen: the admin is picking one chair, and everything else
  // would only be in the way.
  if (seating) {
    return (
      <div className="tma-screen">
        <ScreenHeader
          back={{
            disabled: busy,
            label: "Касса",
            onClick: () => {
              setSeating(null);
              setSeatChoice(null);
            },
          }}
          title="Куда сажаем"
        />

        <div className="tma-card">
          <span className="text-[20px] font-bold">{targetName(seating)}</span>
          <span className="tma-row__badges">
            <span className={`tma-badge${ticketType === "vip" ? " tma-badge--gold" : ""}`}>
              {TICKET_LABELS[ticketType]}
            </span>
            {scannedCode ? <span className="tma-badge">карта {scannedCode}</span> : null}
          </span>
        </div>

        <button
          className="tma-btn tma-btn--link"
          disabled={busy}
          type="button"
          onClick={() => void seatAtRandom(seating)}
        >
          <Dices size={18} /> Посадить на случайное место
        </button>

        <div className="tma-card">
          <SeatingPicker
            changingTable={changingTable}
            ignorePlayerId={seating.kind === "player" ? seating.player.id : undefined}
            players={players}
            selected={seatChoice}
            tableFormats={tableFormats}
            tablesCount={tablesCount}
            onChangeTableFormat={(table, direction) => void handleTableFormat(table, direction)}
            onSelect={(choice) => {
              getTelegramWebApp()?.HapticFeedback.impactOccurred("light");
              setSeatChoice(choice);
            }}
            onTakenSeat={(name) =>
              getTelegramWebApp()?.showAlert(`Место занято: ${name}`)
            }
          />
        </div>

        <div className="tma-cta-bar">
          <button
            className="tma-btn tma-btn--primary tma-btn--big"
            disabled={busy || !seatChoice}
            type="button"
            onClick={() => seatChoice && void handOverCard(seating, seatChoice)}
          >
            {seatChoice
              ? `Посадить за стол ${seatChoice.table}, место ${nameSeat(tableFormats, seatChoice.table, seatChoice.seat)}`
              : "Выберите место"}
          </button>
        </div>
      </div>
    );
  }

  const waitingSignups = signups
    .filter((signup) => !signup.seated)
    .filter((signup) => signup.name.toLowerCase().includes(search.toLowerCase()));

  const withoutCard = players
    .filter((player) =>
      player.status === "active" && (cardsEnabled ? !player.cardCode : !player.table),
    )
    .filter((player) => player.name.toLowerCase().includes(search.toLowerCase()));

  // The settling list is searched by name too when there is no scanner to jump straight
  // to somebody: at the end of the evening it is the whole room.
  const settling = issued.filter((card) =>
    cardsEnabled ? true : card.name.toLowerCase().includes(search.toLowerCase()),
  );
  // The list keeps everyone who has settled, so its length no longer says how much work
  // is left — the number the desk actually works by is how many still owe.
  const unpaidCount = settling.filter((card) => !card.paid).length;

  // Matched by account where the row knows it, and by nickname for a player typed in at
  // the door — the same player the debt was written to.
  const debtBadge = (who: { accountId?: string | null; name: string }) => {
    const nickname = buildNicknameKey(who.name);
    const debt = pastDebts.find(
      (item) =>
        (who.accountId && item.accountId === who.accountId) ||
        buildNicknameKey(item.playerName) === nickname,
    );

    return debt ? <span className="tma-badge tma-badge--red">долг {formatRubles(debt.owed)}</span> : null;
  };

  const searchBox = (
    <label className="tma-search">
      <Search size={18} />
      <input
        placeholder="Поиск по нику"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
      />
    </label>
  );

  return (
    <div className="tma-screen">
      <ScreenHeader
        back={
          session
            ? {
                label: "Касса",
                // Leaving a scanned bill puts the card down too: the desk goes back to
                // the evening's list, the card stays with the player.
                onClick: () => {
                  setSession(null);
                  setScannedCode(null);
                },
              }
            : undefined
        }
        title={session ? "Счёт игрока" : "Касса"}
      />

      {!session ? <CashTabs current="evening" /> : null}

      {cardsEnabled && !session ? (
        <>
          <button
            className="tma-btn tma-btn--primary tma-btn--big"
            disabled={busy}
            type="button"
            onClick={scan}
          >
            <QrCode size={20} /> Сканировать карту
          </button>

          <button
            className="tma-btn"
            type="button"
            onClick={() => setManualOpen((open) => !open)}
          >
            <Keyboard size={16} /> {manualOpen ? "Скрыть ручной ввод" : "Ввести код вручную"}
          </button>
        </>
      ) : null}

      {!cardsEnabled && !session ? (
        <div className="tma-note">
          <CreditCard size={18} />
          <span>Сегодня без карт: найдите игрока по нику в списке ниже.</span>
        </div>
      ) : null}

      {manualOpen && !session ? (
        <div className="flex gap-2">
          {/* The prefix is picked rather than typed a hundred times a night — the club
              prints guest cards as a run of their own, and G-05 is not MJ-05. */}
          <div className="tma-search flex-1 !px-1.5">
            {CARD_CODE_PREFIXES.map((prefix) => (
              <button
                key={prefix}
                aria-label={`Карты ${prefix}`}
                aria-pressed={manualPrefix === prefix}
                className={`h-8 shrink-0 rounded-lg border-0 px-2.5 text-sm font-semibold ${
                  manualPrefix === prefix
                    ? "bg-[var(--tma-accent)] text-white"
                    : "bg-transparent text-[var(--tma-hint)]"
                }`}
                type="button"
                onClick={() => setManualPrefix(prefix)}
              >
                {prefix}
              </button>
            ))}
            <span className="font-semibold">-</span>
            <input
              className="font-semibold text-[var(--tma-text)]"
              inputMode="numeric"
              placeholder="001"
              value={manualCode}
              onChange={(event) => setManualCode(event.target.value.replace(/\D/g, "").slice(0, 4))}
            />
          </div>
          <button
            className="tma-btn tma-btn--primary tma-btn--auto"
            disabled={busy || !manualCode.trim()}
            type="button"
            onClick={() => {
              void readCard(buildCardCodeFromDigits(manualCode, manualPrefix));
              setManualCode("");
            }}
          >
            Найти
          </button>
        </div>
      ) : null}

      {!session && scannedCode ? (
        <p className="tma-hint text-center">Карта {scannedCode}</p>
      ) : !session && cardsEnabled ? (
        <p className="tma-hint text-center">
          Отсканируйте карту, чтобы выдать её игроку или принять обратно.
        </p>
      ) : null}

      {session ? (
        <>
          <div className="tma-card">
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 flex-col gap-1">
                <span className="truncate text-[20px] font-bold">{session.name}</span>
                <span className="tma-hint">
                  {session.registrationNumber ? `#${session.registrationNumber}` : "без номера"}
                  {session.table ? ` · стол ${session.table}` : ""}
                  {session.seat ? ` · место ${nameSeat(tableFormats, Number(session.table), session.seat)}` : ""}
                </span>
              </div>
              {scannedCode ? <span className="tma-badge">Карта {scannedCode}</span> : null}
            </div>
            {debtBadge({ accountId: session.accountId, name: session.name })}

            <div className="flex items-center gap-2 rounded-[10px] bg-[var(--tma-surface-2)] px-3 py-2.5">
              <Ticket className="text-[var(--tma-link)]" size={18} />
              <span className="font-semibold">{TICKET_LABELS[session.ticketType]}</span>
              {session.freePass ? (
                <span className="tma-badge tma-badge--green ml-auto">0 ₽ · проходка</span>
              ) : null}
            </div>

            <div className="tma-stats">
              <Counter label="Ре-энтри" value={session.reentries} />
              <Counter label="Двойных" value={session.doubleReentries} />
              <Counter label="Аддонов" value={session.addons} />
            </div>
          </div>

          {/* The bill the admin reads out at the desk: every line the player bought,
              then what they hand over. */}
          <div className="tma-card">
            <ChargeRow
              label={session.charge.ticket.free ? "Вход (проходка)" : "Вход"}
              line={session.charge.ticket}
            />
            <ChargeRow label="Ре-энтри" line={session.charge.reentries} />
            <ChargeRow label="Двойные" line={session.charge.doubleReentries} />
            <ChargeRow label="Аддоны" line={session.charge.addons} />

            <div className="tma-divider" />
            <div className="flex items-baseline justify-between">
              <span className="font-semibold">{session.paid ? "Оплачено" : "К оплате"}</span>
              <span className={`tma-num text-[28px] font-bold ${session.paid ? "text-[var(--tma-green)]" : ""}`}>
                {session.charge.total.toLocaleString("ru-RU")} ₽
              </span>
            </div>

            <PaidToggle
              busy={busy}
              paid={session.paid}
              onChange={(paid) => void setPaid(session, paid)}
            />
          </div>

          {/* Opened from the list rather than scanned: the player may be long gone, and
              the questionnaire is where the phone and the Telegram they gave the club
              are. A scanned card is someone standing at the desk, so it stays short. */}
          {!scannedCode ? (
            <>
              <SectionLabel title="Анкета" />
              <ClientProfileCard
                accountId={session.accountId}
                className="tma-card"
                telegramId={session.telegramId}
              />
            </>
          ) : null}

          {/* Which way out depends on how the bill was opened, not on whether the player
              holds a card: a scan is the desk taking the card back, a tap is the desk
              looking something up and returning to the list. */}
          {scannedCode ? (
            <div className="tma-cta-bar">
              <button
                className="tma-btn tma-btn--primary tma-btn--big"
                disabled={busy}
                type="button"
                onClick={release}
              >
                <RotateCcw size={16} /> Принять карту обратно
              </button>
              {/* The next player is already at the desk: their card is read straight
                  over this one, as it always could be. */}
              {cardsEnabled ? (
                <button className="tma-btn tma-btn--inset" disabled={busy} type="button" onClick={scan}>
                  <QrCode size={18} /> Сканировать другую карту
                </button>
              ) : null}
            </div>
          ) : (
            <button className="tma-btn" type="button" onClick={() => setSession(null)}>
              <ChevronLeft size={16} /> К списку
            </button>
          )}
        </>
      ) : null}

      {/* Only when no card is in hand: while one is scanned the screen is about that
          card, and the evening's list underneath it only confuses the desk. */}
      {!cardsEnabled && !session ? searchBox : null}

      {settling.length > 0 && !scannedCode && !session ? (
        <section className="flex flex-col gap-2">
          <p className="tma-section-label">
            <span>
              <span className="tma-section-label__title">
                {cardsEnabled ? "Выданные карты" : "За столами"} ({settling.length})
              </span>
              {unpaidCount > 0 ? (
                <span className="tma-danger-text">
                  {" "}
                  · не оплатили {unpaidCount}
                </span>
              ) : null}
            </span>
          </p>
          {settling.map((card) => (
            <div
              key={card.playerId}
              /* Three states the desk reads at a glance, in the order the list is
                 sorted: red — busted and still owing, catch them; plain — playing on;
                 green — settled, parked at the bottom, the latest payment first. */
              className={`tma-card !gap-2 !p-3 ${
                card.paid ? "tma-row--paid" : card.eliminated ? "tma-row--owes" : ""
              }`}
            >
              {/* The row opens the bill behind the number: the desk is asked "за что
                  столько?" across the table and should not have to remember. The
                  player's questionnaire opens under it, to reach whoever has left. The
                  paid toggle stays outside it, so settling up is still one tap. */}
              <button
                className="flex w-full items-center justify-between gap-3 border-0 bg-transparent p-0 text-left"
                type="button"
                onClick={() => setSession(card)}
              >
                <span className="tma-row__body">
                  <span className="flex items-center gap-2">
                    <span className="tma-row__title">{card.name}</span>
                    {/* Knocked out and still owing: the desk has to catch them before
                        they leave, so the row shouts it instead of whispering it in
                        the line of small print underneath. */}
                    {card.paid ? (
                      <span className="tma-badge tma-badge--green">ОПЛАЧЕНО</span>
                    ) : card.eliminated ? (
                      <span className="tma-badge tma-badge--red">ВЫБЫЛ</span>
                    ) : null}
                    {debtBadge({ accountId: card.accountId, name: card.name })}
                  </span>
                  <span className="tma-row__sub">
                    {card.registrationNumber ? `#${card.registrationNumber}` : "без номера"}
                    {card.table ? ` · стол ${card.table}` : ""}
                    {card.seat ? ` · место ${nameSeat(tableFormats, Number(card.table), card.seat)}` : ""}
                    {/* Busted but already settled: the badge slot is taken by the
                        green tick, so the fact still gets said here. */}
                    {card.paid && card.eliminated ? " · выбыл" : ""}
                    {/* The time is what the settled block is ordered by, so the order
                        explains itself. */}
                    {card.paid && card.paidAt
                      ? ` · оплатил в ${formatEventTimeLabel(card.paidAt)}`
                      : ""}
                  </span>
                </span>
                <span
                  className={`tma-num shrink-0 text-lg font-bold ${card.paid ? "text-[var(--tma-green)]" : ""}`}
                >
                  {card.charge.total.toLocaleString("ru-RU")} ₽
                </span>
              </button>

              <PaidToggle
                busy={busy}
                paid={card.paid}
                onChange={(paid) => void setPaid(card, paid)}
              />
            </div>
          ))}
        </section>
      ) : null}

      {(cardsEnabled ? Boolean(scannedCode) : true) && !session ? (
        <>
          <SectionLabel title={cardsEnabled ? "Карта свободна — кому выдать?" : "Кого посадить за стол?"} />

          <div className="tma-segment">
            {(Object.keys(TICKET_LABELS) as TicketType[]).map((type) => (
              <button
                key={type}
                aria-pressed={ticketType === type}
                type="button"
                onClick={() => setTicketType(type)}
              >
                {TICKET_LABELS[type]}
              </button>
            ))}
          </div>

          {cardsEnabled ? searchBox : null}

          {waitingSignups.length > 0 ? (
            <div className="tma-card tma-card--flush">
              <div className="tma-card__head">
                <span className="text-sm">
                  {cardsEnabled
                    ? "Записались в приложении — посадим и выдадим карту"
                    : "Записались в приложении — осталось посадить"}
                </span>
                <span className="tma-card__head-meta">{waitingSignups.length}</span>
              </div>
              {waitingSignups.map((signup) => (
                <button
                  key={signup.id}
                  className="tma-row"
                  disabled={busy}
                  type="button"
                  onClick={() => startSeating(signup)}
                >
                  <span className="tma-row__body">
                    <span className="tma-row__title">{signup.name}</span>
                    <span className="tma-row__sub">
                      {signup.username ? `@${signup.username}` : "записался в приложении"}
                    </span>
                    {signup.ticketType === "vip" || signup.usePass !== "none" || debtBadge({ accountId: signup.userId, name: signup.name }) ? (
                      <span className="tma-row__badges">
                        {debtBadge({ accountId: signup.userId, name: signup.name })}
                        {signup.ticketType === "vip" ? (
                          <span className="tma-badge tma-badge--gold">VIP билет</span>
                        ) : null}
                        {signup.usePass !== "none" ? (
                          <span className="tma-badge tma-badge--green">{PASS_LABELS[signup.usePass]}</span>
                        ) : null}
                      </span>
                    ) : null}
                  </span>
                  <UserPlus className="shrink-0 text-[var(--tma-link)]" size={18} />
                </button>
              ))}
            </div>
          ) : null}

          {withoutCard.length > 0 ? (
            <div className="tma-card tma-card--flush">
              <div className="tma-card__head">
                <span className="text-sm">
                  {cardsEnabled ? "Уже за столом, без карты" : "В ростере, но не за столом"}
                </span>
                <span className="tma-card__head-meta">{withoutCard.length}</span>
              </div>
              {withoutCard.map((player) => (
                <button
                  key={player.id}
                  className="tma-row"
                  disabled={busy}
                  type="button"
                  onClick={() => startSeatingPlayer(player)}
                >
                  <span className="tma-row__body">
                    <span className="tma-row__title">{player.name}</span>
                    <span className="tma-row__sub">
                      {player.registrationNumber ? `#${player.registrationNumber}` : "без номера"}
                      {player.table ? ` · стол ${player.table}` : ""}
                      {player.seat ? ` · место ${nameSeat(tableFormats, Number(player.table), player.seat)}` : ""}
                    </span>
                    {debtBadge({ name: player.name }) ? (
                      <span className="tma-row__badges">{debtBadge({ name: player.name })}</span>
                    ) : null}
                  </span>
                  <UserPlus className="shrink-0 text-[var(--tma-link)]" size={18} />
                </button>
              ))}
            </div>
          ) : null}

          {withoutCard.length === 0 && waitingSignups.length === 0 ? (
            <p className="tma-empty">
              {search
                ? "Никого не нашли"
                : cardsEnabled
                  ? "Все за столами и с картами"
                  : "Все записавшиеся уже за столами"}
            </p>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

/** Whether this player has settled up, and the tap that changes it. */
function PaidToggle({
  busy,
  onChange,
  paid,
}: {
  busy: boolean;
  onChange: (paid: boolean) => void;
  paid: boolean;
}) {
  return (
    <button
      aria-pressed={paid}
      className={`flex min-h-12 w-full items-center justify-between gap-3 rounded-xl border-0 px-3 text-[15px] font-semibold disabled:opacity-60 ${
        paid
          ? "bg-[rgba(62,207,106,0.14)] text-[var(--tma-green)]"
          : "bg-[var(--tma-surface-2)] text-[var(--tma-text)]"
      }`}
      disabled={busy}
      type="button"
      onClick={() => onChange(!paid)}
    >
      <span className="flex items-center gap-2">
        {paid ? <Check size={16} /> : <Wallet size={16} />}
        {paid ? "Оплатил" : "Не оплатил"}
      </span>
      <span aria-hidden="true" className={`tma-toggle-switch${paid ? " tma-toggle-switch--on" : ""}`}>
        <span className="tma-toggle-switch__knob" />
      </span>
    </button>
  );
}

/** One line of the bill: how many, at what price, for how much. */
function ChargeRow({ label, line }: { label: string; line: ChargeLine & { free?: boolean } }) {
  // A line nobody bought is left out, but a free entry is worth saying out loud.
  if (line.count === 0 && !line.free) return null;

  return (
    <div className="tma-kv">
      <span className="tma-kv__label">
        {label}
        {line.count > 1 ? ` × ${line.count}` : ""}
      </span>
      <span className="tma-kv__value tma-num">{line.sum.toLocaleString("ru-RU")} ₽</span>
    </div>
  );
}

function Counter({ label, value }: { label: string; value: number }) {
  return (
    <div className="tma-stat items-center rounded-[10px] bg-[var(--tma-surface-2)] p-2.5 text-center">
      <span className="tma-stat__value">{value}</span>
      <span className="tma-stat__label">{label}</span>
    </div>
  );
}
