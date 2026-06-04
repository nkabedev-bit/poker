import { defaultBlindAlertSettings } from "@/lib/timer/blind-alert";
import {
  createDefaultPlacePoints,
  normalizePlacePoints,
  normalizePtsBountyTemplates,
  normalizePtsPlaceTemplates,
} from "@/lib/pts-rating";
import type { TournamentExtras } from "@/lib/timer/types";

export type TournamentExtrasPatch = Partial<
  Omit<TournamentExtras, "clientBot" | "pts" | "settings">
> & {
  clientBot?: Partial<TournamentExtras["clientBot"]>;
  pts?: Partial<TournamentExtras["pts"]>;
  settings?: Partial<TournamentExtras["settings"]>;
};

export const defaultTournamentExtras: TournamentExtras = {
  blindTemplates: [],
  clientBot: {
    ratingUrl: "",
    registrationCode: "",
    scheduleText: "",
  },
  settings: {
    addonChips: 15000,
    addonMinutes: 0,
    addonPrice: 150,
    blindAlertCustomSoundName: null,
    blindAlertCustomSoundUrl: null,
    blindAlertSeconds: defaultBlindAlertSettings.warningSeconds,
    blindAlertSound: defaultBlindAlertSettings.sound,
    buyIn: 100,
    isBounty: false,
    maxPlayersPerTable: 10,
    maxReentries: 1,
    rebuyPrice: 100,
    reentryEnabled: false,
    tablesCount: 3,
  },
  players: [],
  prizes: [
    { place: 1, bonuses: [] },
    { place: 2, bonuses: [] },
    { place: 3, bonuses: [] },
  ],
  pts: {
    bountyPoints: 0,
    bountyTemplates: [],
    chatId: "",
    enabled: false,
    firstPlace: 100,
    placePoints: createDefaultPlacePoints(),
    placeTemplates: [],
    secondPlace: 50,
    templates: [],
    thirdPlace: 25,
  },
};

export function mergeTournamentExtras(value: unknown): TournamentExtras {
  const input = typeof value === "object" && value ? (value as Partial<TournamentExtras>) : {};
  const ptsInput =
    typeof input.pts === "object" && input.pts
      ? (input.pts as Partial<TournamentExtras["pts"]>)
      : undefined;

  return {
    settings: {
      ...defaultTournamentExtras.settings,
      ...(typeof input.settings === "object" && input.settings ? input.settings : {}),
    },
    blindTemplates: Array.isArray(input.blindTemplates) ? input.blindTemplates : [],
    clientBot: {
      ...defaultTournamentExtras.clientBot,
      ...(typeof input.clientBot === "object" && input.clientBot ? input.clientBot : {}),
    },
    players: Array.isArray(input.players) ? input.players : [],
    prizes:
      Array.isArray(input.prizes) && input.prizes.length > 0
        ? input.prizes
        : defaultTournamentExtras.prizes,
    pts: {
      ...defaultTournamentExtras.pts,
      ...(ptsInput ?? {}),
      placePoints: normalizePlacePoints(
        Array.isArray(ptsInput?.placePoints)
          ? ptsInput.placePoints
          : [ptsInput?.firstPlace, ptsInput?.secondPlace, ptsInput?.thirdPlace],
      ),
      bountyTemplates: normalizePtsBountyTemplates(
        Array.isArray(ptsInput?.bountyTemplates) ? ptsInput.bountyTemplates : ptsInput?.templates,
      ),
      placeTemplates: normalizePtsPlaceTemplates(
        Array.isArray(ptsInput?.placeTemplates) ? ptsInput.placeTemplates : ptsInput?.templates,
      ),
    },
  };
}
