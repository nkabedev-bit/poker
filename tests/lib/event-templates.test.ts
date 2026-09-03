import { describe, expect, it } from "vitest";
import {
  applyEventTemplate,
  makeEventTemplate,
  removeEventTemplate,
  upsertEventTemplate,
} from "@/lib/events/templates";

const event = {
  badge: "ГАРАНТИЯ 100 000",
  buyIn: 1250,
  featuresText: "Ре-энтри до 6 уровня",
  isPublished: true,
  lateEntryUntil: "2026-09-10T19:00:00.000Z",
  maxPlayers: 20,
  maxVipPlayers: 10,
  posterUrl: "https://example.test/poster.png",
  rulesText: "Классический холдем",
  startingStack: 30000,
  startsAt: "2026-09-10T17:00:00.000Z",
  title: "ЧЕТВЕРГОВЫЙ",
  venueAddress: "Петрозаводск",
  vipBuyIn: 2000,
};

describe("makeEventTemplate", () => {
  it("keeps everything about the poster but the evening it runs on", () => {
    const template = makeEventTemplate("Четверг", event);

    expect(template).toMatchObject({
      badge: "ГАРАНТИЯ 100 000",
      buyIn: 1250,
      maxVipPlayers: 10,
      name: "Четверг",
      title: "ЧЕТВЕРГОВЫЙ",
    });
    expect(template).not.toHaveProperty("startsAt");
  });

  // Late registration belongs to the evening, so it is kept as a distance from the start.
  it("remembers how long late registration stayed open", () => {
    expect(makeEventTemplate("Четверг", event).lateEntryMinutes).toBe(120);
  });

  it("remembers no late registration when the poster had none", () => {
    const template = makeEventTemplate("Четверг", { ...event, lateEntryUntil: null });

    expect(template.lateEntryMinutes).toBeNull();
  });

  it("tidies the name it is saved under", () => {
    expect(makeEventTemplate("  Пятница   вечер ", event).name).toBe("Пятница вечер");
  });
});

describe("applyEventTemplate", () => {
  const template = makeEventTemplate("Четверг", event);

  it("makes a poster for the evening the admin typed in", () => {
    const draft = applyEventTemplate(template, { startsAt: "2026-10-01T17:00:00.000Z" });

    expect(draft).toMatchObject({
      buyIn: 1250,
      startsAt: "2026-10-01T17:00:00.000Z",
      title: "ЧЕТВЕРГОВЫЙ",
    });
  });

  it("moves late registration along with the start", () => {
    const draft = applyEventTemplate(template, { startsAt: "2026-10-01T17:00:00.000Z" });

    expect(draft.lateEntryUntil).toBe("2026-10-01T19:00:00.000Z");
  });

  // A template is a draft, never something the club publishes by accident.
  it("leaves the poster unpublished", () => {
    expect(applyEventTemplate(template, { startsAt: event.startsAt }).isPublished).toBe(false);
  });
});

describe("the list of templates", () => {
  const thursday = makeEventTemplate("Четверг", event, "a");
  const friday = makeEventTemplate("Пятница", event, "b");

  it("puts the newest first", () => {
    expect(upsertEventTemplate([thursday], friday).map((item) => item.id)).toEqual(["b", "a"]);
  });

  it("replaces a template saved under a name that is already taken", () => {
    const corrected = makeEventTemplate("четверг", { ...event, buyIn: 1500 }, "c");
    const list = upsertEventTemplate([thursday, friday], corrected);

    expect(list.map((item) => item.id)).toEqual(["c", "b"]);
    expect(list[0].buyIn).toBe(1500);
  });

  it("forgets the one the admin deleted", () => {
    expect(removeEventTemplate([thursday, friday], "a").map((item) => item.id)).toEqual(["b"]);
  });
});
