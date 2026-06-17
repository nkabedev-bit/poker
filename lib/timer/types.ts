export type TimerStatus =
  | "not_started"
  | "running"
  | "paused"
  | "break"
  | "finished";

export type RegistrationStatus = "open" | "closed";

export type BlindAlertSound = "standard" | "double" | "chime" | "custom" | "off";

export type BountyType = "standard" | "mystery" | "dealer";

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
  status: "active" | "eliminated";
  finishPlace: number | null;
  registrationNumber?: number | null;
  category?: "VIP" | "Normal";
  registeredVia?: "admin" | "client_bot";
  telegramId?: number | null;
  label?: string | null; // custom display marker for the public screen (e.g. "дилер")
};

export type ScheduleVersion = { effectiveFrom: string; text: string };

export type TournamentExtras = {
  blindTemplates: BlindTemplate[];
  clientBot: {
    ratingUrl: string;
    registrationCode: string;
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
