import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { z } from "zod";
import { hasPublicEnv } from "@/lib/env";
import { broadcastPublicState } from "@/lib/realtime/broadcast";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const importSchema = z.object({
  tournament: z.object({
    name: z.string().trim().min(1).max(80),
    logoUrl: z.string().url().nullable().optional(),
    startingStack: z.number().int().positive(),
    registrationMinutes: z.number().int().min(0).max(1440),
    registrationStatus: z.enum(["open", "closed"]).optional(),
  }),
  timerState: z.object({
    status: z.enum(["not_started", "running", "paused", "break", "finished"]).optional(),
    currentLevelIndex: z.number().int().min(0).optional(),
    levelStartedAt: z.string().nullable().optional(),
    pausedRemainingSeconds: z.number().int().min(0).nullable().optional(),
    registrationClosesAt: z.string().nullable().optional(),
    finishedAt: z.string().nullable().optional(),
  }).optional(),
  blindLevels: z.array(z.object({
    levelOrder: z.number().int().positive(),
    smallBlind: z.number().int().positive().nullable(),
    bigBlind: z.number().int().positive().nullable(),
    ante: z.number().int().nonnegative().nullable(),
    reentryCloses: z.boolean().default(false),
    durationSeconds: z.number().int().positive(),
    isBreak: z.boolean(),
    breakDurationSeconds: z.number().int().positive().nullable(),
  })).min(1),
});

function normalizeImportedLevels(levels: z.infer<typeof importSchema>["blindLevels"]) {
  let cutoffUsed = false;

  return levels.map((level) => {
    const reentryCloses = !level.isBreak && level.reentryCloses && !cutoffUsed;
    if (reentryCloses) cutoffUsed = true;

    return {
      ...level,
      ante: level.isBreak ? null : 0,
      reentryCloses,
    };
  });
}

export async function POST(request: Request) {
  const parsed = importSchema.safeParse(await request.json().catch(() => null));

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid import file" }, { status: 400 });
  }

  if (!hasPublicEnv()) {
    return NextResponse.json({ ok: true, demo: true });
  }

  const supabase = await createSupabaseServerClient();
  const { data: userData } = await supabase.auth.getUser();

  if (!userData.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: tournament } = await supabase
    .from("tournaments")
    .select("id, public_token")
    .limit(1)
    .single();

  if (!tournament) {
    return NextResponse.json({ error: "Tournament not found" }, { status: 404 });
  }

  await supabase
    .from("tournaments")
    .update({
      name: parsed.data.tournament.name,
      logo_url: parsed.data.tournament.logoUrl ?? null,
      starting_stack: parsed.data.tournament.startingStack,
      registration_minutes: parsed.data.tournament.registrationMinutes,
      registration_status: parsed.data.tournament.registrationStatus ?? "open",
    })
    .eq("id", tournament.id);

  await supabase.from("blind_levels").delete().eq("tournament_id", tournament.id);
  await supabase.from("blind_levels").insert(
    normalizeImportedLevels(parsed.data.blindLevels).map((level) => ({
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

  const timerState = parsed.data.timerState;
  await supabase
    .from("timer_state")
    .update({
      status: timerState?.status ?? "not_started",
      current_level_index: timerState?.currentLevelIndex ?? 0,
      level_started_at: timerState?.levelStartedAt ?? null,
      paused_remaining_seconds: timerState?.pausedRemainingSeconds ?? null,
      registration_closes_at: timerState?.registrationClosesAt ?? null,
      finished_at: timerState?.finishedAt ?? null,
    })
    .eq("tournament_id", tournament.id);

  await broadcastPublicState(tournament.public_token as string);
  revalidatePath("/admin/settings");
  revalidatePath("/admin/blinds");
  revalidatePath("/admin/timer");

  return NextResponse.json({ ok: true });
}
