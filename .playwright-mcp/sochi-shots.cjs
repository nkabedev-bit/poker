// Screenshots of the Sochi announcement, the "Отбор в Сочи" plate and Secret's APC plate
// against mocked API answers.
// node .playwright-mcp/sochi-shots.cjs <outDir> <baseUrl>
const fs = require("fs");
const { chromium } = require("@playwright/test");

const OUT = process.argv[2];
const BASE = process.argv[3] || "http://localhost:3110";
const source = fs
  .readFileSync(__dirname + "/mock-signup-profile.js", "utf8")
  .replaceAll("Ace_77", "Secret")
  .replace('points: 190, tier: "member"', 'points: 190, tier: "core"')
  .replace('    tier: "member",\n    username: "ace77"', '    tier: "core",\n    username: "ace77"')
  .replace('badge: "Глубокие стеки!"', 'badge: "Один шанс"');
const mock = eval(source);

const SHOTS = [
  ["phone-home", "/client", { width: 375, height: 812 }],
  ["phone-home-tall", "/client", { width: 375, height: 1900 }],
  ["phone-tournaments", "/client/tournaments", { width: 375, height: 1400 }],
  ["phone-event", "/client/events/e-next", { width: 375, height: 812 }],
  ["phone-profile", "/client/profile", { width: 375, height: 812 }],
  ["narrow-profile", "/client/profile", { width: 360, height: 640 }],
  ["phone-player", "/client/players/secret", { width: 375, height: 812 }],
  ["desk-home", "/client", { width: 1280, height: 1000 }],
  ["desk-event", "/client/events/e-next", { width: 1280, height: 900 }],
  ["desk-player", "/client/players/secret", { width: 1280, height: 900 }],
  ["desk-profile", "/client/profile", { width: 1280, height: 900 }],
];

(async () => {
  const browser = await chromium.launch({
    executablePath:
      process.env.HOME +
      "/Library/Caches/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-mac-arm64/chrome-headless-shell",
  });

  for (const [name, path, viewport] of SHOTS) {
    const page = await browser.newPage({ viewport, deviceScaleFactor: 2 });
    page.on("pageerror", (error) => console.error("pageerror", name, error.message));
    await mock(page);
    await page.goto(BASE + path);
    await page.waitForTimeout(3500);
    await page.screenshot({ path: `${OUT}/${name}.png` });
    await page.close();
  }

  await browser.close();
})();
