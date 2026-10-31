// Screenshots of the client mini-app against mocked API answers (redesign check).
const fs = require("fs");
const { chromium } = require("@playwright/test");

const OUT = process.argv[2];
const ROUTES = process.argv.slice(3);
const mock = eval(fs.readFileSync(__dirname + "/mock-signup-profile.js", "utf8"));

(async () => {
  // The browsers cached here are a newer build than this Playwright expects; they speak the same protocol.
  const browser = await chromium.launch({
    executablePath: process.env.HOME + "/Library/Caches/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-mac-arm64/chrome-headless-shell",
  });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  await mock(page);
  for (const route of ROUTES) {
    const [path, name, full] = route.split("|");
    // A tall window instead of a full-page shot: the app scrolls inside <main>, not the page.
    await page.setViewportSize({ width: 390, height: full === "full" ? 2600 : 844 });
    await page.goto("http://localhost:3100" + path);
    await page.waitForTimeout(4500);
    await page.screenshot({ path: `${OUT}/${name}.png` });
  }
  await browser.close();
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
