// The hall's board with a full table of ten above the re-entry prices, at the screen sizes
// the board is likely shown at. Reports how many rows fit and shoots the players panel.
// node .playwright-mcp/table-ten-shots.cjs <outDir> [baseUrl] [extraCss]
const fs = require("fs");
const { chromium } = require("@playwright/test");

const OUT = process.argv[2];
const BASE = process.argv[3] || "http://localhost:3100";
const EXTRA_CSS = process.argv[4] ? fs.readFileSync(process.argv[4], "utf8") : "";

const NAMES = [
  "Mers cls 055", "Олюшка", "Киберпсих", "Chura", "1$", "kabedev",
  "Superman_2000", "Ace_77", "Mr.Fish", "DonkeyKong",
];
const players = [
  ...NAMES.map((name, index) => ({
    id: `a${index}`,
    name,
    table: 1,
    seat: index + 1,
    status: "active",
    ...(index % 3 === 0 ? { rebuys: 1 } : {}),
    ...(index % 4 === 0 ? { gamesPlayed: 30 } : {}),
  })),
  { id: "b1", name: "Elsewhere", table: 2, seat: 1, status: "active" },
  { id: "x1", name: "OUT_ONE", table: 1, seat: 4, status: "eliminated", finishPlace: 13 },
  { id: "x2", name: "OUT_TWO", table: 1, seat: 7, status: "eliminated", finishPlace: 12 },
];
const state = {
  tournament: { name: "Majestic", startingStack: 10000 },
  extras: {
    settings: { tablesCount: 2, maxPlayersPerTable: 10, reentryEnabled: true, tournamentFormat: "regular" },
    players,
  },
};

const SIZES = [
  [1920, 1080],
  [1600, 900],
  [1366, 768],
  [1280, 720],
  [1920, 960],
  [1440, 900],
];

(async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const page = await browser.newPage();
  page.on("pageerror", (error) => console.error("pageerror", error.message));
  const cookie = encodeURIComponent(JSON.stringify(state));
  console.log("cookie bytes", cookie.length);
  await page.context().addCookies([{ name: "poker-demo-state", value: cookie, url: BASE }]);

  for (const [width, height] of SIZES) {
    await page.setViewportSize({ width, height });
    await page.goto(BASE + "/screen/demo");
    if (EXTRA_CSS) await page.addStyleTag({ content: EXTRA_CSS });
    await page.waitForSelector(".public-reentry-info");
    await page.waitForTimeout(1500);
    const report = await page.evaluate(() => {
      const list = document.querySelector(".public-player-mini-list");
      const listBox = list.getBoundingClientRect();
      const rows = [...list.children];
      const fitting = rows.filter((row) => row.getBoundingClientRect().bottom <= listBox.bottom + 0.5);
      const firstRow = rows[0];
      const name = firstRow?.querySelector(".public-player-name");
      return {
        density: list.className,
        names: rows.map((row) => row.textContent.trim()).join(", "),
        rows: rows.length,
        fitting: fitting.length,
        listHeight: Math.round(listBox.height),
        needed: Math.round(list.scrollHeight),
        rowHeight: firstRow ? Math.round(firstRow.getBoundingClientRect().height) : null,
        nameFont: name ? getComputedStyle(name).fontSize : null,
        reentryHeight: Math.round(document.querySelector(".public-reentry-info").getBoundingClientRect().height),
      };
    });
    console.log(`${width}x${height}`, JSON.stringify(report));
    await page.locator(".public-players-panel").screenshot({ path: `${OUT}/panel-${width}x${height}.png` });
    await page.screenshot({ path: `${OUT}/full-${width}x${height}.png` });
  }

  await browser.close();
})();
