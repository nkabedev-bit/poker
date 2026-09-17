import { buildNicknameKey } from "@/lib/players/nickname-key";

/**
 * Nicknames the club wrote more than one way for the same person.
 *
 * `buildNicknameKey` already makes "Kabedev" and "kabedev" one player: case, spaces and
 * punctuation are dropped. What it cannot know is that "Trusty_box" became "Trusty", that
 * "Superman (win season 1)" is Superman with a title stuck on, or that "Dj1git" is a typo
 * of "Djig1t" — the keys differ, so the club's own history counted them as separate
 * people.
 *
 * Confirmed by the owner 18.09.2026 against the full attendance list. Left apart on
 * purpose: "Dan" / "Danyazver" and "Mark" / "Mark II" are different players.
 *
 * A list of specific people rather than a setting, because it is read once at the desk's
 * request and edited a few times a year — the same reason the venue owner's free play is a
 * constant in the code.
 */
const NICKNAME_MERGES: Record<string, string> = {
  javmazz: "javmaz",
  leshkaaaaaa: "leshkaaa",
  supermanwinseason1: "superman",
  trustybox: "trusty",
  юрец: "юрец67тузовски",
  dj1git: "djig1t",
  adasmasher: "adamsmasher",
  pattuson: "patusson",
  patison: "patusson",
  mudriu777: "mudriy777",
  mudriy2407: "mudriy777",
  fёdor: "fedor",
  егорий: "egoriy",
  // Izya became Олюшка in the database on 14.09.2026; "lzya" is the nickname typed with a
  // lowercase L, and those evenings belong to the same player.
  lzya: "олюшка",
  маркii: "markii",
  mgmark: "markii",
  mgazb: "markii",
  // Renames already applied to the database (scratch/chura-rename.sql,
  // scratch/izya-rename.sql). Harmless now, and the only thing standing between the club
  // and a split history if the Google Sheets import — whose sheets still carry the old
  // nicknames — is ever run again.
  mrfish: "chura",
  izya: "олюшка",
};

/**
 * The key the club counts a player under: their own, unless the nickname is one of the
 * spellings above.
 */
export function canonicalNicknameKey(nickname: string) {
  const key = buildNicknameKey(nickname);

  return NICKNAME_MERGES[key] ?? key;
}

/** Same, for a key the database already computed (`player_key`, `nickname_key`). */
export function canonicalKeyOf(playerKey: string) {
  return NICKNAME_MERGES[playerKey] ?? playerKey;
}
