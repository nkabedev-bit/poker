"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Armchair, CheckCircle2, ChevronLeft, ClipboardList, Dices } from "lucide-react";
import { getTelegramWebApp, useTMA } from "../layout";
import { useVisiblePolling } from "../use-visible-polling";
import { formatEventDayLabel, formatEventTimeLabel } from "@/lib/events/types";
import { SeatingPicker } from "@/components/tma/seating-picker";
import { buildSeatingTables, pickRandomSeat } from "@/lib/tables/seating";
import type { TournamentPlayer } from "@/lib/timer/types";

type Signup = {
  id: string;
  name: string;
  seated: boolean;
  telegramId: number;
  ticketType: "regular" | "vip";
  usePass: "none" | "regular" | "vip";
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

type SeatChoice = { seat: number; table: number };

const TICKET_LABELS = { regular: "Обычный билет", vip: "VIP билет" } as const;

const PASS_LABELS = { regular: "по проходке", vip: "по VIP проходке" } as const;

type SignupsResponse = {
  event: { id: string; startsAt: string; title: string } | null;
  signups: Signup[];
  tablesCount: number;
};

export default function TMASignupsPage() {
  const { initData } = useTMA();
  const [data, setData] = useState<SignupsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [seatingId, setSeatingId] = useState<string | null>(null);
  // The sign-up the admin opened: first their questionnaire, then the seating plan.
  const [opened, setOpened] = useState<Signup | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [players, setPlayers] = useState<TournamentPlayer[]>([]);
  const [seatChoice, setSeatChoice] = useState<SeatChoice | null>(null);
  const [seatingOpen, setSeatingOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const [signupsRes, playersRes] = await Promise.all([
        fetch("/api/tma/event-signups", { headers: { "X-Telegram-Init-Data": initData } }),
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
  }, [initData]);

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
      const res = await fetch(`/api/tma/client-profile?telegramId=${signup.telegramId}`, {
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

  const seatAtRandom = (signup: Signup) => {
    const tg = getTelegramWebApp();
    const picked = pickRandomSeat(
      buildSeatingTables(players, data?.tablesCount ?? 1),
      signup.ticketType,
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
          ticketType: signup.ticketType,
        }),
      });

      if (res.ok) {
        tg?.HapticFeedback.notificationOccurred("success");
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
          {opened.usePass !== "none" ? (
            <p className="mt-1 text-emerald-500">Вход {PASS_LABELS[opened.usePass]}</p>
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
              value={profile.username ? `@${profile.username}` : `id ${opened.telegramId}`}
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
        ) : (
          <button
            className="w-full rounded-lg bg-[var(--tg-theme-button-color)] p-4 font-semibold text-[var(--tg-theme-button-text-color)]"
            type="button"
            onClick={() => setSeatingOpen(true)}
          >
            Посадить за стол
          </button>
        )}
      </div>
    );
  }

  const signups = data?.signups ?? [];
  const waiting = signups.filter((signup) => !signup.seated);

  return (
    <div className="space-y-4">
      <Link className="flex items-center gap-2 text-[var(--tg-theme-button-color)]" href="/tma/players">
        <ChevronLeft size={18} /> Игроки
      </Link>

      <h1 className="text-xl font-bold flex items-center gap-2">
        <ClipboardList size={20} /> Заявки
      </h1>

      {data?.event ? (
        <div className="bg-[var(--tg-theme-secondary-bg-color)] p-4 rounded-xl">
          <p className="font-semibold">{data.event.title}</p>
          <p className="text-sm text-[var(--tg-theme-hint-color)]">
            {formatEventDayLabel(data.event.startsAt)}, {formatEventTimeLabel(data.event.startsAt)}
          </p>
        </div>
      ) : (
        <div className="bg-[var(--tg-theme-secondary-bg-color)] p-4 rounded-xl text-sm">
          Нет опубликованных турниров впереди. Создайте афишу в веб-админке.
        </div>
      )}

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
                {signup.username ? `@${signup.username}` : "записался в приложении"}
              </span>
              <span className="mt-1 flex flex-wrap gap-1.5">
                {signup.ticketType === "vip" ? (
                  <span className="rounded-full bg-[#e9c07a]/15 px-2 py-0.5 text-[11px] font-bold text-[#e9c07a]">
                    VIP
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
          <div className="text-center text-gray-500 py-8">
            {signups.length === 0 ? "Заявок пока нет" : "Все записавшиеся уже за столами"}
          </div>
        ) : null}
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
