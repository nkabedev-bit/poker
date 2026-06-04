import "server-only";

import { getServerEnv } from "@/lib/env";

export async function broadcastPublicState(publicToken: string) {
  if (!publicToken) return;

  const env = getServerEnv();
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
    throw new Error(`Broadcast failed with status ${response.status}`);
  }
}
