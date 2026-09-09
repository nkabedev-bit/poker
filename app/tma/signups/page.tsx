"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Armchair,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronUp,
  ClipboardList,
  Dices,
  Hourglass,
} from "lucide-react";
import { confirmSeated, getTelegramWebApp, useTMA } from "../layout";
import { useVisiblePolling } from "../use-visible-polling";
import { formatEventDayLabel, formatEventTimeLabel } from "@/lib/events/types";
import { SeatingPicker } from "@/components/tma/seating-picker";
import { buildSeatingTables, pickRandomSeat } from "@/lib/tables/seating";
import type { TournamentPlayer } from "@/lib/timer/types";

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

type Profile = {
  agreementAccepted: boolean;
  birthDate: string;
  discoverySource: string;
  displayName: string | null;
  freeEntries: { regular: number; vip: number };
  fullName: string;
  notificationsConsent: boolean;
  phone: string;
  ratingConsent: boolean;
  submittedAt: string | null;
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
  /** Chairs per table tonight, so the plan matches the room. */
  seatsPerTable: number;
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
  const [profile, setProfile] = useState<Profile | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [players, setPlayers] = useState<TournamentPlayer[]>([]);
  const [seatChoice, setSeatChoice] = useState<SeatChoice | null>(null);
  const [seatingOpen, setSeatingOpen] = useState(false);
  // The queue is folded away: most evenings the desk works the sign-ups and never opens
  // it, and it only matters when somebody fails to turn up.
  const [waitlistOpen, setWaitlistOpen] = useState(false);
  // Seating somebody out of the queue: who they are, and whose place they are taking.
  const [queueSeating, setQueueSeating] = useState<WaitlistEntry | null>(null);
  const [replacing, setReplacing] = useState<Signup | null>(null);
  // A place in line says what the player hoped for; the desk decides at the door.
  const [queueTicket, setQueueTicket] = useState<"regular" | "vip">("regular");

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
  const openSignup = async (signup: Signup) => {
    setOpened(signup);
    setProfile(null);
    setSeatChoice(null);
    setSeatingOpen(false);
    setProfileLoading(true);

    try {
      const res = await fetch(`/api/tma/client-profile?userId=${signup.userId}`, {
        headers: { "X-Telegram-Init-Data": initData },
      });

      if (res.ok) {
        const payload = await res.json();
        setProfile(payload.profile ?? null);
      }
    } finally {
      setProfileLoading(false);
    }
  };

  const closeSignup = () => {
    setOpened(null);
    setProfile(null);
    setSeatChoice(null);
    setSeatingOpen(false);
  };

  /** Starts seating somebody from the queue: first the desk says whose place it is. */
  const openQueueSeating = (entry: WaitlistEntry) => {
    setQueueSeating(entry);
    setReplacing(null);
    setSeatChoice(null);
    // What they asked for in the queue is the obvious first guess; the desk can change it.
    setQueueTicket(entry.ticketType === "vip" ? "vip" : "regular");
  };

  const closeQueueSeating = () => {
    setQueueSeating(null);
    setReplacing(null);
    setSeatChoice(null);
  };

  /**
   * Seats the player from the queue in the absentee's stead: the sign-up that never
   * turned up is marked as such, and this one becomes a ticket of the kind just picked.
   */
  const seatFromQueue = async (entry: WaitlistEntry, absentee: Signup, choice: SeatChoice) => {
    const tg = getTelegramWebApp();
    if (seatingId) return;

    setSeatingId(entry.id);
    try {
      const res = await fetch(`/api/tma/event-signups/${entry.id}/seat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Telegram-Init-Data": initData },
        body: JSON.stringify({
          replacesSignupId: absentee.id,
          seat: choice.seat,
          table: choice.table,
          ticketType: queueTicket,
        }),
      });

      if (res.ok) {
        tg?.HapticFeedback.notificationOccurred("success");
        await confirmSeated(entry.name, choice);
        closeQueueSeating();
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

  const seatAtRandom = (signup: Signup) => {
    const tg = getTelegramWebApp();
    const picked = pickRandomSeat(
      buildSeatingTables(players, data?.tablesCount ?? 1, data?.seatsPerTable),
      seatingTicket(signup.ticketType),
    );

    if (!picked) {
      tg?.HapticFeedback.notificationOccurred("error");
      tg?.showAlert(
        signup.ticketType === "vip"
          ? "Свободных мест за VIP-столом нет"
          : "Свободных мест за обычными столами нет",
      );
      return;
    }

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
        await confirmSeated(signup.name, choice);
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

  if (loading) return <div>Загрузка...</div>;

  // Only tonight's players go to tonight's tables. A Thursday sign-up seated now would
  // join a tournament nobody put them in.
  const canSeat = data?.event?.seatingOpen ?? false;

  // Somebody from the queue, on their way to a chair: first whose place it is, then the
  // ticket and the seat.
  if (queueSeating) {
    const absentees = (data?.signups ?? []).filter(
      (signup) => !signup.seated && !signup.noShow,
    );
    const queueDisabledClass = seatingId ? " opacity-60 cursor-not-allowed" : "";

    if (!replacing) {
      return (
        <div className="space-y-4">
          <button
            className="flex items-center gap-2 text-[var(--tg-theme-button-color)]"
            type="button"
            onClick={closeQueueSeating}
          >
            <ChevronLeft size={18} /> К заявкам
          </button>

          <h1 className="text-xl font-bold">
            Вместо кого сажаем <span className="text-[#7ad0f0]">{queueSeating.name}</span>?
          </h1>
          <p className="text-sm text-[var(--tg-theme-hint-color)]">
            Выберите того, кто записался и не пришёл — его место займёт игрок из очереди.
          </p>

          {absentees.length === 0 ? (
            <p className="rounded-xl bg-[var(--tg-theme-secondary-bg-color)] p-4 text-sm text-[var(--tg-theme-hint-color)]">
              Все записавшиеся уже за столами — свободного места в очередь нет.
            </p>
          ) : (
            <div className="space-y-2">
              {absentees.map((signup) => (
                <button
                  key={signup.id}
                  className="flex w-full items-center justify-between gap-3 rounded-lg bg-[var(--tg-theme-secondary-bg-color)] p-4 text-left"
                  type="button"
                  onClick={() => setReplacing(signup)}
                >
                  <span className="min-w-0">
                    <span className="block truncate font-semibold">{signup.name}</span>
                    <span className="block text-xs text-[var(--tg-theme-hint-color)]">
                      {TICKET_LABELS[signup.ticketType]}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      );
    }

    return (
      <div className="space-y-4">
        <button
          className={`flex items-center gap-2 text-[var(--tg-theme-button-color)]${queueDisabledClass}`}
          disabled={Boolean(seatingId)}
          type="button"
          onClick={() => setReplacing(null)}
        >
          <ChevronLeft size={18} /> К выбору
        </button>

        <div className="rounded-xl bg-[var(--tg-theme-secondary-bg-color)] p-4">
          <p className="text-lg font-bold">{queueSeating.name}</p>
          <p className="text-sm text-[var(--tg-theme-hint-color)]">
            Вместо {replacing.name} — его заявка станет «не пришёл»
          </p>
        </div>

        {/* The queue said what they hoped for; what they get is decided here, at the
            door, and that is the ticket they pay for. */}
        <div>
          <p className="mb-2 text-sm font-semibold">Какой билет</p>
          <div className="grid grid-cols-2 gap-2">
            {(["regular", "vip"] as const).map((ticket) => (
              <button
                key={ticket}
                className={`rounded-lg p-3 text-sm font-semibold ${
                  queueTicket === ticket
                    ? "bg-[var(--tg-theme-button-color)] text-[var(--tg-theme-button-text-color)]"
                    : "bg-[var(--tg-theme-secondary-bg-color)]"
                }`}
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
        </div>

        <button
          className={`flex w-full items-center justify-center gap-2 rounded-lg bg-[var(--tg-theme-secondary-bg-color)] p-3 font-semibold${queueDisabledClass}`}
          disabled={Boolean(seatingId)}
          type="button"
          onClick={() => {
            const tg = getTelegramWebApp();
            const picked = pickRandomSeat(
              buildSeatingTables(players, data?.tablesCount ?? 1, data?.seatsPerTable),
              queueTicket,
            );

            if (!picked) {
              tg?.HapticFeedback.notificationOccurred("error");
              tg?.showAlert(
                queueTicket === "vip"
                  ? "Свободных мест за VIP-столом нет"
                  : "Свободных мест за обычными столами нет",
              );
              return;
            }

            setSeatChoice(picked);
            void seatFromQueue(queueSeating, replacing, picked);
          }}
        >
          <Dices size={18} /> Посадить на случайное место
        </button>

        <SeatingPicker
          players={players}
          seatsPerTable={data?.seatsPerTable}
          selected={seatChoice}
          tablesCount={data?.tablesCount ?? 1}
          onSelect={(choice) => {
            getTelegramWebApp()?.HapticFeedback.impactOccurred("light");
            setSeatChoice(choice);
          }}
          onTakenSeat={(name) => getTelegramWebApp()?.showAlert(`Место занято: ${name}`)}
        />

        <button
          className="w-full rounded-lg bg-[var(--tg-theme-button-color)] p-4 font-semibold text-[var(--tg-theme-button-text-color)] disabled:opacity-60"
          disabled={Boolean(seatingId) || !seatChoice}
          type="button"
          onClick={() => seatChoice && void seatFromQueue(queueSeating, replacing, seatChoice)}
        >
          {seatChoice
            ? `Посадить за стол ${seatChoice.table}, место ${seatChoice.seat}`
            : "Выберите место"}
        </button>
      </div>
    );
  }

  // One sign-up, opened: the questionnaire first, the seating plan when the admin is
  // ready to sit them down.
  if (opened) {
    if (seatingOpen) {
      return (
        <div className="space-y-4">
          <button
            className="flex items-center gap-2 text-[var(--tg-theme-button-color)]"
            type="button"
            onClick={() => setSeatingOpen(false)}
          >
            <ChevronLeft size={18} /> К анкете
          </button>

          <h1 className="text-xl font-bold flex items-center gap-2">
            <Armchair size={20} /> Куда сажаем
          </h1>

          <div className="rounded-xl bg-[var(--tg-theme-secondary-bg-color)] p-4">
            <p className="text-lg font-bold">{opened.name}</p>
            <p className="text-sm text-[var(--tg-theme-hint-color)]">
              {TICKET_LABELS[opened.ticketType]}
            </p>
          </div>

          <button
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-[var(--tg-theme-secondary-bg-color)] p-3 font-semibold disabled:opacity-60"
            disabled={seatingId !== null}
            type="button"
            onClick={() => seatAtRandom(opened)}
          >
            <Dices size={18} /> Посадить на случайное место
          </button>

          <SeatingPicker
            players={players}
            seatsPerTable={data?.seatsPerTable}
            selected={seatChoice}
            tablesCount={data?.tablesCount ?? 1}
            onSelect={(choice) => {
              getTelegramWebApp()?.HapticFeedback.impactOccurred("light");
              setSeatChoice(choice);
            }}
            onTakenSeat={(name) => getTelegramWebApp()?.showAlert(`Место занято: ${name}`)}
          />

          <button
            className="w-full rounded-lg bg-[var(--tg-theme-button-color)] p-4 font-semibold text-[var(--tg-theme-button-text-color)] disabled:opacity-60"
            disabled={seatingId !== null || !seatChoice}
            type="button"
            onClick={() => seatChoice && void seat(opened, seatChoice)}
          >
            {seatChoice
              ? `Посадить за стол ${seatChoice.table}, место ${seatChoice.seat}`
              : "Выберите место"}
          </button>
        </div>
      );
    }

    return (
      <div className="space-y-4">
        <button
          className="flex items-center gap-2 text-[var(--tg-theme-button-color)]"
          type="button"
          onClick={closeSignup}
        >
          <ChevronLeft size={18} /> К заявкам
        </button>

        <h1 className="text-xl font-bold">{opened.name}</h1>

        <div className="rounded-xl bg-[var(--tg-theme-secondary-bg-color)] p-4 text-sm">
          <p className="font-semibold">{TICKET_LABELS[opened.ticketType]}</p>
          {opened.reserved ? (
            <p className="mt-1 text-[#e9c07a]">
              Билет отложен админом — игрок ещё не подтвердил, что придёт.
            </p>
          ) : null}
          {opened.usePass !== "none" ? (
            <p className="mt-1 text-emerald-500">Вход {PASS_LABELS[opened.usePass]}</p>
          ) : null}
          {opened.partnerName ? (
            <p className="mt-1 text-[#7ad0f0]">
              С ним придёт {opened.partnerName} — добавьте вторым игроком вручную, оба
              платят половину билета.
            </p>
          ) : null}
        </div>

        {profileLoading ? (
          <p className="text-sm text-[var(--tg-theme-hint-color)]">Открываем анкету…</p>
        ) : profile ? (
          <div className="space-y-2 rounded-xl bg-[var(--tg-theme-secondary-bg-color)] p-4">
            <ProfileRow label="Имя и фамилия" value={profile.fullName} />
            <ProfileRow label="Ник в клубе" value={profile.displayName ?? ""} />
            <ProfileRow label="Телефон" value={profile.phone} />
            <ProfileRow label="Дата рождения" value={profile.birthDate} />
            <ProfileRow label="Откуда узнал" value={profile.discoverySource} />
            <ProfileRow
              label="Telegram"
              value={
                profile.username
                  ? `@${profile.username}`
                  : opened.telegramId
                    ? `id ${opened.telegramId}`
                    : "нет — вход через Яндекс"
              }
            />
            <ProfileRow label="Согласие на рейтинг" value={profile.ratingConsent ? "Да" : "Нет"} />
            <ProfileRow
              label="Согласие на рассылку"
              value={profile.notificationsConsent ? "Да" : "Нет"}
            />
            <ProfileRow
              label="Проходки"
              value={
                profile.freeEntries.regular + profile.freeEntries.vip > 0
                  ? `обычных ${profile.freeEntries.regular}, VIP ${profile.freeEntries.vip}`
                  : "нет"
              }
            />
            <ProfileRow
              label="Анкета заполнена"
              value={
                profile.submittedAt
                  ? new Date(profile.submittedAt).toLocaleDateString("ru-RU")
                  : "—"
              }
            />
          </div>
        ) : (
          <p className="text-sm text-[var(--tg-theme-hint-color)]">
            Анкета не найдена — игрок регистрировался до появления анкет.
          </p>
        )}

        {opened.seated ? (
          <p className="flex items-center gap-2 text-sm text-green-500">
            <CheckCircle2 size={16} /> Уже за столом
          </p>
        ) : canSeat ? (
          <button
            className="w-full rounded-lg bg-[var(--tg-theme-button-color)] p-4 font-semibold text-[var(--tg-theme-button-text-color)]"
            type="button"
            onClick={() => setSeatingOpen(true)}
          >
            Посадить за стол
          </button>
        ) : (
          <p className="rounded-lg bg-[var(--tg-theme-secondary-bg-color)] p-4 text-sm text-[var(--tg-theme-hint-color)]">
            Игра не сегодня — посадить за стол можно будет в день турнира.
          </p>
        )}
      </div>
    );
  }

  const signups = data?.signups ?? [];
  const waiting = signups.filter((signup) => !signup.seated && !signup.noShow);
  const noShows = signups.filter((signup) => signup.noShow);
  const waitlist = data?.waitlist ?? [];

  return (
    <div className="space-y-4">
      <Link className="flex items-center gap-2 text-[var(--tg-theme-button-color)]" href="/tma/players">
        <ChevronLeft size={18} /> Игроки
      </Link>

      <h1 className="text-xl font-bold flex items-center gap-2">
        <ClipboardList size={20} /> Заявки
      </h1>

      {/* The club posts a week at a time, and the desk is asked about all of it: who is
          coming on Thursday, whether Sunday is filling up. */}
      {(data?.events?.length ?? 0) > 1 ? (
        <div className="overflow-x-auto pb-1">
          <div className="flex w-max gap-2">
            {data?.events?.map((item) => {
              const chosen = item.id === data.event?.id;

              return (
                <button
                  key={item.id}
                  className={`rounded-xl px-4 py-2.5 text-left ${
                    chosen
                      ? "bg-[var(--tg-theme-button-color)] text-[var(--tg-theme-button-text-color)]"
                      : "bg-[var(--tg-theme-secondary-bg-color)]"
                  }`}
                  type="button"
                  onClick={() => setSelectedId(item.id)}
                >
                  <span className="block whitespace-nowrap text-sm font-semibold">
                    {formatEventDayLabel(item.startsAt)}
                  </span>
                  <span
                    className={`block whitespace-nowrap text-xs ${
                      chosen ? "opacity-75" : "text-[var(--tg-theme-hint-color)]"
                    }`}
                  >
                    записались: {item.signupsCount}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      {data?.event ? (
        <div className="bg-[var(--tg-theme-secondary-bg-color)] p-4 rounded-xl">
          <p className="font-semibold">{data.event.title}</p>
          <p className="text-sm text-[var(--tg-theme-hint-color)]">
            {formatEventDayLabel(data.event.startsAt)}, {formatEventTimeLabel(data.event.startsAt)}
          </p>
          {canSeat ? null : (
            <p className="mt-1 text-sm text-[#e9c07a]">
              Игра не сегодня — список смотрим, за стол сажаем в день турнира.
            </p>
          )}
        </div>
      ) : (
        <div className="bg-[var(--tg-theme-secondary-bg-color)] p-4 rounded-xl text-sm">
          Нет опубликованных турниров впереди. Создайте афишу в веб-админке.
        </div>
      )}

      {waitlist.length > 0 ? (
        <div className="space-y-2">
          <button
            className="flex w-full items-center justify-between gap-3 rounded-xl bg-[var(--tg-theme-secondary-bg-color)] p-4 text-left"
            type="button"
            onClick={() => setWaitlistOpen((open) => !open)}
          >
            <span className="flex items-center gap-2 font-semibold">
              <Hourglass size={18} /> Лист ожидания ({waitlist.length})
            </span>
            {waitlistOpen ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
          </button>

          {waitlistOpen ? (
            <div className="space-y-2 pl-2">
              <p className="text-xs text-[var(--tg-theme-hint-color)]">
                Очередь идёт сверху вниз: место, освободившееся в приложении, полчаса
                держат за первым в ней. Нажмите на игрока, чтобы посадить его вместо
                того, кто не пришёл.
              </p>
              {waitlist.map((entry, index) => (
                <button
                  key={entry.id}
                  className={`flex w-full items-center justify-between gap-3 rounded-lg bg-[var(--tg-theme-secondary-bg-color)] p-3 text-left${
                    entry.seated ? " opacity-60" : ""
                  }`}
                  disabled={entry.seated}
                  type="button"
                  onClick={() => openQueueSeating(entry)}
                >
                  <span className="min-w-0">
                    <span className="block truncate font-semibold">
                      {index + 1}. {entry.name}
                    </span>
                    <span className="block text-xs text-[var(--tg-theme-hint-color)]">
                      {entry.seated
                        ? "уже за столом"
                        : entry.offerExpiresAt
                          ? `место держим до ${formatEventTimeLabel(entry.offerExpiresAt)}`
                          : entry.username
                            ? `@${entry.username}`
                            : TICKET_LABELS[entry.ticketType]}
                    </span>
                  </span>
                  <span className="shrink-0">
                    {entry.seated ? (
                      <CheckCircle2 className="text-[#7ad0f0]" size={18} />
                    ) : entry.ticketType === "vip" ? (
                      <span className="rounded-full bg-[#e9c07a]/15 px-2 py-0.5 text-[11px] font-bold text-[#e9c07a]">
                        VIP
                      </span>
                    ) : entry.ticketType === "duo" || entry.ticketType === "duo_plus_one" ? (
                      <span className="rounded-full bg-[#7ad0f0]/15 px-2 py-0.5 text-[11px] font-bold text-[#7ad0f0]">
                        1+1
                      </span>
                    ) : null}
                  </span>
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="space-y-2">
        {waiting.map((signup) => (
          <button
            key={signup.id}
            className="flex w-full items-center justify-between gap-3 rounded-lg bg-[var(--tg-theme-secondary-bg-color)] p-4 text-left"
            type="button"
            onClick={() => void openSignup(signup)}
          >
            <span className="min-w-0">
              <span className="block truncate font-semibold">{signup.name}</span>
              <span className="block text-xs text-[var(--tg-theme-hint-color)]">
                {signup.username
                  ? `@${signup.username}`
                  : signup.telegramId
                    ? "записался в приложении"
                    : "записался на сайте"}
              </span>
              {signup.partnerName ? (
                <span className="block text-xs text-[var(--tg-theme-hint-color)]">
                  +1: {signup.partnerName}
                </span>
              ) : null}
              <span className="mt-1 flex flex-wrap gap-1.5">
                {signup.reserved ? (
                  <span className="rounded-full bg-[#e9c07a]/15 px-2 py-0.5 text-[11px] font-bold text-[#e9c07a]">
                    отложен · не подтвердил
                  </span>
                ) : null}
                {signup.ticketType === "vip" ? (
                  <span className="rounded-full bg-[#e9c07a]/15 px-2 py-0.5 text-[11px] font-bold text-[#e9c07a]">
                    VIP
                  </span>
                ) : null}
                {signup.ticketType === "duo" || signup.ticketType === "duo_plus_one" ? (
                  <span className="rounded-full bg-[#7ad0f0]/15 px-2 py-0.5 text-[11px] font-bold text-[#7ad0f0]">
                    1+1
                  </span>
                ) : null}
                {signup.usePass !== "none" ? (
                  <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-bold text-emerald-500">
                    {PASS_LABELS[signup.usePass]}
                  </span>
                ) : null}
              </span>
            </span>
            <ClipboardList className="shrink-0 text-[var(--tg-theme-button-color)]" size={18} />
          </button>
        ))}

        {waiting.length === 0 ? (
          <div className="py-8 text-center text-[var(--tg-theme-hint-color)]">
            {signups.length === 0 ? "Заявок пока нет" : "Все записавшиеся уже за столами"}
          </div>
        ) : null}

        {/* Their place went to the queue, and they may still walk in an hour late: the
            desk needs to see what happened rather than find them simply gone. */}
        {noShows.map((signup) => (
          <button
            key={signup.id}
            className="flex w-full items-center justify-between gap-3 rounded-lg bg-[var(--tg-theme-secondary-bg-color)] p-4 text-left opacity-60"
            type="button"
            onClick={() => void openSignup(signup)}
          >
            <span className="min-w-0">
              <span className="block truncate font-semibold line-through">{signup.name}</span>
              <span className="mt-1 block">
                <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] font-bold text-[var(--tg-theme-hint-color)]">
                  не пришёл · место отдано
                </span>
              </span>
            </span>
            <ClipboardList className="shrink-0 text-[var(--tg-theme-hint-color)]" size={18} />
          </button>
        ))}
      </div>

      {signups.some((signup) => signup.seated) ? (
        <section className="space-y-2 pt-2">
          <h2 className="text-sm text-[var(--tg-theme-hint-color)]">Уже за столом</h2>
          {signups
            .filter((signup) => signup.seated)
            .map((signup) => (
              <div
                key={signup.id}
                className="flex items-center gap-2 bg-[var(--tg-theme-secondary-bg-color)] p-3 rounded-lg text-sm"
              >
                <CheckCircle2 className="text-green-500" size={16} /> {signup.name}
              </div>
            ))}
        </section>
      ) : null}
    </div>
  );
}

/** One line of the questionnaire, left out when the player never answered it. */
function ProfileRow({ label, value }: { label: string; value: string }) {
  if (!value.trim()) return null;

  return (
    <div className="flex items-baseline justify-between gap-3 text-sm">
      <span className="text-[var(--tg-theme-hint-color)]">{label}</span>
      <span className="text-right font-semibold">{value}</span>
    </div>
  );
}
