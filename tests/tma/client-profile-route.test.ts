import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ requireTmaAuth: vi.fn() }));

vi.mock("@/lib/tma/require-auth", () => ({ requireTmaAuth: mocks.requireTmaAuth }));

import { GET } from "@/app/api/tma/client-profile/route";

const questionnaire = {
  avatar_url: null,
  created_at: "2026-09-01T10:00:00.000Z",
  display_name: "Shark",
  free_entries: 1,
  pending_profile_answers: {
    birthDate: "1990-05-04",
    fullName: "Иван Петров",
    phone: "+7 900 000-00-00",
  },
  profile_submitted_at: "2026-09-01T10:05:00.000Z",
  telegram_id: 77,
  username: "shark",
  vip_free_entries: 0,
};

function supabaseWithQuestionnaire() {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: questionnaire, error: null }) }),
      }),
    }),
  };
}

function readProfile() {
  return GET(new Request("https://club.test/api/tma/client-profile?telegramId=77"));
}

describe("GET /api/tma/client-profile", () => {
  beforeEach(() => {
    mocks.requireTmaAuth.mockReset();
  });

  it("shows a floor how to reach the player", async () => {
    mocks.requireTmaAuth.mockResolvedValue({ role: "floor", supabase: supabaseWithQuestionnaire() });

    const { profile } = await (await readProfile()).json();

    expect(profile.phone).toBe("+7 900 000-00-00");
    expect(profile.birthDate).toBe("1990-05-04");
  });

  it("leaves the phone and the birthday out for a dealer", async () => {
    mocks.requireTmaAuth.mockResolvedValue({ role: "dealer", supabase: supabaseWithQuestionnaire() });

    const { profile } = await (await readProfile()).json();

    expect(profile.phone).toBe("");
    expect(profile.birthDate).toBe("");
    expect(profile.fullName).toBe("Иван Петров");
  });
});
