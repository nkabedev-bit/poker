// Screenshots of the nickname change in the client app against mocked API answers.
// node .playwright-mcp/nickname-shots.cjs <outDir> <baseUrl>
const fs = require("fs");
const { chromium } = require("@playwright/test");

const OUT = process.argv[2];
const BASE = process.argv[3] || "http://localhost:3110";
const mock = eval(fs.readFileSync(__dirname + "/mock-signup-profile.js", "utf8"));

const state = { availableAt: null, nickname: "Ace_77" };

function me() {
  return {
    avatarIsCustom: false,
    avatarUrl: null,
    displayName: state.nickname,
    favoriteHand: "QsTs",
    freeEntries: { regular: 1, vip: 0 },
    history: { active: [], past: [] },
    medals: {},
    nicknameChangeAvailableAt: state.availableAt,
    profileSubmitted: true,
    registered: null,
    stats: { eliminations: 12, games: 23, top9: 9 },
    tier: "core",
    username: "ace77",
  };
}

(async () => {
  const browser = await chromium.launch({
    executablePath:
      process.env.HOME +
      "/Library/Caches/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-mac-arm64/chrome-headless-shell",
  });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  page.on("pageerror", (error) => console.error("pageerror", error.message));
  await mock(page);

  // Registered after the shared mock, so asked first.
  await page.route("**/api/client-tma/me", (route) => route.fulfill({ json: me() }));
  await page.route("**/api/client-tma/nickname", async (route) => {
    const { nickname } = route.request().postDataJSON();
    if (nickname.toLowerCase() === "chura") {
      return route.fulfill({ status: 409, json: { error: "taken", message: "Этот ник уже занят. Выберите другой." } });
    }
    state.nickname = nickname;
    state.availableAt = new Date(Date.now() + 30 * 86400e3).toISOString();
    return route.fulfill({ json: { availableAt: state.availableAt, nickname } });
  });
  await page.route("**/api/client-tma/players/mrfish", (route) =>
    route.fulfill({
      json: {
        player: {
          avatarUrl: null,
          formerName: "Mr.Fish",
          games: [],
          hand: null,
          isMe: false,
          medals: {},
          name: "Chura",
          stats: { eliminations: 4, games: 12, top9: 3 },
          tier: "member",
        },
      },
    }),
  );

  const shot = (name) => page.screenshot({ path: `${OUT}/${name}.png` });
  const pencil = () => page.getByRole("button", { name: "Сменить ник" }).first();
  const field = () => page.getByRole("textbox", { name: /Новый ник/ });

  await page.goto(BASE + "/client/profile");
  await page.waitForTimeout(3500);
  await shot("p1-card");

  await pencil().click();
  await page.waitForTimeout(900);
  await shot("p2-sheet");

  await field().fill("Chura");
  await page.getByRole("button", { name: "Сохранить" }).click();
  await page.waitForTimeout(700);
  await shot("p3-taken");

  await field().fill("Big Fish");
  await page.getByRole("button", { name: "Сохранить" }).click();
  await page.waitForTimeout(1200);
  await shot("p4-renamed");
  console.log("dialog open after save:", await page.getByRole("dialog").count());

  await pencil().click();
  await page.waitForTimeout(900);
  await shot("p5-cooldown");

  state.availableAt = null;
  state.nickname = "Очень длинный игровой никнейм клуба 40";
  await page.goto(BASE + "/client/profile");
  await page.waitForTimeout(3000);
  await shot("p6-long-name");

  await page.goto(BASE + "/client/players/mrfish");
  await page.waitForTimeout(3000);
  await shot("p7-former-name");

  state.nickname = "Ace_77";
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(BASE + "/client/profile");
  await page.waitForTimeout(3500);
  await pencil().click();
  await page.waitForTimeout(900);
  await shot("p8-desk-sheet");

  await browser.close();
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
