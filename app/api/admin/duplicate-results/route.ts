import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { findDuplicateResults, type StoredResultRow } from "@/lib/results/duplicate-results";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const PAGE_SIZE = 1000;
const DELETE_BATCH_SIZE = 200;

async function requireAdmin() {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getUser();

  return data.user ? supabase : null;
}

/** Every stored result, read in pages: PostgREST caps a single response at a thousand rows. */
async function readAllResults(supabase: NonNullable<Awaited<ReturnType<typeof requireAdmin>>>) {
  const rows: StoredResultRow[] = [];

  for (let page = 0; ; page += 1) {
    const { data, error } = await supabase
      .from("tournament_results")
      .select("id, started_at, player_name, place, counts_for_rating, created_at")
      .order("started_at")
      .order("id")
      .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);

    if (error) throw error;

    const batch = (data ?? []) as Array<{
      counts_for_rating: boolean | null;
      created_at: string;
      id: string;
      place: number | null;
      player_name: string;
      started_at: string;
    }>;

    rows.push(
      ...batch.map((row) => ({
        countsForRating: row.counts_for_rating !== false,
        createdAt: row.created_at,
        id: row.id,
        place: row.place,
        playerName: row.player_name,
        startedAt: row.started_at,
      })),
    );

    if (batch.length < PAGE_SIZE) return rows;
  }
}

/** What the club would lose by collapsing the duplicates — shown before anything is deleted. */
export async function GET() {
  const supabase = await requireAdmin();
  if (!supabase) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

  const groups = findDuplicateResults(await readAllResults(supabase));

  return NextResponse.json({
    groups: groups.length,
    rows: groups.reduce((total, group) => total + group.remove.length, 0),
    // Enough of the list to check the run by eye before it is run.
    sample: groups.slice(0, 20).map((group) => ({
      keptName: group.keep.playerName,
      place: group.keep.place,
      playedOn: group.keep.startedAt.slice(0, 10),
      removedNames: group.remove.map((row) => row.playerName),
    })),
  });
}

/** Collapses each evening stored twice into the row that knows most about it. */
export async function POST() {
  const supabase = await requireAdmin();
  if (!supabase) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

  const groups = findDuplicateResults(await readAllResults(supabase));
  const ids = groups.flatMap((group) => group.remove.map((row) => row.id));

  for (let offset = 0; offset < ids.length; offset += DELETE_BATCH_SIZE) {
    const { error } = await supabase
      .from("tournament_results")
      .delete()
      .in("id", ids.slice(offset, offset + DELETE_BATCH_SIZE));

    if (error) throw error;
  }

  return NextResponse.json({ groups: groups.length, rows: ids.length });
}
