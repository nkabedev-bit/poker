"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { CalendarDays, Clock, MapPin, Ticket, Users } from "lucide-react";
import { getClientTelegramWebApp, showClientAlert, useClientTMA } from "../../layout";
import { PlayerAvatar } from "../../_components/player-avatar";
import { buildNicknameKey } from "@/lib/players/nickname-key";
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
  countAnnouncedSeats,
  describeAnnouncedSeats,
  formatSeatsCount,
} from "@/lib/events/seats";
import {
  formatEventDayLabel,
  formatEventTimeLabel,
  type TournamentEvent,
} from "@/lib/events/types";

type FreePassChoice = "none" | "regular" | "vip";

type TicketType = "regular" | "vip" | "duo";

/** What a sign-up can say; the +1's half is given out by accepting, never chosen. */
type HeldTicket = TicketType | "duo_plus_one";

type DuoInviteLinks = { telegram: string | null; web: string | null };

type EventDetails = TournamentEvent & {
  /** The two ways to open the "1+1" invitation, while nobody has taken it up. */
  inviteLinks?: DuoInviteLinks;
  inviteToken?: string | null;
  /** Set once the invited member said they are coming. */
  partnerConfirmed: boolean;
  /** Whether the +1 is a member of the club, who answers, or a guest, who does not. */
  partnerIsMember: boolean;
  /** Who the player is bringing on a "1+1", as they wrote the name down. */
  partnerName: string | null;
  /** A ticket the admin put aside, waiting on this player to say they are coming. */
  reservedTicket?: "regular" | "vip" | "duo" | null;
  /** Their place went to the queue after they did not come. */
  seatGivenAway?: boolean;
  signedUp: boolean;
  signupsCount: number;
  /** Standing in line for a ticket that is sold out. */
  waitlisted?: boolean;
  /** The queue reached them: until this moment the freed place is theirs to take. */
  waitlistOfferExpiresAt?: string | null;
  ticketType: HeldTicket;
  usePass: FreePassChoice;
};

type FreeEntries = { regular: number; vip: number };

type FreeSeats = { duo: number; regular: number | null; vip: number | null };

const MAX_PARTNER_NAME_LENGTH = 40;

/** How long the partner search waits after the last keystroke. */
const SEARCH_DELAY_MS = 350;

/** A member of the club, offered as the +1 of a pair. */
type PartnerMatch = { avatarUrl: string | null; key: string; name: string };

const PASS_TITLES: Record<Exclude<FreePassChoice, "none">, string> = {
  regular: "Обычная проходка",
  vip: "VIP проходка",
};

// Three tickets still have to fit a phone, so the row gets tighter as the poster adds
// kinds rather than wrapping one of them onto a line of its own.
const TICKET_GRID: Record<number, string> = {
  1: "grid grid-cols-1 gap-3",
  2: "grid grid-cols-2 gap-3",
  3: "grid grid-cols-3 gap-2",
};

const TICKET_TITLES: Record<HeldTicket, string> = {
  duo: "1+1",
  duo_plus_one: "1+1 · второй игрок",
  regular: "Обычный",
  vip: "VIP",
};

function seatsLabel(left: number | null) {
  if (left === null) return "Места есть";
  return left > 0 ? `Осталось ${left}` : "Мест нет";
}

/** A "1+1" runs out by tickets, not by seats: one ticket already carries two of them. */
function duoSeatsLabel(left: number | null) {
  if (left === null || left <= 0) return "Разобрали";
  return left === 1 ? "Остался 1" : `Осталось ${left}`;
}

export default function ClientEventPage() {
  const { initData } = useClientTMA();
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const eventId = params?.id;

  const [event, setEvent] = useState<EventDetails | null>(null);
  const [freeEntries, setFreeEntries] = useState<FreeEntries>({ regular: 0, vip: 0 });
  const [freeSeats, setFreeSeats] = useState<FreeSeats>({ duo: 0, regular: null, vip: null });
  const [ticketType, setTicketType] = useState<TicketType>("regular");
  const [usePass, setUsePass] = useState<FreePassChoice>("none");
  const [partnerName, setPartnerName] = useState("");
  // The +1 is either picked from the club, and answers for themselves, or written down
  // as a guest, who is expected by name alone.
  const [partnerKey, setPartnerKey] = useState("");
  // A friend the club already knows is picked by nickname; one it does not is sent a
  // link and joins through it.
  const [partnerMode, setPartnerMode] = useState<"member" | "invite">("member");
  const [inviteLinks, setInviteLinks] = useState<DuoInviteLinks | null>(null);
  const [partnerMatches, setPartnerMatches] = useState<PartnerMatch[]>([]);
  const [invite, setInvite] = useState<{ hostName: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [answering, setAnswering] = useState(false);
  // Nicknames are looked up while the buyer types, so the search waits for them to stop
  // rather than asking the server about every letter.
  const searchTimer = useRef<number | null>(null);

  // A pass belongs to its own kind of ticket, so switching the ticket lets go of a
  // choice that no longer applies — and a "1+1" is bought at its own price, never with
  // a pass.
  const selectTicket = (ticket: TicketType) => {
    setTicketType(ticket);
    setUsePass((chosen) => (chosen === ticket ? chosen : "none"));
  };

  /** A pass belongs to one kind of ticket, so picking it picks that ticket too. */
  const selectPass = (pass: FreePassChoice) => {
    setUsePass(pass);
    if (pass !== "none") setTicketType(pass);
  };

  const load = useCallback(async () => {
    if (!eventId) return;
    try {
      const res = await fetch(`/api/client-tma/events/${eventId}`, {
        headers: { "X-Telegram-Init-Data": initData },
      });
      if (res.ok) {
        const data = await res.json();
        const details = data.event as EventDetails;
        setEvent(details);
        // A sign-up that already stands is what the screen edits from now on: the pair
        // can lose its partner and have to name another without cancelling the ticket.
        if (details.signedUp && details.ticketType !== "duo_plus_one") {
          setTicketType(details.ticketType);
          setPartnerName(details.partnerName ?? "");
        }
        setFreeEntries({
          regular: Number(data.freeEntries?.regular ?? 0),
          vip: Number(data.freeEntries?.vip ?? 0),
        });
        setFreeSeats({
          duo: Number(data.freeSeats?.duo ?? 0),
          regular: data.freeSeats?.regular ?? null,
          vip: data.freeSeats?.vip ?? null,
        });
        setInvite(data.duoInvite ?? null);
      }
    } finally {
      setLoading(false);
    }
  }, [eventId, initData]);

  useEffect(() => {
    const timeout = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timeout);
  }, [load]);

  useEffect(
    () => () => {
      if (searchTimer.current) window.clearTimeout(searchTimer.current);
    },
    [],
  );

  // Members are looked up by nickname as the buyer types; anything typed that matches
  // nobody is taken as a guest's name, so a friend from outside the club still gets in.
  const searchPartners = useCallback(
    async (query: string) => {
      if (query.trim().length < 2) {
        setPartnerMatches([]);
        return;
      }

      try {
        const res = await fetch(`/api/client-tma/players?q=${encodeURIComponent(query)}`, {
          headers: { "X-Telegram-Init-Data": initData },
        });
        if (res.ok) {
          const data = await res.json();
          setPartnerMatches((data.players ?? []) as PartnerMatch[]);
        }
      } catch {
        setPartnerMatches([]);
      }
    },
    [initData],
  );

  const typePartner = (value: string) => {
    setPartnerName(value);
    // Editing the name lets go of the member it used to point at: the text is the
    // choice again until another one is picked from the list.
    setPartnerKey("");

    if (searchTimer.current) window.clearTimeout(searchTimer.current);
    searchTimer.current = window.setTimeout(() => void searchPartners(value), SEARCH_DELAY_MS);
  };

  const pickPartner = (match: PartnerMatch) => {
    if (searchTimer.current) window.clearTimeout(searchTimer.current);
    setPartnerName(match.name);
    setPartnerKey(match.key);
    setPartnerMatches([]);
  };

  const answerInvite = async (accept: boolean) => {
    if (!eventId || answering) return;

    setAnswering(true);
    const tg = getClientTelegramWebApp();
    try {
      const res = await fetch(`/api/client-tma/events/${eventId}/duo`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Telegram-Init-Data": initData },
        body: JSON.stringify({ accept }),
      });

      if (res.ok) {
        const answer = await res.json().catch(() => null);
        tg?.HapticFeedback?.notificationOccurred("success");
        await load();

        // Coming as somebody's +1 replaces whatever this player had bought, and the seat
        // goes back on sale — said out loud, because it is their own ticket being let go.
        const released = answer?.releasedTicket as HeldTicket | null | undefined;
        if (released) {
          showClientAlert(
            released === "duo"
              ? "Ваш билет 1+1 отменён, место вернулось в продажу. Напарнику мы сообщили."
              : `Ваш билет «${TICKET_TITLES[released]}» отменён, место вернулось в продажу.`,
          );
        }
        return;
      }

      const data = await res.json().catch(() => null);
      tg?.HapticFeedback?.notificationOccurred("error");
      showClientAlert(data?.message ?? "Не удалось ответить на приглашение.");
    } catch {
      showClientAlert("Нет связи с сервером. Попробуйте ещё раз.");
    } finally {
      setAnswering(false);
    }
  };

  const toggleSignup = async (
    signUp: boolean,
    waitlist = false,
    // Confirming a held ticket keeps the kind the club promised, whatever the screen
    // happens to have selected.
    forcedTicket?: TicketType,
  ) => {
    if (!eventId || submitting) return;

    setSubmitting(true);
    const tg = getClientTelegramWebApp();
    try {
      const res = await fetch(`/api/client-tma/events/${eventId}/signup`, {
        method: signUp ? "POST" : "DELETE",
        headers: { "Content-Type": "application/json", "X-Telegram-Init-Data": initData },
        body: signUp
          ? JSON.stringify({
              partnerKey,
              partnerMode,
              partnerName,
              ticketType: forcedTicket ?? ticketType,
              usePass,
              waitlist,
            })
          : undefined,
      });

      if (res.ok) {
        // The link is minted by the server as the ticket is saved; it is shown straight
        // away so the buyer can send it while they still have their friend in mind.
        const saved = await res.json().catch(() => null);
        setInviteLinks(saved?.inviteLinks ?? null);
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

      showClientAlert(data?.message ?? "Не удалось сохранить запись. Попробуйте ещё раз.");
    } catch {
      showClientAlert("Нет связи с сервером. Попробуйте ещё раз.");
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

  // The poster offers VIP when the club priced it or opened seats for it — and zero
  // seats means there is no VIP table tonight, whatever the price says.
  const offersVip =
    event.maxVipPlayers !== 0 && (event.vipBuyIn !== null || event.maxVipPlayers !== null);
  // A "1+1" needs both halves: tickets to sell and a price to charge for the pair.
  const offersDuo = (event.maxDuoTickets ?? 0) > 0 && event.duoBuyIn !== null;
  const seatsLeft =
    ticketType === "vip" ? freeSeats.vip : ticketType === "duo" ? freeSeats.duo : freeSeats.regular;
  const soldOut = seatsLeft !== null && seatsLeft <= 0;
  // What the club has already given this player: their sign-up, or the ticket it is
  // holding for them. Either way it is shown rather than chosen.
  const heldTicket: HeldTicket | null = event.reservedTicket ?? (event.signedUp ? event.ticketType : null);
  // A held "1+1" is confirmed by saying who is coming with them — the seat is promised,
  // its second half is theirs to fill.
  const reservedDuo = event.reservedTicket === "duo";
  const reservedPartnerMissing = reservedDuo && partnerMode === "member" && !partnerName.trim();
  // The club takes a "1+1" to mean an expected pair, so the second name is required.
  // Only the nickname route needs a name typed in: the link is the invitation itself.
  const partnerMissing =
    ticketType === "duo" && partnerMode === "member" && !partnerName.trim();

  // Typed a member's nickname without tapping them in the list: they would be written
  // down as a guest, hear nothing, and see nothing in their own app. The server refuses
  // it outright; this says so before the buyer gets that far.
  const typedMember = partnerKey
    ? null
    : (partnerMatches.find(
        (match) => match.key === buildNicknameKey(partnerName),
      ) ?? null);
  const shownInviteLinks = inviteLinks ?? event.inviteLinks ?? null;
  const hasInviteLinks = Boolean(shownInviteLinks?.telegram || shownInviteLinks?.web);
  const ticketsInRow = 1 + (offersVip ? 1 : 0) + (offersDuo ? 1 : 0);
  const announcedSeats = countAnnouncedSeats(event);
  // The split is worth a line only when the poster sells more than the regular seats —
  // otherwise it repeats the total the chip already shows.
  const seatsBreakdown =
    announcedSeats && (announcedSeats.duoTickets > 0 || announcedSeats.vip > 0)
      ? describeAnnouncedSeats(announcedSeats)
      : null;
  // The buyer keeps the ticket when their partner backs out, so the screen has to let
  // them name somebody else without cancelling and starting over.
  const needsPartner = event.signedUp && event.ticketType === "duo" && !event.partnerName;
  // The ticket they asked for while standing in line — that is what the held place is
  // for. The "+1" half is never queued for: it comes with somebody else's ticket.
  const queuedTicket: TicketType | null =
    event.waitlisted && event.ticketType !== "duo_plus_one" ? event.ticketType : null;
  // A pair ticket is still a pair: the club expects two of them by name.
  const queuedPartnerMissing =
    queuedTicket === "duo" && partnerMode === "member" && !partnerName.trim();

  // Every pass the player holds is shown, whichever ticket is picked: a pass buys the
  // ticket of its own kind, so choosing one switches the ticket to match.
  const vipSoldOut = freeSeats.vip !== null && freeSeats.vip <= 0;
  const passOptions: Array<{
    disabled?: boolean;
    note: string | null;
    title: string;
    value: FreePassChoice;
  }> = [
    ...(freeEntries.regular > 0
      ? [{
          note: `Осталось: ${freeEntries.regular} · обычный билет`,
          title: PASS_TITLES.regular,
          value: "regular" as const,
        }]
      : []),
    ...(freeEntries.vip > 0 && offersVip
      ? [{
          disabled: vipSoldOut,
          note: vipSoldOut
            ? "VIP-мест не осталось"
            : `Осталось: ${freeEntries.vip} · VIP билет`,
          title: PASS_TITLES.vip,
          value: "vip" as const,
        }]
      : []),
  ];

  if (passOptions.length > 0) {
    passOptions.push({
      note: "Оплачу вход на месте",
      title: "Без проходки",
      value: "none" as const,
    });
  }
  const featureLines = event.featuresText
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  return (
    <div className="space-y-5 pt-1">

      {invite ? (
        <GlassCard className="space-y-3 !p-4">
          <p className="text-[15px] font-bold">
            {invite.hostName} зовёт вас по билету 1+1
          </p>
          <p className="text-[13px] leading-relaxed text-white/60">
            Место уже оплачено на двоих. Подтвердите, что придёте — администратор будет
            ждать вас обоих.
          </p>
          <div className="grid grid-cols-2 gap-2">
            <PrimaryButton loading={answering} onClick={() => void answerInvite(true)}>
              Приду
            </PrimaryButton>
            <GhostButton disabled={answering} onClick={() => void answerInvite(false)}>
              Не смогу
            </GhostButton>
          </div>
        </GlassCard>
      ) : null}

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
            {announcedSeats ? (
              <Chip>
                <Users size={13} /> {formatSeatsCount(announcedSeats.total)}
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

      <section className="space-y-2">
        <h2 className="text-[19px] font-bold tracking-tight">Билеты</h2>
        {seatsBreakdown ? (
          <p className="px-1 text-xs text-white/40">{seatsBreakdown}</p>
        ) : null}
        {event.signedUp || event.reservedTicket ? (
          <div className={TICKET_GRID[ticketsInRow]}>
            <TicketCard
              compact={ticketsInRow > 2}
              kind="regular"
              price={event.buyIn}
              seats={freeSeats.regular}
              state={heldTicket === "regular" ? "chosen" : "muted"}
            />
            {offersDuo ? (
              <TicketCard
                compact={ticketsInRow > 2}
                kind="duo"
                price={event.duoBuyIn}
                seats={freeSeats.duo}
                state={
                  heldTicket === "duo" || heldTicket === "duo_plus_one"
                    ? "chosen"
                    : "muted"
                }
              />
            ) : null}
            {offersVip ? (
              <TicketCard
                compact={ticketsInRow > 2}
                kind="vip"
                price={event.vipBuyIn}
                seats={freeSeats.vip}
                state={heldTicket === "vip" ? "chosen" : "muted"}
              />
            ) : null}
          </div>
        ) : (
          <>
            <div className={TICKET_GRID[ticketsInRow]}>
              <TicketCard
                compact={ticketsInRow > 2}
                kind="regular"
                onSelect={() => selectTicket("regular")}
                price={event.buyIn}
                seats={freeSeats.regular}
                state={ticketType === "regular" ? "chosen" : "idle"}
              />
              {offersDuo ? (
                <TicketCard
                  compact={ticketsInRow > 2}
                  kind="duo"
                  onSelect={() => selectTicket("duo")}
                  price={event.duoBuyIn}
                  seats={freeSeats.duo}
                  state={ticketType === "duo" ? "chosen" : "idle"}
                />
              ) : null}
              {offersVip ? (
                <TicketCard
                  compact={ticketsInRow > 2}
                  kind="vip"
                  onSelect={() => selectTicket("vip")}
                  price={event.vipBuyIn}
                  seats={freeSeats.vip}
                  state={ticketType === "vip" ? "chosen" : "idle"}
                />
              ) : null}
            </div>
            {offersDuo ? (
              <p className="px-1 text-xs text-white/40">
                Билет 1+1 — вход для двоих по одной цене.
              </p>
            ) : null}
            {offersVip ? (
              <p className="px-1 text-xs text-white/40">
                Место за столом выдаёт администратор в день игры.
              </p>
            ) : null}
          </>
        )}

        {(reservedDuo || ticketType === "duo") && (!event.signedUp || needsPartner) ? (
          <GlassCard className="space-y-3 !p-4">
            <p className="block text-sm font-bold">Кто придёт с вами?</p>

            {/* The friend worth bringing is often the one who has not joined yet, so the
                two cases are asked apart rather than guessed from what was typed. */}
            <div className="grid grid-cols-2 gap-2">
              {(["member", "invite"] as const).map((mode) => (
                <button
                  key={mode}
                  className={`rounded-2xl px-3 py-2.5 text-[13px] font-semibold transition ${
                    partnerMode === mode
                      ? "bg-[#c8163f] text-white"
                      : "border border-white/[0.09] bg-white/[0.04] text-white/70"
                  }`}
                  type="button"
                  onClick={() => setPartnerMode(mode)}
                >
                  {mode === "member" ? "Резидент клуба" : "Нет аккаунта в Majestic"}
                </button>
              ))}
            </div>

            {partnerMode === "invite" ? (
              <div className="space-y-2">
                <p className="text-[12px] leading-relaxed text-white/50">
                  Запишитесь — и получите ссылку-приглашение. Друг откроет её,
                  зарегистрируется и увидит приглашение на этот турнир.
                </p>

                {hasInviteLinks ? (
                  <div className="space-y-1.5">
                    {shownInviteLinks?.telegram ? (
                      <InviteLink href={shownInviteLinks.telegram} label="Телеграм" />
                    ) : null}
                    {shownInviteLinks?.web ? (
                      <InviteLink
                        href={shownInviteLinks.web}
                        label="Нет доступа к телеграмму"
                      />
                    ) : null}
                    <p className="text-[11px] leading-relaxed text-white/40">
                      Отправьте другу ссылку-приглашение — ту, что подходит: есть ли у
                      него доступ к телеграмму. Ссылка одноразовая: кто откроет первым,
                      тот и придёт с вами.
                    </p>
                  </div>
                ) : null}
              </div>
            ) : (
              <>
            <label className="block text-sm font-bold" htmlFor="duo-partner">
              Ник напарника
            </label>
            <input
              autoComplete="off"
              className="w-full rounded-2xl border border-white/[0.09] bg-white/[0.04] px-4 py-3 text-[15px] outline-none placeholder:text-white/30 focus:border-[#f05a7e]/60"
              id="duo-partner"
              maxLength={MAX_PARTNER_NAME_LENGTH}
              onChange={(item) => typePartner(item.target.value)}
              placeholder="Ник в клубе или имя гостя"
              value={partnerName}
            />

            {partnerMatches.length > 0 ? (
              <div className="space-y-1.5">
                {partnerMatches.map((match) => (
                  <button
                    key={match.key}
                    className="flex w-full items-center gap-3 rounded-2xl border border-white/[0.07] bg-white/[0.03] px-3 py-2 text-left"
                    type="button"
                    onClick={() => pickPartner(match)}
                  >
                    <PlayerAvatar
                      name={match.name}
                      photoUrl={match.avatarUrl ?? undefined}
                      size={30}
                    />
                    <span className="truncate text-sm font-semibold">{match.name}</span>
                  </button>
                ))}
              </div>
            ) : null}

            {typedMember ? (
              <p className="text-[11px] font-semibold leading-relaxed text-[#e9c07a]">
                {typedMember.name} есть в клубе — нажмите на него в списке выше, чтобы ему
                пришло приглашение. Иначе он придёт гостем и ничего не увидит в приложении.
              </p>
            ) : (
              <p className="text-[11px] leading-relaxed text-white/45">
                {partnerKey
                  ? "Игрок клуба — ему придёт приглашение, и он подтвердит, что придёт."
                  : "Гость без аккаунта — администратор впустит его по вашему билету."}{" "}
                Вход для обоих, цена делится пополам.
              </p>
            )}
              </>
            )}
          </GlassCard>
        ) : null}
      </section>

      {/* A pass never buys a pair, whether the player picked the "1+1" themselves or the
          club is holding one for them. */}
      {passOptions.length > 0 && !event.signedUp && (heldTicket ?? ticketType) !== "duo" ? (
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
                } ${option.disabled ? "opacity-45" : ""}`}
                disabled={option.disabled}
                type="button"
                onClick={() => selectPass(option.value)}
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
              Проходка закрывает билет своего типа: VIP-проходка — VIP билет, обычная —
              обычный. Использовать её можно только на вход в турнир: права на бесплатный
              ре-энтри или аддон она не даёт.
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

      {needsPartner ? (
        <PrimaryButton
          disabled={partnerMissing}
          loading={submitting}
          onClick={() => void toggleSignup(true)}
        >
          {partnerMissing ? "Укажите напарника" : "Позвать напарника"}
        </PrimaryButton>
      ) : null}

      {event.signedUp ? (
        <div className="space-y-3">
          <div className="rounded-2xl border border-emerald-400/30 bg-emerald-400/10 px-4 py-3.5 text-center text-[15px] font-bold text-emerald-300">
            Вы записаны · {TICKET_TITLES[event.ticketType]} билет
            {event.partnerName ? (
              <span className="mt-1 block text-[13px] font-semibold text-emerald-300/80">
                С вами: {event.partnerName}
                {event.partnerIsMember
                  ? event.partnerConfirmed
                    ? " · подтвердил"
                    : " · ждём ответа"
                  : " · гость"}
              </span>
            ) : null}
          </div>
          <GhostButton disabled={submitting} onClick={() => void toggleSignup(false)}>
            Отменить запись
          </GhostButton>
          {needsPartner ? (
            <p className="px-2 text-center text-xs text-white/40">
              Напарник не сможет прийти. Билет 1+1 остался за вами — позовите другого.
            </p>
          ) : (
            <p className="px-2 text-center text-xs text-white/40">
              Чтобы сменить билет или проходку, отмените запись и запишитесь заново.
            </p>
          )}
        </div>
      ) : event.reservedTicket ? (
        // The club promised this seat to somebody who asked ahead; all that is left is
        // for them to say they are coming.
        <div className="space-y-3">
          <div className="rounded-2xl border border-[#e9c07a]/30 bg-[#e9c07a]/10 px-4 py-3.5 text-center text-[15px] font-bold text-[#e9c07a]">
            Вам отложен{" "}
            {event.reservedTicket === "vip"
              ? "VIP-билет"
              : event.reservedTicket === "duo"
                ? "билет 1+1"
                : "обычный билет"}
            <span className="mt-1 block text-[13px] font-semibold text-[#e9c07a]/75">
              {reservedDuo
                ? "Место держим за вами — впишите напарника и подтвердите."
                : "Место держим за вами — подтвердите участие."}
            </span>
          </div>
          <PrimaryButton
            disabled={reservedPartnerMissing}
            loading={submitting}
            onClick={() => void toggleSignup(true, false, event.reservedTicket ?? "regular")}
          >
            {reservedPartnerMissing ? "Укажите напарника" : "Подтвердить участие"}
          </PrimaryButton>
          <GhostButton disabled={submitting} onClick={() => void toggleSignup(false)}>
            Не смогу прийти
          </GhostButton>
        </div>
      ) : queuedTicket && event.waitlistOfferExpiresAt ? (
        // The queue reached them and the place is held for nobody else until the half
        // hour runs out. The room reads full to everyone else, so this seat is theirs
        // to take rather than to race anyone for.
        <div className="space-y-3">
          <div className="rounded-2xl border border-emerald-400/40 bg-emerald-400/10 px-4 py-3.5 text-center text-[15px] font-bold text-emerald-300">
            Освободилось место — очередь дошла до вас
            <span className="mt-1 block text-[13px] font-semibold text-emerald-300/75">
              Держим его за вами до {formatEventTimeLabel(event.waitlistOfferExpiresAt)}.
              Потом место уйдёт следующему в очереди.
            </span>
          </div>
          <PrimaryButton
            disabled={queuedPartnerMissing}
            loading={submitting}
            onClick={() => void toggleSignup(true, false, queuedTicket)}
          >
            {queuedPartnerMissing
              ? "Укажите напарника"
              : `Записаться · ${TICKET_TITLES[queuedTicket]}`}
          </PrimaryButton>
          <GhostButton disabled={submitting} onClick={() => void toggleSignup(false)}>
            Отказаться от места
          </GhostButton>
        </div>
      ) : event.waitlisted ? (
        <div className="space-y-3">
          <div className="rounded-2xl border border-[#e9c07a]/30 bg-[#e9c07a]/10 px-4 py-3.5 text-center text-[15px] font-bold text-[#e9c07a]">
            Вы в листе ожидания
            <span className="mt-1 block text-[13px] font-semibold text-[#e9c07a]/75">
              Как освободится место, оно уйдёт по очереди — первому, кто в ней стоит.
              Когда дойдёт до вас, сообщим и полчаса будем держать место за вами.
            </span>
          </div>
          <GhostButton disabled={submitting} onClick={() => void toggleSignup(false)}>
            Выйти из листа ожидания
          </GhostButton>
        </div>
      ) : event.seatGivenAway ? (
        // They did not come and the desk gave their place to somebody waiting. Saying
        // so beats the screen insisting they are signed up for a seat that is taken.
        <div className="space-y-3">
          <div className="rounded-2xl border border-white/15 bg-white/[0.06] px-4 py-3.5 text-center text-[15px] font-bold text-white/70">
            Место передали другому игроку
            <span className="mt-1 block text-[13px] font-semibold text-white/45">
              Вас не было к началу, и место ушло тому, кто ждал в очереди.
            </span>
          </div>
          {soldOut ? (
            <PrimaryButton
              disabled={partnerMissing}
              loading={submitting}
              onClick={() => void toggleSignup(true, true)}
            >
              Встать в лист ожидания
            </PrimaryButton>
          ) : (
            <PrimaryButton
              disabled={partnerMissing}
              loading={submitting}
              onClick={() => void toggleSignup(true)}
            >
              {partnerMissing ? "Укажите напарника" : `Записаться снова · ${TICKET_TITLES[ticketType]}`}
            </PrimaryButton>
          )}
        </div>
      ) : soldOut ? (
        // Sold out is where the club used to lose the player: nothing on the screen
        // said "tell me if a place comes free".
        <div className="space-y-3">
          <PrimaryButton
            disabled={partnerMissing}
            loading={submitting}
            onClick={() => void toggleSignup(true, true)}
          >
            Встать в лист ожидания
          </PrimaryButton>
          <p className="px-2 text-center text-xs text-white/40">
            {ticketType === "vip"
              ? "VIP-места разобрали."
              : ticketType === "duo"
                ? "Билеты 1+1 разобрали."
                : "Места разобрали."}{" "}
            Если кто-то отменит запись, мы вам сообщим.
          </p>
        </div>
      ) : (
        <PrimaryButton
          disabled={partnerMissing}
          loading={submitting}
          onClick={() => void toggleSignup(true)}
        >
          {partnerMissing ? "Укажите напарника" : `Записаться · ${TICKET_TITLES[ticketType]}`}
        </PrimaryButton>
      )}

      <p className="px-2 pb-2 text-center text-xs text-white/40">
        Номер участника и стол выдаст администратор в день игры.
      </p>
    </div>
  );
}

const TICKET_ACCENTS: Record<TicketType, string> = {
  duo: "#7ad0f0",
  regular: "#f05a7e",
  vip: "#e9c07a",
};

/** One ticket the poster sells: its price, what is left of it, and whether it is picked. */
function TicketCard({
  compact,
  kind,
  onSelect,
  price,
  seats,
  state,
}: {
  /** Set when three kinds share the row and the card has to give up some width. */
  compact?: boolean;
  kind: TicketType;
  onSelect?: () => void;
  price: number | null;
  seats: number | null;
  state: "chosen" | "idle" | "muted";
}) {
  const soldOut = seats !== null && seats <= 0;
  const accent = TICKET_ACCENTS[kind];

  return (
    <button
      className={`rounded-[20px] border text-left transition ${compact ? "p-3" : "p-[18px]"} ${
        state === "chosen"
          ? "border-white/25 bg-white/[0.09]"
          : "border-white/[0.07] bg-white/[0.03]"
      } ${soldOut && state !== "chosen" ? "opacity-45" : ""}`}
      disabled={!onSelect || (soldOut && state !== "chosen")}
      type="button"
      onClick={onSelect}
    >
      <p
        className="text-[11px] uppercase tracking-wider"
        style={{ color: state === "muted" ? "rgba(255,255,255,0.35)" : accent }}
      >
        {TICKET_TITLES[kind]}
      </p>
      <p
        className={`mt-2 font-extrabold leading-none ${compact ? "text-[19px]" : "text-[24px]"}`}
      >
        {price ? `${price.toLocaleString("ru-RU")} ₽` : "—"}
      </p>
      <p className={`mt-2 text-white/45 ${compact ? "text-[11px]" : "text-[12px]"}`}>
        {kind === "duo" ? duoSeatsLabel(seats) : seatsLabel(seats)}
      </p>
    </button>
  );
}

/**
 * One invitation link, ready to be sent on.
 *
 * Copying is the whole job: the buyer is going to paste this into a chat, and a link
 * they have to select by hand on a phone is a link they will get wrong.
 */
function InviteLink({ href, label }: { href: string; label: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(href);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      showClientAlert(href);
    }
  };

  return (
    <button
      className="flex w-full items-center gap-2 rounded-2xl border border-white/[0.09] bg-white/[0.04] px-3 py-2.5 text-left"
      type="button"
      onClick={copy}
    >
      <span className="min-w-0 flex-1">
        <span className="block text-[12px] font-semibold text-white/70">{label}</span>
        <span className="block truncate text-[11px] text-white/35">{href}</span>
      </span>
      <span className="shrink-0 text-[12px] font-bold text-[#f05a7e]">
        {copied ? "Скопировано" : "Копировать"}
      </span>
    </button>
  );
}
