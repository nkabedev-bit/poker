import { countWord } from "@/lib/raffle/raffle-scenes";
import { TIER_GAMES, TIER_TITLES, type PlayerTier } from "@/lib/players/tier";

/**
 * The plate a player stands on in the hall: a shape they pick in the mini-app and one of
 * the club's colours. Without a pick — or with a shape their tier no longer opens — the
 * board shows the plate of their tier, as it always has.
 */
export type PlateForm =
  | "button"
  | "bluff"
  | "flop"
  | "all_in"
  | "chip_leader"
  | "straight"
  | "satellite"
  | "quads"
  | "gatsby"
  | "jackpot"
  | "nuts"
  | "triumph"
  | "royal_flush"
  | "apc"
  | "apc_second";

export type PlateColor =
  | "ruby"
  | "garnet"
  | "copper"
  | "emerald"
  | "teal"
  | "sapphire"
  | "indigo"
  | "amethyst"
  | "peony"
  | "platinum";

/** What a player picked. A plate with its own art carries no colour. */
export type PlateChoice = { color: PlateColor | null; form: PlateForm };

type PlateFormInfo = {
  id: PlateForm;
  name: string;
  /** The tier that opens the shape; null for a plate of honour, given to named players. */
  tier: PlayerTier | null;
  /** A plate with its own art: the player's colour does not touch it. */
  fixedArt?: boolean;
};

/** Every shape in the order the picker shows them: by tier, plainest first. */
export const PLATE_FORMS: readonly PlateFormInfo[] = [
  { id: "button", name: "Баттон", tier: "member" },
  { id: "bluff", name: "Блеф", tier: "member" },
  { id: "flop", name: "Флоп", tier: "member" },
  { id: "all_in", name: "Олл-ин", tier: "core" },
  { id: "chip_leader", name: "Чип-лидер", tier: "core" },
  { id: "straight", name: "Стрит", tier: "core" },
  { id: "satellite", name: "Сателлит", tier: "legend" },
  { id: "quads", name: "Каре", tier: "legend" },
  { id: "gatsby", name: "Гэтсби", tier: "legend" },
  { id: "jackpot", name: "Джекпот", tier: "champion" },
  { id: "nuts", name: "Натс", tier: "champion" },
  { id: "triumph", name: "Триумф", tier: "champion" },
  { id: "royal_flush", name: "Роял-флеш", tier: "champion" },
  // Plates of honour: who holds them is kept on the server, in plate-honors.ts.
  { fixedArt: true, id: "apc", name: "APC", tier: null },
  { fixedArt: true, id: "apc_second", name: "2-ое место APC", tier: null },
];

/**
 * The club's ten colours. Gold is not among them: it belongs to the champion's own
 * plate. The plate's body takes only a sixth of the colour, so a column of players
 * stays dark and every nickname reads the same.
 */
export const PLATE_COLORS: readonly { hex: string; id: PlateColor; name: string }[] = [
  { hex: "#D2263F", id: "ruby", name: "Рубин" },
  { hex: "#B4325A", id: "garnet", name: "Гранат" },
  { hex: "#C8683E", id: "copper", name: "Медь" },
  { hex: "#23A374", id: "emerald", name: "Изумруд" },
  { hex: "#2AA3AE", id: "teal", name: "Бирюза" },
  { hex: "#3C7BE0", id: "sapphire", name: "Сапфир" },
  { hex: "#6B6EE0", id: "indigo", name: "Индиго" },
  { hex: "#9A5BD8", id: "amethyst", name: "Аметист" },
  { hex: "#CF4C8E", id: "peony", name: "Пион" },
  { hex: "#AEB6C2", id: "platinum", name: "Платина" },
];

export const DEFAULT_PLATE_COLOR: PlateColor = "ruby";

const FORMS_BY_ID = new Map(PLATE_FORMS.map((form) => [form.id, form]));
const COLORS_BY_ID = new Map(PLATE_COLORS.map((color) => [color.id, color]));
const TIER_RANK: Record<PlayerTier, number> = { champion: 4, core: 2, legend: 3, member: 1 };

export function getPlateForm(id: PlateForm) {
  return FORMS_BY_ID.get(id)!;
}

export function isPlateForm(value: unknown): value is PlateForm {
  return typeof value === "string" && FORMS_BY_ID.has(value as PlateForm);
}

export function isPlateColor(value: unknown): value is PlateColor {
  return typeof value === "string" && COLORS_BY_ID.has(value as PlateColor);
}

export function getPlateColorHex(color: PlateColor | null | undefined) {
  return COLORS_BY_ID.get(color ?? DEFAULT_PLATE_COLOR)!.hex;
}

export function getPlateColorName(color: PlateColor | null | undefined) {
  return COLORS_BY_ID.get(color ?? DEFAULT_PLATE_COLOR)!.name;
}

/**
 * A stored pick read back, or null for none. A colour that went missing falls back to
 * the club's red rather than taking the plate away; a plate with its own art never
 * keeps one.
 */
export function readPlateChoice(form: unknown, color: unknown): PlateChoice | null {
  if (!isPlateForm(form)) return null;
  if (getPlateForm(form).fixedArt) return { color: null, form };

  return { color: isPlateColor(color) ? color : DEFAULT_PLATE_COLOR, form };
}

type PlateOwner = {
  /** The plates of honour this player holds (plate-honors.ts). */
  honors: readonly PlateForm[];
  tier: PlayerTier | null;
};

/**
 * Whether this player may stand on the shape: their tier or a higher one opens it, and
 * a plate of honour is open only to the players it was given to.
 */
export function canUsePlate(form: PlateForm, { honors, tier }: PlateOwner) {
  const info = getPlateForm(form);
  if (!info.tier) return honors.includes(form);
  if (!tier) return false;

  return TIER_RANK[tier] >= TIER_RANK[info.tier];
}

/**
 * The plate the board draws for a player, or null for the plate of their tier.
 *
 * A pick their tier no longer opens is kept rather than wiped — it comes back the day
 * the tier does — but the board does not draw it meanwhile.
 */
export function resolveShownPlate(choice: PlateChoice | null, owner: PlateOwner) {
  if (!choice) return null;
  return canUsePlate(choice.form, owner) ? choice : null;
}

/**
 * What the picker says under a shape the player cannot take yet: how many games stand
 * between them and its tier, or that the club hands it out.
 */
export function describePlateLock(form: PlateForm, games: number): string {
  const info = getPlateForm(form);
  if (!info.tier) return "Только для участников";
  if (info.tier === "champion") return `Только со статусом ${TIER_TITLES.champion}`;

  const left = Math.max(1, TIER_GAMES[info.tier] - Math.max(0, Math.trunc(games)));
  return `Откроется на ${TIER_TITLES[info.tier]} — ещё ${countWord(left, ["игра", "игры", "игр"])}`;
}
