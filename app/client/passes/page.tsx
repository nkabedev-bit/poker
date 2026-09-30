"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { Ticket, TriangleAlert } from "lucide-react";
import { useClientTMA } from "../layout";
import { GhostLink, LoadingScreen, PageHeading, SectionHeader } from "../_components/ui";
import { CountUp } from "../_components/count-up";
import { formatEventDateParts } from "@/lib/events/types";

/** A pass written down for a game the player signed up for and has not played yet. */
type PassHold = { eventId: string; pass: "regular" | "vip"; startsAt: string; title: string };

type FreeEntries = { heldFor: PassHold[]; regular: number; vip: number };

const HELD_PASS_TITLES: Record<PassHold["pass"], string> = {
  regular: "Обычная",
  vip: "VIP",
};

export default function ClientPassesPage() {
  const { initData } = useClientTMA();
  const [freeEntries, setFreeEntries] = useState<FreeEntries>({ heldFor: [], regular: 0, vip: 0 });
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/client-tma/me", {
        headers: { "X-Telegram-Init-Data": initData },
      });

      if (res.ok) {
        const data = await res.json();
        setFreeEntries({
          heldFor: Array.isArray(data.freeEntries?.heldFor) ? data.freeEntries.heldFor : [],
          regular: Number(data.freeEntries?.regular ?? 0),
          vip: Number(data.freeEntries?.vip ?? 0),
        });
      }
    } finally {
      setLoading(false);
    }
  }, [initData]);

  useEffect(() => {
    const timeout = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timeout);
  }, [load]);

  if (loading) return <LoadingScreen />;

  const total = freeEntries.regular + freeEntries.vip;
  const held = freeEntries.heldFor;

  return (
    <div className="client-stagger flex flex-col gap-6 pt-1">
      <PageHeading subtitle="Входы в турнир, которые начислил клуб" title="Бесплатные проходки" />

      <div className="flex gap-2.5">
        <PassStub count={freeEntries.regular} title="Обычные" />
        <PassStub count={freeEntries.vip} gold title="VIP" />
      </div>

      {/* A pass written down for a game is taken out of the count above, and the page
          says where it went — otherwise it would simply look lost. */}
      {held.length > 0 ? (
        <section className="flex flex-col gap-2.5">
          <SectionHeader title="Закреплены за записями" />
          {held.map((hold) => {
            const date = formatEventDateParts(hold.startsAt);

            return (
              <Link
                key={hold.eventId}
                className="flex items-center gap-3.5 rounded-[18px] border border-club-line bg-club-surface px-4 py-3.5"
                href={`/client/events/${hold.eventId}`}
              >
                <div className="flex h-[72px] w-[60px] shrink-0 flex-col items-center justify-center gap-0.5 rounded-2xl bg-club-raised">
                  <span className="text-[10px] font-extrabold uppercase tracking-[0.1em] text-club-faint">{date.weekday}</span>
                  <span className="font-display text-[24px] font-semibold leading-none">{date.day}</span>
                  <span className="text-[11px] font-bold text-club-muted">{date.month}</span>
                </div>
                <div className="flex min-w-0 flex-col gap-1">
                  <p className="truncate text-[15px] font-extrabold">{hold.title}</p>
                  <p className="text-[13px] text-club-muted">{HELD_PASS_TITLES[hold.pass]} проходка</p>
                </div>
              </Link>
            );
          })}
          <p className="text-[12px] leading-relaxed text-club-muted">
            Если отмените запись или не придёте на игру, проходка снова станет свободной.
          </p>
        </section>
      ) : null}

      <section className="flex flex-col gap-2.5">
        <SectionHeader title="Как это работает" />
        <div className="flex flex-col gap-3.5 rounded-[20px] border border-club-line bg-club-surface p-4">
          {total === 0 && held.length === 0 ? (
            <Step number={0}>Проходки выдаёт клуб. Как только вам их начислят, они появятся здесь.</Step>
          ) : null}
          <Step number={1}>Выберите проходку, когда записываетесь на турнир</Step>
          <Step number={2}>Её спишут в день игры, когда администратор выдаст вам карту</Step>
        </div>
        <div className="flex gap-3 rounded-[18px] border border-club-rose/35 bg-club-crimson/10 px-4 py-3.5">
          <TriangleAlert className="mt-px shrink-0 text-club-rose" size={18} />
          <p className="text-[13px] leading-relaxed">
            Проходки можно использовать только на вход в турнир. Проходка не даёт права на
            бесплатный ре-энтри или аддон.
          </p>
        </div>
      </section>

      <GhostLink href="/client/tournaments">К расписанию турниров</GhostLink>
    </div>
  );
}

/** A pass count on a ticket stub: the two notches in its sides are what make it a ticket. */
function PassStub({ count, gold = false, title }: { count: number; gold?: boolean; title: string }) {
  const edge = gold ? "border-club-gold/45" : "border-club-line";

  return (
    <div
      className={`relative flex h-[150px] flex-1 basis-0 flex-col justify-between overflow-hidden rounded-[20px] border p-[18px] ${edge} ${
        gold ? "bg-club-gold/10 text-club-gold" : "bg-club-surface text-club-text"
      }`}
    >
      <span className={`absolute -left-[11px] top-1/2 h-5 w-5 -translate-y-1/2 rounded-full border bg-club-ink ${edge}`} />
      <span className={`absolute -right-[11px] top-1/2 h-5 w-5 -translate-y-1/2 rounded-full border bg-club-ink ${edge}`} />
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-bold uppercase tracking-[0.12em]">{title}</p>
        <Ticket size={18} />
      </div>
      <p className="font-display text-[48px] font-semibold leading-none">
        <CountUp value={count} />
      </p>
    </div>
  );
}

/** One numbered line of "how it works". Zero is a note without a number. */
function Step({ children, number }: { children: ReactNode; number: number }) {
  return (
    <div className="flex gap-3.5">
      {number > 0 ? (
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-club-raised font-display text-[13px] font-semibold">
          {number}
        </span>
      ) : null}
      <p className="text-[14px] leading-relaxed text-club-muted">{children}</p>
    </div>
  );
}
