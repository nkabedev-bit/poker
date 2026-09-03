/**
 * The club's own idea of "the same player".
 *
 * A nickname is written differently wherever it is typed — "Kabedev" in a monthly
 * table, "kabedev" in a game sheet, "adam_smasher" and "ADAM SMASHER" in two seasons.
 * They are one person, so everything but letters and digits is dropped and the rest is
 * lower-cased.
 *
 * The database computes the same key in a generated column (202609030001), and the two
 * must stay in step: the expression there mirrors this one character for character.
 */
export function buildNicknameKey(value: string) {
  return value.toLocaleLowerCase("ru-RU").replace(/[^a-z0-9а-яё]/g, "");
}
