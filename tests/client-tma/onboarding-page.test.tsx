/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const replace = vi.fn();

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace }) }));

vi.mock("@/app/client/layout", () => ({
  getClientTelegramWebApp: () => undefined,
  useClientTMA: () => ({ initData: "mock-init", telegramUser: null }),
}));

const { default: ClientOnboardingPage } = await import("@/app/client/onboarding/page");

const CHURA = { avatarUrl: null, key: "chura", name: "Chura" };

type FetchAnswer = () => Promise<Response>;

/** The member search and the questionnaire itself, each answered by the test. */
function mockFetch({
  profile = async () => Response.json({ nickname: "Ace High", profileSubmitted: true }),
  search = async () => Response.json({ players: [CHURA] }),
}: { profile?: FetchAnswer; search?: FetchAnswer } = {}) {
  const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(
    async (input) => {
      const url = String(input);
      if (url.startsWith("/api/client-tma/players")) return search();
      if (url === "/api/client-tma/profile") return profile();
      return Response.json({});
    },
  );

  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function inviterField() {
  return screen.getByPlaceholderText("Ник игрока клуба — необязательно") as HTMLInputElement;
}

function fillRequiredFields() {
  fireEvent.change(screen.getByPlaceholderText("Иван Иванов"), { target: { value: "Иван Петров" } });
  fireEvent.change(screen.getByPlaceholderText("Ваш игровой ник"), { target: { value: "Ace High" } });
  fireEvent.change(screen.getByPlaceholderText("+7 900 000-00-00"), { target: { value: "89990000000" } });
  fireEvent.change(screen.getByPlaceholderText("ДД.ММ.ГГГГ"), { target: { value: "01011990" } });
  fireEvent.change(screen.getByPlaceholderText("Друзья, соцсети, реклама…"), {
    target: { value: "Друг" },
  });
  fireEvent.click(screen.getByRole("checkbox", { name: /пользовательское соглашение/i }));
}

function sentProfile(fetchMock: ReturnType<typeof mockFetch>) {
  const call = fetchMock.mock.calls.find(([url]) => String(url) === "/api/client-tma/profile");
  const init = call?.[1] as RequestInit | undefined;
  return JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
}

describe("client mini-app: анкета новичка", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    replace.mockReset();
  });

  it("asks who brought the player in, and lets them leave it empty", async () => {
    const fetchMock = mockFetch();
    render(<ClientOnboardingPage />);

    expect(
      screen.getByText("Если вас пригласил игрок, что состоит в клубе — укажите его ник"),
    ).toBeTruthy();

    fillRequiredFields();
    fireEvent.click(screen.getByRole("button", { name: "Сохранить анкету" }));

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/client"));
    expect(sentProfile(fetchMock)).toMatchObject({ invitedBy: "" });
  });

  it("offers the club's members as the newcomer types and sends the one picked", async () => {
    const fetchMock = mockFetch();
    render(<ClientOnboardingPage />);

    fireEvent.change(inviterField(), { target: { value: "chu" } });
    fireEvent.click(await screen.findByRole("button", { name: /chura/i }));

    expect(inviterField().value).toBe("Chura");
    expect(screen.queryByRole("button", { name: /chura/i })).toBeNull();
    expect(fetchMock).toHaveBeenCalledWith("/api/client-tma/players?q=chu", expect.anything());

    fillRequiredFields();
    fireEvent.click(screen.getByRole("button", { name: "Сохранить анкету" }));

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/client"));
    expect(sentProfile(fetchMock)).toMatchObject({ invitedBy: "Chura" });
  });

  // A search that was still on its way when the member was picked must not open the
  // list again under the name the newcomer already chose.
  it("keeps the list closed when a late answer comes after the pick", async () => {
    let answerLate: (response: Response) => void = () => {};
    let searches = 0;
    const fetchMock = mockFetch({
      search: () => {
        searches += 1;
        if (searches === 1) return Promise.resolve(Response.json({ players: [CHURA] }));
        return new Promise<Response>((resolve) => {
          answerLate = resolve;
        });
      },
    });
    render(<ClientOnboardingPage />);

    fireEvent.change(inviterField(), { target: { value: "chu" } });
    const firstMatch = await screen.findByRole("button", { name: /chura/i });

    fireEvent.change(inviterField(), { target: { value: "chur" } });
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith("/api/client-tma/players?q=chur", expect.anything()),
    );

    fireEvent.click(firstMatch);
    answerLate(Response.json({ players: [CHURA] }));
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(inviterField().value).toBe("Chura");
    expect(screen.queryByRole("button", { name: /chura/i })).toBeNull();
  });

  it("shows why the server sent the questionnaire back", async () => {
    mockFetch({
      profile: async () =>
        Response.json(
          {
            error: "referrer_not_found",
            message: "Не нашли в клубе игрока «Саша». Выберите его из подсказок или оставьте поле пустым.",
          },
          { status: 400 },
        ),
      search: async () => Response.json({ players: [] }),
    });
    render(<ClientOnboardingPage />);

    fireEvent.change(inviterField(), { target: { value: "Саша" } });
    fillRequiredFields();
    fireEvent.click(screen.getByRole("button", { name: "Сохранить анкету" }));

    expect(await screen.findByText(/Не нашли в клубе игрока «Саша»/)).toBeTruthy();
    expect(replace).not.toHaveBeenCalled();
  });
});
