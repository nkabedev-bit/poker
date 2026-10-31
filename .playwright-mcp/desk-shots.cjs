// Screenshots of the client app at desktop / tablet / phone widths against mocked API answers.
// node .playwright-mcp/desk-shots.cjs <outDir> "/client|home|1440x1240" ...
const fs = require("fs");
const { chromium } = require("@playwright/test");

const OUT = process.argv[2];
const ROUTES = process.argv.slice(3);
const mock = eval(fs.readFileSync(__dirname + "/mock-signup-profile.js", "utf8"));

(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.HOME + "/Library/Caches/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-mac-arm64/chrome-headless-shell",
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  page.on("pageerror", (error) => console.error("pageerror", error.message));
  await mock(page);
  // Answers the shared mock leaves out: an achievement's holders and the announcements.
  // Registered after it, so they are asked first.
  const holder = (name, value, extra = {}) => ({ avatarUrl: null, hand: null, isMe: false, key: name.toLowerCase(), name, value, ...extra });
  await page.route("**/api/client-tma/achievements/*", (route) =>
    route.fulfill({
      json: {
        holders: [holder("Mr.Shark", 1, { hand: "AsKs" }), holder("River", 1), holder("Ace_77", 1, { isMe: true, hand: "QsTs" }), holder("Туз", 1), holder("Kira", 1)],
        players: 40,
      },
    }),
  );
  await page.route("**/api/client-tma/announcements", (route) =>
    route.fulfill({
      json: {
        announcements: [
          { createdAt: new Date(Date.now() - 3600e3).toISOString(), id: "a1", message: "Сегодня в 19:00 — Phoenix. Глубокие стеки, ре-энтри до 4 уровня." },
          { createdAt: new Date(Date.now() - 2 * 86400e3).toISOString(), id: "a2", message: "Расписание на неделю опубликовано.\nЗапись открыта в приложении." },
        ],
      },
    }),
  );
  for (const route of ROUTES) {
    const [path, name, size = "1440x1000", action] = route.split("|");
    const [width, height] = size.split("x").map(Number);
    await page.setViewportSize({ width, height });
    await page.goto("http://localhost:3100" + path);
    await page.waitForTimeout(4000);
    if (action) {
      await page.getByRole("button", { name: action }).first().click();
      await page.waitForTimeout(1200);
    }
    await page.screenshot({ path: `${OUT}/${name}.png` });
  }
  await browser.close();
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
