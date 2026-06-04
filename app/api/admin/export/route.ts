import { NextResponse } from "next/server";
import { buildTournamentExportPayload } from "@/lib/admin/import-export";
import { mapAdminStateRpc, type AdminStateRpc } from "@/lib/admin/admin-state-mapper";
import { loadDemoPublicState } from "@/lib/demo-overrides";
import { hasPublicEnv } from "@/lib/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET() {
  if (!hasPublicEnv()) {
    return exportJson(buildTournamentExportPayload(await loadDemoPublicState()));
  }

  const supabase = await createSupabaseServerClient();
  const { data: userData } = await supabase.auth.getUser();

  if (!userData.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase.rpc("get_admin_state");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json({ error: "Tournament not found" }, { status: 404 });
  }

  return exportJson(buildTournamentExportPayload(mapAdminStateRpc(data as AdminStateRpc)));
}

function exportJson(payload: unknown) {
  return new NextResponse(JSON.stringify(payload, null, 2), {
    headers: {
      "Content-Disposition": "attachment; filename=\"poker-tournament.json\"",
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}
