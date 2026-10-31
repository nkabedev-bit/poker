// Screenshots of framing a profile photo in the client app against mocked API answers.
// node .playwright-mcp/photo-crop-shots.cjs <outDir> <baseUrl>
const fs = require("fs");
const sharp = require("sharp");
const { chromium } = require("@playwright/test");

const OUT = process.argv[2];
const BASE = process.argv[3] || "http://localhost:3100";
const mock = eval(fs.readFileSync(__dirname + "/mock-signup-profile.js", "utf8"));

const state = { avatarIsCustom: false, sent: null };

function me() {
  return {
    avatarIsCustom: state.avatarIsCustom,
    avatarUrl: state.sent,
    displayName: "Ace_77",
    favoriteHand: "QsTs",
    freeEntries: { regular: 1, vip: 0 },
    history: { active: [], past: [] },
    medals: {},
    nicknameChangeAvailableAt: null,
    profileSubmitted: true,
    registered: null,
    stats: { eliminations: 12, games: 23, top9: 9 },
    tier: "core",
    username: "ace77",
  };
}

/** A wide camera-sized photo with the "face" well off to the right, as in real life. */
async function makePhoto(path) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="4000" height="3000">
    <defs>
      <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#4a6fa5"/><stop offset="1" stop-color="#c9d6e3"/>
      </linearGradient>
    </defs>
    <rect width="4000" height="3000" fill="url(#sky)"/>
    <rect y="2100" width="4000" height="900" fill="#3d5a3a"/>
    <rect x="300" y="1300" width="700" height="800" fill="#8a5a3c"/>
    <polygon points="250,1300 650,950 1050,1300" fill="#6b3b2a"/>
    <circle cx="3000" cy="1150" r="330" fill="#e2b48c"/>
    <circle cx="2890" cy="1100" r="38" fill="#2b1d14"/>
    <circle cx="3110" cy="1100" r="38" fill="#2b1d14"/>
    <path d="M2880 1290 Q3000 1370 3120 1290" stroke="#7a3b2a" stroke-width="22" fill="none"/>
    <path d="M2660 1010 Q3000 650 3340 1010 Q3000 860 2660 1010" fill="#3b2617"/>
    <rect x="2620" y="1480" width="760" height="1100" rx="260" fill="#9b1c2c"/>
  </svg>`;
  await sharp(Buffer.from(svg)).jpeg({ quality: 90 }).toFile(path);
}

(async () => {
  const photo = `${OUT}/camera-photo.jpg`;
  await makePhoto(photo);

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
  await page.route("**/api/client-tma/avatar", async (route) => {
    const { dataUrl } = route.request().postDataJSON();
    const bytes = Buffer.from(dataUrl.split(",")[1], "base64");
    fs.writeFileSync(`${OUT}/sent.jpg`, bytes);
    const meta = await sharp(bytes).metadata();
    console.log("sent", meta.format, `${meta.width}x${meta.height}`, `${Math.round(bytes.length / 1024)} KB`);
    state.avatarIsCustom = true;
    state.sent = dataUrl;
    return route.fulfill({ json: { avatarUrl: dataUrl } });
  });

  const shot = (name) => page.screenshot({ path: `${OUT}/${name}.png` });

  await page.goto(BASE + "/client/profile/settings");
  await page.waitForTimeout(3000);
  await shot("c0-settings");

  await page.locator('input[type="file"]').setInputFiles(photo);
  await page.getByRole("dialog", { name: "Выбор кадра" }).waitFor();
  await page.waitForTimeout(800);
  await shot("c1-open");

  // Closer, then the face dragged into the circle.
  await page.getByRole("slider", { name: "Приближение" }).fill("1.9");
  await page.waitForTimeout(200);
  const box = await page.getByTestId("photo-cropper-stage").boundingBox();
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx - 150, cy + 30, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(300);
  await shot("c2-framed");

  await page.getByRole("button", { name: "Сохранить" }).click();
  await page.getByRole("dialog", { name: "Выбор кадра" }).waitFor({ state: "detached" });
  await page.waitForTimeout(600);
  await shot("c3-saved");

  await page.goto(BASE + "/client/profile");
  await page.waitForTimeout(3000);
  await shot("c4-profile");

  await browser.close();
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
