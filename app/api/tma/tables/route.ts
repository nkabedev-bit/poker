import { NextResponse } from "next/server";
import { requireTmaAuth } from "@/lib/tma/require-auth";
import { loadTournamentExtras } from "@/lib/tournament-extras";
import {
  nameSeat,
  nextTableFormat,
  previousTableFormat,
  readTableFormats,
  seatsRemovedBetween,
} from "@/lib/tables/seating";

export const dynamic = "force-dynamic";

/** The function is applied by hand, so a deploy can land before it exists. */
function isMissingRpc(error: unknown) {
  if (!error || typeof error !== "object") return false;

  const { code, message } = error as { code?: unknown; message?: unknown };
  return code === "PGRST202" || String(message ?? "").includes("set_table_format");
}

/**
 * Brings a chair to a table, or takes one away, while the room is being seated.
 *
 * Late players used to send the admin back to the settings to change the seats of every
 * table at once. A table goes up a format at a time — six, seven, nine, ten — and back
 * down only while the chairs it loses are empty. The change is written under the
 * tournament's row lock and touches nothing but the formats, so a player being seated in
 * the same second is not written over.
 */
export async function POST(request: Request) {
  const auth = await requireTmaAuth(request);
  if (auth.error) return auth.error;

  const { data: t } = await auth.supabase.from("tournaments").select("id").limit(1).single();
  if (!t) return NextResponse.json({ error: "No tournament" }, { status: 404 });

  const body = await request.json().catch(() => ({}));
  const table = Number(body.table);
  const direction = body.direction;

  if (direction !== "add" && direction !== "remove") {
    return NextResponse.json({ error: "Добавить место или убрать?" }, { status: 400 });
  }

  const extras = await loadTournamentExtras(t.id, auth.supabase);
  const tablesCount = Math.max(1, Number(extras.settings.tablesCount ?? 1));

  if (!Number.isInteger(table) || table < 1 || table > tablesCount) {
    return NextResponse.json({ error: "Выберите номер стола" }, { status: 400 });
  }

  const formats = readTableFormats(
    extras.settings.maxPlayersPerTable,
    extras.tableFormats,
    tablesCount,
  );
  const current = formats[table - 1];
  const target = direction === "add" ? nextTableFormat(current) : previousTableFormat(current);

  if (target === null) {
    return NextResponse.json(
      {
        error:
          direction === "add"
            ? `За столом ${table} уже 10 мест`
            : `За столом ${table} меньше мест не сделать`,
      },
      { status: 409 },
    );
  }

  const { data, error } = await auth.supabase.rpc("set_table_format", {
    p_format: target,
    p_removed_seats: direction === "add" ? [] : seatsRemovedBetween(current, target),
    p_table: table,
    p_tournament_id: t.id,
  });

  if (error) {
    if (isMissingRpc(error)) {
      return NextResponse.json(
        {
          error:
            "Добавлять и убирать места можно будет после SQL-миграции 202609140004 — выполните её в Supabase",
        },
        { status: 503 },
      );
    }

    // The database names the chair and whoever is in it, and so does the admin's screen.
    const taken = String(error.message ?? "").match(/Seat (\d+) is taken by (.+)$/);
    if (taken) {
      return NextResponse.json(
        {
          error: `Место ${nameSeat(formats, table, Number(taken[1]))} занято: ${taken[2].trim()}. Сначала пересадите игрока`,
        },
        { status: 409 },
      );
    }

    throw error;
  }

  return NextResponse.json({
    tableFormats: readTableFormats(extras.settings.maxPlayersPerTable, data, tablesCount),
  });
}
