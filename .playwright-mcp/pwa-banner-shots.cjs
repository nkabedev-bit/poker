// Web-app invitation screens against mocked API answers: the mini-app card, the browser
// landing page from it, an error, and the install note at the bottom on an iPhone.
const fs = require("fs");
const { chromium } = require("@playwright/test");

const OUT = process.argv[2];
const mock = eval(fs.readFileSync(__dirname + "/mock-signup-profile.js", "utf8"));
const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const TG = "#tgWebAppData=query_id%3Dx%26user%3D%257B%2522id%2522%253A1%257D&tgWebAppVersion=7.0&tgWebAppPlatform=android";

(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.HOME + "/Library/Caches/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-mac-arm64/chrome-headless-shell",
  });
  const shots = [
    ["tg-card", {}, "/client" + TG, async (page) => page.getByText("Добавьте Majestic на главный экран").locator("xpath=ancestor::button[1]")],
    ["login-link", { userAgent: IPHONE, isMobile: true, hasTouch: true }, "/client/login?link=pass.sig", null],
    ["login-error", { userAgent: IPHONE, isMobile: true, hasTouch: true }, "/client/login?link_error=yandex_taken", null],
    ["web-home-iphone", { userAgent: IPHONE, isMobile: true, hasTouch: true }, "/client", null],
  ];
  for (const [name, options, path, pick] of shots) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, ...options });
    const page = await context.newPage();
    await mock(page);
    await page.goto("http://localhost:3100" + path);
    await page.waitForTimeout(4500);
    if (pick) await (await pick(page)).screenshot({ path: `${OUT}/${name}.png` });
    else await page.screenshot({ path: `${OUT}/${name}.png` });
    await context.close();
  }
  await browser.close();
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
