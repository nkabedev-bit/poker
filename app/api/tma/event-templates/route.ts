import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireTmaAuth } from "@/lib/tma/require-auth";
import { eventInputSchema, toEventDraft } from "@/lib/events/input";
import {
  makeEventTemplate,
  removeEventTemplate,
  upsertEventTemplate,
} from "@/lib/events/templates";
import { loadTournamentExtras, saveTournamentExtras } from "@/lib/tournament-extras";

export const dynamic = "force-dynamic";

async function loadTemplates(supabase: SupabaseClient) {
  const { data: tournament } = await supabase.from("tournaments").select("id").limit(1).single();
  const extras = await loadTournamentExtras(tournament?.id as string | undefined, supabase);

  return extras.eventTemplates;
}

export async function GET(request: Request) {
  const auth = await requireTmaAuth(request);
  if (auth.error) return auth.error;

  return NextResponse.json({ templates: await loadTemplates(auth.supabase) });
}

/** Saves the poster on screen under a name, so the next one is a pick and a date. */
export async function POST(request: Request) {
  const auth = await requireTmaAuth(request);
  if (auth.error) return auth.error;

  const body = await request.json().catch(() => ({}));
  const name = String(body.name ?? "").trim();

  if (!name) return NextResponse.json({ error: "Укажите название шаблона" }, { status: 400 });

  const parsed = eventInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Проверьте поля афиши" },
      { status: 400 },
    );
  }

  const templates = upsertEventTemplate(
    await loadTemplates(auth.supabase),
    makeEventTemplate(name, toEventDraft(parsed.data)),
  );

  await saveTournamentExtras({ eventTemplates: templates }, "/tma/events", auth.supabase);

  return NextResponse.json({ templates });
}

export async function DELETE(request: Request) {
  const auth = await requireTmaAuth(request);
  if (auth.error) return auth.error;

  const id = String(new URL(request.url).searchParams.get("id") ?? "").trim();
  if (!id) return NextResponse.json({ error: "Не выбран шаблон" }, { status: 400 });

  const templates = removeEventTemplate(await loadTemplates(auth.supabase), id);
  await saveTournamentExtras({ eventTemplates: templates }, "/tma/events", auth.supabase);

  return NextResponse.json({ templates });
}
