import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { broadcastPublicState } from "@/lib/realtime/broadcast";
import {
  mergeTournamentExtras,
  type TournamentExtrasPatch,
} from "@/lib/tournament-extras-shared";
import type { TournamentExtras } from "@/lib/timer/types";

export type CurrentTournamentContext = {
  extras: TournamentExtras;
  tournament: {
    id: string;
    public_token: string;
    starting_stack: number;
  };
};

export async function loadCurrentTournamentContext(
  supabase: SupabaseClient,
): Promise<CurrentTournamentContext | null> {
  const { data: tournament } = await supabase
    .from("tournaments")
    .select("id, public_token, starting_stack")
    .limit(1)
    .single();

  if (!tournament) return null;

  const { data: extrasRow } = await supabase
    .from("tournament_extras")
    .select("data")
    .eq("tournament_id", tournament.id)
    .maybeSingle();

  return {
    extras: mergeTournamentExtras(extrasRow?.data),
    tournament: tournament as CurrentTournamentContext["tournament"],
  };
}

export async function saveTournamentExtrasFromContext(
  supabase: SupabaseClient,
  context: CurrentTournamentContext,
  patch: TournamentExtrasPatch,
) {
  const next = mergeTournamentExtras({
    ...context.extras,
    ...patch,
    clientBot: { ...context.extras.clientBot, ...patch.clientBot },
    pts: { ...context.extras.pts, ...patch.pts },
    settings: { ...context.extras.settings, ...patch.settings },
  });

  await supabase.from("tournament_extras").upsert({
    data: next,
    tournament_id: context.tournament.id,
  });

  await broadcastPublicState(context.tournament.public_token);

  return next;
}
