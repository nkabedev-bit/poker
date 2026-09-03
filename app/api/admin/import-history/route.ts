import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { readGames, readMonths } from "@/lib/sheets-import/reader";
import { resolveGameNightDate } from "@/lib/sheets-import/parse-sheets";
import { buildNicknameKey } from "@/lib/players/nickname-key";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const NIGHT_BATCH_SIZE = 500;
const NIGHT_DATE_BATCH_SIZE = 100;

/**
 * How the club already spells each player of these evenings, keyed by evening and
 * nickname key — so an import writes over the row it means to.
 */
async function readStoredNames(
  supabase: NonNullable<Awaited<ReturnType<typeof requireAdmin>>>,
  startedAt: string[],
) {
  const names = new Map<string, string>();
  const moments = [...new Set(startedAt)];

  for (let offset = 0; offset < moments.length; offset += NIGHT_DATE_BATCH_SIZE) {
    const { data, error } = await supabase
      .from("tournament_results")
      .select("started_at, player_name")
      .in("started_at", moments.slice(offset, offset + NIGHT_DATE_BATCH_SIZE));

    if (error) throw error;

    for (const row of (data ?? []) as Array<{ player_name: string; started_at: string }>) {
      names.set(storedNameKey(row.started_at, row.player_name), row.player_name);
    }
  }

  return names;
}

/**
 * Postgres hands a timestamp back as "+00:00" while the import writes "Z", so both
 * sides of the key go through one format.
 */
function storedNameKey(startedAt: string, playerName: string) {
  return `${new Date(startedAt).toISOString()}|${buildNicknameKey(playerName)}`;
}

async function requireAdmin() {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getUser();

  return data.user ? supabase : null;
}

/**
 * Preview of what the club's spreadsheets hold, so the import can be checked before it
 * writes anything: which sheets were recognised, how they were dated and how many rows
 * came out of each.
 */
export async function GET(request: Request) {
  const supabase = await requireAdmin();
  if (!supabase) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

  const url = new URL(request.url);
  const year = Number(url.searchParams.get("year")) || new Date().getFullYear();
  const pointsHeadings = JSON.parse(url.searchParams.get("points") ?? "{}") as Record<string, string>;
  const countedGames = JSON.parse(url.searchParams.get("counted") ?? "{}") as Record<
    string,
    number | null
  >;

  try {
    const [games, monthsResult] = await Promise.all([
      readGames(year),
      readMonths(year, pointsHeadings, countedGames),
    ]);
    const months = monthsResult.months;

    return NextResponse.json({
      games: games.map((game) => ({
        players: game.rows.length,
        playedOn: game.playedOn,
        sample: game.rows.slice(0, 3),
        sheetName: game.sheetName,
      })),
      months: months.map((month) => ({
        headers: month.headers,
        label: month.label,
        month: month.month,
        pointsHeading: month.pointsHeading,
        players: month.rows.length,
        sample: month.rows.slice(0, 3),
        sheetName: month.sheetName,
      })),
      // Sheets that were read but produced nothing, with the reason — otherwise a
      // spreadsheet that fails to parse just looks empty.
      skippedMonths: monthsResult.skipped,
      year,
    });
  } catch (error) {
    console.error("History preview failed", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Не удалось прочитать таблицы" },
      { status: 502 },
    );
  }
}

/** Writes the preview into the database: games as results, months as archive rows. */
export async function POST(request: Request) {
  const supabase = await requireAdmin();
  if (!supabase) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const year = Number(body.year) || new Date().getFullYear();
  // Sheet names the admin unticked in the preview: skipped entirely, or imported as a
  // fun game that stays in the players' history without touching the standings.
  const skipped = new Set<string>(Array.isArray(body.skip) ? body.skip.map(String) : []);
  const funGames = new Set<string>(Array.isArray(body.fun) ? body.fun.map(String) : []);
  // Which column of a sheet holds the score that counted, when the automatic pick is
  // wrong: a club sheet often carries both a running total and the scoring figure.
  const pointsHeadings = (body.points ?? {}) as Record<string, string>;
  // How many of a player's best game nights a sheet counts, per sheet.
  const countedGames = (body.counted ?? {}) as Record<string, number | null>;

  try {
    const [games, monthsResult] = await Promise.all([
      readGames(year),
      readMonths(year, pointsHeadings, countedGames),
    ]);
    const months = monthsResult.months;

    // Imported games carry midday as their start time: the sheets keep the date only,
    // and a fixed hour keeps two imports from producing two copies of one evening.
    const gameRows = games
      .filter((game) => !skipped.has(game.sheetName))
      .flatMap((game) =>
      game.rows.map((row) => ({
        counts_for_rating: !funGames.has(game.sheetName),
        knockouts: row.knockouts,
        place: row.place,
        played_on: game.playedOn,
        player_name: row.playerName,
        points: row.points,
        source: "import",
        started_at: `${game.playedOn}T12:00:00.000Z`,
        title: `Игра ${game.sheetName}`,
      })),
    );

    // A re-import must correct the evening it already stored, not add a second copy of
    // it: the club spells a nickname differently from sheet to sheet, and the table's
    // unique constraint compares the text. Rows already stored for these evenings lend
    // their spelling to whatever matches by key.
    const storedNames = await readStoredNames(
      supabase,
      gameRows.map((row) => row.started_at),
    );

    const alignedGameRows = gameRows.map((row) => ({
      ...row,
      player_name: storedNames.get(storedNameKey(row.started_at, row.player_name)) ?? row.player_name,
    }));

    for (let offset = 0; offset < alignedGameRows.length; offset += NIGHT_BATCH_SIZE) {
      const { error } = await supabase
        .from("tournament_results")
        .upsert(alignedGameRows.slice(offset, offset + NIGHT_BATCH_SIZE), {
          onConflict: "started_at,player_name",
        });

      if (error) throw error;
    }

    // Imported periods become closed seasons directly. Going through an intermediate
    // archive table meant a sheet fixed after the migration never became a season at
    // all — which is exactly how June went missing.
    const importedPeriods = months.filter((month) => !skipped.has(month.sheetName));
    const seasonIdBySheet = new Map<string, string>();
    let seasonRows = 0;

    for (const period of importedPeriods) {
      const covered = period.coveredMonths.length
        ? [...period.coveredMonths].sort()
        : [period.month];
      const [lastYear, lastMonth] = covered[covered.length - 1].split("-").map(Number);

      const { data: existing } = await supabase
        .from("seasons")
        .select("id")
        .eq("title", period.label)
        .maybeSingle();

      let seasonId = (existing as { id: string } | null)?.id ?? null;

      if (seasonId) {
        // Keep the rule on record even for a season that already exists, so the admin
        // screen shows what the imported table was scored by.
        await supabase
          .from("seasons")
          .update({ counted_games: period.countedGames })
          .eq("id", seasonId);
      }

      if (!seasonId) {
        const { data: created, error } = await supabase
          .from("seasons")
          .insert({
            closed_at: new Date().toISOString(),
            counted_games: period.countedGames,
            // Last day of the final month the period spans.
            ends_on: new Date(Date.UTC(lastYear, lastMonth, 0)).toISOString().slice(0, 10),
            starts_on: `${covered[0]}-01`,
            status: "closed",
            title: period.label,
          })
          .select("id")
          .single();

        if (error) throw error;
        seasonId = (created as { id: string }).id;
      }

      seasonIdBySheet.set(period.sheetName, seasonId);

      // The sheet is the source of truth for an imported season, so its table replaces
      // whatever was there — a re-import corrects rather than duplicates.
      const { error: clearError } = await supabase
        .from("season_standings")
        .delete()
        .eq("season_id", seasonId);

      if (clearError) throw clearError;

      const standings = [...period.rows]
        .sort((a, b) => b.points - a.points)
        .map((row, index) => ({
          games: 0,
          knockouts: row.knockouts,
          place: index + 1,
          player_name: row.playerName,
          points: row.points,
          season_id: seasonId,
        }));

      if (standings.length > 0) {
        const { error } = await supabase.from("season_standings").insert(standings);
        if (error) throw error;
        seasonRows += standings.length;
      }
    }


    // The club's oldest seasons were never kept as game sheets — only as a monthly
    // table with a column per evening. Those columns are the only record that a player
    // was in the room that night, so each scored cell becomes a game of its own and the
    // profile counts it. Nights already imported from a game sheet win: `ignoreDuplicates`
    // leaves their place and knockouts untouched.
    const nights = importedPeriods.flatMap((month) =>
      month.rows.flatMap((row) =>
        row.gameNights.flatMap((night) => {
          const playedOn = resolveGameNightDate(night.heading, month.coveredMonths, year);
          if (!playedOn) return [];

          return [{
            // The season's table was frozen from the sheet itself, so these games must
            // not be scored a second time — they are here to be counted and listed.
            counts_for_rating: false,
            // The monthly table knows the score of the evening and nothing else: no
            // finishing place, no knockouts. Those stay empty rather than invented.
            knockouts: 0,
            place: null,
            played_on: playedOn,
            player_name: row.playerName,
            points: night.points,
            season_id: seasonIdBySheet.get(month.sheetName) ?? null,
            source: "import",
            started_at: `${playedOn}T12:00:00.000Z`,
            title: `Игра ${playedOn.split("-").reverse().join(".")}`,
          }];
        }),
      ),
    );

    // A season sheet and a month sheet can both carry the same evening, so one row per
    // player per evening survives. The club writes a nickname as it pleases — "kabedev",
    // "Kabedev", "adam_smasher", "ADAM SMASHER" — and all of those are one player.
    const nightKey = (playedOn: string, playerName: string) =>
      `${playedOn}|${buildNicknameKey(playerName)}`;

    const uniqueNights = [
      ...new Map(
        nights.map((night) => [nightKey(night.played_on, night.player_name), night]),
      ).values(),
    ];

    // An evening the club already has — imported from its own game sheet, or played in
    // the app — keeps its place and knockouts. Only the nights nothing knows about are
    // restored from the monthly columns.
    const known = new Set<string>();
    const nightDates = [...new Set(uniqueNights.map((night) => night.played_on))];

    for (let offset = 0; offset < nightDates.length; offset += NIGHT_DATE_BATCH_SIZE) {
      const { data, error } = await supabase
        .from("tournament_results")
        .select("played_on, player_name")
        .in("played_on", nightDates.slice(offset, offset + NIGHT_DATE_BATCH_SIZE));

      if (error) throw error;

      for (const row of (data ?? []) as Array<{ played_on: string; player_name: string }>) {
        known.add(nightKey(row.played_on, row.player_name));
      }
    }

    const nightRows = uniqueNights.filter(
      (night) => !known.has(nightKey(night.played_on, night.player_name)),
    );

    // Years of evenings across every player add up to thousands of rows, and one
    // request that large times out before it is written.
    for (let offset = 0; offset < nightRows.length; offset += NIGHT_BATCH_SIZE) {
      const { error } = await supabase
        .from("tournament_results")
        .upsert(nightRows.slice(offset, offset + NIGHT_BATCH_SIZE), {
          ignoreDuplicates: true,
          onConflict: "started_at,player_name",
        });

      if (error) throw error;
    }

    return NextResponse.json({
      games: games.filter((game) => !skipped.has(game.sheetName)).length,
      gameRows: gameRows.length,
      months: importedPeriods.length,
      monthRows: seasonRows,
      nightRows: nightRows.length,
    });
  } catch (error) {
    console.error("History import failed", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Импорт не удался" },
      { status: 502 },
    );
  }
}
