import "server-only";

import { revalidatePath } from "next/cache";
import { hasPublicEnv } from "@/lib/env";
import { broadcastPublicState } from "@/lib/realtime/broadcast";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  defaultTournamentExtras,
  mergeTournamentExtras,
  type TournamentExtrasPatch,
} from "@/lib/tournament-extras-shared";
import type { TournamentExtras } from "@/lib/timer/types";

export {
  defaultTournamentExtras,
  mergeTournamentExtras,
  type TournamentExtrasPatch,
} from "@/lib/tournament-extras-shared";

export async function loadTournamentExtras(tournamentId?: string): Promise<TournamentExtras> {
  if (!hasPublicEnv() || !tournamentId) {
    return defaultTournamentExtras;
  }

  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("tournament_extras")
    .select("data")
    .eq("tournament_id", tournamentId)
    .maybeSingle();

  return mergeTournamentExtras(data?.data);
}

export async function saveTournamentExtras(
  patch: TournamentExtrasPatch,
  redirectTo: string,
) {
  if (!hasPublicEnv()) {
    revalidatePath("/admin");
    revalidatePath("/screen/demo");
    return;
  }

  const supabase = await createSupabaseServerClient();
  const { data: tournament } = await supabase
    .from("tournaments")
    .select("id, public_token")
    .limit(1)
    .single();

  if (!tournament) return;

  const current = await loadTournamentExtras(tournament.id as string);
  const next = mergeTournamentExtras({
    ...current,
    ...patch,
    clientBot: { ...current.clientBot, ...patch.clientBot },
    settings: { ...current.settings, ...patch.settings },
    pts: { ...current.pts, ...patch.pts },
  });

  await supabase.from("tournament_extras").upsert({
    tournament_id: tournament.id,
    data: next,
  });

  await broadcastPublicState(tournament.public_token as string);
  revalidatePath(redirectTo);
  revalidatePath("/screen/[token]");
}
