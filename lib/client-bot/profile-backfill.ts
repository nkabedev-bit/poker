import { buildNicknameKey } from "@/lib/players/nickname-key";
import { formatClientBotBirthDateForSheet } from "@/lib/client-bot/registration";

/** Where the questionnaire sheet keeps each answer. */
const NICKNAME_COLUMN = 4;
const BIRTH_DATE_COLUMN = 6;
const PHONE_COLUMN = 5;
const FULL_NAME_COLUMN = 3;

export type SheetProfile = {
  /** Day and month, as the sheet keeps them — the year was never written down. */
  birthDate: string;
  fullName: string;
  nicknameKey: string;
  phone: string;
};

/**
 * The questionnaires the club filled in before the form moved into the app.
 *
 * Those went straight to the spreadsheet, so the account row knows nothing about them —
 * which is why a player whose answers are plainly in the sheet was told the club has no
 * date of birth for them, and could not claim their own profile on the web.
 *
 * A nickname the sheet holds twice keeps the first questionnaire: it is the one the
 * club has been playing under.
 */
export function readSheetProfiles(grid: string[][]): SheetProfile[] {
  const seen = new Set<string>();
  const profiles: SheetProfile[] = [];

  for (let row = 1; row < grid.length; row += 1) {
    const nicknameKey = buildNicknameKey(String(grid[row]?.[NICKNAME_COLUMN] ?? ""));
    if (!nicknameKey || seen.has(nicknameKey)) continue;

    // A cell the spreadsheet mangled into something else — a time, a stray number — is
    // no date, and a profile without one is no use here.
    const birthDate = formatClientBotBirthDateForSheet(
      String(grid[row]?.[BIRTH_DATE_COLUMN] ?? ""),
    );
    if (!/^\d{2}\.\d{2}$/.test(birthDate)) continue;

    seen.add(nicknameKey);
    profiles.push({
      birthDate,
      fullName: String(grid[row]?.[FULL_NAME_COLUMN] ?? "").trim(),
      nicknameKey,
      phone: String(grid[row]?.[PHONE_COLUMN] ?? "").trim(),
    });
  }

  return profiles;
}
