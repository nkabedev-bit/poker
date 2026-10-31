// Screenshots of the player plates: the hall's board at four row heights and the
// mini-app's settings and «Моя плашка» against mocked API answers.
// node .playwright-mcp/plates-shots.cjs <outDir> <baseUrl>
// The board reads the demo state, which the check build seeds with plates (cookie plates_n).
const fs = require("fs");
const { chromium } = require("@playwright/test");

const OUT = process.argv[2];
const BASE = process.argv[3] || "http://localhost:3100";
const mock = eval(fs.readFileSync(__dirname + "/mock-signup-profile.js", "utf8"));

const state = { plate: { color: "sapphire", form: "chip_leader" } };

function me(overrides = {}) {
  return {
    avatarIsCustom: true,
    avatarUrl: null,
    displayName: "Ace_77",
    favoriteHand: "QsTs",
    freeEntries: { regular: 1, vip: 0 },
    history: { active: [], past: [] },
    honorPlates: [],
    medals: {},
    nicknameChangeAvailableAt: null,
    plate: state.plate,
    profileSubmitted: true,
    registered: null,
    stats: { eliminations: 12, games: 23, top9: 9 },
    tier: "core",
    username: "ace77",
    ...overrides,
  };
}

(async () => {
  const browser = await chromium.launch({
    executablePath:
      process.env.HOME +
      "/Library/Caches/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-mac-arm64/chrome-headless-shell",
  });

  // The board, as the hall's TV shows it.
  const tv = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  tv.on("pageerror", (error) => console.error("pageerror", error.message));
  for (const count of [5, 12, 18, 24]) {
    await tv.context().addCookies([{ domain: "localhost", name: "plates_n", path: "/", value: String(count) }]);
    await tv.goto(BASE + "/screen/demo");
    await tv.waitForTimeout(2500);
    await tv.screenshot({ path: `${OUT}/tv-${count}.png` });
    const panel = tv.locator(".public-players-panel");
    await panel.screenshot({ path: `${OUT}/tv-${count}-panel.png` });
  }

  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  page.on("pageerror", (error) => console.error("pageerror", error.message));
  await mock(page);
  let current = me();
  await page.route("**/api/client-tma/me", (route) => route.fulfill({ json: current }));
  await page.route("**/api/client-tma/plate", async (route) => {
    const body = route.request().postDataJSON();
    state.plate = body.form ? { color: body.color, form: body.form } : null;
    current = { ...current, plate: state.plate };
    return route.fulfill({ json: { plate: state.plate } });
  });

  const shot = (name) => page.screenshot({ path: `${OUT}/${name}.png` });

  await page.goto(BASE + "/client/profile");
  await page.waitForTimeout(3500);
  await shot("m1-profile");

  await page.getByRole("link", { name: "Настройки" }).click();
  await page.waitForTimeout(2500);
  await shot("m2-settings");

  await page.getByRole("link", { name: /Плашка в зале/ }).click();
  await page.waitForTimeout(2500);
  await shot("m3-plate");

  // A locked shape says how far it is; a colour and a shape change the preview.
  await page.getByRole("button", { name: /^Каре/ }).click();
  await page.waitForTimeout(400);
  await page.getByRole("button", { name: /^Изумруд/ }).click();
  await page.getByRole("button", { name: /^Стрит/ }).click();
  await page.waitForTimeout(600);
  await shot("m4-plate-picked");

  await page.getByRole("button", { name: "Сохранить" }).click();
  await page.waitForTimeout(800);
  await shot("m5-plate-saved");

  await page.setViewportSize({ width: 390, height: 2200 });
  await page.waitForTimeout(500);
  await shot("m6-plate-tall");

  // Secret: both APC plates at the top, the colour locked on them.
  current = me({ displayName: "Secret", honorPlates: ["apc", "apc_second"], plate: null, tier: "member" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(BASE + "/client/profile/plate");
  await page.waitForTimeout(3000);
  await page.getByRole("button", { name: /^2-ое место APC/ }).click();
  await page.waitForTimeout(600);
  await shot("m7-secret-second");
  await page.getByRole("button", { name: /^APC/ }).first().click();
  await page.waitForTimeout(600);
  await shot("m8-secret-apc");

  await browser.close();
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
