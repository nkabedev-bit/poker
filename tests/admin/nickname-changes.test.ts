import { describe, expect, it, vi } from "vitest";
import {
  buildNicknameChangesMessage,
  readNicknameChanges,
  type NicknameChangeEntry,
} from "@/lib/admin-bot/nickname-changes";

function change(overrides: Partial<NicknameChangeEntry> = {}): NicknameChangeEntry {
  return {
    // 14:05 Moscow.
    changedAt: "2026-10-09T11:05:00.000Z",
    newName: "Chura",
    oldName: "Mr.Fish",
    username: "fish",
    ...overrides,
  };
}

describe("buildNicknameChangesMessage", () => {
  it("names who became whom, when, and their Telegram", () => {
    const message = buildNicknameChangesMessage([
      change(),
      change({ changedAt: "2026-10-10T07:30:00.000Z", newName: "Web 2", oldName: "WebGuy", username: null }),
    ]);

    expect(message).toBe(
      "✏️ Смена ников — за 30 дн.\n\n" +
        "09.10 в 14:05 — Mr.Fish → Chura (@fish)\n" +
        "10.10 в 10:30 — WebGuy → Web 2",
    );
  });

  it("says so when nobody changed a nickname", () => {
    expect(buildNicknameChangesMessage([])).toBe("✏️ Смена ников — за 30 дн.\n\nНикто не менял ник.");
  });
});

describe("readNicknameChanges", () => {
  function journal(result: { data: unknown; error: unknown }) {
    const calls: Record<string, unknown[]> = {};
    const query = {
      gte: vi.fn((...args: unknown[]) => {
        calls.gte = args;
        return query;
      }),
      order: vi.fn(async () => result),
      select: vi.fn(() => query),
    };
    return { calls, supabase: { from: vi.fn(() => query) } };
  }

  it("reads the last month of changes with the player's Telegram username", async () => {
    const { calls, supabase } = journal({
      data: [
        {
          changed_at: "2026-10-09T11:05:00+00:00",
          client_bot_users: { username: "fish" },
          new_name: "Chura",
          old_name: "Mr.Fish",
        },
        { changed_at: "2026-10-10T07:30:00+00:00", client_bot_users: null, new_name: "Web 2", old_name: "WebGuy" },
      ],
      error: null,
    });

    const changes = await readNicknameChanges(supabase as never, { now: new Date("2026-10-31T00:00:00.000Z") });

    expect(calls.gte).toEqual(["changed_at", "2026-10-01T00:00:00.000Z"]);
    expect(changes).toEqual([
      { changedAt: "2026-10-09T11:05:00+00:00", newName: "Chura", oldName: "Mr.Fish", username: "fish" },
      { changedAt: "2026-10-10T07:30:00+00:00", newName: "Web 2", oldName: "WebGuy", username: null },
    ]);
  });

  it("lets the bot say what went wrong when the journal cannot be read", async () => {
    const { supabase } = journal({ data: null, error: new Error('relation "nickname_changes" does not exist') });

    await expect(readNicknameChanges(supabase as never)).rejects.toThrow("nickname_changes");
  });
});
