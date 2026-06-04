"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { demoBlindLevels } from "@/lib/demo-state";
import { hasPublicEnv } from "@/lib/env";
import { broadcastPublicState } from "@/lib/realtime/broadcast";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const resetTournamentValues = {
  name: "POKER CLUB / DEMO",
  logo_url: null,
  starting_stack: 10000,
  registration_minutes: 180,
  registration_status: "open" as const,
};

export async function resetTournament() {
  if (!hasPublicEnv()) {
    redirect("/admin/settings?demo=1");
  }

  const supabase = await createSupabaseServerClient();
  const { data: tournament } = await supabase
    .from("tournaments")
    .select("id, public_token")
    .limit(1)
    .single();

  if (!tournament) redirect("/admin/settings?error=no_tournament");

  await supabase
    .from("tournaments")
    .update(resetTournamentValues)
    .eq("id", tournament.id);

  await supabase.from("blind_levels").delete().eq("tournament_id", tournament.id);
  await supabase.from("blind_levels").insert(
    demoBlindLevels.map((level) => ({
      tournament_id: tournament.id,
      level_order: level.levelOrder,
      small_blind: level.isBreak ? null : level.smallBlind,
      big_blind: level.isBreak ? null : level.bigBlind,
      ante: level.isBreak ? null : 0,
      reentry_closes: level.isBreak ? false : level.reentryCloses,
      duration_seconds: level.durationSeconds,
      is_break: level.isBreak,
      break_duration_seconds: level.isBreak ? level.breakDurationSeconds : null,
    })),
  );

  await supabase
    .from("timer_state")
    .update({
      status: "not_started",
      current_level_index: 0,
      level_started_at: null,
      paused_remaining_seconds: null,
      registration_closes_at: null,
      finished_at: null,
    })
    .eq("tournament_id", tournament.id);

  await broadcastPublicState(tournament.public_token as string);
  revalidatePath("/admin/settings");
  revalidatePath("/admin/blinds");
  revalidatePath("/admin/timer");
  redirect("/admin/settings?reset=1");
}
