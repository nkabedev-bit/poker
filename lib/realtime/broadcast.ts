import "server-only";

import { getServerEnv } from "@/lib/env";

export async function broadcastPublicState(publicToken: string) {
  if (!publicToken) return;

  const env = getServerEnv();

  // Best-effort notification: screens also recover via their fallback poll, so a
  // broadcast failure must never break the (already-committed) mutation that triggered it.
  try {
    const response = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/realtime/v1/api/broadcast`, {
      method: "POST",
      headers: {
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messages: [
          {
            topic: `screen:${publicToken}`,
            event: "state-changed",
            payload: { token: publicToken, changedAt: new Date().toISOString() },
          },
        ],
      }),
    });

    if (!response.ok) {
      console.error(`Broadcast failed with status ${response.status}`);
    }
  } catch (error) {
    console.error("Broadcast request failed", error);
  }
}
