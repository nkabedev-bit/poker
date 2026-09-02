export type ParsedGameRow = {
  knockouts: number;
  place: number;
  playerName: string;
  points: number;
};

export type ParsedMonthRow = {
  // What the player scored in each game night of the sheet, in column order.
  gamePoints: number[];
  knockouts: number;
  playerName: string;
  points: number;
};

const MONTH_NAMES = [
  "январ",
  "феврал",
  "март",
  "апрел",
  "май",
  "мая",
  "июн",
  "июл",
  "август",
  "сентябр",
  "октябр",
  "ноябр",
  "декабр",
];

function toNumber(value: unknown) {
  const text = String(value ?? "").trim().replace(/\s/g, "").replace(",", ".");
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Game sheets are named after the date they were played — "01/09" — and the club has
 * been keeping them for years, so the year has to be supplied from outside.
 */
export function parseGameSheetDate(sheetName: string, year: number) {
  const match = sheetName.trim().match(/^(\d{1,2})[./-](\d{1,2})(?:[./-](\d{2,4}))?$/);
  if (!match) return null;

  const day = Number(match[1]);
  const month = Number(match[2]);
  const explicitYear = match[3] ? Number(match[3].length === 2 ? `20${match[3]}` : match[3]) : null;

  if (month < 1 || month > 12 || day < 1 || day > 31) return null;

  return `${explicitYear ?? year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/**
 * Reads the standings block our own sync writes into every game sheet.
 *
 * Columns are located by their headings rather than by counting them: in mystery,
 * dealer, wanted and progressive games the block carries an extra column, and Sheets
 * trims trailing empty cells, so a header row can arrive shorter than the data below
 * it. Counting columns there silently read the side-points column as the knockout
 * count — the source of both wrong points and impossible knockout totals.
 *
 * Points are the sum of the two scoring columns: the place points in PTS plus the
 * knockout points that those modes report separately. In standard bounty the knockout
 * points are already inside PTS and the neighbouring column counts heads, not points,
 * so nothing is added there.
 */
export function parseGameStandings(values: unknown[][]): ParsedGameRow[] {
  const [header = [], ...rows] = values;
  const headings = header.map((cell) => String(cell ?? "").trim().toLocaleLowerCase("ru-RU"));
  const width = Math.max(header.length, ...rows.map((row) => row.length), 0);

  const findHeading = (match: (heading: string) => boolean) => headings.findIndex(match);

  const headCountIndex = findHeading((heading) => heading.includes("кол-во выбиваний"));
  const bountyCountIndex = findHeading((heading) => heading.includes("кол-во баунти"));
  const sidePointsIndex = findHeading(
    (heading) =>
      heading.includes("mystery") ||
      heading.includes("дилер") ||
      heading.includes("wanted") ||
      heading.includes("очки за баунти"),
  );

  // Without headings the layout is inferred from the width: five columns mean the wide
  // block, where the knockout count is last and the column before it holds points.
  const knockoutsIndex =
    headCountIndex !== -1
      ? headCountIndex
      : bountyCountIndex !== -1
        ? bountyCountIndex
        : width >= 5
          ? 4
          : 3;
  const extraPointsIndex = sidePointsIndex !== -1 ? sidePointsIndex : width >= 5 ? 3 : -1;

  return rows
    .map((row) => ({
      knockouts: toNumber(row[knockoutsIndex]),
      place: toNumber(row[0]),
      playerName: String(row[1] ?? "").trim(),
      points:
        toNumber(row[2]) + (extraPointsIndex === -1 ? 0 : toNumber(row[extraPointsIndex])),
    }))
    .filter((row) => row.place > 0 && row.playerName.length > 0);
}

/** "СЕНТЯБРЬ", "Август 2026" — a month sheet; "система рейтинга", "VIP LEAGUE" — not. */
export function isMonthSheetName(sheetName: string) {
  const name = sheetName.trim().toLocaleLowerCase("ru-RU");
  if (!name) return false;

  return (
    name.includes("сезон") ||
    MONTH_NAMES.some((month) => name.includes(month)) ||
    /\b\d{1,2}[./-]\d{4}\b/.test(name) ||
    /\b\d{4}[./-]\d{1,2}\b/.test(name)
  );
}

export type SheetPeriod = {
  coveredMonths: string[];
  key: string;
  label: string;
};

/** Every month mentioned in a sheet title, in the order they appear. */
function findMentionedMonths(name: string, fallbackYear: number) {
  const year = name.match(/(\d{4})/)?.[1] ?? String(fallbackYear);
  const months: string[] = [];

  MONTH_NAMES.forEach((monthName, index) => {
    if (!name.includes(monthName)) return;

    // "мая" is the same month as "май" and shares its slot in the calendar.
    const month = index >= 5 ? index : index + 1;
    const key = `${year}-${String(month).padStart(2, "0")}`;
    if (!months.includes(key)) months.push(key);
  });

  return months;
}

/**
 * What period a rating sheet describes.
 *
 * Most sheets are a calendar month. The club's first two seasons, though, ran across
 * two months and are titled accordingly ("Сезон 1 (март-апрель)") — reading only the
 * first month name would file a season under March and lose the season entirely.
 */
export function parseSheetPeriod(sheetName: string, fallbackYear: number): SheetPeriod | null {
  const name = sheetName.trim().toLocaleLowerCase("ru-RU");
  const season = name.match(/сезон\s*(\d+)/);

  if (season) {
    const covered = findMentionedMonths(name, fallbackYear);

    return {
      coveredMonths: covered,
      key: `season-${season[1]}`,
      label: `Сезон ${season[1]}`,
    };
  }

  const month = parseMonthSheetKey(sheetName, fallbackYear);
  if (!month) return null;

  return { coveredMonths: [month], key: month, label: sheetName.trim() };
}

export function parseMonthSheetKey(sheetName: string, fallbackYear: number) {
  const name = sheetName.trim().toLocaleLowerCase("ru-RU");

  const numeric = name.match(/(\d{1,2})[./-](\d{4})/) ?? null;
  if (numeric) return `${numeric[2]}-${String(Number(numeric[1])).padStart(2, "0")}`;

  const reversed = name.match(/(\d{4})[./-](\d{1,2})/) ?? null;
  if (reversed) return `${reversed[1]}-${String(Number(reversed[2])).padStart(2, "0")}`;

  const index = MONTH_NAMES.findIndex((month) => name.includes(month));
  if (index === -1) return null;

  // "мая" is the same month as "май" and shares its slot in the calendar.
  const month = index >= 5 ? index : index + 1;
  const year = name.match(/(\d{4})/)?.[1] ?? String(fallbackYear);

  return `${year}-${String(month).padStart(2, "0")}`;
}

/** "5.3.26", "22.03.26" — a game night; "Итоговая сумма", "БАУНТИ" — not. */
function isGameDateHeading(heading: string) {
  return /^\d{1,2}[.\-/]\d{1,2}([.\-/]\d{2,4})?$/.test(heading.trim());
}

function findColumn(header: string[], keywords: string[]) {
  return header.findIndex((cell) => {
    const text = cell.trim().toLocaleLowerCase("ru-RU");
    return keywords.some((keyword) => text.includes(keyword));
  });
}

/**
 * The club's own rating sheets are hand-made, so the columns are found by their
 * headings rather than by position: nickname, points and knockouts under whatever
 * names they were given.
 */
/**
 * Scores a sheet's rows under a season's rule.
 *
 * The club's sheets carry a column per game night and a running total of all of them,
 * while a season is scored on a player's best few games — the two disagree, and only
 * the per-night columns can produce the figure the club published.
 */
export function scoreMonthRows(rows: ParsedMonthRow[], countedGames: number | null) {
  if (countedGames === null) return rows;

  return rows.map((row) => ({
    ...row,
    points: Number(
      [...row.gamePoints]
        .sort((a, b) => b - a)
        .slice(0, countedGames)
        .reduce((total, points) => total + points, 0)
        .toFixed(2),
    ),
  }));
}

export function findMonthSheetHeaders(values: unknown[][]): string[] {
  const headerIndex = values.findIndex((row) =>
    findColumn(row.map((cell) => String(cell ?? "")), ["ник", "игрок", "имя"]) !== -1,
  );

  if (headerIndex === -1) return [];

  return values[headerIndex].map((cell) => String(cell ?? "").trim());
}

/**
 * @param pointsHeading exact heading to score by, when the automatic choice is wrong.
 *   A club sheet often carries both a running total of every game and the figure that
 *   actually counted; only the club knows which is which.
 */
export function parseMonthStandings(
  values: unknown[][],
  pointsHeading?: string,
): ParsedMonthRow[] {
  const headerIndex = values.findIndex((row) =>
    findColumn(row.map((cell) => String(cell ?? "")), ["ник", "игрок", "имя"]) !== -1,
  );

  if (headerIndex === -1) return [];

  const header = values[headerIndex].map((cell) => String(cell ?? ""));
  const nameColumn = findColumn(header, ["ник", "игрок", "имя"]);
  const chosenColumn = pointsHeading
    ? header.findIndex((cell) => cell.trim() === pointsHeading.trim())
    : -1;
  // The club names this column differently from sheet to sheet: "Очки", "Рейтинг",
  // "Итоговая сумма". Anything that reads as a total counts.
  const pointsColumn = findColumn(header, [
    "очк",
    "рейтинг",
    "pts",
    "балл",
    "итог",
    "сумм",
    "total",
  ]);
  const knockoutsColumn = findColumn(header, ["нокаут", "выбива", "баунти"]);

  const scoreColumn = chosenColumn !== -1 ? chosenColumn : pointsColumn;

  if (nameColumn === -1 || scoreColumn === -1) return [];

  // The columns of individual game nights, kept so a season's own scoring rule — the
  // best five games, say — can be applied instead of trusting a running total.
  const gameColumns = header
    .map((heading, index) => ({ heading, index }))
    .filter((column) => isGameDateHeading(column.heading))
    .map((column) => column.index);

  return values
    .slice(headerIndex + 1)
    .map((row) => ({
      gamePoints: gameColumns.map((index) => toNumber(row[index])).filter((points) => points > 0),
      knockouts: knockoutsColumn === -1 ? 0 : toNumber(row[knockoutsColumn]),
      playerName: String(row[nameColumn] ?? "").trim(),
      points: toNumber(row[scoreColumn]),
    }))
    .filter((row) => row.playerName.length > 0);
}
