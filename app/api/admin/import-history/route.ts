import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { readGames, readMonths } from "@/lib/sheets-import/reader";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

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

    if (gameRows.length > 0) {
      const { error } = await supabase
        .from("tournament_results")
        .upsert(gameRows, { onConflict: "started_at,player_name" });

      if (error) throw error;
    }

    // Imported periods become closed seasons directly. Going through an intermediate
    // archive table meant a sheet fixed after the migration never became a season at
    // all — which is exactly how June went missing.
    const importedPeriods = months.filter((month) => !skipped.has(month.sheetName));
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


    return NextResponse.json({
      games: games.filter((game) => !skipped.has(game.sheetName)).length,
      gameRows: gameRows.length,
      months: importedPeriods.length,
      monthRows: seasonRows,
    });
  } catch (error) {
    console.error("History import failed", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Импорт не удался" },
      { status: 502 },
    );
  }
}
