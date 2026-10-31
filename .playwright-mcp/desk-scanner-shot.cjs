// The browser desk's own QR scanner on «Касса», with Chromium's fake camera standing in
// for the phone's back camera. Admin API answers are mocked; signed in as a floor.
const { chromium } = require("@playwright/test");

const OUT = process.argv[2];
const BASE = process.env.BASE || "http://localhost:3101";

(async () => {
  const browser = await chromium.launch({
    args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"],
    executablePath:
      process.env.HOME +
      "/Library/Caches/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-mac-arm64/chrome-headless-shell",
  });
  const context = await browser.newContext({ deviceScaleFactor: 2, viewport: { width: 390, height: 844 } });
  await context.grantPermissions(["camera"], { origin: BASE });
  const page = await context.newPage();
  page.on("pageerror", (error) => console.error("pageerror:", error.message));
  await page.route("**/api/tma/**", async (route) => {
    const path = route.request().url().replace(/^https?:\/\/[^/]+/, "").split("?")[0];
    const json = (body) => route.fulfill({ body: JSON.stringify(body), contentType: "application/json" });
    if (path === "/api/tma/me") return json({ name: "Браузер · флор", role: "floor" });
    if (path === "/api/tma/cards") return json({ cardsEnabled: true, issued: [] });
    if (path === "/api/tma/players") return json({ players: [], tablesCount: 1 });
    if (path === "/api/tma/event-signups") return json({ signups: [] });
    return json({});
  });

  await page.goto(BASE + "/tma/cards");
  await page.waitForTimeout(2000);
  await page.getByRole("button", { name: /Сканировать карту/ }).first().click();
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${OUT}/5-scanner.png` });
  console.log("scanner open:", await page.getByRole("dialog", { name: "Сканер QR-кода" }).count());
  console.log("video playing:", await page.evaluate(() => {
    const video = document.querySelector("video");
    return video ? { h: video.videoHeight, paused: video.paused, w: video.videoWidth } : null;
  }));

  await page.getByRole("button", { name: "Закрыть" }).click();
  await page.waitForTimeout(300);
  console.log("scanner closed:", (await page.getByRole("dialog", { name: "Сканер QR-кода" }).count()) === 0);
  await browser.close();
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
