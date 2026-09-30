"use client";

import { useCallback, useEffect, useState } from "react";
import {
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  Dices,
  Hourglass,
  Ticket,
  Users,
} from "lucide-react";
import { ScreenHeader, SectionLabel } from "../ui";
import { confirmSeated, getTelegramWebApp, useTMA } from "../layout";
import { useVisiblePolling } from "../use-visible-polling";
import { formatEventDayLabel, formatEventTimeLabel } from "@/lib/events/types";
import { SeatingPicker } from "@/components/tma/seating-picker";
import { nameSeat } from "@/lib/tables/seating";
import {
  changeTableFormat,
  drawSeatOrGrowTable,
  readTableFormatsFrom,
  type TableFormats,
} from "../table-formats";
import type { TournamentPlayer } from "@/lib/timer/types";
import { ClientProfileCard } from "../client-profile-card";

type Signup = {
  id: string;
  name: string;
  /** The guest coming in on this player's "1+1", when they bought one. */
  partnerName: string | null;
  /** They never came, and their place went to somebody out of the queue. */
  noShow: boolean;
  /** The club put this ticket aside and the player has not answered yet. */
  reserved: boolean;
  seated: boolean;
  /** Null for a player who joined through the web: they have no Telegram at all. */
  telegramId: number | null;
  ticketType: "regular" | "vip" | "duo" | "duo_plus_one";
  usePass: "none" | "regular" | "vip";
  /** The account behind the sign-up, which is who the player is on either door. */
  userId: string;
  username: string | null;
};

/** Somebody standing in line: a name and what they hoped for, but no seat. */
type WaitlistEntry = {
  id: string;
  name: string;
  /** Until when the club is holding a freed place for them; null when it is not. */
  offerExpiresAt?: string | null;
  /** They are at a table already — the desk put them there without going through here. */
  seated: boolean;
  telegramId: number | null;
  ticketType: Signup["ticketType"];
  userId: string;
  username: string | null;
};

type SeatChoice = { seat: number; table: number };

const TICKET_LABELS = {
  duo: "Билет 1+1",
  duo_plus_one: "Билет 1+1 · второй игрок",
  regular: "Обычный билет",
  vip: "VIP билет",
} as const;

/** A pair plays at the ordinary tables, so seating asks for a regular seat. */
function seatingTicket(ticket: Signup["ticketType"]) {
  return ticket === "vip" ? "vip" : "regular";
}

const PASS_LABELS = { regular: "по проходке", vip: "по VIP проходке" } as const;

/** One evening the desk can look at, as the day strip shows it. */
type EventOption = { id: string; signupsCount: number; startsAt: string; title: string };

type SignupsResponse = {
  event: { id: string; seatingOpen: boolean; startsAt: string; title: string } | null;
  /** Tonight's game and every poster still ahead of it, nearest first. */
  events: EventOption[];
  /** Chairs per table tonight, from a server that predates the table formats. */
  seatsPerTable: number;
  /** The format each table is dealt in tonight, so the plan matches the room. */
  tableFormats?: number[];
  signups: Signup[];
  tablesCount: number;
  waitlist: WaitlistEntry[];
};

export default function TMASignupsPage() {
  const { initData } = useTMA();
  const [data, setData] = useState<SignupsResponse | null>(null);
  // Which evening the admin is looking at; null until they pick, and then the server
  // opens the nearest one.
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [seatingId, setSeatingId] = useState<string | null>(null);
  // The sign-up the admin opened: first their questionnaire, then the seating plan.
  const [opened, setOpened] = useState<Signup | null>(null);
  const [players, setPlayers] = useState<TournamentPlayer[]>([]);
  const [seatChoice, setSeatChoice] = useState<SeatChoice | null>(null);
  const [seatingOpen, setSeatingOpen] = useState(false);
  // Which list is open. The queue sits behind its own tab: most evenings the desk works
  // the sign-ups and never opens it, and it only matters when somebody fails to turn up.
  const [listTab, setListTab] = useState<"seated" | "waiting" | "waitlist">("waiting");
  // Somebody from the queue, opened: their questionnaire first, then the ticket and the
  // chair once the desk decides to sit them down.
  const [queueEntry, setQueueEntry] = useState<WaitlistEntry | null>(null);
  const [queueSeatingOpen, setQueueSeatingOpen] = useState(false);
  // A place in line says what the player hoped for; the desk decides at the door.
  const [queueTicket, setQueueTicket] = useState<"regular" | "vip">("regular");
  // The table whose chairs are being changed, so its buttons wait for the answer.
  const [changingTable, setChangingTable] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      const chosen = selectedId ? `?eventId=${encodeURIComponent(selectedId)}` : "";
      const [signupsRes, playersRes] = await Promise.all([
        fetch(`/api/tma/event-signups${chosen}`, {
          headers: { "X-Telegram-Init-Data": initData },
        }),
        fetch("/api/tma/players", { headers: { "X-Telegram-Init-Data": initData } }),
      ]);

      if (signupsRes.ok) setData(await signupsRes.json());
      if (playersRes.ok) {
        const payload = await playersRes.json();
        setPlayers(payload.players ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, [initData, selectedId]);

  useEffect(() => {
    const timeout = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timeout);
  }, [load]);
  useVisiblePolling(() => void load());

  /** Opens one sign-up: the questionnaire the player filled in when they joined. */
  const openSignup = (signup: Signup) => {
    setOpened(signup);
    setSeatChoice(null);
    setSeatingOpen(false);
  };

  const closeSignup = () => {
    setOpened(null);
    setSeatChoice(null);
    setSeatingOpen(false);
  };

  /** Opens somebody from the queue: the questionnaire they filled in when they joined. */
  const openQueueEntry = (entry: WaitlistEntry) => {
    setQueueEntry(entry);
    setQueueSeatingOpen(false);
    setSeatChoice(null);
    // What they asked for in the queue is the obvious first guess; the desk can change it.
    setQueueTicket(entry.ticketType === "vip" ? "vip" : "regular");
  };

  const closeQueueEntry = () => {
    setQueueEntry(null);
    setQueueSeatingOpen(false);
    setSeatChoice(null);
  };

  /**
   * Seats the player from the queue on the ticket just picked. Nobody is named as the
   * one they replace: people come late, and the desk cannot tell who of those signed up
   * is still on the way.
   */
  const seatFromQueue = async (entry: WaitlistEntry, choice: SeatChoice) => {
    const tg = getTelegramWebApp();
    if (seatingId) return;

    setSeatingId(entry.id);
    try {
      const res = await fetch(`/api/tma/event-signups/${entry.id}/seat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Telegram-Init-Data": initData },
        body: JSON.stringify({
          seat: choice.seat,
          table: choice.table,
          ticketType: queueTicket,
        }),
      });

      if (res.ok) {
        tg?.HapticFeedback.notificationOccurred("success");
        await confirmSeated(entry.name, {
          ...choice,
          label: nameSeat(tableFormats, choice.table, choice.seat),
        });
        closeQueueEntry();
        await load();
        return;
      }

      const payload = await res.json().catch(() => null);
      tg?.HapticFeedback.notificationOccurred("error");
      tg?.showAlert(payload?.error ?? "Не удалось посадить игрока");
    } finally {
      setSeatingId(null);
    }
  };

  // The formats come with the sign-ups; a chair brought over is written straight in, so
  // the plan does not wait for the next poll to show it.
  const tableFormats: TableFormats = readTableFormatsFrom(data);
  const applyTableFormats = (formats: number[]) =>
    setData((current) => (current ? { ...current, tableFormats: formats } : current));

  /** Brings a chair to a table or takes one away, and redraws the plan with it. */
  const handleTableFormat = async (table: number, direction: "add" | "remove") => {
    if (changingTable !== null) return;

    setChangingTable(table);
    try {
      const formats = await changeTableFormat(initData, table, direction);
      if (formats) applyTableFormats(formats);
    } finally {
      setChangingTable(null);
    }
  };

  /** A free chair for the ticket — or, with the room full, one brought to a table. */
  const drawSeat = (ticket: "regular" | "vip") =>
    drawSeatOrGrowTable({
      initData,
      onFormatsChanged: applyTableFormats,
      players,
      tableFormats,
      tablesCount: data?.tablesCount ?? 1,
      ticket,
    });

  const seatAtRandom = async (signup: Signup) => {
    const picked = await drawSeat(seatingTicket(signup.ticketType));
    if (!picked) return;

    setSeatChoice(picked);
    void seat(signup, picked);
  };

  const seat = async (signup: Signup, choice: SeatChoice) => {
    const tg = getTelegramWebApp();
    if (seatingId) return;

    setSeatingId(signup.id);
    try {
      const res = await fetch(`/api/tma/event-signups/${signup.id}/seat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Telegram-Init-Data": initData },
        body: JSON.stringify({
          seat: choice.seat,
          table: choice.table,
          ticketType: seatingTicket(signup.ticketType),
        }),
      });

      if (res.ok) {
        tg?.HapticFeedback.notificationOccurred("success");
        await confirmSeated(signup.name, {
          ...choice,
          label: nameSeat(tableFormats, choice.table, choice.seat),
        });
        closeSignup();
        await load();
        return;
      }

      const payload = await res.json().catch(() => null);
      tg?.HapticFeedback.notificationOccurred("error");
      tg?.showAlert(payload?.error ?? "Не удалось посадить игрока");
    } finally {
      setSeatingId(null);
    }
  };

  if (loading) return <div className="tma-empty">Загрузка…</div>;

  // Only tonight's players go to tonight's tables. A Thursday sign-up seated now would
  // join a tournament nobody put them in.
  const canSeat = data?.event?.seatingOpen ?? false;

  const notTonight = (
    <div className="tma-note tma-note--amber">
      <CalendarClock size={18} />
      <span>Игра не сегодня — посадить за стол можно будет в день турнира.</span>
    </div>
  );

  const seatingPlan = (onRandom: () => void, disabled: boolean) => (
    <>
      <button className="tma-btn tma-btn--link" disabled={disabled} type="button" onClick={onRandom}>
        <Dices size={18} /> Посадить на случайное место
      </button>
      <div className="tma-card">
        <SeatingPicker
          changingTable={changingTable}
          players={players}
          selected={seatChoice}
          tableFormats={tableFormats}
          tablesCount={data?.tablesCount ?? 1}
          onChangeTableFormat={(table, direction) => void handleTableFormat(table, direction)}
          onSelect={(choice) => {
            getTelegramWebApp()?.HapticFeedback.impactOccurred("light");
            setSeatChoice(choice);
          }}
          onTakenSeat={(name) => getTelegramWebApp()?.showAlert(`Место занято: ${name}`)}
        />
      </div>
    </>
  );

  const seatButton = (onSeat: (choice: SeatChoice) => void, disabled: boolean) => (
    <div className="tma-cta-bar">
      <button
        className="tma-btn tma-btn--primary tma-btn--big"
        disabled={disabled || !seatChoice}
        type="button"
        onClick={() => seatChoice && onSeat(seatChoice)}
      >
        {seatChoice
          ? `Посадить за стол ${seatChoice.table}, место ${nameSeat(tableFormats, seatChoice.table, seatChoice.seat)}`
          : "Выберите место"}
      </button>
    </div>
  );

  // Somebody from the queue: their questionnaire first, then — once the desk sits them
  // down — the ticket and the chair.
  if (queueEntry) {
    if (!queueSeatingOpen) {
      return (
        <div className="tma-screen">
          <ScreenHeader back={{ label: "Заявки", onClick: closeQueueEntry }} title="Лист ожидания" />

          <div className="tma-card">
            <span className="text-[20px] font-bold">{queueEntry.name}</span>
            <span className="tma-row__badges">
              <span className={`tma-badge${queueEntry.ticketType === "vip" ? " tma-badge--gold" : ""}`}>
                Просил: {TICKET_LABELS[queueEntry.ticketType]}
              </span>
              {queueEntry.username ? <span className="tma-badge">@{queueEntry.username}</span> : null}
            </span>
            {queueEntry.offerExpiresAt && !queueEntry.seated ? (
              <div className="tma-note tma-note--amber">
                <Hourglass size={18} />
                <span>Место держим до {formatEventTimeLabel(queueEntry.offerExpiresAt)}</span>
              </div>
            ) : null}
          </div>

          <SectionLabel title="Анкета" />
          <ClientProfileCard
            accountId={queueEntry.userId}
            className="tma-card"
            telegramId={queueEntry.telegramId}
          />

          {queueEntry.seated ? (
            <div className="tma-note tma-note--green">
              <CheckCircle2 size={18} />
              <span>Уже за столом</span>
            </div>
          ) : canSeat ? (
            <div className="tma-cta-bar">
              <button
                className="tma-btn tma-btn--primary tma-btn--big"
                type="button"
                onClick={() => setQueueSeatingOpen(true)}
              >
                Посадить за стол
              </button>
            </div>
          ) : (
            notTonight
          )}
        </div>
      );
    }

    return (
      <div className="tma-screen">
        <ScreenHeader
          back={{ disabled: Boolean(seatingId), label: "К анкете", onClick: () => setQueueSeatingOpen(false) }}
          title="Куда сажаем"
        />

        <div className="tma-card">
          <span className="text-[20px] font-bold">{queueEntry.name}</span>
          <span className="tma-hint">Из листа ожидания</span>
        </div>

        {/* The queue said what they hoped for; what they get is decided here, at the
            door, and that is the ticket they pay for. */}
        <SectionLabel title="Какой билет" />
        <div className="tma-segment">
          {(["regular", "vip"] as const).map((ticket) => (
            <button
              key={ticket}
              aria-pressed={queueTicket === ticket}
              disabled={Boolean(seatingId)}
              type="button"
              onClick={() => {
                setQueueTicket(ticket);
                setSeatChoice(null);
              }}
            >
              {TICKET_LABELS[ticket]}
            </button>
          ))}
        </div>

        {seatingPlan(async () => {
          const picked = await drawSeat(queueTicket);
          if (!picked) return;

          setSeatChoice(picked);
          void seatFromQueue(queueEntry, picked);
        }, Boolean(seatingId))}

        {seatButton((choice) => void seatFromQueue(queueEntry, choice), Boolean(seatingId))}
      </div>
    );
  }

  // One sign-up, opened: the questionnaire first, the seating plan when the admin is
  // ready to sit them down.
  if (opened) {
    if (seatingOpen) {
      return (
        <div className="tma-screen">
          <ScreenHeader back={{ label: "К анкете", onClick: () => setSeatingOpen(false) }} title="Куда сажаем" />

          <div className="tma-card">
            <span className="text-[20px] font-bold">{opened.name}</span>
            <span className="tma-hint">{TICKET_LABELS[opened.ticketType]}</span>
          </div>

          {seatingPlan(() => void seatAtRandom(opened), seatingId !== null)}
          {seatButton((choice) => void seat(opened, choice), seatingId !== null)}
        </div>
      );
    }

    return (
      <div className="tma-screen">
        <ScreenHeader back={{ label: "Заявки", onClick: closeSignup }} title="Заявка" />

        <div className="tma-card">
          <span className="text-[20px] font-bold">{opened.name}</span>
          <span className="tma-row__badges">
            <TicketBadge ticket={opened.ticketType} />
            {opened.username ? <span className="tma-badge">@{opened.username}</span> : null}
          </span>
          {opened.reserved ? (
            <div className="tma-note tma-note--amber">
              <Hourglass size={18} />
              <span>Билет отложен админом — игрок ещё не подтвердил, что придёт.</span>
            </div>
          ) : null}
          {opened.usePass !== "none" ? (
            <div className="tma-note tma-note--green">
              <Ticket size={18} />
              <span>Вход {PASS_LABELS[opened.usePass]}</span>
            </div>
          ) : null}
          {opened.partnerName ? (
            <div className="tma-note tma-note--blue">
              <Users size={18} />
              <span>
                С ним придёт {opened.partnerName} — добавьте вторым игроком вручную, оба
                платят половину билета.
              </span>
            </div>
          ) : null}
        </div>

        <SectionLabel title="Анкета" />
        <ClientProfileCard
          accountId={opened.userId}
          className="tma-card"
          telegramId={opened.telegramId}
        />

        {opened.seated ? (
          <div className="tma-note tma-note--green">
            <CheckCircle2 size={18} />
            <span>Уже за столом</span>
          </div>
        ) : canSeat ? (
          <div className="tma-cta-bar">
            <button
              className="tma-btn tma-btn--primary tma-btn--big"
              type="button"
              onClick={() => setSeatingOpen(true)}
            >
              Посадить за стол
            </button>
          </div>
        ) : (
          notTonight
        )}
      </div>
    );
  }

  const signups = data?.signups ?? [];
  const waiting = signups.filter((signup) => !signup.seated && !signup.noShow);
  const noShows = signups.filter((signup) => signup.noShow);
  const seated = signups.filter((signup) => signup.seated);
  const waitlist = data?.waitlist ?? [];
  // The queue's tab goes away with the queue; the list falls back to the sign-ups.
  const tab = listTab === "waitlist" && waitlist.length === 0 ? "waiting" : listTab;

  return (
    <div className="tma-screen">
      <ScreenHeader back={{ href: "/tma/players", label: "Зал" }} title="Заявки" />

      {/* The club posts a week at a time, and the desk is asked about all of it: who is
          coming on Thursday, whether Sunday is filling up. */}
      {(data?.events?.length ?? 0) > 1 ? (
        <div className="tma-chips">
          {data?.events?.map((item) => (
            <button
              key={item.id}
              aria-pressed={item.id === data.event?.id}
              className="tma-chip tma-chip--tall"
              type="button"
              onClick={() => setSelectedId(item.id)}
            >
              <span className="block whitespace-nowrap">{formatEventDayLabel(item.startsAt)}</span>
              <span className="tma-chip__sub whitespace-nowrap">записались: {item.signupsCount}</span>
            </button>
          ))}
        </div>
      ) : null}

      {data?.event ? (
        <div className="tma-card">
          <span className="text-[17px] font-bold">{data.event.title}</span>
          <span className="tma-hint">
            {formatEventDayLabel(data.event.startsAt)}, {formatEventTimeLabel(data.event.startsAt)} ·{" "}
            {signups.length} заяв.
          </span>
          {canSeat ? null : (
            <span className="text-sm text-[var(--tma-amber)]">
              Игра не сегодня — список смотрим, за стол сажаем в день турнира.
            </span>
          )}
        </div>
      ) : (
        <div className="tma-note">
          <ClipboardList size={18} />
          <span>Нет опубликованных турниров впереди. Создайте афишу во вкладке «Ещё».</span>
        </div>
      )}

      <div className="tma-segment">
        <button aria-pressed={tab === "waiting"} type="button" onClick={() => setListTab("waiting")}>
          Ждут · {waiting.length}
        </button>
        {waitlist.length > 0 ? (
          <button aria-pressed={tab === "waitlist"} type="button" onClick={() => setListTab("waitlist")}>
            Очередь · {waitlist.length}
          </button>
        ) : null}
        <button aria-pressed={tab === "seated"} type="button" onClick={() => setListTab("seated")}>
          За столом · {seated.length}
        </button>
      </div>

      {tab === "waitlist" ? (
        <>
          <p className="tma-hint tma-hint--pad">
            Очередь идёт сверху вниз: место, освободившееся в приложении, полчаса держат за
            первым в ней. Нажмите на игрока, чтобы открыть анкету и посадить за стол.
          </p>
          <div className="tma-card tma-card--flush">
            {waitlist.map((entry, index) => (
              <button
                key={entry.id}
                className={`tma-row${entry.seated ? " tma-row--dim" : ""}`}
                type="button"
                onClick={() => openQueueEntry(entry)}
              >
                <span className="tma-row__lead">{index + 1}</span>
                <span className="tma-row__body">
                  <span className="tma-row__title">{entry.name}</span>
                  <span className="tma-row__sub">
                    {entry.seated
                      ? "уже за столом"
                      : entry.offerExpiresAt
                        ? `место держим до ${formatEventTimeLabel(entry.offerExpiresAt)}`
                        : entry.username
                          ? `@${entry.username}`
                          : TICKET_LABELS[entry.ticketType]}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  {entry.seated ? (
                    <CheckCircle2 className="text-[var(--tma-cyan)]" size={18} />
                  ) : entry.ticketType === "vip" ? (
                    <span className="tma-badge tma-badge--gold">VIP</span>
                  ) : entry.ticketType === "duo" || entry.ticketType === "duo_plus_one" ? (
                    <span className="tma-badge tma-badge--cyan">1+1</span>
                  ) : null}
                  {/* The same way into the questionnaire as every sign-up. */}
                  <ChevronRight className="tma-muted" size={18} />
                </span>
              </button>
            ))}
          </div>
        </>
      ) : null}

      {tab === "waiting" ? (
        <>
          <div className="tma-card tma-card--flush">
            {waiting.map((signup) => (
              <button
                key={signup.id}
                className="tma-row"
                type="button"
                onClick={() => openSignup(signup)}
              >
                <span className="tma-row__body">
                  <span className="tma-row__title">{signup.name}</span>
                  <span className="tma-row__sub">
                    {signup.username
                      ? `@${signup.username}`
                      : signup.telegramId
                        ? "записался в приложении"
                        : "записался на сайте"}
                  </span>
                  {signup.partnerName ? (
                    <span className="tma-row__sub">+1: {signup.partnerName}</span>
                  ) : null}
                  {signup.reserved || signup.ticketType !== "regular" || signup.usePass !== "none" ? (
                    <span className="tma-row__badges">
                      {signup.reserved ? (
                        <span className="tma-badge tma-badge--amber">отложен · не подтвердил</span>
                      ) : null}
                      {signup.ticketType === "vip" ? <span className="tma-badge tma-badge--gold">VIP</span> : null}
                      {signup.ticketType === "duo" || signup.ticketType === "duo_plus_one" ? (
                        <span className="tma-badge tma-badge--cyan">1+1</span>
                      ) : null}
                      {signup.usePass !== "none" ? (
                        <span className="tma-badge tma-badge--green">{PASS_LABELS[signup.usePass]}</span>
                      ) : null}
                    </span>
                  ) : null}
                </span>
                <ChevronRight className="tma-muted shrink-0" size={18} />
              </button>
            ))}

            {waiting.length === 0 ? (
              <div className="tma-empty">
                {signups.length === 0 ? "Заявок пока нет" : "Все записавшиеся уже за столами"}
              </div>
            ) : null}

            {/* Their place went to the queue, and they may still walk in an hour late: the
                desk needs to see what happened rather than find them simply gone. */}
            {noShows.map((signup) => (
              <button
                key={signup.id}
                className="tma-row tma-row--dim"
                type="button"
                onClick={() => openSignup(signup)}
              >
                <span className="tma-row__body">
                  <span className="tma-row__title tma-row__title--struck">{signup.name}</span>
                  <span className="tma-row__badges">
                    <span className="tma-badge">не пришёл · место отдано</span>
                  </span>
                </span>
                <ChevronRight className="tma-muted shrink-0" size={18} />
              </button>
            ))}
          </div>
          {waiting.length > 0 ? (
            <p className="tma-hint tma-hint--pad">Нажмите на игрока — откроется анкета и выбор места.</p>
          ) : null}
        </>
      ) : null}

      {tab === "seated" ? (
        <div className="tma-card tma-card--flush">
          {seated.map((signup) => (
            <div key={signup.id} className="tma-row">
              <CheckCircle2 className="shrink-0 text-[var(--tma-green)]" size={18} />
              <span className="tma-row__body">
                <span className="tma-row__title">{signup.name}</span>
              </span>
            </div>
          ))}
          {seated.length === 0 ? <div className="tma-empty">За столами пока никого из заявок</div> : null}
        </div>
      ) : null}
    </div>
  );
}

/** The ticket a sign-up came in on, in the colour the lists use for it. */
function TicketBadge({ ticket }: { ticket: Signup["ticketType"] }) {
  const tone =
    ticket === "vip" ? " tma-badge--gold" : ticket === "duo" || ticket === "duo_plus_one" ? " tma-badge--cyan" : "";
  return <span className={`tma-badge${tone}`}>{TICKET_LABELS[ticket]}</span>;
}
