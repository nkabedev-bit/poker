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
    <div className="space-y-5 pt-1">
      <Link className="flex items-center gap-1 text-sm text-white/60" href="/client">
        <ChevronLeft size={18} /> Назад
      </Link>

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
          <h2 className="px-0.5 text-[19px] font-bold tracking-tight">Где проходит турнир?</h2>
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
          <h2 className="px-0.5 text-[19px] font-bold tracking-tight">Общие правила</h2>
          <GlassCard className="!p-4">
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-white/80">
              {event.rulesText}
            </p>
          </GlassCard>
        </section>
      ) : null}

      {featureLines.length > 0 || event.startingStack ? (
        <section className="space-y-2">
          <h2 className="px-0.5 text-[19px] font-bold tracking-tight">Особенности</h2>
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
          <h2 className="px-0.5 text-[19px] font-bold tracking-tight">Билеты</h2>
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
