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

  const year = Number(new URL(request.url).searchParams.get("year")) || new Date().getFullYear();

  try {
    const [games, monthsResult] = await Promise.all([readGames(year), readMonths(year)]);
    const months = monthsResult.months;

    return NextResponse.json({
      games: games.map((game) => ({
        players: game.rows.length,
        playedOn: game.playedOn,
        sample: game.rows.slice(0, 3),
        sheetName: game.sheetName,
      })),
      months: months.map((month) => ({
        label: month.label,
        month: month.month,
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

  try {
    const [games, monthsResult] = await Promise.all([readGames(year), readMonths(year)]);
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

    const monthRows = months
      .filter((month) => !skipped.has(month.sheetName))
      .flatMap((month) =>
      month.rows.map((row) => ({
        covered_months: month.coveredMonths,
        knockouts: row.knockouts,
        label: month.label,
        month: month.month,
        player_name: row.playerName,
        points: row.points,
        sort_key: month.coveredMonths[0] ?? month.month,
        source_sheet: month.sheetName,
      })),
    );

    if (monthRows.length > 0) {
      const { error } = await supabase
        .from("monthly_rating_archive")
        .upsert(monthRows, { onConflict: "month,player_name" });

      if (error) throw error;
    }

    // A season replaces the months it spans: an earlier import may have filed those
    // months separately, and leaving them behind offers the same games twice.
    const monthsInsideSeasons = months
      .filter((month) => !/^\d{4}-\d{2}$/.test(month.month))
      .flatMap((month) => month.coveredMonths);

    if (monthsInsideSeasons.length > 0) {
      const { error } = await supabase
        .from("monthly_rating_archive")
        .delete()
        .in("month", monthsInsideSeasons);

      if (error) throw error;
    }

    return NextResponse.json({
      games: games.filter((game) => !skipped.has(game.sheetName)).length,
      gameRows: gameRows.length,
      months: months.filter((month) => !skipped.has(month.sheetName)).length,
      monthRows: monthRows.length,
    });
  } catch (error) {
    console.error("History import failed", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Импорт не удался" },
      { status: 502 },
    );
  }
}
