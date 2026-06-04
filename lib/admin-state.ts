import "server-only";

import { cache } from "react";
import { mapAdminStateRpc, type AdminStateRpc } from "@/lib/admin/admin-state-mapper";
import { loadDemoPublicState } from "@/lib/demo-overrides";
import { hasPublicEnv } from "@/lib/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { defaultTournamentExtras } from "@/lib/tournament-extras";

export const loadAdminState = cache(async () => {
  if (!hasPublicEnv()) {
    return loadDemoPublicState();
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("get_admin_state");

  if (error) {
    throw new Error(error.message);
  }

  if (!data) return null;

  return mapAdminStateRpc(data as AdminStateRpc);
});

export async function loadAdminExtras() {
  const state = await loadAdminState();
  return state?.extras ?? defaultTournamentExtras;
}
