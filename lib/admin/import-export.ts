import { z } from "zod";
import { blindAlertSounds } from "@/lib/timer/blind-alert";
import type {
  BlindLevel,
  PublicTournamentState,
  TimerState,
  Tournament,
  TournamentExtras,
} from "@/lib/timer/types";
import type { TournamentExtrasPatch } from "@/lib/tournament-extras-shared";

type ExportableExtras = Omit<TournamentExtras, "players">;

export type TournamentExportPayload = {
  schemaVersion: 1;
  exportedAt: string;
  tournament: Tournament;
  timerState: TimerState;
  blindLevels: BlindLevel[];
  extras: ExportableExtras;
};

const registrationStatusSchema = z.enum(["open", "closed"]);
const timerStatusSchema = z.enum(["not_started", "running", "paused", "break", "finished"]);
const blindAlertSoundSchema = z.enum(blindAlertSounds);

const nullableStoredUrlSchema = z.string().trim().min(1).nullable();

const tournamentSchema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(1).max(80),
  logoUrl: nullableStoredUrlSchema.optional(),
  startingStack: z.number().int().positive(),
  registrationMinutes: z.number().int().min(0).max(1440),
  registrationStatus: registrationStatusSchema.optional(),
  publicToken: z.string().optional(),
});

const timerStateSchema = z.object({
  status: timerStatusSchema.optional(),
  currentLevelIndex: z.number().int().min(0).optional(),
  levelStartedAt: z.string().nullable().optional(),
  pausedRemainingSeconds: z.number().int().min(0).nullable().optional(),
  registrationClosesAt: z.string().nullable().optional(),
  finishedAt: z.string().nullable().optional(),
});

const blindLevelSchema = z.object({
  id: z.string().optional(),
  levelOrder: z.number().int().positive(),
  smallBlind: z.number().int().positive().nullable(),
  bigBlind: z.number().int().positive().nullable(),
  ante: z.number().int().nonnegative().nullable(),
  reentryCloses: z.boolean().default(false),
  doubleReentryAvailable: z.boolean().default(false),
  durationSeconds: z.number().int().positive(),
  isBreak: z.boolean(),
  breakDurationSeconds: z.number().int().positive().nullable(),
});

const blindTemplateLevelSchema = blindLevelSchema.omit({ id: true });

const blindTemplateSchema = z.object({
  id: z.string(),
  name: z.string().trim().min(1).max(80),
  levels: z.array(blindTemplateLevelSchema).min(1).max(80),
});

const settingsSchema = z.object({
  addonChips: z.number().int().min(0).optional(),
  addonEnabled: z.boolean().optional(),
  addonMinutes: z.number().int().min(0).optional(),
  addonPrice: z.number().int().min(0).optional(),
  blindAlertCustomSoundName: z.string().nullable().optional(),
  blindAlertCustomSoundUrl: nullableStoredUrlSchema.optional(),
  blindAlertSeconds: z.number().int().min(1).max(300).optional(),
  blindAlertSound: blindAlertSoundSchema.optional(),
  bountyType: z.enum(["standard", "mystery"]).optional(),
  buyIn: z.number().int().min(0).optional(),
  isBounty: z.boolean().optional(),
  maxPlayersPerTable: z.number().int().positive().optional(),
  maxAddons: z.number().int().min(1).optional(),
  maxReentries: z.number().int().min(1).optional(),
  rebuyPrice: z.number().int().min(0).optional(),
  reentryEnabled: z.boolean().optional(),
  tablesCount: z.number().int().positive().optional(),
});

const prizeSchema = z.object({
  bonuses: z.array(z.string()),
  place: z.number().int().positive(),
});

const ptsPlaceTemplateSchema = z.object({
  id: z.string(),
  name: z.string(),
  placePoints: z.array(z.number()),
});

const ptsBountyTemplateSchema = z.object({
  bountyPoints: z.number(),
  id: z.string(),
  name: z.string(),
});

const ptsLegacyTemplateSchema = z.object({
  bountyPoints: z.number(),
  id: z.string(),
  name: z.string(),
  placePoints: z.array(z.number()),
});

const ptsSchema = z.object({
  bountyPoints: z.number().optional(),
  bountyTemplates: z.array(ptsBountyTemplateSchema).optional(),
  chatId: z.string().optional(),
  enabled: z.boolean().optional(),
  firstPlace: z.number().optional(),
  placePoints: z.array(z.number()).optional(),
  placeTemplates: z.array(ptsPlaceTemplateSchema).optional(),
  secondPlace: z.number().optional(),
  templates: z.array(ptsLegacyTemplateSchema).optional(),
  thirdPlace: z.number().optional(),
});

const extrasSchema = z.object({
  blindTemplates: z.array(blindTemplateSchema).optional(),
  clientBot: z.object({
    ratingUrl: z.string().optional(),
    registrationCode: z.string().optional(),
    scheduleText: z.string().optional(),
  }).optional(),
  settings: settingsSchema.optional(),
  prizes: z.array(prizeSchema).optional(),
  pts: ptsSchema.optional(),
});

const importSchema = z.object({
  schemaVersion: z.number().int().positive().optional(),
  exportedAt: z.string().optional(),
  tournament: tournamentSchema,
  timerState: timerStateSchema.optional(),
  blindLevels: z.array(blindLevelSchema).min(1),
  extras: extrasSchema.optional(),
});

function getExportableExtras(extras: TournamentExtras): ExportableExtras {
  const { players, ...exportableExtras } = extras;
  void players;
  return exportableExtras;
}

export function buildTournamentExportPayload(
  state: PublicTournamentState,
  exportedAt = new Date().toISOString(),
): TournamentExportPayload {
  return {
    schemaVersion: 1,
    exportedAt,
    tournament: state.tournament,
    timerState: state.timerState,
    blindLevels: state.blindLevels,
    extras: getExportableExtras(state.extras),
  };
}

export function normalizeImportedBlindLevels(
  levels: Array<z.infer<typeof blindLevelSchema>>,
): BlindLevel[] {
  let cutoffUsed = false;

  return levels.map((level, index) => {
    const reentryCloses = !level.isBreak && level.reentryCloses && !cutoffUsed;
    if (reentryCloses) cutoffUsed = true;

    return {
      id: level.id ?? `imported-${index + 1}`,
      levelOrder: level.levelOrder,
      smallBlind: level.isBreak ? null : level.smallBlind,
      bigBlind: level.isBreak ? null : level.bigBlind,
      ante: level.isBreak ? null : 0,
      reentryCloses,
      doubleReentryAvailable: Boolean(level.doubleReentryAvailable),
      durationSeconds: level.durationSeconds,
      isBreak: level.isBreak,
      breakDurationSeconds: level.isBreak ? level.breakDurationSeconds : null,
    };
  });
}

function buildExtrasPatch(extras: z.infer<typeof extrasSchema> | undefined): TournamentExtrasPatch {
  const patch: TournamentExtrasPatch = {};

  if (!extras) return patch;
  if (extras.blindTemplates !== undefined) patch.blindTemplates = extras.blindTemplates;
  if (extras.clientBot !== undefined) patch.clientBot = extras.clientBot;
  if (extras.settings !== undefined) patch.settings = extras.settings;
  if (extras.prizes !== undefined) patch.prizes = extras.prizes;
  if (extras.pts !== undefined) patch.pts = extras.pts;

  return patch;
}

export function parseTournamentImportPayload(payload: unknown) {
  const parsed = importSchema.safeParse(payload);

  if (!parsed.success) {
    return parsed;
  }

  return {
    success: true as const,
    data: {
      tournament: parsed.data.tournament,
      timerState: parsed.data.timerState,
      blindLevels: normalizeImportedBlindLevels(parsed.data.blindLevels),
      extrasPatch: buildExtrasPatch(parsed.data.extras),
    },
  };
}
