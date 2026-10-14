import { resolveMedalKey, type MedalKey } from "@/lib/client/medals";
import { getProgressiveHeadPoints, PROGRESSIVE_BASE_POINTS, PROGRESSIVE_STEP_POINTS } from "@/lib/pts-rating";
import { BOUNTY_CHIP_AWARD_BIG_BLINDS, resolveEffectiveBigBlind } from "@/lib/timer/calculate";
import { hasUnlimitedReentries, isDoubleReentryBannedByFormat } from "@/lib/tma/reentry-eligibility";
import type { BlindLevel, PublicTournamentState, TimerState, TournamentExtras } from "@/lib/timer/types";

/**
 * The rules of tonight's game, put on the hall's screen while the room is being seated.
 *
 * The slides follow the club's own deck, one per tournament it runs, but every number on
 * them is read from the tournament as it is set up: the stack, the re-entries, the addon
 * and the points per place say what the app will actually let happen tonight.
 */
export type ModeRulesKey = MedalKey;

export type ModeRulesAccent = "red" | "violet" | "gold";

export type ModeRulesStat = {
  label: string;
  value: string;
  note: string;
  /** Drawn in the mode's colour: the addon always, anything the game goes without. */
  accent: boolean;
};

export type ModeRulesFeature =
  | { kind: "bounty"; points: number; bigBlinds: number }
  | {
      kind: "progressive";
      basePoints: number;
      bigBlinds: number;
      ladder: Array<{ label: string; points: number }>;
      stepPoints: number;
    }
  | { kind: "mystery"; prizes: Array<{ icon: MysteryPrizeIcon; note: string; title: string }> }
  | { kind: "freeroll" }
  | { kind: "lastchance"; bonusPercent: number };

export type MysteryPrizeIcon = "gift" | "stack" | "star" | "ticket";

export type ModeRules = {
  accent: ModeRulesAccent;
  artSrc: string;
  description: string;
  feature: ModeRulesFeature | null;
  key: ModeRulesKey;
  kicker: string;
  /** Leading places that score, in order; empty when the tournament gives no points. */
  placePoints: Array<{ place: number; points: number }>;
  placePointsNote: string;
  stats: ModeRulesStat[];
  tag: "ACTION" | "SPECIAL" | "SPORT";
  title: string;
};

type ModeLook = Pick<ModeRules, "accent" | "kicker" | "tag" | "title">;

const MODE_LOOKS: Record<ModeRulesKey, ModeLook> = {
  phoenix: { accent: "red", kicker: "MTT", tag: "SPORT", title: "PHOENIX" },
  progressive: { accent: "red", kicker: "MTT · BOUNTY", tag: "ACTION", title: "PROGRESSIVE" },
  bounty: { accent: "red", kicker: "MTT · CLASSIC", tag: "ACTION", title: "BOUNTY" },
  mystery: { accent: "violet", kicker: "MTT · BOUNTY", tag: "SPECIAL", title: "MYSTERY" },
  deepstack: { accent: "red", kicker: "MTT", tag: "SPORT", title: "DEEP STACK" },
  freeroll: { accent: "red", kicker: "MTT", tag: "SPECIAL", title: "FREEROLL" },
  lastchance: { accent: "gold", kicker: "MTT", tag: "SPECIAL", title: "LAST CHANCE" },
};

/** Last Chance pays a third more for every place; the points in its scale already carry it. */
const LAST_CHANCE_BONUS_PERCENT = 30;

/** Knockouts on the Progressive ladder: the starting head and four after it. */
const PROGRESSIVE_LADDER_STEPS = 4;

const MYSTERY_PRIZES: Extract<ModeRulesFeature, { kind: "mystery" }>["prizes"] = [
  { icon: "star", note: "очки ITP", title: "Рейтинг" },
  { icon: "stack", note: "фишки в стек", title: "Блайнды" },
  { icon: "ticket", note: "обычная или VIP", title: "Проходки" },
  { icon: "gift", note: "сюрприз от клуба", title: "Особые призы" },
];

// "до второй паузы", "на второй паузе": the feminine ordinal reads the same in both.
const BREAK_ORDINALS = ["первой", "второй", "третьей", "четвёртой", "пятой", "шестой"];

// "До трёх одинарных ре-энтри".
const REENTRY_COUNT_GENITIVE = ["одного", "двух", "трёх", "четырёх", "пяти", "шести"];

/**
 * Whether the hall's screen should be showing the rules instead of the clock.
 *
 * From the first player seated until the admin starts the clock: the room is filling
 * up and there is nothing on the clock to watch yet.
 */
export function shouldShowModeRules(status: TimerState["status"], playersCount: number) {
  return status === "not_started" && playersCount > 0;
}

/**
 * Which of the club's slides tonight's game gets, or null when none of them fits.
 *
 * The type the admin picked decides, as it does for the winner's medal. Dealer Revenge
 * and Wanted Bounty have no slide: a bounty game switched to either pays knockouts in
 * its own way, and the Bounty slide would tell the room the wrong rules.
 */
export function resolveModeRulesKey(
  settings: Pick<
    TournamentExtras["settings"],
    "bountyType" | "isBounty" | "tournamentFormat" | "tournamentPreset"
  >,
): ModeRulesKey | null {
  if (settings.isBounty && (settings.bountyType === "dealer" || settings.bountyType === "wanted")) {
    return null;
  }

  return resolveMedalKey(settings);
}

export function buildModeRules(state: PublicTournamentState): ModeRules | null {
  const { settings, pts } = state.extras;
  const key = resolveModeRulesKey(settings);
  if (!key) return null;

  const levels = state.blindLevels;
  const startingStack = state.tournament.startingStack;
  const placePoints = getScoringPlaces(pts.placePoints);

  return {
    ...MODE_LOOKS[key],
    artSrc: `/modes/${key}.webp`,
    description: describeMode(key, {
      addonEnabled: settings.addonEnabled,
      maxReentries: getMaxReentries(settings),
      reentryEnabled: settings.reentryEnabled,
      startingStack,
    }),
    feature: getModeFeature(key, pts.bountyPoints),
    key,
    placePoints,
    placePointsNote:
      key === "lastchance"
        ? `Бонус +${LAST_CHANCE_BONUS_PERCENT}% уже учтён`
        : "Рейтинговые очки · не деньги",
    stats: [
      describeStartingStack(startingStack, levels),
      describeReentries(settings, levels),
      describeAddon(settings, levels),
    ],
  };
}

function getMaxReentries(settings: Pick<TournamentExtras["settings"], "maxReentries">) {
  // The same floor the re-entry check puts under the setting.
  return Math.max(1, Math.trunc(Number(settings.maxReentries ?? 1)));
}

function getScoringPlaces(placePoints: number[]) {
  const points = placePoints.map((value) => (Number.isFinite(value) ? value : 0));
  const lastScoring = points.findLastIndex((value) => value > 0);

  return points.slice(0, lastScoring + 1).map((value, index) => ({ place: index + 1, points: value }));
}

function getModeFeature(key: ModeRulesKey, bountyPoints: number): ModeRulesFeature | null {
  if (key === "bounty") {
    return {
      bigBlinds: BOUNTY_CHIP_AWARD_BIG_BLINDS,
      kind: "bounty",
      points: Math.max(0, Number(bountyPoints) || 0),
    };
  }

  if (key === "progressive") {
    return {
      basePoints: PROGRESSIVE_BASE_POINTS,
      bigBlinds: BOUNTY_CHIP_AWARD_BIG_BLINDS,
      kind: "progressive",
      ladder: Array.from({ length: PROGRESSIVE_LADDER_STEPS + 1 }, (_, knockouts) => ({
        label: knockouts === 0 ? "старт" : `${knockouts} KO`,
        points: getProgressiveHeadPoints(knockouts),
      })),
      stepPoints: PROGRESSIVE_STEP_POINTS,
    };
  }

  if (key === "mystery") return { kind: "mystery", prizes: MYSTERY_PRIZES };
  if (key === "freeroll") return { kind: "freeroll" };
  if (key === "lastchance") return { bonusPercent: LAST_CHANCE_BONUS_PERCENT, kind: "lastchance" };

  return null;
}

function describeMode(
  key: ModeRulesKey,
  game: { addonEnabled: boolean; maxReentries: number; reentryEnabled: boolean; startingStack: number },
) {
  if (key === "phoenix") {
    return `Чистая турнирная игра — ${describeSingleBullets(game, false)}.`;
  }

  if (key === "deepstack") {
    return `Глубокий стартовый стек — ${formatNumber(game.startingStack)} фишек. ${capitalize(
      describeSingleBullets(game, true),
    )}.`;
  }

  if (key === "progressive") return "Каждое выбивание делает твою голову дороже.";
  if (key === "bounty") return "За каждого выбитого игрока — очки в рейтинг и фишки в стек.";
  if (key === "mystery") return "Каждое выбивание — секретная награда. Выбил игрока — тяни карточку.";
  if (key === "freeroll") return "Первый вход — бесплатно. Ре-энтри и аддон — по правилам турнира ниже.";

  return `Повышенный рейтинг: за каждое место — на ${LAST_CHANCE_BONUS_PERCENT}% больше очков.`;
}

// PHOENIX and DEEP STACK deal single re-entries only, so their line names the count and
// what the game goes without: "один одинарный ре-энтри, без двойных ре-энтри и аддонов".
function describeSingleBullets(
  game: { addonEnabled: boolean; maxReentries: number; reentryEnabled: boolean },
  upTo: boolean,
) {
  if (!game.reentryEnabled) {
    return game.addonEnabled ? "без ре-энтри" : "без ре-энтри и аддонов";
  }

  const count = game.maxReentries;
  const bullets = upTo
    ? `до ${REENTRY_COUNT_GENITIVE[count - 1] ?? count} ${count === 1 ? "одинарного" : "одинарных"} ре-энтри`
    : count === 1
      ? "один одинарный ре-энтри"
      : `${count} одинарных ре-энтри`;
  const without = game.addonEnabled ? "без двойных ре-энтри" : "без двойных ре-энтри и аддонов";

  return `${bullets}, ${without}`;
}

function describeStartingStack(startingStack: number, levels: BlindLevel[]): ModeRulesStat {
  const firstBigBlind = levels.find((level) => !level.isBreak && (level.bigBlind ?? 0) > 0)?.bigBlind ?? 0;

  return {
    accent: false,
    label: "Стартовый стек",
    note: firstBigBlind > 0 ? `фишек · ${formatBigBlinds(startingStack / firstBigBlind)} BB` : "фишек",
    value: formatNumber(startingStack),
  };
}

/**
 * Where the re-entry window shuts, as the room counts it: "до второй паузы (9-й уровень)".
 *
 * Re-entries are taken until the first level flagged to close them, the break before it
 * included — and that break is where the addon is bought.
 */
function getReentryWindow(levels: BlindLevel[]) {
  const cutoffIndex = levels.findIndex((level) => !level.isBreak && level.reentryCloses);
  if (cutoffIndex <= 0) return null;

  const open = levels.slice(0, cutoffIndex);
  const lastRound = open.filter((level) => !level.isBreak).length;
  if (lastRound === 0) return null;

  const closesOnBreak = open[open.length - 1].isBreak;

  return {
    breakIndex: closesOnBreak ? cutoffIndex - 1 : null,
    breakOrdinal: closesOnBreak ? ordinalOfBreak(open.filter((level) => level.isBreak).length) : null,
    lastRound,
  };
}

function describeReentries(
  settings: TournamentExtras["settings"],
  levels: BlindLevel[],
): ModeRulesStat {
  const label = "Ре-энтри";
  if (!settings.reentryEnabled) return { accent: true, label, note: "без ре-энтри", value: "Нет" };

  const maxReentries = getMaxReentries(settings);
  const unlimited = hasUnlimitedReentries(settings.bountyType);
  const singleBulletFormat = isDoubleReentryBannedByFormat(settings.tournamentFormat);
  const doubles = !singleBulletFormat && levels.some((level) => level.doubleReentryAvailable);
  // A single-bullet format names its exact count ("3 одинарных"); every other game says
  // how far it goes ("до 3").
  const exactCount = singleBulletFormat && !unlimited;
  const value = unlimited ? "∞" : exactCount ? String(maxReentries) : `до ${maxReentries}`;
  let kind = "только одинарные";
  if (doubles) kind = "одинарные или двойные";
  else if (exactCount) kind = maxReentries === 1 ? "одинарный" : "одинарных";

  const window = getReentryWindow(levels);
  const until = window
    ? window.breakOrdinal
      ? `до ${window.breakOrdinal} паузы (${window.lastRound}-й уровень)`
      : `до конца ${window.lastRound}-го уровня`
    : null;

  return { accent: false, label, note: until ? `${kind}, ${until}` : kind, value };
}

function describeAddon(settings: TournamentExtras["settings"], levels: BlindLevel[]): ModeRulesStat {
  const label = "Аддон";
  if (!settings.addonEnabled) return { accent: true, label, note: "без аддонов", value: "Нет" };

  const chips = Math.max(0, Number(settings.addonChips) || 0);
  const window = getReentryWindow(levels);
  const breakIndex = window?.breakIndex ?? null;
  const bigBlind = breakIndex === null ? 0 : resolveEffectiveBigBlind(levels, breakIndex);
  const inBigBlinds = bigBlind > 0 && chips > 0 ? ` · ${formatBigBlinds(chips / bigBlind)} BB` : "";
  const when = window?.breakOrdinal ? `, на ${window.breakOrdinal} паузе` : "";

  return { accent: true, label, note: `фишек${inBigBlinds}${when}`, value: formatNumber(chips) };
}

function ordinalOfBreak(breakNumber: number) {
  return BREAK_ORDINALS[breakNumber - 1] ?? `${breakNumber}-й`;
}

function formatNumber(value: number) {
  return value.toLocaleString("ru-RU");
}

function formatBigBlinds(value: number) {
  return value.toLocaleString("ru-RU", { maximumFractionDigits: 1 });
}

function capitalize(text: string) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
