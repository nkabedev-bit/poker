"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Armchair,
  Check,
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
import { getTelegramWebApp, useTMA } from "../layout";
import { isVipRegistrationNumber } from "@/lib/player-registration-number";
import { SeatingPicker } from "@/components/tma/seating-picker";
import { buildSeatingTables, pickRandomSeat } from "@/lib/tables/seating";
import {
  buildCardCodeFromDigits,
  CARD_CODE_PREFIX,
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
  username: string | null;
};

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
  // Who the card is being handed to, waiting for a chair: someone who signed up in the
  // app, or a walk-in already in the roster.
  const [seating, setSeating] = useState<SeatingTarget | null>(null);
  const [seatChoice, setSeatChoice] = useState<SeatChoice | null>(null);
  const [manualOpen, setManualOpen] = useState(false);
  const [manualCode, setManualCode] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [session, setSession] = useState<CardSession | null>(null);
  // Every card that is out tonight, so the desk can see who still owes money.
  const [issued, setIssued] = useState<CardSession[]>([]);
  const [scannedCode, setScannedCode] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [ticketType, setTicketType] = useState<TicketType>("regular");

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
      }

      if (playersRes.ok) {
        const data = await playersRes.json();
        setPlayers(data.players ?? []);
        setTablesCount(Math.max(1, Number(data.tablesCount ?? 1)));
      }

      if (signupsRes.ok) {
        const data = await signupsRes.json();
        setSignups(data.signups ?? []);
      }
    } finally {
      setLoading(false);
    }
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
      // Outside Telegram (or on an old client) there is no camera to open, so the code
      // is typed in instead of the screen becoming useless.
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
    if (!scannedCode || busy) return;

    setBusy(true);
    try {
      const res = await fetch("/api/tma/cards", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Telegram-Init-Data": initData },
        body: JSON.stringify({
          cardCode: scannedCode,
          playerId: player.id,
          seat: choice.seat,
          table: choice.table,
          ticketType,
        }),
      });
      const data = await res.json().catch(() => null);

      if (!res.ok) {
        tg?.HapticFeedback.notificationOccurred("error");
        tg?.showAlert(data?.error ?? "Не удалось выдать карту");
        return;
      }

      tg?.HapticFeedback.notificationOccurred("success");
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
   * a regular one at the regular tables.
   */
  const seatAtRandom = (target: SeatingTarget) => {
    const tg = getTelegramWebApp();
    const seated =
      target.kind === "player"
        ? players.filter((item) => item.id !== target.player.id)
        : players;
    const picked = pickRandomSeat(buildSeatingTables(seated, tablesCount), ticketType);

    if (!picked) {
      tg?.HapticFeedback.notificationOccurred("error");
      tg?.showAlert(
        ticketType === "vip"
          ? "Свободных мест за VIP-столом нет"
          : "Свободных мест за обычными столами нет",
      );
      return;
    }

    setSeatChoice(picked);
    void handOverCard(target, picked);
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
    if (!scannedCode || busy) return;

    setBusy(true);
    try {
      const res = await fetch(`/api/tma/event-signups/${signup.id}/seat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Telegram-Init-Data": initData },
        body: JSON.stringify({
          cardCode: scannedCode,
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
        body: JSON.stringify({ cardCode: card.cardCode, paid }),
      });
      const data = await res.json().catch(() => null);

      if (!res.ok) {
        tg?.HapticFeedback.notificationOccurred("error");
        tg?.showAlert(data?.error ?? "Не удалось отметить оплату");
        return;
      }

      tg?.HapticFeedback.impactOccurred("light");
      if (session?.cardCode === card.cardCode) setSession(data.session);
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

  if (loading) return <div>Загрузка...</div>;

  // Seating takes over the screen: the admin is picking one chair, and everything else
  // would only be in the way.
  if (seating) {
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-bold flex items-center gap-2">
          <Armchair size={20} /> Куда сажаем
        </h1>

        <div className="rounded-xl bg-[var(--tg-theme-secondary-bg-color)] p-4">
          <p className="text-lg font-bold">{targetName(seating)}</p>
          <p className="text-sm text-[var(--tg-theme-hint-color)]">
            {TICKET_LABELS[ticketType]} · карта {scannedCode}
          </p>
        </div>

        <button
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-[var(--tg-theme-secondary-bg-color)] p-3 font-semibold disabled:opacity-60"
          disabled={busy}
          type="button"
          onClick={() => seatAtRandom(seating)}
        >
          <Dices size={18} /> Посадить на случайное место
        </button>

        <SeatingPicker
          ignorePlayerId={seating.kind === "player" ? seating.player.id : undefined}
          players={players}
          selected={seatChoice}
          tablesCount={tablesCount}
          onSelect={(choice) => {
            getTelegramWebApp()?.HapticFeedback.impactOccurred("light");
            setSeatChoice(choice);
          }}
          onTakenSeat={(name) =>
            getTelegramWebApp()?.showAlert(`Место занято: ${name}`)
          }
        />

        <button
          className="w-full rounded-lg bg-[var(--tg-theme-button-color)] p-4 font-semibold text-[var(--tg-theme-button-text-color)] disabled:opacity-60"
          disabled={busy || !seatChoice}
          type="button"
          onClick={() => seatChoice && void handOverCard(seating, seatChoice)}
        >
          {seatChoice
            ? `Посадить за стол ${seatChoice.table}, место ${seatChoice.seat}`
            : "Выберите место"}
        </button>

        <button
          className="w-full rounded-lg bg-[var(--tg-theme-secondary-bg-color)] p-3 text-sm"
          disabled={busy}
          type="button"
          onClick={() => {
            setSeating(null);
            setSeatChoice(null);
          }}
        >
          Отмена
        </button>
      </div>
    );
  }

  const waitingSignups = signups
    .filter((signup) => !signup.seated)
    .filter((signup) => signup.name.toLowerCase().includes(search.toLowerCase()));

  const withoutCard = players
    .filter((player) => player.status === "active" && !player.cardCode)
    .filter((player) => player.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold flex items-center gap-2">
        <CreditCard size={20} /> Карты
      </h1>

      <button
        className="flex w-full items-center justify-center gap-2 rounded-lg bg-[var(--tg-theme-button-color)] px-4 py-4 font-semibold text-[var(--tg-theme-button-text-color)] disabled:opacity-60"
        disabled={busy}
        type="button"
        onClick={scan}
      >
        <QrCode size={20} /> Сканировать карту
      </button>

      <button
        className="flex w-full items-center justify-center gap-2 rounded-lg bg-[var(--tg-theme-secondary-bg-color)] p-3 text-sm"
        type="button"
        onClick={() => setManualOpen((open) => !open)}
      >
        <Keyboard size={16} /> {manualOpen ? "Скрыть ручной ввод" : "Ввести код вручную"}
      </button>

      {manualOpen ? (
        <div className="flex gap-2">
          {/* Every card carries the same prefix, so it is printed on the field rather
              than typed a hundred times a night. */}
          <div className="flex flex-1 items-center gap-1 rounded-lg bg-[var(--tg-theme-secondary-bg-color)] px-3">
            <span className="font-semibold text-[var(--tg-theme-hint-color)]">
              {CARD_CODE_PREFIX}-
            </span>
            <input
              className="w-full bg-transparent py-3 font-semibold outline-none"
              inputMode="numeric"
              placeholder="01"
              value={manualCode}
              onChange={(event) => setManualCode(event.target.value.replace(/\D/g, "").slice(0, 4))}
            />
          </div>
          <button
            className="shrink-0 rounded-lg bg-[var(--tg-theme-button-color)] px-4 font-semibold text-[var(--tg-theme-button-text-color)] disabled:opacity-60"
            disabled={busy || !manualCode.trim()}
            type="button"
            onClick={() => {
              void readCard(buildCardCodeFromDigits(manualCode));
              setManualCode("");
            }}
          >
            Найти
          </button>
        </div>
      ) : null}

      {scannedCode ? (
        <p className="text-center text-xs text-[var(--tg-theme-hint-color)]">
          Карта {scannedCode}
        </p>
      ) : (
        <p className="text-center text-sm text-[var(--tg-theme-hint-color)]">
          Отсканируйте карту, чтобы выдать её игроку или принять обратно.
        </p>
      )}

      {session ? (
        <div className="space-y-3 rounded-xl bg-[var(--tg-theme-secondary-bg-color)] p-4">
          <div>
            <p className="text-lg font-bold">{session.name}</p>
            <p className="text-sm text-[var(--tg-theme-hint-color)]">
              {session.registrationNumber ? `#${session.registrationNumber}` : "без номера"}
              {session.table ? ` · стол ${session.table}` : ""}
              {session.seat ? ` · место ${session.seat}` : ""}
            </p>
          </div>

          <div className="flex items-center gap-2 rounded-lg bg-[var(--tg-theme-bg-color)] p-3">
            <Ticket className="text-[var(--tg-theme-button-color)]" size={18} />
            <span className="font-semibold">{TICKET_LABELS[session.ticketType]}</span>
            {session.freePass ? (
              <span className="ml-auto rounded-full bg-emerald-500/15 px-2.5 py-1 text-xs font-bold text-emerald-500">
                0 ₽ · проходка
              </span>
            ) : null}
          </div>

          <div className="grid grid-cols-3 gap-2 text-center">
            <Counter label="Ре-энтри" value={session.reentries} />
            <Counter label="Двойных" value={session.doubleReentries} />
            <Counter label="Аддонов" value={session.addons} />
          </div>

          {/* The bill the admin reads out at the desk: every line the player bought,
              then what they hand over. */}
          <div className="space-y-1.5 rounded-lg bg-[var(--tg-theme-bg-color)] p-3">
            <ChargeRow
              label={session.charge.ticket.free ? "Вход (проходка)" : "Вход"}
              line={session.charge.ticket}
            />
            <ChargeRow label="Ре-энтри" line={session.charge.reentries} />
            <ChargeRow label="Двойные" line={session.charge.doubleReentries} />
            <ChargeRow label="Аддоны" line={session.charge.addons} />

            <div className="mt-2 flex items-baseline justify-between border-t border-[var(--tg-theme-hint-color)]/25 pt-2">
              <span className="font-semibold">{session.paid ? "Оплачено" : "К оплате"}</span>
              <span className={`text-2xl font-bold ${session.paid ? "text-green-500" : ""}`}>
                {session.charge.total.toLocaleString("ru-RU")} ₽
              </span>
            </div>

            <PaidToggle
              busy={busy}
              paid={session.paid}
              onChange={(paid) => void setPaid(session, paid)}
            />
          </div>

          <button
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-[var(--tg-theme-bg-color)] p-3 font-semibold disabled:opacity-60"
            disabled={busy}
            type="button"
            onClick={release}
          >
            <RotateCcw size={16} /> Принять карту обратно
          </button>
        </div>
      ) : null}

      {/* Only when no card is in hand: while one is scanned the screen is about that
          card, and the evening's list underneath it only confuses the desk. */}
      {issued.length > 0 && !scannedCode ? (
        <section className="space-y-2">
          <p className="text-sm font-semibold">Выданные карты ({issued.length})</p>
          {issued.map((card) => (
              <div
                key={card.cardCode}
                className="space-y-2 rounded-lg bg-[var(--tg-theme-secondary-bg-color)] p-3"
              >
                <div className="flex items-baseline justify-between gap-3">
                  <span className="min-w-0">
                    <span className="block truncate font-semibold">{card.name}</span>
                    <span className="block text-xs text-[var(--tg-theme-hint-color)]">
                      {card.registrationNumber ? `#${card.registrationNumber}` : "без номера"}
                      {card.table ? ` · стол ${card.table}` : ""}
                      {card.seat ? ` · место ${card.seat}` : ""}
                    </span>
                  </span>
                  <span
                    className={`shrink-0 text-lg font-bold ${card.paid ? "text-green-500" : ""}`}
                  >
                    {card.charge.total.toLocaleString("ru-RU")} ₽
                  </span>
                </div>

                <PaidToggle
                  busy={busy}
                  paid={card.paid}
                  onChange={(paid) => void setPaid(card, paid)}
                />
              </div>
          ))}
        </section>
      ) : null}

      {scannedCode && !session ? (
        <div className="space-y-3">
          <p className="text-sm font-semibold">Карта свободна — кому выдать?</p>

          <div className="grid grid-cols-2 gap-2">
            {(Object.keys(TICKET_LABELS) as TicketType[]).map((type) => (
              <button
                key={type}
                className={`rounded-lg p-3 text-sm font-semibold ${
                  ticketType === type
                    ? "bg-[var(--tg-theme-button-color)] text-[var(--tg-theme-button-text-color)]"
                    : "bg-[var(--tg-theme-secondary-bg-color)]"
                }`}
                type="button"
                onClick={() => setTicketType(type)}
              >
                {TICKET_LABELS[type]}
              </button>
            ))}
          </div>

          <div className="relative">
            <Search
              className="absolute left-3 top-3 text-[var(--tg-theme-hint-color)]"
              size={18}
            />
            <input
              className="w-full rounded-lg bg-[var(--tg-theme-secondary-bg-color)] p-3 pl-10 outline-none"
              placeholder="Поиск игрока"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>

          {waitingSignups.length > 0 ? (
            <div className="space-y-2">
              <p className="text-xs text-[var(--tg-theme-hint-color)]">
                Записались в приложении — посадим и выдадим карту
              </p>
              {waitingSignups.map((signup) => (
                <button
                  key={signup.id}
                  className="flex w-full items-center justify-between gap-3 rounded-lg bg-[var(--tg-theme-secondary-bg-color)] p-4 text-left disabled:opacity-60"
                  disabled={busy}
                  type="button"
                  onClick={() => startSeating(signup)}
                >
                  <span className="min-w-0">
                    <span className="block truncate font-semibold">{signup.name}</span>
                    <span className="block text-xs text-[var(--tg-theme-hint-color)]">
                      {signup.username ? `@${signup.username}` : "записался в приложении"}
                    </span>
                    <span className="mt-1 flex flex-wrap gap-1.5">
                      {signup.ticketType === "vip" ? (
                        <span className="inline-block rounded-full bg-[#e9c07a]/15 px-2 py-0.5 text-[11px] font-bold text-[#e9c07a]">
                          VIP билет
                        </span>
                      ) : null}
                      {signup.usePass !== "none" ? (
                        <span className="inline-block rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-bold text-emerald-500">
                          {PASS_LABELS[signup.usePass]}
                        </span>
                      ) : null}
                    </span>
                  </span>
                  <UserPlus className="shrink-0 text-[var(--tg-theme-button-color)]" size={18} />
                </button>
              ))}
            </div>
          ) : null}

          <div className="space-y-2">
            {withoutCard.length > 0 && waitingSignups.length > 0 ? (
              <p className="text-xs text-[var(--tg-theme-hint-color)]">Уже за столом, без карты</p>
            ) : null}
            {withoutCard.map((player) => (
              <button
                key={player.id}
                className="flex w-full items-center justify-between gap-3 rounded-lg bg-[var(--tg-theme-secondary-bg-color)] p-4 text-left disabled:opacity-60"
                disabled={busy}
                type="button"
                onClick={() => startSeatingPlayer(player)}
              >
                <span className="min-w-0">
                  <span className="block truncate font-semibold">{player.name}</span>
                  <span className="block text-xs text-[var(--tg-theme-hint-color)]">
                    {player.registrationNumber ? `#${player.registrationNumber}` : "без номера"}
                    {player.table ? ` · стол ${player.table}` : ""}
                    {player.seat ? ` · место ${player.seat}` : ""}
                  </span>
                </span>
                <UserPlus className="shrink-0 text-[var(--tg-theme-button-color)]" size={18} />
              </button>
            ))}

            {withoutCard.length === 0 && waitingSignups.length === 0 ? (
              <p className="py-6 text-center text-[var(--tg-theme-hint-color)]">
                {search ? "Никого не нашли" : "Все за столами и с картами"}
              </p>
            ) : null}
          </div>
        </div>
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
      className={`flex w-full items-center justify-between gap-3 rounded-lg p-3 text-sm font-semibold disabled:opacity-60 ${
        paid
          ? "bg-green-500/15 text-green-500"
          : "bg-[var(--tg-theme-bg-color)] text-[var(--tg-theme-text-color)]"
      }`}
      disabled={busy}
      type="button"
      onClick={() => onChange(!paid)}
    >
      <span className="flex items-center gap-2">
        {paid ? <Check size={16} /> : <Wallet size={16} />}
        {paid ? "Оплатил" : "Не оплатил"}
      </span>
      <span
        className={`flex h-6 w-11 shrink-0 items-center rounded-full p-0.5 transition ${
          paid ? "bg-green-500/70" : "bg-[var(--tg-theme-hint-color)]/35"
        }`}
      >
        <span
          className={`h-5 w-5 rounded-full bg-white transition ${paid ? "translate-x-5" : ""}`}
        />
      </span>
    </button>
  );
}

/** One line of the bill: how many, at what price, for how much. */
function ChargeRow({ label, line }: { label: string; line: ChargeLine & { free?: boolean } }) {
  // A line nobody bought is left out, but a free entry is worth saying out loud.
  if (line.count === 0 && !line.free) return null;

  return (
    <div className="flex items-baseline justify-between gap-2 text-sm">
      <span className="text-[var(--tg-theme-hint-color)]">
        {label}
        {line.count > 1 ? ` × ${line.count}` : ""}
      </span>
      <span className="font-semibold">{line.sum.toLocaleString("ru-RU")} ₽</span>
    </div>
  );
}

function Counter({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg bg-[var(--tg-theme-bg-color)] p-3">
      <p className="text-xl font-bold">{value}</p>
      <p className="text-[11px] text-[var(--tg-theme-hint-color)]">{label}</p>
    </div>
  );
}
