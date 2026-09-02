export type ParsedGameRow = {
  knockouts: number;
  place: number;
  playerName: string;
  points: number;
};

export type ParsedMonthRow = {
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
export function parseMonthStandings(values: unknown[][]): ParsedMonthRow[] {
  const headerIndex = values.findIndex((row) =>
    findColumn(row.map((cell) => String(cell ?? "")), ["ник", "игрок", "имя"]) !== -1,
  );

  if (headerIndex === -1) return [];

  const header = values[headerIndex].map((cell) => String(cell ?? ""));
  const nameColumn = findColumn(header, ["ник", "игрок", "имя"]);
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

  if (nameColumn === -1 || pointsColumn === -1) return [];

  return values
    .slice(headerIndex + 1)
    .map((row) => ({
      knockouts: knockoutsColumn === -1 ? 0 : toNumber(row[knockoutsColumn]),
      playerName: String(row[nameColumn] ?? "").trim(),
      points: toNumber(row[pointsColumn]),
    }))
    .filter((row) => row.playerName.length > 0);
}
