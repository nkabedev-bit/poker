import { describe, expect, it } from "vitest";
import { buildSignupList } from "@/lib/events/signup-list";
import type { EventSignupWithPlayer } from "@/lib/events/store";

function signup(overrides: Partial<EventSignupWithPlayer> = {}): EventSignupWithPlayer {
  return {
    createdAt: "2026-09-18T10:00:00.000Z",
    displayName: "Игрок",
    duoConfirmedAt: null,
    duoHostUserId: null,
    duoInviteToken: null,
    duoPartnerName: null,
    duoPartnerUserId: null,
    eventId: "event-1",
    id: "signup-1",
    notifiedAt: null,
    status: "signed_up",
    telegramId: 100,
    ticketType: "regular",
    usePass: "none",
    userId: "user-1",
    username: "player",
    waitlistOfferExpiresAt: null,
    waitlistOfferedAt: null,
    ...overrides,
  };
}

describe("buildSignupList", () => {
  it("lists the nickname from the questionnaire, never the Telegram handle", () => {
    const list = buildSignupList([signup({ displayName: "Чура", username: "churaptz" })]);

    expect(list).toHaveLength(1);
    expect(list[0]?.name).toBe("Чура");
    expect(JSON.stringify(list)).not.toContain("churaptz");
  });

  it("hangs the face the club has and marks the player who is looking", () => {
    const list = buildSignupList(
      [signup({ userId: "me" }), signup({ id: "signup-2", displayName: "Другой", userId: "other" })],
      {
        findAvatar: (player) => (player.name === "Игрок" ? "https://example.test/a.jpg" : null),
        myUserId: "me",
      },
    );

    expect(list[0]).toMatchObject({ avatarUrl: "https://example.test/a.jpg", isMe: true });
    expect(list[1]).toMatchObject({ avatarUrl: null, isMe: false });
  });

  // A pair takes two chairs, so the list has to show two people.
  it("lists the guest half of a 1+1 under the name the buyer wrote down", () => {
    const list = buildSignupList([
      signup({ duoPartnerName: "Друг", ticketType: "duo" }),
    ]);

    expect(list.map((entry) => entry.name)).toEqual(["Игрок", "Друг"]);
    expect(list[1]).toMatchObject({ isGuest: true, ticketType: "duo_plus_one" });
  });

  // A member who was invited has a sign-up of their own and would be listed twice.
  it("does not double a 1+1 partner who plays at the club", () => {
    const list = buildSignupList([
      signup({ duoPartnerName: "Партнёр", duoPartnerUserId: "user-2", ticketType: "duo" }),
      signup({ id: "signup-2", displayName: "Партнёр", ticketType: "duo_plus_one", userId: "user-2" }),
    ]);

    expect(list.map((entry) => entry.name)).toEqual(["Игрок", "Партнёр"]);
    expect(list.filter((entry) => entry.isGuest)).toHaveLength(0);
  });

  it("names an account with no nickname rather than showing a blank row", () => {
    expect(buildSignupList([signup({ displayName: null })])[0]?.name).toBe("Игрок клуба");
  });

  it("maps what it is given without deciding which sign-ups belong on the list", () => {
    const list = buildSignupList([signup({ status: "waitlist" })]);

    expect(list).toHaveLength(1);
  });
});
