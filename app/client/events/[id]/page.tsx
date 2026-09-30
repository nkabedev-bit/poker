"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  CalendarDays,
  Check,
  ChevronDown,
  Clock,
  Copy,
  Info,
  MapPin,
  ScrollText,
  Search,
  Sparkles,
  Ticket,
  Users,
} from "lucide-react";
import {
  getClientTelegramWebApp,
  showClientAlert,
  tickClientSelection,
  useClientTMA,
} from "../../layout";
import { PlayerAvatar } from "../../_components/player-avatar";
import { PosterImage } from "../../_components/poster-image";
import { OfferCountdown } from "../../_components/offer-countdown";
import {
  countPlayersIn,
  findNewlyEliminated,
  KnockoutToast,
  type KnockoutNews,
} from "../../_components/knockout-toast";
import { useSuitBurst } from "../../_components/suit-burst";
import { buildNicknameKey } from "@/lib/players/nickname-key";
import {
  Chip,
  Eyebrow,
  GhostButton,
  GlassCard,
  IconTile,
  LoadingScreen,
  PrimaryButton,
  ScreenMessage,
  SectionHeader,
} from "../../_components/ui";
import {
  countAnnouncedSeats,
  describeAnnouncedSeats,
  formatSeatsCount,
} from "@/lib/events/seats";
import {
  formatEventDayLabel,
  formatEventShortDateLabel,
  formatEventTimeLabel,
  isEventEveningOpen,
  isUpcomingEvent,
  type TournamentEvent,
} from "@/lib/events/types";
import { LiveTables } from "../../_components/live-tables";
import { SignupList } from "../../_components/signup-list";
import { LiveTournamentCard } from "../../_components/live-tournament-card";
import { useLiveTournament } from "../../_components/use-live-tournament";
import type { LiveRoom } from "@/lib/tables/live-tables";
import type { SignupListEntry } from "@/lib/events/signup-list";
import type { ClientLiveState } from "@/lib/client-tma/live-state-shared";

type FreePassChoice = "none" | "regular" | "vip";

type TicketType = "regular" | "vip" | "duo";

/** What a sign-up can say; the +1's half is given out by accepting, never chosen. */
type HeldTicket = TicketType | "duo_plus_one";

type DuoInviteLinks = { telegram: string | null; web: string | null };

type EventDetails = TournamentEvent & {
  /** The desk has sat them down (they may be out already): the ticket is no longer theirs to give back. */
  cancellationClosed: boolean;
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

/** A pass the player already wrote down for another game they have not played yet. */
type PassHold = {
  eventId: string;
  pass: Exclude<FreePassChoice, "none">;
  startsAt: string;
  title: string;
};

type FreeEntries = { heldFor: PassHold[]; regular: number; vip: number };

type FreeSeats = { duo: number; regular: number | null; vip: number | null };

const MAX_PARTNER_NAME_LENGTH = 40;

/** How long the partner search waits after the last keystroke. */
const SEARCH_DELAY_MS = 350;

/** How long a new sign-up's stamp and suits hold the screen. */
const CELEBRATION_MS = 1600;

/** A member of the club, offered as the +1 of a pair. */
type PartnerMatch = { avatarUrl: string | null; key: string; name: string };

const PASS_TITLES: Record<Exclude<FreePassChoice, "none">, string> = {
  regular: "Обычная проходка",
  vip: "VIP проходка",
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
  const [freeEntries, setFreeEntries] = useState<FreeEntries>({ heldFor: [], regular: 0, vip: 0 });
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
  // Set while the club has barred this player from signing up; carries its own wording.
  const [signupBan, setSignupBan] = useState<{ message: string } | null>(null);
  // Who is coming, and — once the cards are in the air — where everybody is sitting.
  const [signups, setSignups] = useState<{ players: SignupListEntry[]; waitlist: SignupListEntry[] }>(
    { players: [], waitlist: [] },
  );
  // Null until the room has been read once, so an empty room is never drawn in its place.
  const [room, setRoom] = useState<LiveRoom | null>(null);
  // The last reading of the room, to tell who went out since; and the knockouts that
  // reading turned up, called out at the top of the screen one after another.
  const roomRef = useRef<LiveRoom | null>(null);
  const [justOut, setJustOut] = useState<ReadonlySet<string>>(() => new Set());
  const [knockouts, setKnockouts] = useState<KnockoutNews[]>([]);
  // The game under way as the page was served with it, so the card and the tables are
  // there on the first paint rather than a beat later.
  const [servedLive, setServedLive] = useState<ClientLiveState | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [answering, setAnswering] = useState(false);
  // The moment right after a seat is taken: the stamp thuds onto the ticket and the
  // suits go up. Only then — a page opened on an old sign-up shows the stamp at rest.
  const [celebrating, setCelebrating] = useState(false);
  const { burst, fire: fireBurst } = useSuitBurst();
  // Nicknames are looked up while the buyer types, so the search waits for them to stop
  // rather than asking the server about every letter.
  const searchTimer = useRef<number | null>(null);

  // A pass belongs to its own kind of ticket, so switching the ticket lets go of a
  // choice that no longer applies — and a "1+1" is bought at its own price, never with
  // a pass.
  const selectTicket = (ticket: TicketType) => {
    if (ticket !== ticketType) tickClientSelection();
    setTicketType(ticket);
    setUsePass((chosen) => (chosen === ticket ? chosen : "none"));
  };

  /** A pass belongs to one kind of ticket, so picking it picks that ticket too. */
  const selectPass = (pass: FreePassChoice) => {
    if (pass !== usePass) tickClientSelection();
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
          heldFor: Array.isArray(data.freeEntries?.heldFor) ? data.freeEntries.heldFor : [],
          regular: Number(data.freeEntries?.regular ?? 0),
          vip: Number(data.freeEntries?.vip ?? 0),
        });
        setFreeSeats({
          duo: Number(data.freeSeats?.duo ?? 0),
          regular: data.freeSeats?.regular ?? null,
          vip: data.freeSeats?.vip ?? null,
        });
        setInvite(data.duoInvite ?? null);
        setSignupBan(data.signupBan ?? null);
        setServedLive(data.live ?? null);
      }
    } finally {
      setLoading(false);
    }
  }, [eventId, initData]);

  const loadSignups = useCallback(async () => {
    if (!eventId) return;

    try {
      const res = await fetch(`/api/client-tma/events/${eventId}/signups`, {
        headers: { "X-Telegram-Init-Data": initData },
      });
      if (!res.ok) return;

      const data = (await res.json()) as {
        players?: SignupListEntry[];
        waitlist?: SignupListEntry[];
      };
      setSignups({ players: data.players ?? [], waitlist: data.waitlist ?? [] });
    } catch {
      // The list of names is the least of what this screen is for.
    }
  }, [eventId, initData]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void load();
      void loadSignups();
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [load, loadSignups]);

  useEffect(
    () => () => {
      if (searchTimer.current) window.clearTimeout(searchTimer.current);
    },
    [],
  );

  // The game this poster announced is the one being played tonight. Only then is there
  // a clock to follow, and only then does this screen ask the club for anything — and
  // it keeps following it past midnight, until the desk finishes the tournament.
  const playingToday = event ? isEventEveningOpen(event, new Date()) : false;
  // Whether this evening is still ahead of the club: a poster whose game has been
  // played is history, and "кто идёт" reads as a lie under it.
  const stillAhead = event ? isUpcomingEvent(event, new Date()) : false;
  const { live } = useLiveTournament({ enabled: playingToday, initData, initial: servedLive });
  const activePlayers = live?.activePlayers ?? null;

  const loadTables = useCallback(async () => {
    try {
      const res = await fetch("/api/client-tma/live/tables", {
        headers: { "X-Telegram-Init-Data": initData },
      });
      if (!res.ok) return;

      const data = (await res.json()) as Partial<LiveRoom>;
      const next = { eliminated: data.eliminated ?? [], tables: data.tables ?? [] };
      // Who went out since the last reading is the news; the reading taken on opening
      // the screen is compared with nothing.
      const out = roomRef.current ? findNewlyEliminated(roomRef.current, next) : [];
      roomRef.current = next;
      setRoom(next);

      if (out.length > 0) {
        const left = countPlayersIn(next);
        setJustOut(new Set(out.map((player) => player.id)));
        setKnockouts((queue) => [
          ...queue,
          ...out.map((player) => ({ id: player.id, left, name: player.name })),
        ]);
      }
    } catch {
      // The seating is a bonus on this screen; the ticket is what it is for.
    }
  }, [initData]);

  // Stable, so the page re-drawing its clock every second does not restart the toast.
  const nextKnockout = useCallback(() => setKnockouts((queue) => queue.slice(1)), []);

  // The roster is the heavy half of the state, so it is fetched when the room actually
  // changes — somebody busting moves the count of survivors, and the light beat carries
  // that — rather than on a timer of its own.
  useEffect(() => {
    if (activePlayers === null) return;

    const timeout = window.setTimeout(() => void loadTables(), 0);
    return () => window.clearTimeout(timeout);
  }, [activePlayers, loadTables]);

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
    // Celebrated only when a seat is newly taken: naming another partner on a ticket
    // already held, or stepping into the queue, is not that moment.
    const takesSeat = signUp && !waitlist && !event?.signedUp;
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
        // Letting a seat go is not a success to cheer: it gets a light tap instead.
        if (signUp) {
          tg?.HapticFeedback?.notificationOccurred("success");
        } else {
          tg?.HapticFeedback?.impactOccurred("light");
        }
        await load();

        if (takesSeat) {
          setCelebrating(true);
          fireBurst();
          window.setTimeout(() => setCelebrating(false), CELEBRATION_MS);
        }
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

  if (loading) return <LoadingScreen shape="event" />;

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
  // A pass promised to another game stays on the list, greyed out and naming that game:
  // one that simply vanished would read as lost rather than taken.
  const heldNote = (pass: Exclude<FreePassChoice, "none">) => {
    const hold = freeEntries.heldFor.find((item) => item.pass === pass);
    return hold ? `Занята записью: ${hold.title}, ${formatEventDayLabel(hold.startsAt)}` : null;
  };
  const regularHeldNote = heldNote("regular");
  const vipHeldNote = heldNote("vip");
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
      : regularHeldNote
        ? [{
            disabled: true,
            note: regularHeldNote,
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
      : offersVip && vipHeldNote
        ? [{
            disabled: true,
            note: vipHeldNote,
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
  // The ticket a signed-up player holds wears the stamp; it lands with a thud only at the
  // moment the seat is taken. A ticket the club is holding is not the player's yet.
  const heldStamp: TicketStamp | undefined = event.signedUp
    ? celebrating
      ? "landing"
      : "resting"
    : undefined;
  const featureLines = event.featuresText
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const priceOf = (ticket: TicketType) =>
    ticket === "vip" ? event.vipBuyIn : ticket === "duo" ? event.duoBuyIn : event.buyIn;
  // What the chosen ticket comes to at the desk: nothing when a pass covers it.
  const chosenPrice = usePass !== "none" ? 0 : priceOf(ticketType);
  const freeSeatsLine = [
    `Обычных — ${freeSeats.regular === null ? "есть места" : freeSeats.regular > 0 ? `${freeSeats.regular} свободно` : "разобрали"}`,
    ...(offersDuo ? [`1+1 — ${freeSeats.duo > 0 ? freeSeats.duo : "разобрали"}`] : []),
    ...(offersVip
      ? [`VIP — ${freeSeats.vip === null ? "есть места" : freeSeats.vip > 0 ? `${freeSeats.vip} свободно` : "разобрали"}`]
      : []),
  ].join(" · ");
  const aboutItems = [
    ...(featureLines.length > 0 || event.startingStack
      ? [{
          body: (
            <>
              {event.startingStack ? (
                <p>Стартовый стек {event.startingStack.toLocaleString("ru-RU")} фишек</p>
              ) : null}
              {featureLines.map((line, index) => (
                <p key={index}>{line}</p>
              ))}
            </>
          ),
          icon: <Sparkles size={20} />,
          title: "Особенности",
        }]
      : []),
    ...(event.rulesText
      ? [{ body: <p className="whitespace-pre-wrap">{event.rulesText}</p>, icon: <ScrollText size={20} />, title: "Общие правила" }]
      : []),
    ...(event.venueAddress
      ? [{ body: <p>{event.venueAddress}</p>, icon: <MapPin size={20} />, title: "Где проходит турнир?" }]
      : []),
  ];

  return (
    <div className="client-stagger flex flex-col gap-6 pt-1">

      {invite ? (
        // Waits on the player's answer, so it breathes in gold like a held ticket.
        <div className="client-breathe relative flex flex-col gap-3 rounded-[20px] border border-club-gold/35 bg-club-gold/[0.08] p-4">
          <p className="text-[15px] font-extrabold">{invite.hostName} зовёт вас по билету 1+1</p>
          <p className="text-[13px] leading-relaxed text-club-muted">
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
        </div>
      ) : null}

      <div className="relative h-[230px] overflow-hidden rounded-3xl bg-[#3a0e1a]">
        {event.posterUrl ? (
          <PosterImage drift url={event.posterUrl} />
        ) : (
          <span aria-hidden className="pointer-events-none absolute -right-8 -top-12 text-[280px] leading-none text-white/[0.06]">
            ♠
          </span>
        )}
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(13,10,11,0)_25%,rgba(13,10,11,0.9)_100%)]" />

        <div className="absolute inset-x-[18px] bottom-[18px] flex flex-col gap-3">
          {event.badge ? <Eyebrow className="!text-club-gold">{event.badge}</Eyebrow> : null}
          <h1 className="font-display text-[28px] font-bold uppercase leading-[1.05] tracking-[-0.01em]">
            {event.title}
          </h1>
          <div className="flex flex-wrap gap-1.5">
            <Chip>
              <CalendarDays size={14} /> {formatEventShortDateLabel(event.startsAt)}
            </Chip>
            <Chip>
              <Clock size={14} /> {formatEventTimeLabel(event.startsAt)}
            </Chip>
            {announcedSeats ? (
              <Chip>
                <Users size={14} /> {formatSeatsCount(announcedSeats.total)}
              </Chip>
            ) : null}
          </div>
        </div>
      </div>

      {/* Once the cards are in the air the room takes the place of the sign-up list: who
          is still in, table by table, and who has already gone out. */}
      {live ? (
        <section className="flex flex-col gap-2.5">
          {/* Fixed to the top of the screen; it sits here because only a game under way
              has knockouts to call out. */}
          <KnockoutToast news={knockouts[0] ?? null} onDone={nextKnockout} />
          <LiveTournamentCard live={live} />
          {room ? (
            <>
              <h2 className="flex min-h-11 items-center gap-2 font-display text-[17px] font-semibold">
                За столами
                <span className="font-body text-[15px] font-semibold text-club-faint">{countPlayersIn(room)}</span>
              </h2>
              <LiveTables eliminated={room.eliminated} justOut={justOut} tables={room.tables} />
            </>
          ) : null}
        </section>
      ) : stillAhead && (signups.players.length > 0 || signups.waitlist.length > 0) ? (
        <WhoIsComing players={signups.players} waitlist={signups.waitlist} />
      ) : null}

      <section className="flex flex-col gap-2.5">
        <SectionHeader title={event.signedUp || event.reservedTicket ? "Ваш билет" : "Билет"} />
        {seatsBreakdown ? <p className="-mt-2 text-[13px] text-club-muted">{seatsBreakdown}</p> : null}
        {!event.signedUp && !event.reservedTicket && ticketsInRow > 1 ? (
          <p className="-mt-1 text-[13px] text-club-muted">{freeSeatsLine}</p>
        ) : null}
        {event.signedUp || event.reservedTicket ? (
          <>
            <TicketOption
              kind="regular"
              price={event.buyIn}
              seats={freeSeats.regular}
              stamp={heldTicket === "regular" ? heldStamp : undefined}
              state={heldTicket === "regular" ? "chosen" : "muted"}
            />
            {offersDuo ? (
              <TicketOption
                kind="duo"
                price={event.duoBuyIn}
                seats={freeSeats.duo}
                stamp={heldTicket === "duo" || heldTicket === "duo_plus_one" ? heldStamp : undefined}
                state={heldTicket === "duo" || heldTicket === "duo_plus_one" ? "chosen" : "muted"}
              />
            ) : null}
            {offersVip ? (
              <TicketOption
                kind="vip"
                price={event.vipBuyIn}
                seats={freeSeats.vip}
                stamp={heldTicket === "vip" ? heldStamp : undefined}
                state={heldTicket === "vip" ? "chosen" : "muted"}
              />
            ) : null}
          </>
        ) : (
          <>
            <TicketOption
              kind="regular"
              onSelect={() => selectTicket("regular")}
              price={event.buyIn}
              seats={freeSeats.regular}
              state={ticketType === "regular" ? "chosen" : "idle"}
            />
            {offersDuo ? (
              <TicketOption
                kind="duo"
                onSelect={() => selectTicket("duo")}
                price={event.duoBuyIn}
                seats={freeSeats.duo}
                state={ticketType === "duo" ? "chosen" : "idle"}
              />
            ) : null}
            {offersVip ? (
              <TicketOption
                kind="vip"
                onSelect={() => selectTicket("vip")}
                price={event.vipBuyIn}
                seats={freeSeats.vip}
                state={ticketType === "vip" ? "chosen" : "idle"}
              />
            ) : null}
          </>
        )}

        {(reservedDuo || ticketType === "duo") && (!event.signedUp || needsPartner) ? (
          <GlassCard className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <p className="font-display text-[18px] font-semibold">Кто придёт с вами?</p>
              <p className="text-[13px] text-club-muted">Билет 1+1 — вход для двоих, цена делится пополам</p>
            </div>

            {/* The friend worth bringing is often the one who has not joined yet, so the
                two cases are asked apart rather than guessed from what was typed. */}
            <div className="flex gap-1 rounded-2xl border border-club-line bg-club-ink/40 p-1">
              {(["member", "invite"] as const).map((mode) => (
                <button
                  key={mode}
                  aria-pressed={partnerMode === mode}
                  className={`h-10 flex-1 rounded-xl text-[14px] font-bold transition-colors ${
                    partnerMode === mode ? "bg-club-text text-[#15100f]" : "text-club-muted"
                  }`}
                  type="button"
                  onClick={() => setPartnerMode(mode)}
                >
                  {mode === "member" ? "Резидент клуба" : "Нет аккаунта"}
                </button>
              ))}
            </div>

            {partnerMode === "invite" ? (
              <div className="flex flex-col gap-2.5">
                <p className="text-[13px] leading-relaxed text-club-muted">
                  Запишитесь — и получите ссылку-приглашение. Друг откроет её,
                  зарегистрируется и увидит приглашение на этот турнир.
                </p>

                {hasInviteLinks ? (
                  <div className="flex flex-col gap-2">
                    {shownInviteLinks?.telegram ? (
                      <InviteLink href={shownInviteLinks.telegram} label="Телеграм" />
                    ) : null}
                    {shownInviteLinks?.web ? (
                      <InviteLink href={shownInviteLinks.web} label="Нет доступа к телеграму" />
                    ) : null}
                    <InfoNote>
                      Отправьте другу ссылку-приглашение — ту, что подходит. Ссылка одноразовая:
                      кто откроет первым, тот и придёт с вами.
                    </InfoNote>
                  </div>
                ) : null}
              </div>
            ) : (
              <>
                <div className="flex flex-col gap-2">
                  <span className="text-[13px] font-bold">Ник напарника</span>
                  <div className="flex h-[52px] items-center gap-2.5 rounded-[14px] border border-club-line bg-club-ink/40 px-4 focus-within:border-club-rose">
                    <Search className="shrink-0 text-club-faint" size={18} />
                    <input
                      aria-label="Ник напарника"
                      autoComplete="off"
                      className="min-w-0 flex-1 bg-transparent text-[15px] font-semibold text-club-text outline-none placeholder:font-medium placeholder:text-club-faint"
                      id="duo-partner"
                      maxLength={MAX_PARTNER_NAME_LENGTH}
                      onChange={(item) => typePartner(item.target.value)}
                      placeholder="Ник в клубе или имя гостя"
                      value={partnerName}
                    />
                  </div>
                </div>

                {partnerMatches.length > 0 ? (
                  <div className="flex flex-col gap-1.5">
                    {partnerMatches.map((match) => (
                      <button
                        key={match.key}
                        className="flex h-14 w-full items-center gap-3 rounded-[14px] border border-club-line px-3 text-left"
                        type="button"
                        onClick={() => pickPartner(match)}
                      >
                        <PlayerAvatar name={match.name} photoUrl={match.avatarUrl ?? undefined} size={34} />
                        <span className="min-w-0 flex-1 truncate text-[15px] font-bold">{match.name}</span>
                      </button>
                    ))}
                  </div>
                ) : partnerKey ? (
                  <div className="flex h-14 items-center gap-3 rounded-[14px] border border-club-rose bg-club-crimson/10 px-3">
                    <span className="min-w-0 flex-1 truncate text-[15px] font-bold">{partnerName}</span>
                    <Check className="shrink-0 text-club-rose" size={18} strokeWidth={2.5} />
                  </div>
                ) : null}

                {typedMember ? (
                  <InfoNote tone="gold">
                    {typedMember.name} есть в клубе — нажмите на него в списке выше, чтобы ему
                    пришло приглашение. Иначе он придёт гостем и ничего не увидит в приложении.
                  </InfoNote>
                ) : (
                  <InfoNote tone={partnerKey ? "mint" : "neutral"}>
                    {partnerKey
                      ? "Игрок клуба — ему придёт приглашение, и он подтвердит, что придёт."
                      : "Гость без аккаунта — администратор впустит его по вашему билету."}
                  </InfoNote>
                )}
              </>
            )}
          </GlassCard>
        ) : null}
      </section>

      {/* A pass never buys a pair, whether the player picked the "1+1" themselves or the
          club is holding one for them. */}
      {passOptions.length > 0 && !event.signedUp && (heldTicket ?? ticketType) !== "duo" ? (
        <section className="flex flex-col gap-2.5">
          <SectionHeader title="Бесплатная проходка" />
          <div className="flex flex-col gap-2">
            {passOptions.map((option) => (
              <ChoiceRow
                key={option.value}
                chosen={usePass === option.value}
                disabled={option.disabled}
                note={option.note}
                title={option.title}
                onSelect={() => selectPass(option.value)}
              />
            ))}
          </div>
          <InfoNote>
            Проходка закрывает билет своего типа и действует только на вход: права на
            бесплатный ре-энтри или аддон она не даёт.
          </InfoNote>
        </section>
      ) : null}

      {event.signedUp && event.usePass !== "none" ? (
        <div className="flex items-center gap-3 rounded-[18px] border border-club-line bg-club-surface px-4 py-3">
          <Ticket className="shrink-0 text-club-rose" size={18} />
          <p className="text-[13px] text-club-muted">
            Вход по проходке: {PASS_TITLES[event.usePass]}. Её спишут, когда вы придёте на игру, а
            до тех пор она закреплена за этой записью.
          </p>
        </div>
      ) : null}

      <div className="flex flex-col gap-3">
        {needsPartner ? (
          <PrimaryButton
            disabled={partnerMissing}
            loading={submitting}
            onClick={() => void toggleSignup(true)}
          >
            {partnerMissing ? "Укажите напарника" : "Позвать напарника"}
          </PrimaryButton>
        ) : null}

        {signupBan ? (
          // Said before they tap rather than after: the player is not signing up tonight,
          // and the screen owes them the reason and the date it ends.
          <div className="rounded-[18px] border border-club-rose/45 bg-club-crimson/10 px-4 py-3.5 text-center text-[14px] font-semibold leading-relaxed text-club-rose">
            {signupBan.message}
          </div>
        ) : event.signedUp ? (
          <>
            <div
              className={`relative rounded-[18px] border border-club-mint/35 bg-club-mint/10 px-4 py-3.5 text-center text-[15px] font-extrabold text-club-mint ${
                celebrating ? "client-pop-in" : ""
              }`}
            >
              {burst}
              <span className="inline-flex items-center justify-center gap-1.5">
                <Check
                  className={`shrink-0 ${celebrating ? "client-check-draw" : ""}`}
                  size={17}
                  strokeWidth={3}
                />
                Вы записаны · {TICKET_TITLES[event.ticketType]} билет
              </span>
              {event.partnerName ? (
                <span className="mt-1 block text-[13px] font-semibold text-club-mint/80">
                  С вами: {event.partnerName}
                  {event.partnerIsMember
                    ? event.partnerConfirmed
                      ? " · подтвердил"
                      : " · ждём ответа"
                    : " · гость"}
                </span>
              ) : null}
            </div>
            {/* Sat down at a table, or out already: the seat is being played in. */}
            {event.cancellationClosed ? null : (
              <>
                <GhostButton disabled={submitting} onClick={() => void toggleSignup(false)}>
                  Отменить запись
                </GhostButton>
                <p className="px-2 text-center text-[12px] text-club-faint">
                  {needsPartner
                    ? "Напарник не сможет прийти. Билет 1+1 остался за вами — позовите другого."
                    : "Чтобы сменить билет или проходку, отмените запись и запишитесь заново."}
                </p>
              </>
            )}
          </>
        ) : event.reservedTicket ? (
          // The club promised this seat to somebody who asked ahead; all that is left is
          // for them to say they are coming.
          <>
            <div className="client-breathe relative rounded-[18px] border border-club-gold/35 bg-club-gold/10 px-4 py-3.5 text-center text-[15px] font-extrabold text-club-gold">
              Вам отложен{" "}
              {event.reservedTicket === "vip"
                ? "VIP-билет"
                : event.reservedTicket === "duo"
                  ? "билет 1+1"
                  : "обычный билет"}
              <span className="mt-1 block text-[13px] font-semibold text-club-gold/75">
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
          </>
        ) : queuedTicket && event.waitlistOfferExpiresAt ? (
          // The queue reached them and the place is held for nobody else until the half
          // hour runs out. The room reads full to everyone else, so this seat is theirs
          // to take rather than to race anyone for.
          <>
            {/* Counting down on the phone; when the time is up the club is asked once where
                the queue went, and the screen follows. */}
            <OfferCountdown expiresAt={event.waitlistOfferExpiresAt} onExpire={() => void load()} />
            <PrimaryButton
              disabled={queuedPartnerMissing}
              loading={submitting}
              onClick={() => void toggleSignup(true, false, queuedTicket)}
            >
              {queuedPartnerMissing ? "Укажите напарника" : `Записаться · ${TICKET_TITLES[queuedTicket]}`}
            </PrimaryButton>
            <GhostButton disabled={submitting} onClick={() => void toggleSignup(false)}>
              Отказаться от места
            </GhostButton>
          </>
        ) : event.waitlisted ? (
          <>
            <div className="rounded-[18px] border border-club-gold/35 bg-club-gold/10 px-4 py-3.5 text-center text-[15px] font-extrabold text-club-gold">
              Вы в листе ожидания
              <span className="mt-1 block text-[13px] font-semibold text-club-gold/75">
                Как освободится место, оно уйдёт по очереди — первому, кто в ней стоит.
                Когда дойдёт до вас, сообщим и полчаса будем держать место за вами.
              </span>
            </div>
            <GhostButton disabled={submitting} onClick={() => void toggleSignup(false)}>
              Выйти из листа ожидания
            </GhostButton>
          </>
        ) : event.seatGivenAway ? (
          // They did not come and the desk gave their place to somebody waiting. Saying
          // so beats the screen insisting they are signed up for a seat that is taken.
          <>
            <div className="rounded-[18px] border border-club-line bg-club-surface px-4 py-3.5 text-center text-[15px] font-extrabold text-club-muted">
              Место передали другому игроку
              <span className="mt-1 block text-[13px] font-semibold text-club-faint">
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
          </>
        ) : soldOut ? (
          // Sold out is where the club used to lose the player: nothing on the screen
          // said "tell me if a place comes free".
          <>
            <PrimaryButton
              disabled={partnerMissing}
              loading={submitting}
              onClick={() => void toggleSignup(true, true)}
            >
              Встать в лист ожидания
            </PrimaryButton>
            <p className="px-2 text-center text-[12px] text-club-faint">
              {ticketType === "vip"
                ? "VIP-места разобрали."
                : ticketType === "duo"
                  ? "Билеты 1+1 разобрали."
                  : "Места разобрали."}{" "}
              Если кто-то отменит запись, мы вам сообщим.
            </p>
          </>
        ) : (
          <div className="flex items-center gap-3 rounded-[20px] border border-club-line bg-club-surface p-3 pl-4">
            <div className="flex min-w-0 flex-col gap-0.5">
              <span className="truncate text-[12px] text-club-muted">
                {TICKET_TITLES[ticketType]}
                {usePass !== "none" ? " · по проходке" : ""}
              </span>
              <span className="font-display text-[17px] font-semibold">
                {chosenPrice === null ? "—" : `${chosenPrice.toLocaleString("ru-RU")} ₽`}
              </span>
            </div>
            <PrimaryButton
              className="flex-1"
              disabled={partnerMissing}
              loading={submitting}
              onClick={() => void toggleSignup(true)}
            >
              {/* Keyed by its words, so a change of ticket rolls them over in place. */}
              <SwapLabel text={partnerMissing ? "Укажите напарника" : "Записаться"} />
            </PrimaryButton>
          </div>
        )}

        <p className="px-2 text-center text-[11px] text-club-faint">
          Номер участника и стол выдаст администратор в день игры
        </p>
      </div>

      {aboutItems.length > 0 ? (
        <section className="flex flex-col gap-2.5">
          <SectionHeader title="О турнире" />
          <Accordion items={aboutItems} />
        </section>
      ) : null}
    </div>
  );
}

/** "Кто идёт": the faces of the first few, and the whole list on a tap. */
function WhoIsComing({ players, waitlist }: { players: SignupListEntry[]; waitlist: SignupListEntry[] }) {
  const [open, setOpen] = useState(false);
  const faces = players.slice(0, 5);

  return (
    <section className="flex flex-col gap-2.5">
      <button
        aria-expanded={open}
        className="flex items-center gap-3 rounded-[18px] border border-club-line bg-club-surface px-4 py-3 text-left"
        type="button"
        onClick={() => {
          tickClientSelection();
          setOpen((current) => !current);
        }}
      >
        {faces.length > 0 ? (
          <span className="flex shrink-0">
            {faces.map((player, index) => (
              <span
                key={player.key}
                className="rounded-full shadow-[0_0_0_3px_#171113]"
                style={{ marginLeft: index === 0 ? 0 : -10 }}
              >
                <PlayerAvatar name={player.name} photoUrl={player.avatarUrl ?? undefined} size={36} />
              </span>
            ))}
          </span>
        ) : null}
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="text-[14px] font-extrabold">Кто идёт · {players.length}</span>
          {waitlist.length > 0 ? (
            <span className="text-[12px] text-club-muted">и {waitlist.length} в листе ожидания</span>
          ) : null}
        </span>
        <ChevronDown
          className={`shrink-0 text-club-faint transition-transform duration-300 ${open ? "rotate-180" : ""}`}
          size={18}
        />
      </button>
      {open ? <SignupList players={players} waitlist={waitlist} /> : null}
    </section>
  );
}

/** Sections that open one at a time, the first open to begin with. */
function Accordion({ items }: { items: Array<{ body: ReactNode; icon: ReactNode; title: string }> }) {
  const [open, setOpen] = useState(0);

  return (
    <div className="overflow-hidden rounded-[20px] border border-club-line bg-club-surface">
      {items.map((item, index) => (
        <div key={item.title} className={index > 0 ? "border-t border-club-line" : undefined}>
          <button
            aria-expanded={open === index}
            className="flex min-h-[60px] w-full items-center gap-3.5 px-4 py-2.5 text-left"
            type="button"
            onClick={() => setOpen((current) => (current === index ? -1 : index))}
          >
            <IconTile className="!text-club-muted">{item.icon}</IconTile>
            <span className="flex-1 text-[15px] font-bold">{item.title}</span>
            <ChevronDown
              className={`shrink-0 text-club-faint transition-transform duration-300 ${open === index ? "rotate-180" : ""}`}
              size={18}
            />
          </button>
          {open === index ? (
            <div className="flex flex-col gap-1.5 pb-4 pl-[70px] pr-4 text-[14px] leading-relaxed text-club-muted">
              {item.body}
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}

const NOTE_TONES = {
  gold: { box: "bg-club-gold/10", icon: "text-club-gold" },
  mint: { box: "bg-club-mint/[0.08]", icon: "text-club-mint" },
  neutral: { box: "bg-white/[0.04]", icon: "text-club-faint" },
} as const;

/** A quiet line of explanation with an "i" in front of it. */
function InfoNote({ children, tone = "neutral" }: { children: ReactNode; tone?: keyof typeof NOTE_TONES }) {
  return (
    <div className={`flex gap-2.5 rounded-[14px] px-3.5 py-3 ${NOTE_TONES[tone].box}`}>
      <Info className={`mt-px shrink-0 ${NOTE_TONES[tone].icon}`} size={16} />
      <p className="text-[12px] leading-relaxed text-club-muted">{children}</p>
    </div>
  );
}

/** The "вы записаны" stamp on the ticket a player holds, and whether it is landing now. */
type TicketStamp = "landing" | "resting";

/** How few seats of a kind have to be left before they start to pulse. */
const LAST_SEATS = 3;

const TICKET_NOTES: Record<TicketType, string> = {
  duo: "Вход для двоих по одной цене",
  regular: "Вход для одного игрока",
  vip: "Место за столом выдаёт администратор",
};

/** One line of a single choice: a radio, a title with a note under it, and whatever sits on the right. */
function ChoiceRow({
  chosen,
  className = "",
  disabled,
  note,
  onSelect,
  right,
  title,
}: {
  chosen: boolean;
  className?: string;
  disabled?: boolean;
  note?: string | null;
  onSelect?: () => void;
  right?: ReactNode;
  title: ReactNode;
}) {
  return (
    <button
      aria-pressed={chosen}
      className={`relative flex min-h-[72px] w-full items-center gap-3.5 overflow-hidden rounded-[18px] border-[1.5px] px-4 py-3.5 text-left transition-[background-color,border-color,opacity,transform] duration-300 ${
        chosen ? "border-club-rose bg-club-crimson/10" : "border-club-line bg-club-surface"
      } ${disabled ? "opacity-50" : ""} ${className}`}
      disabled={disabled || !onSelect}
      type="button"
      onClick={onSelect}
    >
      <span
        className={`h-[22px] w-[22px] shrink-0 rounded-full transition-colors ${
          chosen ? "border-[6px] border-club-crimson bg-club-crimson shadow-[inset_0_0_0_3px_#fff]" : "border-2 border-club-faint"
        }`}
      />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-[16px] font-extrabold">{title}</span>
        {note ? <span className="text-[12px] text-club-muted">{note}</span> : null}
      </span>
      {right}
    </button>
  );
}

/** One ticket the poster sells: its price, what is left of it, and whether it is picked. */
function TicketOption({
  kind,
  onSelect,
  price,
  seats,
  stamp,
  state,
}: {
  kind: TicketType;
  onSelect?: () => void;
  price: number | null;
  seats: number | null;
  stamp?: TicketStamp;
  state: "chosen" | "idle" | "muted";
}) {
  const soldOut = seats !== null && seats <= 0;
  const chosen = state === "chosen";
  // The last seats of a kind pulse; a ticket that is sold out or not on the table keeps
  // still. VIP catches the light while it is on sale — the ticket the club would rather sell.
  const lastSeats = seats !== null && seats > 0 && seats <= LAST_SEATS && state !== "muted";
  const glints = kind === "vip" && !soldOut && state !== "muted";

  return (
    <ChoiceRow
      chosen={chosen}
      className={`${glints ? "client-glint" : ""} ${stamp === "landing" ? "client-jolt" : ""} ${
        state === "muted" ? "opacity-50" : ""
      }`}
      disabled={!onSelect || (soldOut && !chosen)}
      note={TICKET_NOTES[kind]}
      right={
        <span className="flex shrink-0 flex-col items-end gap-1">
          <span className="font-display text-[15px] font-semibold">
            {price ? `${price.toLocaleString("ru-RU")} ₽` : "—"}
          </span>
          {/* The stamp takes the seats line's place: what is left of a ticket the player
              already holds is not theirs to worry about. */}
          {stamp ? (
            <span
              className={`inline-block rounded-md border-[1.5px] border-club-mint px-1.5 py-px text-[10px] font-extrabold uppercase tracking-[0.06em] text-club-mint ${
                stamp === "landing" ? "client-stamp-in" : ""
              }`}
            >
              Вы записаны
            </span>
          ) : (
            <span
              className={`text-[11px] font-bold ${
                lastSeats ? "client-blink text-club-rose" : soldOut ? "text-club-faint" : "text-club-mint"
              }`}
            >
              {kind === "duo" ? duoSeatsLabel(seats) : seatsLabel(seats)}
            </span>
          )}
        </span>
      }
      title={TICKET_TITLES[kind]}
      onSelect={onSelect}
    />
  );
}

/** A button's words, rolled over in place when they change instead of blinking. */
function SwapLabel({ text }: { text: string }) {
  return (
    <span key={text} className="client-swap-in inline-block">
      {text}
    </span>
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
      getClientTelegramWebApp()?.HapticFeedback?.impactOccurred("light");
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      showClientAlert(href);
    }
  };

  return (
    <button
      className={`flex w-full items-center gap-3 rounded-[14px] border px-3.5 py-3 text-left transition-colors duration-300 ${
        copied ? "border-club-mint/40 bg-club-mint/10" : "border-club-line bg-club-ink/40"
      }`}
      type="button"
      onClick={copy}
    >
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-[13px] font-bold">{label}</span>
        <span className="truncate text-[11px] text-club-faint">{href}</span>
      </span>
      <span
        className={`flex shrink-0 items-center gap-1 text-[12px] font-bold ${
          copied ? "text-club-mint" : "text-club-rose"
        }`}
      >
        {copied ? (
          <Check key="copied" className="client-icon-pop" size={14} strokeWidth={3} />
        ) : (
          <Copy key="copy" size={14} />
        )}
        {copied ? "Скопировано" : "Копировать"}
      </span>
    </button>
  );
}
