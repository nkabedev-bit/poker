// Screenshots of the club announcements: the carousel on the client home screen (one card,
// several cards, the web-app invitation closing the strip inside Telegram) and the
// editor in TMA «Рассылка и бот», against mocked API answers.
// node .playwright-mcp/announcements-shots.cjs <outDir> <baseUrl>
const fs = require("fs");
const { chromium } = require("@playwright/test");

const OUT = process.argv[2];
const BASE = process.argv[3] || "http://localhost:3100";

const source = fs
  .readFileSync(__dirname + "/mock-signup-profile.js", "utf8")
  .replace("return json({\n        events: [", "return json({\n        announcements: globalThis.__ANNOUNCEMENTS,\n        events: [");
const mock = eval(source);

const SOCHI = {
  id: "sochi",
  linkUrl: "https://t.me/majesticpokerptz/1197",
  message: "Majestic едет в Сочи, нажмите для подробностей!",
};
const SEASON = { id: "season", linkUrl: null, message: "С 1 ноября стартует новый сезон рейтинга — очки обнуляются, финал месяца как обычно." };
const MAP = { id: "map", linkUrl: "https://yandex.ru/maps", message: "Мы переехали: новый зал на Ленина, 12. Как пройти — по ссылке" };

// The Telegram SDK reads its launch data from the hash, so the app thinks it is inside Telegram.
const IN_TELEGRAM = "#tgWebAppData=user%3D%257B%2522id%2522%253A42%252C%2522first_name%2522%253A%2522Ace%2522%257D%26hash%3Dx&tgWebAppVersion=8.0&tgWebAppPlatform=ios";

const SHOTS = [
  ["phone-one", "/client", { width: 375, height: 812 }, [SOCHI]],
  ["phone-three", "/client", { width: 375, height: 812 }, [SOCHI, SEASON, MAP]],
  ["phone-three-swiped", "/client", { width: 375, height: 812 }, [SOCHI, SEASON, MAP], "swipe"],
  ["phone-tg-trailing", "/client" + IN_TELEGRAM, { width: 375, height: 812 }, [SOCHI]],
  ["narrow-three", "/client", { width: 320, height: 640 }, [SOCHI, SEASON, MAP]],
  ["desk-three", "/client", { width: 1280, height: 900 }, [SOCHI, SEASON, MAP]],
];

const ADMIN_ITEMS = [
  { ...SOCHI, showUntil: "2026-11-19T21:00:00.000Z" },
  { ...SEASON, showUntil: null },
  { ...MAP, id: "old", message: "Турнир 10 октября перенесён", showUntil: "2026-10-10T18:00:00.000Z" },
];

async function mockAdmin(page) {
  await page.route("**/api/tma/**", async (route) => {
    const request = route.request();
    const path = request.url().replace(/^https?:\/\/[^/]+/, "").split("?")[0];
    const json = (body, status = 200) => route.fulfill({ body: JSON.stringify(body), contentType: "application/json", status });

    if (path === "/api/tma/me") return json({ role: "floor" });
    if (path === "/api/tma/client-bot/settings") return json({ ratingUrl: "", scheduleText: "Пт 19:00", scheduleVersions: [] });
    if (path === "/api/tma/client-bot/scheduled") return json({ items: [] });
    if (path === "/api/tma/client-bot/home-announcements") {
      if (request.method() === "PUT") {
        const { items } = JSON.parse(request.postData() || "{}");
        if (items.some((item) => !item.message.trim())) return json({ error: "Объявление 1: пустой текст" }, 400);
        return json({ items: items.map((item, index) => ({ ...item, id: item.id || `new-${index}` })) });
      }
      return json({ items: ADMIN_ITEMS });
    }
    return json({});
  });
}

(async () => {
  // The Playwright browser cache is gone from this machine; the installed Chrome speaks the same protocol.
  const browser = await chromium.launch({ channel: "chrome", headless: true });

  for (const [name, path, viewport, announcements, action] of SHOTS) {
    globalThis.__ANNOUNCEMENTS = announcements;
    const page = await browser.newPage({ viewport, deviceScaleFactor: 2, hasTouch: viewport.width < 768 });
    page.on("pageerror", (error) => console.error("pageerror", name, error.message));
    await mock(page);
    await page.goto(BASE + path);
    await page.waitForTimeout(3500);
    if (action === "swipe") {
      await page.locator('[aria-roledescription="карусель"] > div').first().evaluate((track) => {
        track.scrollBy({ left: track.clientWidth * 0.9 });
      });
      await page.waitForTimeout(800);
    }
    const dots = await page.locator('button[aria-label^="Объявление "]').evaluateAll((items) =>
      items.map((item) => item.getAttribute("aria-current")),
    );
    const heights = await page.locator('[aria-roledescription="слайд"]').evaluateAll((items) =>
      items.map((item) => Math.round(item.getBoundingClientRect().height)),
    );
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    console.log(name, JSON.stringify({ dots, heights, pageOverflowX: overflow }));
    const banner = page.getByRole("button", { name: "Закрыть" });
    if (await banner.count()) await banner.first().click();
    await page.screenshot({ path: `${OUT}/${name}.png` });
    // The strip sits under the game and the next poster, as the Sochi card did: a close-up too.
    const strip = page.locator('[aria-roledescription="карусель"], [aria-roledescription="слайд"], a:has-text("Объявление клуба")').first();
    if (await strip.count()) {
      await strip.scrollIntoViewIfNeeded();
      await page.waitForTimeout(300);
      const box = await strip.boundingBox();
      await page.screenshot({
        clip: { height: Math.min(box.height + 120, viewport.height), width: viewport.width, x: 0, y: Math.max(box.y - 60, 0) },
        path: `${OUT}/${name}-strip.png`,
      });
    }
    await page.close();
  }

  const admin = await browser.newPage({ viewport: { width: 390, height: 1900 }, deviceScaleFactor: 2 });
  admin.on("pageerror", (error) => console.error("pageerror admin", error.message));
  await mockAdmin(admin);
  await admin.goto(BASE + "/tma/bot");
  await admin.waitForTimeout(3000);
  await admin.screenshot({ path: `${OUT}/tma-bot.png` });
  await admin.getByRole("button", { name: /Добавить объявление/ }).click();
  await admin.getByRole("button", { name: "Сохранить объявления" }).click();
  await admin.waitForTimeout(800);
  console.log("admin status:", await admin.locator("text=Объявление 1: пустой текст").count());
  await admin.screenshot({ path: `${OUT}/tma-bot-error.png` });
  await admin.close();

  await browser.close();
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
