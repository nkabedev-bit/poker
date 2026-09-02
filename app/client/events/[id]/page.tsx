"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { CalendarDays, Clock, MapPin, Ticket, Users } from "lucide-react";
import { getClientTelegramWebApp, useClientTMA } from "../../layout";
import {
  Badge,
  Chip,
  GhostButton,
  GlassCard,
  LoadingScreen,
  PrimaryButton,
  ScreenMessage,
} from "../../_components/ui";
import {
  formatEventDayLabel,
  formatEventTimeLabel,
  type TournamentEvent,
} from "@/lib/events/types";

type FreePassChoice = "none" | "regular" | "vip";

type EventDetails = TournamentEvent & {
  signedUp: boolean;
  signupsCount: number;
  usePass: FreePassChoice;
};

type FreeEntries = { regular: number; vip: number };

const PASS_TITLES: Record<Exclude<FreePassChoice, "none">, string> = {
  regular: "Обычная проходка",
  vip: "VIP проходка",
};

export default function ClientEventPage() {
  const { initData } = useClientTMA();
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const eventId = params?.id;

  const [event, setEvent] = useState<EventDetails | null>(null);
  const [freeEntries, setFreeEntries] = useState<FreeEntries>({ regular: 0, vip: 0 });
  const [usePass, setUsePass] = useState<FreePassChoice>("none");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    if (!eventId) return;
    try {
      const res = await fetch(`/api/client-tma/events/${eventId}`, {
        headers: { "X-Telegram-Init-Data": initData },
      });
      if (res.ok) {
        const data = await res.json();
        setEvent(data.event as EventDetails);
        setFreeEntries({
          regular: Number(data.freeEntries?.regular ?? 0),
          vip: Number(data.freeEntries?.vip ?? 0),
        });
      }
    } finally {
      setLoading(false);
    }
  }, [eventId, initData]);

  useEffect(() => {
    const timeout = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timeout);
  }, [load]);

  const toggleSignup = async (signUp: boolean) => {
    if (!eventId || submitting) return;

    setSubmitting(true);
    const tg = getClientTelegramWebApp();
    try {
      const res = await fetch(`/api/client-tma/events/${eventId}/signup`, {
        method: signUp ? "POST" : "DELETE",
        headers: { "Content-Type": "application/json", "X-Telegram-Init-Data": initData },
        body: signUp ? JSON.stringify({ usePass }) : undefined,
      });

      if (res.ok) {
        tg?.HapticFeedback?.notificationOccurred("success");
        await load();
        return;
      }

      const data = await res.json().catch(() => null);
      tg?.HapticFeedback?.notificationOccurred("error");

      // A player without a questionnaire cannot sign up — send them straight to it
      // instead of leaving them at a dead end.
      if (data?.error === "profile_required") {
        router.push("/client/onboarding");
        return;
      }

      tg?.showAlert(data?.message ?? "Не удалось сохранить запись. Попробуйте ещё раз.");
    } catch {
      tg?.showAlert("Нет связи с сервером. Попробуйте ещё раз.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <LoadingScreen />;

  if (!event) {
    return (
      <ScreenMessage
        action={
          <Link href="/client">
            <GhostButton>К списку турниров</GhostButton>
          </Link>
        }
        icon={<CalendarDays size={30} />}
        title="Турнир не найден"
        subtitle="Возможно, его сняли с публикации."
      />
    );
  }

  const seatsLeft = event.maxPlayers ? Math.max(0, event.maxPlayers - event.signupsCount) : null;
  const hasPasses = freeEntries.regular > 0 || freeEntries.vip > 0;
  const passOptions: Array<{ note: string | null; title: string; value: FreePassChoice }> = [
    ...(freeEntries.regular > 0
      ? [{
          note: `Осталось: ${freeEntries.regular}`,
          title: PASS_TITLES.regular,
          value: "regular" as const,
        }]
      : []),
    ...(freeEntries.vip > 0
      ? [{ note: `Осталось: ${freeEntries.vip}`, title: PASS_TITLES.vip, value: "vip" as const }]
      : []),
    { note: "Оплачу вход на месте", title: "Без проходки", value: "none" as const },
  ];
  const featureLines = event.featuresText
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  return (
    <div className="space-y-5 pt-1">

      <div className="relative min-h-[210px] overflow-hidden rounded-[22px] border border-white/[0.07] bg-[#1a0b10] shadow-[0_12px_36px_rgba(0,0,0,0.5)]">
        {event.posterUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            alt=""
            className="pointer-events-none absolute inset-0 h-full w-full object-cover"
            src={event.posterUrl}
          />
        ) : (
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-[#4a0f1e] via-[#20080e] to-[#0a0608]" />
        )}

        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(100deg,rgba(6,3,4,0.95)_0%,rgba(6,3,4,0.86)_38%,rgba(6,3,4,0.35)_72%,rgba(6,3,4,0.1)_100%)]" />

        <div className="relative flex h-full flex-col gap-3 p-5">
          <h1 className="max-w-[70%] text-[27px] font-extrabold uppercase leading-[1.05] tracking-tight">
            {event.title}
          </h1>
          <div className="flex flex-wrap gap-2">
            <Chip>
              <CalendarDays size={13} /> {formatEventDayLabel(event.startsAt)}
            </Chip>
            <Chip>
              <Clock size={13} /> {formatEventTimeLabel(event.startsAt)}
            </Chip>
            {event.maxPlayers ? (
              <Chip>
                <Users size={13} /> {event.maxPlayers} игроков
              </Chip>
            ) : null}
          </div>
          <div className="mt-auto">{event.badge ? <Badge>{event.badge}</Badge> : null}</div>
        </div>
      </div>

      {event.venueAddress ? (
        <section className="space-y-2">
          <h2 className="text-[19px] font-bold tracking-tight">Где проходит турнир?</h2>
          <GlassCard className="!p-4">
            <div className="flex items-start gap-3">
              <MapPin className="mt-0.5 shrink-0 text-[#f05a7e]" size={19} />
              <p className="text-sm text-white/80">{event.venueAddress}</p>
            </div>
          </GlassCard>
        </section>
      ) : null}

      {event.rulesText ? (
        <section className="space-y-2">
          <h2 className="text-[19px] font-bold tracking-tight">Общие правила</h2>
          <GlassCard className="!p-4">
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-white/80">
              {event.rulesText}
            </p>
          </GlassCard>
        </section>
      ) : null}

      {featureLines.length > 0 || event.startingStack ? (
        <section className="space-y-2">
          <h2 className="text-[19px] font-bold tracking-tight">Особенности</h2>
          <GlassCard className="space-y-2 !p-4">
            {featureLines.map((line, index) => (
              <p key={index} className="text-sm leading-relaxed text-white/80">
                {line}
              </p>
            ))}
            {event.startingStack ? (
              <p className="text-sm text-white/80">
                Стартовый стек {event.startingStack.toLocaleString("ru-RU")} фишек
              </p>
            ) : null}
          </GlassCard>
        </section>
      ) : null}

      {event.buyIn > 0 || event.vipBuyIn ? (
        <section className="space-y-2">
          <h2 className="text-[19px] font-bold tracking-tight">Билеты</h2>
          <div className="grid grid-cols-2 gap-3">
            {event.buyIn > 0 ? (
              <GlassCard className="!p-[18px]">
                <p className="text-[11px] uppercase tracking-wider text-white/40">Обычный</p>
                <p className="mt-2 text-[24px] font-extrabold leading-none">
                  {event.buyIn.toLocaleString("ru-RU")} ₽
                </p>
              </GlassCard>
            ) : null}
            {event.vipBuyIn ? (
              <GlassCard className="border-[#e9c07a]/40 bg-[linear-gradient(180deg,rgba(233,192,122,0.16),rgba(233,192,122,0.02))] !p-[18px]">
                <p className="text-[11px] uppercase tracking-wider text-[#e9c07a]">VIP</p>
                <p className="mt-2 text-[24px] font-extrabold leading-none text-[#e9c07a]">
                  {event.vipBuyIn.toLocaleString("ru-RU")} ₽
                </p>
              </GlassCard>
            ) : null}
          </div>
        </section>
      ) : null}

      {hasPasses && !event.signedUp ? (
        <section className="space-y-2">
          <h2 className="text-[19px] font-bold tracking-tight">Бесплатные проходки</h2>
          <GlassCard className="space-y-2 !p-3">
            {passOptions.map((option) => (
              <button
                key={option.value}
                className={`flex w-full items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-left transition ${
                  usePass === option.value
                    ? "border-[#f05a7e]/60 bg-[#f05a7e]/12"
                    : "border-white/[0.07] bg-white/[0.03]"
                }`}
                type="button"
                onClick={() => setUsePass(option.value)}
              >
                <span className="min-w-0">
                  <span className="block text-sm font-bold">{option.title}</span>
                  {option.note ? (
                    <span className="block text-xs text-white/45">{option.note}</span>
                  ) : null}
                </span>
                <span
                  className={`h-[18px] w-[18px] shrink-0 rounded-full border-2 ${
                    usePass === option.value
                      ? "border-[#f05a7e] bg-[#f05a7e]"
                      : "border-white/25"
                  }`}
                />
              </button>
            ))}
            <p className="px-1 pt-1 text-[11px] leading-relaxed text-white/45">
              Проходку можно использовать только на вход в турнир. Она не даёт права на
              бесплатный ре-энтри или аддон.
            </p>
          </GlassCard>
        </section>
      ) : null}

      {event.signedUp && event.usePass !== "none" ? (
        <div className="flex items-center gap-2.5 rounded-2xl border border-white/[0.07] bg-white/[0.03] px-4 py-3">
          <Ticket className="shrink-0 text-[#f05a7e]" size={18} />
          <p className="text-sm text-white/80">
            Вход по проходке: {PASS_TITLES[event.usePass]}. Её спишут, когда вы придёте на игру.
          </p>
        </div>
      ) : null}

      {seatsLeft !== null ? (
        <p className="px-1 text-center text-xs text-white/45">
          {seatsLeft > 0 ? `Свободных мест: ${seatsLeft}` : "Мест не осталось"}
        </p>
      ) : null}

      {event.signedUp ? (
        <div className="space-y-3">
          <div className="rounded-2xl border border-emerald-400/30 bg-emerald-400/10 px-4 py-3.5 text-center text-[15px] font-bold text-emerald-300">
            Вы записаны на турнир
          </div>
          <GhostButton disabled={submitting} onClick={() => void toggleSignup(false)}>
            Отменить запись
          </GhostButton>
        </div>
      ) : (
        <PrimaryButton
          disabled={seatsLeft === 0}
          loading={submitting}
          onClick={() => void toggleSignup(true)}
        >
          {seatsLeft === 0 ? "Мест нет" : "Записаться"}
        </PrimaryButton>
      )}

      <p className="px-2 pb-2 text-center text-xs text-white/40">
        Номер участника и стол выдаст администратор в день игры.
      </p>
    </div>
  );
}
