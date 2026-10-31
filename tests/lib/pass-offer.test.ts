import { beforeEach, describe, expect, it, vi } from "vitest";
import { mapEventRow } from "@/lib/events/types";

const mocks = vi.hoisted(() => ({
  loadPassHolds: vi.fn(),
  sendMessage: vi.fn(),
}));

vi.mock("@/lib/client-bot/broadcast", () => ({
  getClientBot: () => ({ api: { sendMessage: mocks.sendMessage } }),
}));

vi.mock("@/lib/free-entries/holds", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/free-entries/holds")>()),
  loadPassHolds: mocks.loadPassHolds,
}));

import {
  buildPassOfferKeyboard,
  offerPassForNextSignup,
  parsePassOfferCallback,
  passOfferAnswerText,
  passOfferMessage,
} from "@/lib/free-entries/pass-offer";

const NOW = new Date("2026-11-03T12:00:00.000Z");

function eventRow(id: string, startsAt: string, title: string, extra: Record<string, unknown> = {}) {
  return { id, is_published: true, late_entry_until: null, starts_at: startsAt, title, ...extra };
}

/** Answers the account read and the sign-ups read with what is given. */
function supabaseWith({
  account = { chat_id: 777, free_entries: 1, id: "user-1" } as Record<string, unknown> | null,
  signups = [] as Array<Record<string, unknown>>,
} = {}) {
  const accounts = {
    eq: () => accounts,
    maybeSingle: async () => ({ data: account, error: null }),
    select: () => accounts,
  };
  const signupRows = {
    eq: () => signupRows,
    select: () => signupRows,
    then: (resolve: (result: { data: unknown; error: null }) => unknown) =>
      resolve({ data: signups.map((row) => ({ tournament_events: row })), error: null }),
  };

  return {
    from: (table: string) => (table === "client_bot_users" ? accounts : signupRows),
  } as never;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.loadPassHolds.mockResolvedValue([]);
  mocks.sendMessage.mockResolvedValue({});
});

describe("the pass offer's buttons", () => {
  it("carries the game in both answers and reads them back", () => {
    const keyboard = buildPassOfferKeyboard("3f2c-uuid");
    const [yes, no] = keyboard.inline_keyboard[0] as Array<{ callback_data: string }>;

    expect(parsePassOfferCallback(yes.callback_data)).toEqual({ accept: true, eventId: "3f2c-uuid" });
    expect(parsePassOfferCallback(no.callback_data)).toEqual({ accept: false, eventId: "3f2c-uuid" });
  });

  it("leaves every other button to its own handler", () => {
    expect(parsePassOfferCallback("menu:schedule")).toBeNull();
    expect(parsePassOfferCallback(undefined)).toBeNull();
  });

  // Telegram refuses callback data over 64 bytes.
  it("fits a full uuid inside Telegram's limit", () => {
    const keyboard = buildPassOfferKeyboard("123e4567-e89b-12d3-a456-426614174000");
    const [yes] = keyboard.inline_keyboard[0] as Array<{ callback_data: string }>;

    expect(new TextEncoder().encode(yes.callback_data).length).toBeLessThanOrEqual(64);
  });
});

describe("the pass offer's wording", () => {
  it("names the game, its day and its time", () => {
    const text = passOfferMessage({ startsAt: "2026-11-05T16:00:00.000Z", title: "Четверговый" });

    expect(text).toContain("Хотите использовать её на следующем турнире");
    expect(text).toContain("«Четверговый», 5 ноября в 19:00");
  });

  it("answers a no without touching the ticket", () => {
    expect(passOfferAnswerText({ accept: false, eventId: "e" }, null)).toContain("остался обычным");
  });

  it("passes a refusal on and points at the app", () => {
    const text = passOfferAnswerText(
      { accept: true, eventId: "e" },
      { error: "no_pass", message: "Свободных проходок не осталось.", ok: false },
    );

    expect(text).toContain("Свободных проходок не осталось.");
    expect(text).toContain("в афише");
  });
});

describe("offerPassForNextSignup", () => {
  it("asks about the nearest game paid for at the door", async () => {
    const supabase = supabaseWith({
      signups: [
        eventRow("event-sat", "2026-11-07T16:00:00.000Z", "Суббота"),
        eventRow("event-thu", "2026-11-05T16:00:00.000Z", "Четверг"),
      ],
    });

    await expect(offerPassForNextSignup(supabase, { accountId: "user-1" }, NOW)).resolves.toBe(true);

    expect(mocks.sendMessage).toHaveBeenCalledTimes(1);
    const [chatId, text, options] = mocks.sendMessage.mock.calls[0];
    expect(chatId).toBe(777);
    expect(text).toContain("«Четверг»");
    expect(options.reply_markup).toEqual(buildPassOfferKeyboard("event-thu"));
  });

  it("skips games already over and posters taken down", async () => {
    const supabase = supabaseWith({
      signups: [
        eventRow("event-old", "2026-10-30T16:00:00.000Z", "Прошлая"),
        eventRow("event-draft", "2026-11-04T16:00:00.000Z", "Снята", { is_published: false }),
        eventRow("event-sat", "2026-11-07T16:00:00.000Z", "Суббота"),
      ],
    });

    await offerPassForNextSignup(supabase, { accountId: "user-1" }, NOW);

    expect(mocks.sendMessage.mock.calls[0][1]).toContain("«Суббота»");
  });

  it("stays quiet when every pass is already promised to a game", async () => {
    mocks.loadPassHolds.mockResolvedValue([
      { eventId: "event-tue", startsAt: "2026-11-04T16:00:00.000Z", title: "Вторник" },
    ]);
    const supabase = supabaseWith({
      signups: [eventRow("event-thu", "2026-11-05T16:00:00.000Z", "Четверг")],
    });

    await expect(offerPassForNextSignup(supabase, { accountId: "user-1" }, NOW)).resolves.toBe(false);
    expect(mocks.sendMessage).not.toHaveBeenCalled();
  });

  it("stays quiet without a game paid for at the door", async () => {
    await expect(
      offerPassForNextSignup(supabaseWith(), { accountId: "user-1" }, NOW),
    ).resolves.toBe(false);
    expect(mocks.sendMessage).not.toHaveBeenCalled();
  });

  it("stays quiet for a web player the bot cannot write to", async () => {
    const supabase = supabaseWith({
      account: { chat_id: null, free_entries: 1, id: "user-1" },
      signups: [eventRow("event-thu", "2026-11-05T16:00:00.000Z", "Четверг")],
    });

    await expect(offerPassForNextSignup(supabase, { accountId: "user-1" }, NOW)).resolves.toBe(false);
  });

  it("never fails the grant it follows", async () => {
    mocks.sendMessage.mockRejectedValue(new Error("bot was blocked by the user"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const supabase = supabaseWith({
      signups: [eventRow("event-thu", "2026-11-05T16:00:00.000Z", "Четверг")],
    });

    await expect(offerPassForNextSignup(supabase, { telegramId: 555 }, NOW)).resolves.toBe(false);
  });
});

// Keeps mapEventRow honest about the partial rows the offer reads.
it("reads a poster from the few columns the offer selects", () => {
  const event = mapEventRow(eventRow("event-thu", "2026-11-05T16:00:00.000Z", "Четверг"));

  expect(event).toMatchObject({ id: "event-thu", isPublished: true, title: "Четверг" });
});
