import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { findDuoInvitation } from "@/lib/events/duo";
import { listEventSignups } from "@/lib/events/store";

/**
 * A sign-up row points at several accounts at once, so PostgREST refuses to guess which
 * one an embed means and answers PGRST201 instead. These tests hold the queries to
 * naming their foreign key: an unnamed embed took the whole event page down.
 */
function supabaseStub(rows: unknown[]) {
  const columns: string[] = [];
  const chain: Record<string, unknown> = {
    then: (resolve: (value: { data: unknown[]; error: null }) => unknown) =>
      Promise.resolve({ data: rows, error: null }).then(resolve),
  };
  for (const link of ["eq", "neq", "order", "limit"]) chain[link] = vi.fn(() => chain);

  const select = vi.fn((asked: string) => {
    columns.push(asked);
    return chain;
  });

  return { columns, supabase: { from: vi.fn(() => ({ select })) } as unknown as SupabaseClient };
}

describe("embedding the account of a sign-up", () => {
  it("names the foreign key when it reads the host of a pair", async () => {
    const { columns, supabase } = supabaseStub([
      {
        client_bot_users: { display_name: "TitAn" },
        created_at: "2026-09-05T10:00:00.000Z",
        duo_confirmed_at: null,
        telegram_id: 777,
        user_id: "account-host",
      },
    ]);

    const invitation = await findDuoInvitation(supabase, {
      eventId: "event-1",
      userId: "account-plus-one",
    });

    expect(invitation?.hostName).toBe("TitAn");
    expect(columns[0]).toContain("client_bot_users!user_id(");
    expect(columns[0]).not.toMatch(/[^!]client_bot_users\(/);
  });

  it("names the foreign key when it lists who signed up", async () => {
    const { columns, supabase } = supabaseStub([
      {
        client_bot_users: { display_name: "TitAn", username: "titan" },
        created_at: "2026-09-05T10:00:00.000Z",
        event_id: "event-1",
        id: "signup-1",
        status: "signed_up",
        ticket_type: "regular",
        use_pass: "none",
        user_id: "account-host",
      },
    ]);

    const [signup] = await listEventSignups(supabase, "event-1");

    expect(signup.displayName).toBe("TitAn");
    expect(columns[0]).toContain("client_bot_users!user_id(");
    expect(columns[0]).not.toMatch(/[^!]client_bot_users\(/);
  });
});
