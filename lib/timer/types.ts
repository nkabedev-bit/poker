import type { EventTemplate } from "@/lib/events/templates";
import type { Raffle } from "@/lib/raffle/raffle";

export type TimerStatus =
  | "not_started"
  | "running"
  | "paused"
  | "break"
  | "finished";

export type RegistrationStatus = "open" | "closed";

export type BlindAlertSound = "standard" | "double" | "chime" | "custom" | "off";

export type BountyType = "standard" | "mystery" | "dealer" | "wanted" | "progressive";

// Tournament format presets: PHOENIX — no addons, 1 regular re-entry; DEEP STACK — no
// addons, 2 regular re-entries. Both disable the double (x2) re-entry option. FREEROLL
// plays like a regular tournament and only differs in money: the entry ticket is free,
// so nothing is charged for it in the finance sheet.
export type TournamentFormat = "regular" | "phoenix" | "deepstack" | "freeroll";

// The seven tournaments the club runs. Picking one prefills the settings below, and the
// choice is kept: it names the tournament type, which is what decides the medal its
// winner is awarded.
export type TournamentPresetName =
  | "phoenix"
  | "deepstack"
  | "bounty"
  | "progressive"
  | "mystery"
  | "freeroll"
  | "lastchance";

export type BlindLevel = {
  id: string;
  levelOrder: number;
  smallBlind: number | null;
  bigBlind: number | null;
  ante: number | null;
  reentryCloses: boolean;
  doubleReentryAvailable?: boolean;
  durationSeconds: number;
  isBreak: boolean;
  breakDurationSeconds: number | null;
};

export type BlindTemplateLevel = Omit<BlindLevel, "id">;

export type BlindTemplate = {
  id: string;
  name: string;
  levels: BlindTemplateLevel[];
};

export type Tournament = {
  id: string;
  name: string;
  logoUrl: string | null;
  startingStack: number;
  registrationMinutes: number;
  registrationStatus: RegistrationStatus;
  publicToken: string;
};

export type TournamentPlayer = {
  id: string;
  name: string;
  stack: number;
  table: number | null;
  seat: number | null;
  rebuys: number;
  doubleRebuys?: number;
  addons: number;
  addonChipsTotal?: number;
  bountyChipsTotal?: number;
  bountyCount: number;
  mysteryBountyPoints?: number;
  // Progressive Bounty: knockouts scored on the CURRENT bullet, which set the price of
  // this player's own head. Reset to 0 on a re-entry; `bountyCount` keeps the total.
  progressiveKnockouts?: number;
  status: "active" | "eliminated";
  finishPlace: number | null;
  registrationNumber?: number | null;
  category?: "VIP" | "Normal";
  registeredVia?: "admin" | "client_bot";
  telegramId?: number | null;
  label?: string | null; // custom display marker for the public screen (e.g. "дилер")
  // Venue card handed out at the door for the evening; the code is printed on the card
  // and the card is reused by whoever comes next.
  cardCode?: string | null;
  ticketType?: "regular" | "vip";
  /** Set when the entry was paid with a free pass, so the desk charges nothing for it. */
  freePass?: "regular" | "vip" | null;
  /**
   * Set once the player has settled up. Payment happens at the break that closes
   * re-entries and add-ons, so nothing is bought after it and the bill cannot change.
   */
  paid?: boolean;
};

export type ScheduleVersion = { effectiveFrom: string; text: string };

export type TournamentExtras = {
  blindTemplates: BlindTemplate[];
  /** Saved posters the club reuses week after week, dated afresh each time. */
  eventTemplates: EventTemplate[];
  /** The draw showing on the big screen right now, if one is running. */
  raffle: Raffle | null;
  clientBot: {
    ratingUrl: string;
    scheduleText: string;
    scheduleVersions: ScheduleVersion[];
  };
  settings: {
    addonChips: number;
    addonEnabled: boolean;
    addonMinutes: number;
    addonPrice: number;
    blindAlertCustomSoundName: string | null;
    blindAlertCustomSoundUrl: string | null;
    blindAlertSeconds: number;
    blindAlertSound: BlindAlertSound;
    buyIn: number;
    // Ticket price for a VIP seat; regular seats pay `buyIn`.
    vipBuyIn: number;
    // Price of the double (x2) re-entry; a single re-entry costs `rebuyPrice`.
    doubleRebuyPrice: number;
    bountyType: BountyType;
    isBounty: boolean;
    maxPlayersPerTable: number;
    maxAddons: number;
    maxReentries: number;
    rebuyPrice: number;
    reentryEnabled: boolean;
    sheetsSessionStartedAt: string | null;
    statsCountedAt: string | null;
    tablesCount: number;
    tournamentPreset: TournamentPresetName | null;
    tournamentFormat: TournamentFormat;
  };
  players: TournamentPlayer[];
  // Persistent per-guest display labels keyed by normalized nickname (e.g. "дилер").
  // Survives the roster wipe on tournament finish so regular guests keep their marker.
  playerLabels: Record<string, string>;
  prizes: Array<{
    bonuses: string[];
    place: number;
  }>;
  pts: {
    bountyPoints: number;
    bountyTemplates: Array<{
      bountyPoints: number;
      id: string;
      name: string;
    }>;
    chatId: string;
    enabled: boolean;
    firstPlace: number;
    placePoints: number[];
    placeTemplates: Array<{
      id: string;
      name: string;
      placePoints: number[];
    }>;
    secondPlace: number;
    templates: Array<{
      bountyPoints: number;
      id: string;
      name: string;
      placePoints: number[];
    }>;
    thirdPlace: number;
  };
};

export type TimerState = {
  status: TimerStatus;
  currentLevelIndex: number;
  levelStartedAt: string | null;
  pausedRemainingSeconds: number | null;
  registrationClosesAt: string | null;
  finishedAt: string | null;
};

export type PublicTournamentState = {
  tournament: Tournament;
  timerState: TimerState;
  blindLevels: BlindLevel[];
  extras: TournamentExtras;
};
