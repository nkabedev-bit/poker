"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { CalendarDays, ChevronLeft, Clock, MapPin, Users } from "lucide-react";
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

type EventDetails = TournamentEvent & { signedUp: boolean; signupsCount: number };

export default function ClientEventPage() {
  const { initData } = useClientTMA();
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const eventId = params?.id;

  const [event, setEvent] = useState<EventDetails | null>(null);
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
        headers: { "X-Telegram-Init-Data": initData },
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
  const featureLines = event.featuresText
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  return (
    <div className="space-y-5 pt-2">
      <Link className="flex items-center gap-1 text-sm text-white/60" href="/client">
        <ChevronLeft size={18} /> Назад
      </Link>

      <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-[#3a0a17] via-[#1a0509] to-[#0b0708] p-5">
        {event.posterUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            alt=""
            className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-35"
            src={event.posterUrl}
          />
        ) : null}

        <div className="relative space-y-3">
          <h1 className="text-2xl font-bold uppercase leading-tight">{event.title}</h1>
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
          {event.badge ? <Badge>{event.badge}</Badge> : null}
        </div>
      </div>

      {event.venueAddress ? (
        <section className="space-y-2">
          <h2 className="px-1 text-lg font-bold">Где проходит турнир?</h2>
          <GlassCard className="!p-4">
            <div className="flex items-start gap-3">
              <MapPin className="mt-0.5 shrink-0 text-white/45" size={18} />
              <p className="text-sm text-white/80">{event.venueAddress}</p>
            </div>
          </GlassCard>
        </section>
      ) : null}

      {event.rulesText ? (
        <section className="space-y-2">
          <h2 className="px-1 text-lg font-bold">Общие правила</h2>
          <GlassCard className="!p-4">
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-white/80">
              {event.rulesText}
            </p>
          </GlassCard>
        </section>
      ) : null}

      {featureLines.length > 0 || event.buyIn > 0 || event.startingStack ? (
        <section className="space-y-2">
          <h2 className="px-1 text-lg font-bold">Особенности</h2>
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
            {event.buyIn > 0 ? (
              <p className="text-sm text-white/80">
                Стоимость участия {event.buyIn.toLocaleString("ru-RU")} ₽
              </p>
            ) : null}
          </GlassCard>
        </section>
      ) : null}

      {seatsLeft !== null ? (
        <p className="px-1 text-center text-xs text-white/45">
          {seatsLeft > 0 ? `Свободных мест: ${seatsLeft}` : "Мест не осталось"}
        </p>
      ) : null}

      {event.signedUp ? (
        <div className="space-y-3">
          <div className="rounded-2xl border border-emerald-400/30 bg-emerald-400/10 px-4 py-3 text-center text-sm font-semibold text-emerald-300">
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
