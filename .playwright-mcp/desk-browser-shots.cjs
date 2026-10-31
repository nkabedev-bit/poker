// The admin desk opened in a phone's browser (no Telegram): the password screen, a
// dealer's desk, the browser's own bottom button, a floor's desk, and a dealer sent
// back from the cash desk. Admin API answers are mocked.
const { chromium } = require("@playwright/test");

const OUT = process.argv[2];
const BASE = process.env.BASE || "http://localhost:3101";

const now = new Date().toISOString();
const PLAYERS = [
  { id: "p1", name: "Shark", seat: 1, stack: 25000, status: "active", table: 1 },
  { id: "p2", name: "Ace High", seat: 2, stack: 25000, status: "active", table: 1 },
  { id: "p3", name: "Secret", seat: 3, stack: 25000, status: "active", table: 1 },
  { id: "p4", name: "Javmaz", seat: 4, stack: 0, status: "eliminated", table: 1 },
];
const LEVELS = [1, 2, 3].map((n) => ({
  ante: 0,
  big_blind: n * 200,
  break_duration_seconds: null,
  duration_seconds: 1200,
  id: `l${n}`,
  is_break: false,
  level_order: n,
  small_blind: n * 100,
}));

async function mock(page, state) {
  await page.route("**/api/tma/**", async (route) => {
    const request = route.request();
    const path = request.url().replace(/^https?:\/\/[^/]+/, "").split("?")[0];
    const json = (body, status = 200) =>
      route.fulfill({ body: JSON.stringify(body), contentType: "application/json", status });

    if (path === "/api/tma/session") {
      state.role = request.method() === "DELETE" ? null : state.nextRole;
      return json(state.role ? { role: state.role } : { signedOut: true });
    }
    if (path === "/api/tma/me") {
      return state.role ? json({ name: `Браузер · ${state.role}`, role: state.role }) : json({ error: "Войдите заново" }, 401);
    }
    if (path === "/api/tma/players") return json({ players: PLAYERS, tablesCount: 1 });
    if (path === "/api/tma/timer") {
      return json({
        blindLevels: LEVELS,
        timerState: { current_level_index: 0, level_started_at: now, status: "running" },
      });
    }
    return json({});
  });
}

(async () => {
  const browser = await chromium.launch({
    executablePath:
      process.env.HOME +
      "/Library/Caches/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-mac-arm64/chrome-headless-shell",
  });
  const context = await browser.newContext({ deviceScaleFactor: 2, viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  page.on("pageerror", (error) => console.error("pageerror:", error.message));
  page.on("dialog", (dialog) => {
    console.log("dialog:", dialog.message());
    void dialog.accept();
  });
  const state = { nextRole: "dealer", role: null };
  await mock(page, state);

  await page.goto("" + BASE + "/tma/players");
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${OUT}/1-login.png` });

  await page.getByLabel("Пароль").fill("dealer-password");
  await page.getByRole("button", { name: "Войти" }).click();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${OUT}/2-dealer-desk.png` });
  console.log("dealer tabs:", await page.locator("nav a").allTextContents());
  console.log("pause button for dealer:", await page.getByRole("button", { name: "Пауза" }).count());

  await page.getByRole("button", { name: "Добавить игрока" }).click();
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${OUT}/3-add-player-main-button.png` });
  console.log("main button:", await page.getByRole("button", { name: "ДОБАВИТЬ ИГРОКА" }).count());

  await page.goto("" + BASE + "/tma/cards");
  await page.waitForTimeout(1500);
  console.log("dealer on /tma/cards ends at:", page.url());

  state.role = "floor";
  await page.goto("" + BASE + "/tma/players");
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${OUT}/4-floor-desk.png` });
  console.log("floor tabs:", await page.locator("nav a").allTextContents());

  await page.getByRole("button", { name: "Выйти" }).click();
  await page.waitForTimeout(1000);
  console.log("after sign-out shows login:", await page.getByText("Вход в админку").count());

  await browser.close();
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
