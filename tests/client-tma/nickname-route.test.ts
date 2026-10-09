import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  after: vi.fn(),
  renameInClientBotProfileSheet: vi.fn(),
  requireClientTmaAuth: vi.fn(),
}));

vi.mock("@/lib/client-tma/require-auth", () => ({ requireClientTmaAuth: mocks.requireClientTmaAuth }));
vi.mock("@/lib/google-sheets", () => ({
  renameInClientBotProfileSheet: mocks.renameInClientBotProfileSheet,
}));
vi.mock("next/server", () => ({
  after: mocks.after,
  NextResponse: { json: (body: unknown, init?: ResponseInit) => Response.json(body, init) },
}));

const PLAYER = { display_name: "Mr.Fish", id: "account-me", telegram_id: 874191714 };

/** The database function, answering what it is told to. */
function rpcAnswering(answer: { data: unknown; error: unknown }) {
  const rpc = vi.fn(async () => answer);
  return { rpc, supabase: { rpc } };
}

async function changeNickname(nickname: unknown) {
  const { POST } = await import("@/app/api/client-tma/nickname/route");
  return POST(
    new Request("http://localhost/api/client-tma/nickname", {
      body: JSON.stringify({ nickname }),
      method: "POST",
    }),
  );
}

describe("a player changing their nickname", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("hands the tidied nickname to the database and answers with it", async () => {
    const { rpc, supabase } = rpcAnswering({
      data: { availableAt: "2026-11-08T10:00:00+00:00", newName: "Chura", ok: true, oldName: "Mr.Fish" },
      error: null,
    });
    mocks.requireClientTmaAuth.mockResolvedValue({ supabase, user: PLAYER });

    const response = await changeNickname("  Chura ");

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ availableAt: "2026-11-08T10:00:00+00:00", nickname: "Chura" });
    expect(rpc).toHaveBeenCalledWith("change_player_nickname", {
      p_nickname: "Chura",
      p_user_id: "account-me",
    });
  });

  it("renames the player in the questionnaire sheet once the answer is sent", async () => {
    const { supabase } = rpcAnswering({
      data: { availableAt: "2026-11-08T10:00:00+00:00", newName: "Chura", ok: true, oldName: "Mr.Fish" },
      error: null,
    });
    mocks.requireClientTmaAuth.mockResolvedValue({ supabase, user: PLAYER });

    await changeNickname("Chura");
    await mocks.after.mock.calls[0][0]();

    expect(mocks.renameInClientBotProfileSheet).toHaveBeenCalledWith({
      newName: "Chura",
      oldName: "Mr.Fish",
      telegramId: 874191714,
    });
  });

  it("keeps the new nickname when the sheet cannot be written", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { supabase } = rpcAnswering({
      data: { availableAt: "2026-11-08T10:00:00+00:00", newName: "Chura", ok: true, oldName: "Mr.Fish" },
      error: null,
    });
    mocks.requireClientTmaAuth.mockResolvedValue({ supabase, user: PLAYER });
    mocks.renameInClientBotProfileSheet.mockRejectedValue(new Error("quota"));

    const response = await changeNickname("Chura");
    await expect(mocks.after.mock.calls[0][0]()).resolves.toBeUndefined();

    expect(response.status).toBe(200);
    error.mockRestore();
  });

  it("turns down a nickname without a letter or a digit before asking the database", async () => {
    const { rpc, supabase } = rpcAnswering({ data: null, error: null });
    mocks.requireClientTmaAuth.mockResolvedValue({ supabase, user: PLAYER });

    const response = await changeNickname("???");

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "invalid",
      message: "В нике нужна хотя бы одна буква или цифра.",
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("says when the next change opens inside the thirty days", async () => {
    const { supabase } = rpcAnswering({
      data: { availableAt: "2026-11-08T10:00:00+00:00", error: "cooldown" },
      error: null,
    });
    mocks.requireClientTmaAuth.mockResolvedValue({ supabase, user: PLAYER });

    const response = await changeNickname("Chura");

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      availableAt: "2026-11-08T10:00:00+00:00",
      error: "cooldown",
      message: "Ник можно менять раз в 30 дней. Следующая смена — с 8 ноября.",
    });
    expect(mocks.after).not.toHaveBeenCalled();
  });

  it("says a nickname is taken", async () => {
    const { supabase } = rpcAnswering({ data: { error: "taken" }, error: null });
    mocks.requireClientTmaAuth.mockResolvedValue({ supabase, user: PLAYER });

    const response = await changeNickname("Chura");

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      error: "taken",
      message: "Этот ник уже занят. Выберите другой.",
    });
  });

  it("says the change is not switched on while the migration is not applied", async () => {
    const { supabase } = rpcAnswering({
      data: null,
      error: { code: "PGRST202", message: "Could not find the function public.change_player_nickname" },
    });
    mocks.requireClientTmaAuth.mockResolvedValue({ supabase, user: PLAYER });

    const response = await changeNickname("Chura");

    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ error: "not_ready" });
  });

  it("lets the failure through when the database breaks otherwise", async () => {
    const { supabase } = rpcAnswering({ data: null, error: { code: "57014", message: "timeout" } });
    mocks.requireClientTmaAuth.mockResolvedValue({ supabase, user: PLAYER });

    await expect(changeNickname("Chura")).rejects.toMatchObject({ message: "timeout" });
  });

  it("answers for itself when the player is not signed in", async () => {
    mocks.requireClientTmaAuth.mockResolvedValue({ error: Response.json({}, { status: 401 }) });

    const response = await changeNickname("Chura");

    expect(response.status).toBe(401);
  });
});
