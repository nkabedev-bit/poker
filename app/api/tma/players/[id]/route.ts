import { NextResponse } from "next/server";
import { requireTmaAuth } from "@/lib/tma/require-auth";
import { loadTournamentExtras, saveTournamentExtras } from "@/lib/tournament-extras";
import type { TournamentPlayer } from "@/lib/timer/types";

function getAddonChips(value: unknown) {
  const chips = Number(value);
  return Number.isInteger(chips) && chips > 0 ? chips : null;
}

function getTableNumber(value: unknown) {
  const tableNumber = Number(value);
  return Number.isInteger(tableNumber) && tableNumber > 0 ? tableNumber : null;
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireTmaAuth(request);
  if (auth.error) return auth.error;

  const { data: t } = await auth.supabase
    .from("tournaments")
    .select("id")
    .limit(1)
    .single();

  if (!t) return NextResponse.json({ error: "No tournament" }, { status: 404 });

  const id = (await params).id;
  const extras = await loadTournamentExtras(t.id);
  const filtered = extras.players.filter((p) => p.id !== id);

  await saveTournamentExtras({ players: filtered }, "/tma/players");

  return new NextResponse(null, { status: 204 });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireTmaAuth(request);
  if (auth.error) return auth.error;

  const { data: t } = await auth.supabase
    .from("tournaments")
    .select("id")
    .limit(1)
    .single();

  if (!t) return NextResponse.json({ error: "No tournament" }, { status: 404 });

  const body = await request.json();
  const action = String(body.action ?? "");

  const id = (await params).id;
  const extras = await loadTournamentExtras(t.id);

  if (action === "move_table") {
    const tableNumber = getTableNumber(body.table);
    const tablesCount = Math.max(1, Number(extras.settings.tablesCount ?? 1));
    if (!tableNumber || tableNumber > tablesCount) {
      return NextResponse.json({ error: "Invalid table number" }, { status: 400 });
    }

    let updatedPlayer: TournamentPlayer | null = null;
    const players = extras.players.map((player) => {
      if (player.id !== id) return player;

      updatedPlayer = {
        ...player,
        table: tableNumber,
      };
      return updatedPlayer;
    });

    if (!updatedPlayer) {
      return NextResponse.json({ error: "Player not found" }, { status: 404 });
    }

    await saveTournamentExtras({ players }, "/tma/players");

    return NextResponse.json({ player: updatedPlayer });
  }

  if (action !== "add_addon") {
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }

  const chips = getAddonChips(body.chips);
  if (!chips) {
    return NextResponse.json({ error: "Chips must be positive integer" }, { status: 400 });
  }

  if (!extras.settings.addonEnabled) {
    return NextResponse.json({ error: "Addons disabled" }, { status: 400 });
  }

  const maxAddons = Math.max(1, Number(extras.settings.maxAddons ?? 1));
  let updatedPlayer: TournamentPlayer | null = null;
  const players = extras.players.map((player) => {
    if (player.id !== id) return player;

    const addons = Math.max(0, Number(player.addons ?? 0));
    if (addons >= maxAddons) return player;

    updatedPlayer = {
      ...player,
      addons: addons + 1,
      addonChipsTotal: Math.max(0, Number(player.addonChipsTotal ?? 0)) + chips,
      stack: Math.max(0, Number(player.stack ?? 0)) + chips,
    };
    return updatedPlayer;
  });

  if (!updatedPlayer) {
    const exists = extras.players.some((player) => player.id === id);
    return NextResponse.json(
      { error: exists ? "Addon limit reached" : "Player not found" },
      { status: exists ? 409 : 404 },
    );
  }

  await saveTournamentExtras({ players }, "/tma/players");

  return NextResponse.json({ player: updatedPlayer });
}
