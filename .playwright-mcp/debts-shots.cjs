// «Касса → Долги» against mocked admin API answers: the list by players, by games, one
// player's debt with a partial payment, and the evening's cash list with a debt badge.
const { chromium } = require("@playwright/test");

const OUT = process.argv[2];

const game = (id, day, amount, left, source = "import") => ({
  amount,
  gameStartedAt: `2026-${day}T16:00:00.000Z`,
  id,
  left,
  source,
});

const DEBTORS = [
  {
    accountId: "acc-secret",
    allowedUntil: null,
    debtorKey: "acc-secret",
    games: [game("s3", "09-29", 5500, 4000), game("s4", "10-01", 1000, 1000), game("s5", "10-04", 2500, 2500)],
    owed: 7500,
    payments: [
      { amount: 7000, cancelledAt: null, createdAt: "2026-10-07T13:20:00.000Z", id: "p1", kind: "payment", recordedBy: "Никита" },
      { amount: 500, cancelledAt: "2026-10-07T13:19:00.000Z", createdAt: "2026-10-07T13:18:00.000Z", id: "p0", kind: "payment", recordedBy: "Никита" },
    ],
    playerName: "Secret",
  },
  {
    accountId: "acc-inrikki",
    allowedUntil: "2026-10-14T12:00:00.000Z",
    debtorKey: "acc-inrikki",
    games: [game("i1", "09-29", 2500, 2500), game("i2", "10-01", 2500, 2500), game("i3", "10-04", 3750, 3750)],
    owed: 8750,
    payments: [],
    playerName: "inrikki",
  },
  {
    accountId: "acc-javmaz",
    allowedUntil: null,
    debtorKey: "acc-javmaz",
    games: [game("j1", "09-27", 5250, 5250), game("j2", "10-04", 2500, 2500)],
    owed: 7750,
    payments: [],
    playerName: "Javmaz",
  },
  {
    accountId: null,
    allowedUntil: null,
    debtorKey: "name:гость",
    games: [game("g1", "10-08", 1250, 1250, "app")],
    owed: 1250,
    payments: [],
    playerName: "Гость Петя",
  },
  {
    accountId: "acc-superman",
    allowedUntil: null,
    debtorKey: "acc-superman",
    games: [],
    owed: 0,
    payments: [{ amount: 2500, cancelledAt: null, createdAt: "2026-10-07T12:00:00.000Z", id: "p2", kind: "payment", recordedBy: "Никита" }],
    playerName: "Superman",
  },
];

const charge = (total) => ({
  addons: { count: 0, price: 1000, sum: 0 },
  doubleReentries: { count: 0, price: 2000, sum: 0 },
  reentries: { count: 1, price: 1250, sum: 1250 },
  ticket: { count: 1, free: false, price: 1250, sum: total - 1250 },
  total,
});

const ISSUED = [
  { accountId: "acc-secret", addons: 0, cardCode: "MJ-012", charge: charge(2500), doubleReentries: 0, eliminated: true, freePass: null, name: "Secret", paid: false, paidAt: null, playerId: "pl-1", reentries: 1, registrationNumber: 12, seat: 3, table: 1, telegramId: null, ticketType: "regular" },
  { accountId: "acc-ace", addons: 0, cardCode: "MJ-004", charge: charge(2500), doubleReentries: 0, eliminated: false, freePass: null, name: "Ace High", paid: true, paidAt: "2026-10-08T18:40:00.000Z", playerId: "pl-2", reentries: 1, registrationNumber: 4, seat: 5, table: 2, telegramId: null, ticketType: "regular" },
];

async function mock(page) {
  await page.route("**/api/tma/**", async (route) => {
    const path = route.request().url().replace(/^https?:\/\/[^/]+/, "").split("?")[0];
    const json = (body) => route.fulfill({ body: JSON.stringify(body), contentType: "application/json" });

    if (path === "/api/tma/debts") return json({ debtors: DEBTORS });
    if (path === "/api/tma/cards") return json({ cardsEnabled: true, issued: ISSUED });
    if (path === "/api/tma/players") return json({ players: [], tablesCount: 3 });
    if (path === "/api/tma/event-signups") return json({ signups: [] });
    return json({});
  });
}

(async () => {
  const browser = await chromium.launch({
    executablePath:
      process.env.HOME +
      "/Library/Caches/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-mac-arm64/chrome-headless-shell",
  });
  const context = await browser.newContext({ deviceScaleFactor: 2, viewport: { width: 390, height: 900 } });
  const page = await context.newPage();
  page.on("pageerror", (error) => console.error("pageerror:", error.message));
  await mock(page);

  await page.goto("http://localhost:3100/tma/cards/debts");
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${OUT}/debts-players.png` });

  await page.getByRole("button", { name: "По играм" }).click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/debts-games.png` });

  await page.getByRole("button", { name: "По игрокам" }).click();
  await page.getByRole("button", { name: /Secret/ }).first().click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/debts-player.png` });

  await page.goto("http://localhost:3100/tma/cards");
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${OUT}/cash-evening.png` });

  await browser.close();
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
